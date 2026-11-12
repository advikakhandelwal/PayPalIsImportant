"""
TrustPay AI — PayPal Orders v2 & Escrow Engine Test Suite
===========================================================
Tests Devansh's PayPal Integration Scope independently using:
1. Mocked HTTP Sessions simulating real PayPal Sandbox responses & error payloads
   (OAuth2 caching & 401 refresh, Orders v2 intent=AUTHORIZE, Authorize, Partwise Capture,
   Retries with preserved PayPal-Request-Id, Deterministic 4xx error handling, Void, Refund, Payouts).
2. Explicit PAYPAL_MODE=mock end-to-end FastAPI lifecycle tests:
   Create Order -> Authorize Escrow (unlocks Step 1) -> Submit Deliverable ->
   Approve Milestone (auto-captures partwise payment & updates reputation badges) ->
   Payout -> Refund/Void -> Audit Ledger -> Signature-Verified Webhook reconciliation.
"""

import os
import sys
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
import requests
from fastapi.testclient import TestClient

# Path setup when invoked directly
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("DEV_AUTH_ALLOWED", "false")
os.environ.setdefault("SEED_DEMO_DATA", "false")

from app.main import app
from app.database import Base, engine, SessionLocal
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.models.paypal_transaction import PayPalTransaction, PayPalOperationType
from app.api.paypal_routes import get_paypal_service
from app.services.paypal_service import (
    PayPalConfigurationError,
    PayPalPaymentError,
    PayPalService,
    PayPalTransientError,
    build_idempotency_key,
    normalize_paypal_currency_and_amount,
)

# Ensure all tables (including paypal_transactions) exist
Base.metadata.create_all(bind=engine)


def _mock_response(status_code: int, json_body=None, headers=None) -> MagicMock:
    resp = MagicMock(spec=requests.Response)
    resp.status_code = status_code
    resp.headers = headers or {}
    if json_body is None:
        resp.content = b""
        resp.text = ""
        resp.json.side_effect = ValueError("No JSON content")
    else:
        import json
        raw_str = json.dumps(json_body)
        resp.content = raw_str.encode("utf-8")
        resp.text = raw_str
        resp.json.return_value = json_body
    return resp


def _unique_email(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


# =============================================================================
# 1. Unit Tests: PayPalService (Orders v2, Retries, Idempotency, Failure Handling)
# =============================================================================
class TestPayPalServiceUnit:
    def test_missing_credentials_raises_configuration_error(self):
        svc = PayPalService(client_id="", client_secret="", mode="sandbox")
        assert not svc.is_configured()
        with pytest.raises(PayPalConfigurationError) as exc_info:
            svc.create_escrow_order(contract_id=10, amount="500.00")
        assert exc_info.value.code == "PAYPAL_NOT_CONFIGURED"

    def test_oauth_token_caching_and_401_refresh(self):
        mock_session = MagicMock(spec=requests.Session)
        mock_session.post.side_effect = [
            _mock_response(200, {"access_token": "tok_1", "expires_in": 3600}),
            _mock_response(200, {"access_token": "tok_2", "expires_in": 3600}),
        ]
        # First call succeeds; then a 401 on order creation triggers token refresh + retry
        mock_session.request.side_effect = [
            _mock_response(401, {"name": "INVALID_TOKEN", "message": "Token expired"}),
            _mock_response(
                201,
                {
                    "id": "ORD-123",
                    "status": "CREATED",
                    "links": [{"rel": "approve", "href": "https://sandbox.paypal.com/checkout?token=ORD-123"}],
                },
            ),
        ]

        svc = PayPalService(
            client_id="sb_client",
            client_secret="sb_secret",
            mode="sandbox",
            escrow_intent="AUTHORIZE",
            session=mock_session,
            base_retry_delay=0.0,
        )
        # Cached token reuse
        assert svc.get_access_token() == "tok_1"
        assert svc.get_access_token() == "tok_1"
        assert mock_session.post.call_count == 1

        # 401 forces refresh to tok_2 and retries request cleanly
        res = svc.create_escrow_order(contract_id=42, amount=Decimal("1250.50"), currency="USD")
        assert res["order_id"] == "ORD-123"
        assert res["approval_url"] == "https://sandbox.paypal.com/checkout?token=ORD-123"
        assert mock_session.post.call_count == 2
        assert mock_session.request.call_count == 2

        # Verify Orders v2 payload sent intent=AUTHORIZE and exact 2-decimal value
        sent_kwargs = mock_session.request.call_args.kwargs
        assert sent_kwargs["json"]["intent"] == "AUTHORIZE"
        assert sent_kwargs["json"]["purchase_units"][0]["amount"] == {
            "currency_code": "USD",
            "value": "1250.50",
        }

    def test_transient_retry_preserves_idempotency_key(self):
        mock_session = MagicMock(spec=requests.Session)
        mock_session.post.return_value = _mock_response(200, {"access_token": "tok_retry", "expires_in": 3600})
        mock_session.request.side_effect = [
            requests.Timeout("Simulated PayPal read timeout"),
            _mock_response(503, {"message": "Service Unavailable"}, headers={"Retry-After": "0"}),
            _mock_response(
                201,
                {
                    "id": "CAP-999",
                    "status": "COMPLETED",
                    "amount": {"currency_code": "USD", "value": "300.00"},
                    "final_capture": False,
                },
            ),
        ]

        svc = PayPalService(
            client_id="sb_client",
            client_secret="sb_secret",
            mode="sandbox",
            session=mock_session,
            max_retries=3,
            base_retry_delay=0.0,
        )
        cap = svc.capture_milestone_payment(
            authorization_id="AUTH-777",
            amount=300,
            currency="USD",
            contract_id=7,
            milestone_id=1,
            final_capture=False,
        )
        assert cap["capture_id"] == "CAP-999"
        assert cap["status"] == "COMPLETED"
        assert mock_session.request.call_count == 3

        # Every retry MUST send the exact same PayPal-Request-Id header
        request_ids = [
            call.kwargs["headers"]["PayPal-Request-Id"]
            for call in mock_session.request.call_args_list
        ]
        assert len(set(request_ids)) == 1
        assert request_ids[0] == build_idempotency_key("capture", 7, 1)

    def test_deterministic_4xx_error_does_not_retry(self):
        mock_session = MagicMock(spec=requests.Session)
        mock_session.post.return_value = _mock_response(200, {"access_token": "tok_4xx", "expires_in": 3600})
        mock_session.request.return_value = _mock_response(
            422,
            {
                "name": "UNPROCESSABLE_ENTITY",
                "message": "The requested action could not be performed.",
                "debug_id": "dbg_exp_001",
                "details": [
                    {
                        "issue": "AUTHORIZATION_EXPIRED",
                        "description": "An expired authorization cannot be captured.",
                    }
                ],
            },
        )

        svc = PayPalService(
            client_id="sb_client",
            client_secret="sb_secret",
            mode="sandbox",
            session=mock_session,
            max_retries=3,
            base_retry_delay=0.0,
        )
        with pytest.raises(PayPalPaymentError) as exc_info:
            svc.capture_milestone_payment(
                authorization_id="AUTH-EXPIRED",
                amount="100.00",
                contract_id=9,
                milestone_id=2,
            )
        assert exc_info.value.code == "AUTHORIZATION_EXPIRED"
        assert exc_info.value.debug_id == "dbg_exp_001"
        assert exc_info.value.retryable is False
        # Must NOT retry 422
        assert mock_session.request.call_count == 1

    def test_exhausted_retries_raise_transient_error(self):
        mock_session = MagicMock(spec=requests.Session)
        mock_session.post.return_value = _mock_response(200, {"access_token": "tok_5xx", "expires_in": 3600})
        mock_session.request.return_value = _mock_response(502, {"message": "Bad Gateway", "debug_id": "dbg_502"})

        svc = PayPalService(
            client_id="sb_client",
            client_secret="sb_secret",
            mode="sandbox",
            session=mock_session,
            max_retries=2,
            base_retry_delay=0.0,
        )
        with pytest.raises(PayPalTransientError) as exc_info:
            svc.authorize_order(order_id="ORD-502", contract_id=5)
        assert exc_info.value.retryable is True
        assert exc_info.value.debug_id == "dbg_502"
        assert mock_session.request.call_count == 3  # 1 initial + 2 retries

    def test_authorize_order_extracts_auth_and_rejects_declined(self):
        mock_session = MagicMock(spec=requests.Session)
        mock_session.post.return_value = _mock_response(200, {"access_token": "tok_auth", "expires_in": 3600})
        mock_session.request.side_effect = [
            _mock_response(
                201,
                {
                    "id": "ORD-GOOD",
                    "status": "COMPLETED",
                    "purchase_units": [
                        {
                            "payments": {
                                "authorizations": [
                                    {
                                        "id": "AUTH-LIVE-01",
                                        "status": "CREATED",
                                        "amount": {"currency_code": "USD", "value": "500.00"},
                                        "expiration_time": "2026-12-01T00:00:00Z",
                                    }
                                ]
                            }
                        }
                    ],
                },
            ),
            _mock_response(
                201,
                {
                    "id": "ORD-BAD",
                    "status": "COMPLETED",
                    "purchase_units": [
                        {"payments": {"authorizations": [{"id": "AUTH-DENIED", "status": "DENIED"}]}}
                    ],
                },
            ),
        ]

        svc = PayPalService(
            client_id="sb_client",
            client_secret="sb_secret",
            mode="sandbox",
            escrow_intent="AUTHORIZE",
            session=mock_session,
            base_retry_delay=0.0,
        )
        ok = svc.authorize_order(order_id="ORD-GOOD", contract_id=11)
        assert ok["authorization_id"] == "AUTH-LIVE-01"
        assert ok["status"] == "CREATED"

        with pytest.raises(PayPalPaymentError) as exc_info:
            svc.authorize_order(order_id="ORD-BAD", contract_id=12)
        assert exc_info.value.code == "AUTHORIZATION_DENIED"

    def test_inr_currency_normalizes_to_usd_for_paypal(self):
        curr, amt = normalize_paypal_currency_and_amount(Decimal("8400.00"), "INR")
        assert curr == "USD"
        assert amt == "100.00"

        curr_usd, amt_usd = normalize_paypal_currency_and_amount(Decimal("250.5"), "usd")
        assert curr_usd == "USD"
        assert amt_usd == "250.50"


# =============================================================================
# 2. End-to-End FastAPI PayPal Escrow Lifecycle Tests
# =============================================================================
class TestPayPalEscrowAPILifecycle:
    @pytest.fixture(autouse=True)
    def setup_mock_paypal_override(self):
        mock_svc = PayPalService(mode="mock", escrow_intent="AUTHORIZE")
        app.dependency_overrides[get_paypal_service] = lambda: mock_svc
        with patch.dict(os.environ, {"PAYPAL_MODE": "mock", "PAYPAL_ESCROW_INTENT": "AUTHORIZE"}):
            yield mock_svc
        app.dependency_overrides.pop(get_paypal_service, None)

    def test_full_partwise_escrow_flow_with_paypal_capture_payout_and_reputation(self):
        client = TestClient(app)

        # 1. Register Client & Freelancer
        c_email = _unique_email("pp_client")
        f_email = _unique_email("pp_talent")
        reg_c = client.post(
            "/api/auth/register",
            json={"name": "PayPal Client", "email": c_email, "password": "Password123!", "role": "CLIENT"},
        )
        assert reg_c.status_code == 201
        c_token = reg_c.json()["accessToken"]
        c_headers = {"Authorization": f"Bearer {c_token}"}

        reg_f = client.post(
            "/api/auth/register",
            json={
                "name": "PayPal Talent",
                "email": f_email,
                "password": "Password123!",
                "role": "FREELANCER",
                "domain": "Full-Stack Development",
                "bio": "Experienced engineer delivering verified milestones.",
            },
        )
        assert reg_f.status_code == 201
        f_token = reg_f.json()["accessToken"]
        f_id = reg_f.json()["user"]["id"]
        f_headers = {"Authorization": f"Bearer {f_token}"}

        # 2. Client Creates 2-Step Project ($1000: 40% + 60%)
        proj_res = client.post(
            "/api/projects",
            headers=c_headers,
            json={
                "title": "PayPal Partwise Escrow Project",
                "domain": "Full-Stack Development",
                "description": "Verify Orders v2 authorization and partwise captures.",
                "totalBudget": 1000.0,
                "currency": "USD",
                "milestones": [
                    {
                        "stepNumber": 1,
                        "title": "Step 1: Backend API",
                        "description": "Deliver core API endpoints.",
                        "percentage": 40,
                        "paymentAmount": 400.0,
                        "deliverableRequirements": ["Working API"],
                    },
                    {
                        "stepNumber": 2,
                        "title": "Step 2: Frontend Integration",
                        "description": "Connect dashboard.",
                        "percentage": 60,
                        "paymentAmount": 600.0,
                        "deliverableRequirements": ["UI integrated"],
                    },
                ],
            },
        )
        assert proj_res.status_code == 201
        pid = proj_res.json()["id"]

        # 3. Freelancer Applies & Client Accepts
        app_res = client.post(
            f"/api/projects/{pid}/applications",
            headers=f_headers,
            json={"coverLetter": "Ready to build!", "bidAmount": 1000.0, "currency": "USD"},
        )
        assert app_res.status_code == 201
        aid = app_res.json()["id"]

        acc_res = client.post(f"/api/projects/{pid}/applications/{aid}/accept", headers=c_headers)
        assert acc_res.status_code == 200
        contract = acc_res.json()
        cid = contract["id"]
        assert contract["escrowStatus"] == "AWAITING_AUTHORIZATION"
        assert contract["milestones"][0]["status"] == "LOCKED"

        # Role Guard: Freelancer cannot fund or authorize escrow
        assert (
            client.post(f"/api/paypal/contracts/{cid}/create-order", headers=f_headers).status_code == 403
        )

        # 4. Client Creates PayPal Escrow Order (intent: AUTHORIZE)
        ord_res = client.post(f"/api/paypal/contracts/{cid}/create-order", headers=c_headers, json={})
        assert ord_res.status_code == 200
        ord_data = ord_res.json()
        assert ord_data["orderId"].startswith("MOCK-ORD-")
        assert ord_data["approvalUrl"]
        assert ord_data["amount"] == 1000.0

        # 5. Client Authorizes Escrow -> Transitions to HELD_IN_ESCROW & Unlocks Step 1
        auth_res = client.post(
            f"/api/paypal/contracts/{cid}/authorize",
            headers=c_headers,
            json={"orderId": ord_data["orderId"]},
        )
        assert auth_res.status_code == 200
        auth_data = auth_res.json()
        assert auth_data["escrowStatus"] == "HELD_IN_ESCROW"
        assert auth_data["heldInEscrowAmount"] == 1000.0
        assert auth_data["authorizationId"].startswith("MOCK-AUTH-")
        m1_id = auth_data["activeMilestoneId"]
        assert m1_id is not None

        # Idempotent replay of authorize returns cleanly without error
        auth_replay = client.post(
            f"/api/paypal/contracts/{cid}/authorize",
            headers=c_headers,
            json={"orderId": ord_data["orderId"], "authorizationId": auth_data["authorizationId"]},
        )
        assert auth_replay.status_code == 200
        assert auth_replay.json()["authorizationId"] == auth_data["authorizationId"]

        # 6. Freelancer Submits Step 1 -> Client Approves Step 1 -> Auto-Captures $400
        sub1 = client.post(
            f"/api/contracts/{cid}/milestones/{m1_id}/submit",
            headers=f_headers,
            json={
                "submissionType": "URL",
                "submissionUrl": "https://github.com/org/repo/pull/1",
                "notes": "Completed Step 1 API endpoints with full unit tests.",
            },
        )
        assert sub1.status_code == 201

        app1 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=c_headers)
        assert app1.status_code == 200
        c_after_m1 = app1.json()
        assert c_after_m1["escrowStatus"] == "PARTIALLY_RELEASED"
        assert c_after_m1["releasedAmount"] == 400.0
        assert c_after_m1["heldInEscrowAmount"] == 600.0
        m2_id = c_after_m1["milestones"][1]["id"]
        assert c_after_m1["milestones"][1]["status"] == "ACTIVE"

        # 7. Payout Step 1 to Freelancer PayPal Email
        payout_res = client.post(
            f"/api/paypal/contracts/{cid}/milestones/{m1_id}/payout",
            headers=c_headers,
            json={},
        )
        assert payout_res.status_code == 200
        assert payout_res.json()["amount"] == 400.0
        assert payout_res.json()["recipientEmail"] == f_email
        assert payout_res.json()["payoutBatchId"].startswith("MOCK-BATCH-")

        # 8. Freelancer Submits Step 2 -> Client Approves Step 2 -> Auto-Captures Remaining $600
        sub2 = client.post(
            f"/api/contracts/{cid}/milestones/{m2_id}/submit",
            headers=f_headers,
            json={
                "submissionType": "URL",
                "submissionUrl": "https://github.com/org/repo/pull/2",
                "notes": "Integrated frontend with PayPal checkout and verified E2E.",
            },
        )
        assert sub2.status_code == 201

        app2 = client.post(f"/api/contracts/{cid}/milestones/{m2_id}/approve", headers=c_headers)
        assert app2.status_code == 200
        c_done = app2.json()
        assert c_done["escrowStatus"] == "COMPLETED"
        assert c_done["releasedAmount"] == 1000.0
        assert c_done["heldInEscrowAmount"] == 0.0

        # 9. Verify PayPal Capture Confirmed in Reputation Scorecard ("Escrow Protected" & $1000 earned)
        sc = client.get(f"/api/users/{f_id}/scorecard").json()
        assert sc["totalEarningsOrSpent"] == 1000.0
        assert "Escrow Protected" in sc["badges"]

        # 10. Verify PayPal Transaction Audit Log Contains Full History
        txs = client.get(f"/api/paypal/contracts/{cid}/transactions", headers=c_headers)
        assert txs.status_code == 200
        ops = {t["operation"] for t in txs.json()}
        assert {"CREATE_ORDER", "AUTHORIZE_ORDER", "CAPTURE_MILESTONE", "PAYOUT"}.issubset(ops)

    def test_capture_failure_rolls_back_milestone_approval(self):
        client = TestClient(app)

        c_email = _unique_email("pp_fail_c")
        f_email = _unique_email("pp_fail_f")
        c_token = client.post(
            "/api/auth/register",
            json={"name": "Fail Client", "email": c_email, "password": "Password123!", "role": "CLIENT"},
        ).json()["accessToken"]
        f_token = client.post(
            "/api/auth/register",
            json={"name": "Fail Talent", "email": f_email, "password": "Password123!", "role": "FREELANCER"},
        ).json()["accessToken"]
        c_headers = {"Authorization": f"Bearer {c_token}"}
        f_headers = {"Authorization": f"Bearer {f_token}"}

        pid = client.post(
            "/api/projects",
            headers=c_headers,
            json={
                "title": "Rollback On PayPal Capture Failure",
                "domain": "Backend",
                "description": "Test capture decline rollback.",
                "totalBudget": 500.0,
                "milestones": [{"stepNumber": 1, "title": "Only Step", "description": "Deliver", "percentage": 100, "paymentAmount": 500.0}],
            },
        ).json()["id"]
        aid = client.post(
            f"/api/projects/{pid}/applications",
            headers=f_headers,
            json={"coverLetter": "Applying", "bidAmount": 500.0},
        ).json()["id"]
        cid = client.post(f"/api/projects/{pid}/applications/{aid}/accept", headers=c_headers).json()["id"]

        ord_id = client.post(f"/api/paypal/contracts/{cid}/create-order", headers=c_headers, json={}).json()["orderId"]
        auth_data = client.post(f"/api/paypal/contracts/{cid}/authorize", headers=c_headers, json={"orderId": ord_id}).json()
        m1_id = auth_data["activeMilestoneId"]

        client.post(
            f"/api/contracts/{cid}/milestones/{m1_id}/submit",
            headers=f_headers,
            json={"submissionType": "URL", "submissionUrl": "https://github.com/org/pr/1", "notes": "Done"},
        )

        # Simulate PayPal gateway declining capture during approve_milestone
        with patch.object(
            PayPalService,
            "capture_milestone_payment",
            side_effect=PayPalPaymentError("Capture declined by PayPal", code="CAPTURE_DECLINED", status_code=422),
        ):
            fail_res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=c_headers)
            assert fail_res.status_code == 422

        # Verify internal DB ledger stayed rolled back (still IN_REVIEW, $500 held, $0 released)
        db = SessionLocal()
        try:
            c_db = db.query(Contract).filter(Contract.id == int(cid)).first()
            m_db = db.query(Milestone).filter(Milestone.id == int(m1_id)).first()
            assert c_db.escrow_status == EscrowStatus.HELD_IN_ESCROW
            assert c_db.held_in_escrow_amount == Decimal("500.00")
            assert c_db.released_amount == Decimal("0.00")
            assert m_db.status == MilestoneStatus.IN_REVIEW
        finally:
            db.close()

    def test_refund_void_and_webhook_signature_verification(self):
        client = TestClient(app)
        c_token = client.post(
            "/api/auth/register",
            json={"name": "Ref Client", "email": _unique_email("pp_ref_c"), "password": "Password123!", "role": "CLIENT"},
        ).json()["accessToken"]
        f_token = client.post(
            "/api/auth/register",
            json={"name": "Ref Talent", "email": _unique_email("pp_ref_f"), "password": "Password123!", "role": "FREELANCER"},
        ).json()["accessToken"]
        c_headers = {"Authorization": f"Bearer {c_token}"}
        f_headers = {"Authorization": f"Bearer {f_token}"}

        pid = client.post(
            "/api/projects",
            headers=c_headers,
            json={
                "title": "Refund & Webhook Test",
                "domain": "Design",
                "description": "Test voiding authorization & webhooks.",
                "totalBudget": 250.0,
                "milestones": [{"stepNumber": 1, "title": "Design", "description": "Figma", "percentage": 100, "paymentAmount": 250.0}],
            },
        ).json()["id"]
        aid = client.post(
            f"/api/projects/{pid}/applications",
            headers=f_headers,
            json={"coverLetter": "Design pro", "bidAmount": 250.0},
        ).json()["id"]
        cid = client.post(f"/api/projects/{pid}/applications/{aid}/accept", headers=c_headers).json()["id"]

        ord_id = client.post(f"/api/paypal/contracts/{cid}/create-order", headers=c_headers, json={}).json()["orderId"]
        auth_data = client.post(f"/api/paypal/contracts/{cid}/authorize", headers=c_headers, json={"orderId": ord_id}).json()
        auth_id = auth_data["authorizationId"]

        # Void uncaptured authorization
        void_res = client.post(f"/api/paypal/contracts/{cid}/refund", headers=c_headers, json={"reason": "Mutual cancel"})
        assert void_res.status_code == 200
        assert void_res.json()["action"] == "VOID_AUTHORIZATION"
        assert void_res.json()["escrowStatus"] == "REFUNDED"

        # Invalid webhook signature -> 401
        bad_wh = client.post(
            "/api/paypal/webhook",
            headers={
                "paypal-auth-algo": "SHA256withRSA",
                "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
                "paypal-transmission-id": "tx-bad-1",
                "paypal-transmission-sig": "INVALID_SIGNATURE",
                "paypal-transmission-time": "2026-11-11T00:00:00Z",
            },
            json={"id": "WH-BAD", "event_type": "PAYMENT.CAPTURE.COMPLETED", "resource": {}},
        )
        assert bad_wh.status_code == 401

        # Valid webhook signature -> processed and deduplicated
        valid_headers = {
            "paypal-auth-algo": "SHA256withRSA",
            "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
            "paypal-transmission-id": f"tx-{uuid.uuid4().hex[:8]}",
            "paypal-transmission-sig": "VALID_MOCK_SIG",
            "paypal-transmission-time": "2026-11-11T00:00:00Z",
        }
        event_id = f"WH-{uuid.uuid4().hex[:8]}"
        wh_payload = {
            "id": event_id,
            "event_type": "PAYMENT.CAPTURE.COMPLETED",
            "resource": {
                "id": "CAP-WEBHOOK-999",
                "supplementary_data": {"related_ids": {"authorization_id": auth_id}},
                "amount": {"currency_code": "USD", "value": "250.00"},
            },
        }
        wh1 = client.post("/api/paypal/webhook", headers=valid_headers, json=wh_payload)
        assert wh1.status_code == 200
        assert wh1.json()["status"] == "PROCESSED"
        assert wh1.json()["contractId"] == cid

        # Duplicate webhook delivery is cleanly deduplicated
        wh2 = client.post("/api/paypal/webhook", headers=valid_headers, json=wh_payload)
        assert wh2.status_code == 200
        assert wh2.json()["status"] == "ALREADY_PROCESSED"

    def test_upfront_override_release_and_contract_messaging_and_deadlines(self):
        client = TestClient(app)
        c_token = client.post(
            "/api/auth/register",
            json={"name": "Chat Client", "email": _unique_email("pp_chat_c"), "password": "Password123!", "role": "CLIENT"},
        ).json()["accessToken"]
        f_token = client.post(
            "/api/auth/register",
            json={"name": "Chat Talent", "email": _unique_email("pp_chat_f"), "password": "Password123!", "role": "FREELANCER"},
        ).json()["accessToken"]
        c_headers = {"Authorization": f"Bearer {c_token}"}
        f_headers = {"Authorization": f"Bearer {f_token}"}

        pid = client.post(
            "/api/projects",
            headers=c_headers,
            json={
                "title": "Override & Chat Project",
                "domain": "Full-Stack",
                "description": "Full brief visible to both parties.",
                "totalBudget": 600.0,
                "deadline": "2026-12-25",
                "milestones": [
                    {"stepNumber": 1, "title": "M1", "description": "D1", "percentage": 50, "paymentAmount": 300.0, "deadline": "2026-12-10"},
                    {"stepNumber": 2, "title": "M2", "description": "D2", "percentage": 50, "paymentAmount": 300.0, "deadline": "2026-12-25"},
                ],
            },
        ).json()["id"]
        aid = client.post(
            f"/api/projects/{pid}/applications",
            headers=f_headers,
            json={"coverLetter": "Proposal", "bidAmount": 600.0},
        ).json()["id"]
        contract = client.post(f"/api/projects/{pid}/applications/{aid}/accept", headers=c_headers).json()
        cid = contract["id"]

        # Verify deadlines and project details propagated onto ContractResponse
        assert contract["projectDescription"] == "Full brief visible to both parties."
        assert contract["projectDeadline"] is not None
        assert contract["milestones"][0]["deadline"] is not None
        assert contract["milestones"][1]["deadline"] is not None

        # Fund escrow via PayPal
        ord_id = client.post(f"/api/paypal/contracts/{cid}/create-order", headers=c_headers, json={}).json()["orderId"]
        auth_data = client.post(f"/api/paypal/contracts/{cid}/authorize", headers=c_headers, json={"orderId": ord_id}).json()
        m1_id = auth_data["activeMilestoneId"]

        # Direct messaging between Client and Freelancer
        m_c = client.post(f"/api/contracts/{cid}/messages", headers=c_headers, json={"message": "Welcome aboard!"})
        assert m_c.status_code == 201
        m_f = client.post(f"/api/contracts/{cid}/messages", headers=f_headers, json={"message": "Thanks, starting M1 now!"})
        assert m_f.status_code == 201
        thread = client.get(f"/api/contracts/{cid}/messages", headers=c_headers).json()
        assert len(thread) == 2

        # Wrong password rejected with 403 on verify-password, release-override, and release-upfront
        assert client.post("/api/auth/verify-password", headers=c_headers, json={"password": "WrongPassword!"}).status_code == 403
        assert client.post("/api/auth/verify-password", headers=c_headers, json={"password": "Password123!"}).status_code == 200

        bad_ov = client.post(
            f"/api/contracts/{cid}/milestones/{m1_id}/release-override",
            headers=c_headers,
            json={"password": "WrongPassword!", "reason": "Unauthorized attempt"},
        )
        assert bad_ov.status_code == 403

        # Client overrides and pays M1 upfront BEFORE submission using valid password
        ov1 = client.post(
            f"/api/contracts/{cid}/milestones/{m1_id}/release-override",
            headers=c_headers,
            json={"password": "Password123!", "reason": "Upfront release"},
        )
        assert ov1.status_code == 200
        assert ov1.json()["releasedAmount"] == 300.0
        assert ov1.json()["escrowStatus"] == "PARTIALLY_RELEASED"
        assert ov1.json()["milestones"][1]["status"] == "ACTIVE"

        # Wrong password rejected on full upfront release too
        bad_all = client.post(
            f"/api/contracts/{cid}/release-upfront",
            headers=c_headers,
            json={"password": "WrongPassword!"},
        )
        assert bad_all.status_code == 403

        # Client releases remaining balance upfront with valid password
        ov_all = client.post(
            f"/api/contracts/{cid}/release-upfront",
            headers=c_headers,
            json={"password": "Password123!", "reason": "Full upfront"},
        )
        assert ov_all.status_code == 200
        assert ov_all.json()["releasedAmount"] == 600.0
        assert ov_all.json()["heldInEscrowAmount"] == 0.0
        assert ov_all.json()["escrowStatus"] == "COMPLETED"

    def test_simulated_escrow_fallback_and_release(self):
        client = TestClient(app)
        c_token = client.post(
            "/api/auth/register",
            json={"name": "Sim Client", "email": _unique_email("pp_sim_c"), "password": "Password123!", "role": "CLIENT"},
        ).json()["accessToken"]
        f_token = client.post(
            "/api/auth/register",
            json={"name": "Sim Talent", "email": _unique_email("pp_sim_f"), "password": "Password123!", "role": "FREELANCER"},
        ).json()["accessToken"]
        c_headers = {"Authorization": f"Bearer {c_token}"}
        f_headers = {"Authorization": f"Bearer {f_token}"}

        pid = client.post(
            "/api/projects",
            headers=c_headers,
            json={
                "title": "Simulated Fallback Project",
                "domain": "Full-Stack",
                "description": "USD-only project using instant simulated fallback.",
                "totalBudget": 400.0,
                "currency": "USD",
                "deadline": "2026-12-25",
                "milestones": [
                    {"stepNumber": 1, "title": "M1", "description": "D1", "percentage": 50, "paymentAmount": 200.0},
                    {"stepNumber": 2, "title": "M2", "description": "D2", "percentage": 50, "paymentAmount": 200.0},
                ],
            },
        ).json()["id"]
        aid = client.post(
            f"/api/projects/{pid}/applications",
            headers=f_headers,
            json={"coverLetter": "Proposal", "bidAmount": 400.0},
        ).json()["id"]
        cid = client.post(f"/api/projects/{pid}/applications/{aid}/accept", headers=c_headers).json()["id"]

        auth_res = client.post(
            f"/api/paypal/contracts/{cid}/authorize",
            headers=c_headers,
            json={"simulate": True},
        )
        assert auth_res.status_code == 200
        auth_data = auth_res.json()
        assert auth_data["authorizationId"].startswith("MOCK-AUTH-")
        assert auth_data["mode"] == "mock"
        assert auth_data["escrowStatus"] == "HELD_IN_ESCROW"

        m1_id = auth_data["activeMilestoneId"]
        ov1 = client.post(
            f"/api/contracts/{cid}/milestones/{m1_id}/release-override",
            headers=c_headers,
            json={"password": "Password123!", "reason": "Simulated milestone release"},
        )
        assert ov1.status_code == 200
        assert ov1.json()["releasedAmount"] == 200.0
        assert ov1.json()["escrowStatus"] == "PARTIALLY_RELEASED"

    def test_freelancer_paypal_payout_email_resolution(self):
        client = TestClient(app)
        c_token = client.post(
            "/api/auth/register",
            json={"name": "Payout Client", "email": _unique_email("pp_po_c"), "password": "Password123!", "role": "CLIENT"},
        ).json()["accessToken"]
        f_token = client.post(
            "/api/auth/register",
            json={"name": "Payout Talent", "email": _unique_email("pp_po_f"), "password": "Password123!", "role": "FREELANCER"},
        ).json()["accessToken"]
        c_headers = {"Authorization": f"Bearer {c_token}"}
        f_headers = {"Authorization": f"Bearer {f_token}"}

        bad_prof = client.patch("/api/auth/profile", headers=f_headers, json={"paypalPayoutEmail": "not-an-email"})
        assert bad_prof.status_code == 422

        custom_payout = "custom-payout-talent@personal.example.com"
        good_prof = client.patch("/api/auth/profile", headers=f_headers, json={"paypalPayoutEmail": custom_payout})
        assert good_prof.status_code == 200
        assert good_prof.json()["paypalPayoutEmail"] == custom_payout

        pid = client.post(
            "/api/projects",
            headers=c_headers,
            json={
                "title": "Payout Email Routing Project",
                "domain": "Backend",
                "description": "Verify custom PayPal payout email on contract.",
                "totalBudget": 300.0,
                "currency": "USD",
                "milestones": [
                    {"stepNumber": 1, "title": "M1", "description": "D1", "percentage": 100, "paymentAmount": 300.0},
                ],
            },
        ).json()["id"]
        aid = client.post(
            f"/api/projects/{pid}/applications",
            headers=f_headers,
            json={"coverLetter": "Proposal", "bidAmount": 300.0},
        ).json()["id"]
        contract = client.post(f"/api/projects/{pid}/applications/{aid}/accept", headers=c_headers).json()
        assert contract["freelancerPayoutEmail"] == custom_payout

        cid = contract["id"]
        client.post(f"/api/paypal/contracts/{cid}/authorize", headers=c_headers, json={"simulate": True})
        m1_id = contract["milestones"][0]["id"]
        client.post(
            f"/api/contracts/{cid}/milestones/{m1_id}/release-override",
            headers=c_headers,
            json={"password": "Password123!"},
        )
        po = client.post(f"/api/paypal/contracts/{cid}/milestones/{m1_id}/payout", headers=c_headers, json={})
        assert po.status_code == 200
        assert po.json()["recipientEmail"] == custom_payout

        # Verify unified message inbox returns contract threads with last message preview
        client.post(f"/api/contracts/{cid}/messages", headers=c_headers, json={"message": "Ready to start!"})
        inbox_c = client.get("/api/contracts/messages/inbox", headers=c_headers)
        inbox_f = client.get("/api/contracts/messages/inbox", headers=f_headers)
        assert inbox_c.status_code == 200
        assert inbox_f.status_code == 200
        assert inbox_c.json()[0]["contractId"] == cid
        assert inbox_c.json()[0]["lastMessage"] == "Ready to start!"
        assert inbox_f.json()[0]["messageCount"] == 1
