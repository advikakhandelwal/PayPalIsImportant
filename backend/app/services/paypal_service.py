"""
TrustPay AI — PayPal Orders v2 & Milestone Escrow Engine
=========================================================
Implements Devansh's PayPal Integration Scope:
1. OAuth2 Bearer token acquisition & automatic caching/refresh.
2. Orders v2 Escrow Order creation (`intent: "AUTHORIZE"`).
3. Order authorization (`POST /v2/checkout/orders/{id}/authorize`) -> `authorization_id`.
4. Partwise Milestone Capture (`POST /v2/payments/authorizations/{id}/capture`).
5. Authorization Void & Capture Refund (`void` / `refund`) for cancellations & disputes.
6. PayPal Payouts API (`POST /v1/payments/payouts`) for talent disbursements.
7. Webhook signature verification (`POST /v1/notifications/verify-webhook-signature`).
8. Production-grade idempotency (`PayPal-Request-Id`), retry with exponential backoff,
   and structured PayPal error handling.

Modes (via PAYPAL_MODE env var):
- "sandbox": Calls https://api-m.sandbox.paypal.com (requires real sandbox credentials).
- "live":    Calls https://api-m.paypal.com (requires real live credentials).
- "mock":    Deterministic local/CI PayPal v2 simulator with realistic payloads.
"""

from __future__ import annotations

import logging
import os
import random
import time
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger("trustpay.paypal_service")

PAYPAL_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com"
PAYPAL_LIVE_BASE_URL = "https://api-m.paypal.com"

_PLACEHOLDER_CREDS = {
    "",
    "your_paypal_sandbox_client_id",
    "your_paypal_sandbox_client_secret",
    "changeme",
    "placeholder",
}

_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

PAYPAL_SUPPORTED_CURRENCIES = {
    "AUD", "BRL", "CAD", "CNY", "CZK", "DKK", "EUR", "HKD", "HUF",
    "ILS", "JPY", "MYR", "MXN", "TWD", "NZD", "NOK", "PHP", "PLN",
    "GBP", "SGD", "SEK", "CHF", "THB", "USD",
}


# ---------------------------------------------------------------------------
# Structured Exceptions
# ---------------------------------------------------------------------------
class PayPalError(Exception):
    """Base exception for PayPal Escrow Engine errors."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "PAYPAL_ERROR",
        status_code: int = 502,
        debug_id: Optional[str] = None,
        details: Optional[List[Dict[str, Any]]] = None,
        retryable: bool = False,
        raw: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.debug_id = debug_id
        self.details = details or []
        self.retryable = retryable
        self.raw = raw or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error": self.code,
            "message": self.message,
            "status_code": self.status_code,
            "debug_id": self.debug_id,
            "details": self.details,
            "retryable": self.retryable,
        }


class PayPalConfigurationError(PayPalError):
    """Raised when PayPal credentials are missing or invalid for live/sandbox mode."""

    def __init__(self, message: str):
        super().__init__(
            message,
            code="PAYPAL_NOT_CONFIGURED",
            status_code=503,
            retryable=False,
        )


class PayPalTransientError(PayPalError):
    """Raised on network timeouts, 429 rate limits, or 5xx gateway errors after retries."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "PAYPAL_TRANSIENT_ERROR",
        status_code: int = 503,
        debug_id: Optional[str] = None,
        details: Optional[List[Dict[str, Any]]] = None,
        raw: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            message,
            code=code,
            status_code=status_code,
            debug_id=debug_id,
            details=details,
            retryable=True,
            raw=raw,
        )


class PayPalPaymentError(PayPalError):
    """Raised on deterministic 4xx business/decline errors from PayPal."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "PAYPAL_PAYMENT_ERROR",
        status_code: int = 422,
        debug_id: Optional[str] = None,
        details: Optional[List[Dict[str, Any]]] = None,
        raw: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            message,
            code=code,
            status_code=status_code,
            debug_id=debug_id,
            details=details,
            retryable=False,
            raw=raw,
        )


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
def format_currency_amount(amount: Decimal | float | int | str) -> str:
    """Format monetary value strictly to 2 decimal places per PayPal Orders v2 spec."""
    dec = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if dec <= Decimal("0.00"):
        raise ValueError(f"PayPal amount must be strictly positive, got {dec}")
    return f"{dec:.2f}"


def normalize_paypal_currency_and_amount(
    amount: Decimal | float | int | str,
    currency: str = "USD",
) -> tuple[str, str]:
    """
    Ensure currency is supported by PayPal Orders v2 REST API.
    - Supported currencies (USD, EUR, GBP, etc.) pass through 1:1.
    - INR (used as a UI option in India) converts deterministically to USD
      using PAYPAL_INR_PER_USD (default 84.0) so PayPal Sandbox never fails
      with CURRENCY_NOT_SUPPORTED.
    """
    curr = (currency or "USD").strip().upper()
    dec = Decimal(str(amount))
    if dec <= Decimal("0.00"):
        raise ValueError(f"PayPal amount must be strictly positive, got {dec}")

    if curr in PAYPAL_SUPPORTED_CURRENCIES:
        return curr, format_currency_amount(dec)

    if curr == "INR":
        rate = Decimal(os.getenv("PAYPAL_INR_PER_USD", "84.0"))
        usd_amt = max(Decimal("0.01"), (dec / rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        return "USD", f"{usd_amt:.2f}"

    return curr, format_currency_amount(dec)


def build_idempotency_key(prefix: str, *parts: Any) -> str:
    """
    Generate a deterministic PayPal-Request-Id (max 108 chars per PayPal API).
    Using deterministic keys ensures retries never trigger duplicate authorizations/captures.
    """
    joined = "-".join(str(p).strip() for p in parts if p is not None and str(p).strip())
    key = f"trustpay-{prefix}-{joined}" if joined else f"trustpay-{prefix}-{uuid.uuid4().hex[:16]}"
    return key[:108]


def resolve_talent_payout_email(talent: Any, mode: str = "sandbox") -> str:
    """
    Resolve where PayPal sends milestone payouts:
    1. Freelancer's saved PayPal payout email (`paypal_payout_email`)
    2. Sandbox override (`PAYPAL_SANDBOX_TALENT_EMAIL`) when in sandbox mode
    3. Freelancer's registered TrustPay email (`email`)
    """
    explicit = (getattr(talent, "paypal_payout_email", None) or "").strip()
    if explicit and "@" in explicit:
        return explicit
    if mode == "sandbox":
        sb_email = os.getenv("PAYPAL_SANDBOX_TALENT_EMAIL", "").strip()
        if sb_email and "@" in sb_email:
            return sb_email
    login_email = (getattr(talent, "email", None) or "").strip()
    return login_email or "sb-talent@personal.example.com"


# ---------------------------------------------------------------------------
# PayPal Service
# ---------------------------------------------------------------------------
class PayPalService:
    """
    Encapsulates all PayPal Orders v2, Payments v2, Payouts v1, and Webhook interactions.
    Thread/instance safe OAuth2 token caching with retry & idempotency guarantees.
    """

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        mode: Optional[str] = None,
        webhook_id: Optional[str] = None,
        escrow_intent: Optional[str] = None,
        session: Optional[requests.Session] = None,
        timeout: float = 15.0,
        max_retries: int = 3,
        base_retry_delay: float = 0.5,
    ):
        self.client_id = (client_id if client_id is not None else os.getenv("PAYPAL_CLIENT_ID", "")).strip()
        self.client_secret = (
            client_secret if client_secret is not None else os.getenv("PAYPAL_CLIENT_SECRET", "")
        ).strip()
        raw_mode = (mode if mode is not None else os.getenv("PAYPAL_MODE", "sandbox")).strip().lower()
        self.mode = raw_mode if raw_mode in ("sandbox", "live", "mock") else "sandbox"
        self.webhook_id = (webhook_id if webhook_id is not None else os.getenv("PAYPAL_WEBHOOK_ID", "")).strip()
        raw_intent = (escrow_intent if escrow_intent is not None else os.getenv("PAYPAL_ESCROW_INTENT", "AUTHORIZE")).strip().upper()
        self.escrow_intent = raw_intent if raw_intent in ("AUTHORIZE", "CAPTURE") else "AUTHORIZE"

        self.base_url = PAYPAL_LIVE_BASE_URL if self.mode == "live" else PAYPAL_SANDBOX_BASE_URL
        self.session = session or requests.Session()
        self.timeout = timeout
        self.max_retries = max(0, max_retries)
        self.base_retry_delay = max(0.0, base_retry_delay)

        # Cached OAuth2 Token
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0.0

        # In-memory mock store when mode == "mock"
        self._mock_orders: Dict[str, Dict[str, Any]] = {}
        self._mock_authorizations: Dict[str, Dict[str, Any]] = {}
        self._mock_captures: Dict[str, Dict[str, Any]] = {}

    def is_configured(self) -> bool:
        """Returns True if real credentials exist or explicit mock mode is enabled."""
        if self.mode == "mock":
            return True
        return (
            self.client_id.lower() not in _PLACEHOLDER_CREDS
            and self.client_secret.lower() not in _PLACEHOLDER_CREDS
        )

    def has_live_credentials(self) -> bool:
        """Returns True only when non-placeholder PayPal API credentials are present."""
        return (
            self.client_id.lower() not in _PLACEHOLDER_CREDS
            and self.client_secret.lower() not in _PLACEHOLDER_CREDS
        )

    def _require_credentials(self) -> None:
        if self.mode != "mock" and not self.has_live_credentials():
            raise PayPalConfigurationError(
                "PayPal Sandbox/Live credentials are not configured. "
                "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in backend/.env, "
                "or set PAYPAL_MODE=mock for offline simulation."
            )

    def _sleep_backoff(self, attempt: int, retry_after: Optional[str] = None) -> None:
        if self.base_retry_delay <= 0:
            return
        if retry_after:
            try:
                delay = min(float(retry_after), 10.0)
                if delay > 0:
                    time.sleep(delay)
                    return
            except ValueError:
                pass
        jitter = random.uniform(0.0, 0.25 * self.base_retry_delay)
        delay = min(self.base_retry_delay * (2 ** attempt) + jitter, 8.0)
        time.sleep(delay)

    @staticmethod
    def _parse_paypal_error(resp: requests.Response) -> Dict[str, Any]:
        try:
            body = resp.json()
        except ValueError:
            body = {"message": resp.text or f"HTTP {resp.status_code}"}

        debug_id = body.get("debug_id") or resp.headers.get("PayPal-Debug-Id")
        code = body.get("name") or f"PAYPAL_HTTP_{resp.status_code}"
        details = body.get("details") or []
        message = body.get("message") or body.get("error_description") or f"PayPal API error ({resp.status_code})"
        if details and isinstance(details, list):
            first_issue = details[0]
            if isinstance(first_issue, dict):
                issue = first_issue.get("issue")
                desc = first_issue.get("description")
                if issue and desc:
                    message = f"{message} [{issue}: {desc}]"
                    code = issue
        return {
            "code": code,
            "message": message,
            "debug_id": debug_id,
            "details": details if isinstance(details, list) else [],
            "raw": body if isinstance(body, dict) else {"raw": str(body)},
        }

    # -----------------------------------------------------------------------
    # 1. OAuth2 Token Management
    # -----------------------------------------------------------------------
    def get_access_token(self, force_refresh: bool = False) -> str:
        """Obtain and cache an OAuth2 access token from PayPal."""
        if self.mode == "mock":
            return "MOCK_PAYPAL_ACCESS_TOKEN"

        self._require_credentials()

        now = time.monotonic()
        if not force_refresh and self._access_token and now < self._token_expires_at:
            return self._access_token

        url = f"{self.base_url}/v1/oauth2/token"
        headers = {
            "Accept": "application/json",
            "Accept-Language": "en_US",
        }
        last_exc: Optional[Exception] = None

        for attempt in range(self.max_retries + 1):
            try:
                resp = self.session.post(
                    url,
                    auth=(self.client_id, self.client_secret),
                    headers=headers,
                    data={"grant_type": "client_credentials"},
                    timeout=self.timeout,
                )
            except (requests.Timeout, requests.ConnectionError) as exc:
                last_exc = PayPalTransientError(f"Network error contacting PayPal OAuth: {exc}")
                if attempt < self.max_retries:
                    self._sleep_backoff(attempt)
                    continue
                raise last_exc from exc
            except requests.RequestException as exc:
                raise PayPalPaymentError(f"PayPal OAuth request failed: {exc}") from exc

            if resp.status_code == 200:
                payload = resp.json()
                token = payload.get("access_token")
                if not token:
                    raise PayPalPaymentError("PayPal OAuth response missing access_token", raw=payload)
                expires_in = int(payload.get("expires_in", 300))
                self._access_token = token
                self._token_expires_at = time.monotonic() + max(30, expires_in - 60)
                return token

            parsed = self._parse_paypal_error(resp)
            if resp.status_code in _RETRYABLE_STATUS_CODES and attempt < self.max_retries:
                self._sleep_backoff(attempt, resp.headers.get("Retry-After"))
                continue

            if resp.status_code in (401, 403):
                raise PayPalPaymentError(
                    f"PayPal OAuth authentication rejected: {parsed['message']}",
                    code=parsed["code"],
                    status_code=resp.status_code,
                    debug_id=parsed["debug_id"],
                    details=parsed["details"],
                    raw=parsed["raw"],
                )

            if resp.status_code in _RETRYABLE_STATUS_CODES:
                raise PayPalTransientError(
                    parsed["message"],
                    code=parsed["code"],
                    status_code=resp.status_code,
                    debug_id=parsed["debug_id"],
                    details=parsed["details"],
                    raw=parsed["raw"],
                )

            raise PayPalPaymentError(
                parsed["message"],
                code=parsed["code"],
                status_code=resp.status_code,
                debug_id=parsed["debug_id"],
                details=parsed["details"],
                raw=parsed["raw"],
            )

        raise last_exc or PayPalTransientError("Failed to obtain PayPal OAuth token")

    # -----------------------------------------------------------------------
    # 2. Resilient HTTP Request Executor (Retries + Idempotency + 401 Refresh)
    # -----------------------------------------------------------------------
    def _request_with_retry(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Execute an authenticated PayPal REST call with:
        - Idempotency header (`PayPal-Request-Id`) preserved identically across all retries.
        - Automatic 401 OAuth token refresh once per request.
        - Exponential backoff + jitter for transient 429/5xx/network failures.
        """
        url = f"{self.base_url}{path}"
        token_refreshed = False

        for attempt in range(self.max_retries + 1):
            token = self.get_access_token(force_refresh=token_refreshed)
            headers: Dict[str, str] = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Prefer": "return=representation",
            }
            if idempotency_key:
                headers["PayPal-Request-Id"] = idempotency_key[:108]
            if extra_headers:
                headers.update(extra_headers)

            try:
                resp = self.session.request(
                    method=method.upper(),
                    url=url,
                    headers=headers,
                    json=json_body,
                    timeout=self.timeout,
                )
            except (requests.Timeout, requests.ConnectionError) as exc:
                logger.warning(
                    f"[PayPal] Transient network error on {method} {path} (attempt {attempt + 1}/{self.max_retries + 1}): {exc}"
                )
                if attempt < self.max_retries:
                    self._sleep_backoff(attempt)
                    continue
                raise PayPalTransientError(
                    f"PayPal network request timed out/failed after {self.max_retries + 1} attempts: {exc}"
                ) from exc
            except requests.RequestException as exc:
                raise PayPalPaymentError(f"PayPal HTTP client error: {exc}") from exc

            # Handle expired OAuth token once
            if resp.status_code == 401 and not token_refreshed:
                logger.info("[PayPal] Received 401; refreshing OAuth token and retrying once.")
                token_refreshed = True
                self._access_token = None
                continue

            if 200 <= resp.status_code < 300:
                if resp.status_code == 204 or not resp.content:
                    return {"status": "NO_CONTENT"}
                try:
                    return resp.json()
                except ValueError:
                    return {"status": "OK", "raw_text": resp.text}

            parsed = self._parse_paypal_error(resp)
            logger.warning(
                f"[PayPal] {method} {path} failed HTTP {resp.status_code} "
                f"(code={parsed['code']}, debug_id={parsed['debug_id']}): {parsed['message']}"
            )

            if resp.status_code in _RETRYABLE_STATUS_CODES:
                if attempt < self.max_retries:
                    self._sleep_backoff(attempt, resp.headers.get("Retry-After"))
                    continue
                raise PayPalTransientError(
                    parsed["message"],
                    code=parsed["code"],
                    status_code=resp.status_code,
                    debug_id=parsed["debug_id"],
                    details=parsed["details"],
                    raw=parsed["raw"],
                )

            # Deterministic 4xx error — do NOT retry
            raise PayPalPaymentError(
                parsed["message"],
                code=parsed["code"],
                status_code=resp.status_code,
                debug_id=parsed["debug_id"],
                details=parsed["details"],
                raw=parsed["raw"],
            )

        raise PayPalTransientError(f"Exhausted retries calling PayPal {method} {path}")

    # -----------------------------------------------------------------------
    # 3. Orders v2: Create Escrow Order (intent: AUTHORIZE)
    # -----------------------------------------------------------------------
    def create_escrow_order(
        self,
        *,
        contract_id: int | str,
        amount: Decimal | float | str,
        currency: str = "USD",
        description: Optional[str] = None,
        return_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
        intent: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a PayPal Orders v2 order (`intent: AUTHORIZE` or `CAPTURE`) to fund escrow upfront.
        Returns `order_id`, `status`, `intent`, `approval_url`, `idempotency_key`, and `raw`.
        """
        order_intent = (intent or self.escrow_intent or "AUTHORIZE").strip().upper()
        if order_intent not in ("AUTHORIZE", "CAPTURE"):
            order_intent = "AUTHORIZE"

        currency_code, formatted_amount = normalize_paypal_currency_and_amount(amount, currency)
        req_id = idempotency_key or build_idempotency_key("order", contract_id, order_intent, currency_code, formatted_amount)
        desc = (description or f"TrustPay AI Escrow Contract #{contract_id}")[:127]

        payload: Dict[str, Any] = {
            "intent": order_intent,
            "purchase_units": [
                {
                    "reference_id": f"contract-{contract_id}",
                    "custom_id": str(contract_id),
                    "description": desc,
                    "amount": {
                        "currency_code": currency_code,
                        "value": formatted_amount,
                    },
                }
            ],
        }

        experience_ctx: Dict[str, Any] = {
            "brand_name": "TrustPay AI Escrow",
            "landing_page": "LOGIN",
            "shipping_preference": "NO_SHIPPING",
            "user_action": "PAY_NOW" if order_intent == "CAPTURE" else "CONTINUE",
        }
        if return_url and cancel_url:
            experience_ctx["return_url"] = return_url
            experience_ctx["cancel_url"] = cancel_url
            payload["payment_source"] = {
                "paypal": {
                    "experience_context": experience_ctx,
                }
            }
        else:
            payload["application_context"] = experience_ctx

        if self.mode == "mock":
            order_id = f"MOCK-ORD-{contract_id}-{uuid.uuid4().hex[:10].upper()}"
            mock_approve = f"https://www.sandbox.paypal.com/checkoutnow?token={order_id}"
            raw = {
                "id": order_id,
                "intent": order_intent,
                "status": "CREATED",
                "purchase_units": payload["purchase_units"],
                "links": [
                    {"href": f"{self.base_url}/v2/checkout/orders/{order_id}", "rel": "self", "method": "GET"},
                    {"href": mock_approve, "rel": "approve", "method": "GET"},
                    {"href": f"{self.base_url}/v2/checkout/orders/{order_id}/authorize", "rel": "authorize", "method": "POST"},
                ],
            }
            self._mock_orders[order_id] = raw
            return {
                "order_id": order_id,
                "status": "CREATED",
                "intent": order_intent,
                "approval_url": mock_approve,
                "amount": formatted_amount,
                "currency": currency_code,
                "idempotency_key": req_id,
                "mode": self.mode,
                "raw": raw,
            }

        raw = self._request_with_retry(
            "POST",
            "/v2/checkout/orders",
            json_body=payload,
            idempotency_key=req_id,
        )

        approval_url = None
        for link in raw.get("links", []):
            if link.get("rel") in ("approve", "payer-action"):
                approval_url = link.get("href")
                break

        return {
            "order_id": raw["id"],
            "status": raw.get("status", "CREATED"),
            "intent": raw.get("intent", order_intent),
            "approval_url": approval_url,
            "amount": formatted_amount,
            "currency": currency_code,
            "idempotency_key": req_id,
            "mode": self.mode,
            "raw": raw,
        }

    def get_order_details(self, order_id: str) -> Dict[str, Any]:
        """Fetch current Orders v2 order details."""
        if self.mode == "mock":
            if order_id in self._mock_orders:
                return self._mock_orders[order_id]
            return {
                "id": order_id,
                "intent": "AUTHORIZE",
                "status": "APPROVED",
            }
        return self._request_with_retry("GET", f"/v2/checkout/orders/{order_id}")

    # -----------------------------------------------------------------------
    # 4. Orders v2: Authorize Approved Escrow Order
    # -----------------------------------------------------------------------
    def authorize_order(
        self,
        *,
        order_id: str,
        contract_id: Optional[int | str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Authorize a payer-approved PayPal order (`POST /v2/checkout/orders/{id}/authorize`).
        Extracts the `authorization_id` used for subsequent partwise milestone captures.
        """
        req_id = idempotency_key or build_idempotency_key("auth", contract_id or order_id, order_id)

        if self.mode == "mock":
            auth_id = f"MOCK-AUTH-{uuid.uuid4().hex[:12].upper()}"
            order_obj = self._mock_orders.get(order_id, {})
            pu = (order_obj.get("purchase_units") or [{}])[0]
            amt = pu.get("amount", {"currency_code": "USD", "value": "0.00"})
            auth_record = {
                "id": auth_id,
                "status": "CREATED",
                "amount": amt,
                "expiration_time": "2026-12-31T23:59:59Z",
            }
            self._mock_authorizations[auth_id] = auth_record
            raw = {
                "id": order_id,
                "status": "COMPLETED",
                "intent": "AUTHORIZE",
                "purchase_units": [
                    {
                        **pu,
                        "payments": {"authorizations": [auth_record]},
                    }
                ],
            }
            self._mock_orders[order_id] = raw
            return {
                "order_id": order_id,
                "authorization_id": auth_id,
                "status": "CREATED",
                "order_status": "COMPLETED",
                "amount": amt.get("value"),
                "currency": amt.get("currency_code", "USD"),
                "expiration_time": auth_record["expiration_time"],
                "idempotency_key": req_id,
                "mode": self.mode,
                "raw": raw,
            }

        try:
            raw = self._request_with_retry(
                "POST",
                f"/v2/checkout/orders/{order_id}/authorize",
                json_body={},
                idempotency_key=req_id,
            )
        except PayPalPaymentError as exc:
            # Handle idempotent retry where order was already authorized earlier
            if "ORDER_ALREADY_AUTHORIZED" in exc.code or "already authorized" in exc.message.lower():
                raw = self.get_order_details(order_id)
            else:
                raise

        auth_obj = self._extract_authorization_from_order(raw)
        if not auth_obj or not auth_obj.get("id"):
            raise PayPalPaymentError(
                f"PayPal order {order_id} did not return an authorization object.",
                code="MISSING_AUTHORIZATION",
                status_code=422,
                raw=raw,
            )

        auth_status = auth_obj.get("status", "UNKNOWN")
        if auth_status in ("DENIED", "VOIDED", "EXPIRED"):
            raise PayPalPaymentError(
                f"PayPal authorization {auth_obj['id']} returned terminal failure status '{auth_status}'.",
                code=f"AUTHORIZATION_{auth_status}",
                status_code=422,
                raw=raw,
            )

        amt = auth_obj.get("amount", {})
        return {
            "order_id": raw.get("id", order_id),
            "authorization_id": auth_obj["id"],
            "status": auth_status,
            "order_status": raw.get("status", "COMPLETED"),
            "amount": amt.get("value"),
            "currency": amt.get("currency_code", "USD"),
            "expiration_time": auth_obj.get("expiration_time"),
            "idempotency_key": req_id,
            "mode": self.mode,
            "raw": raw,
        }

    @staticmethod
    def _extract_authorization_from_order(order_payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for pu in order_payload.get("purchase_units", []):
            auths = pu.get("payments", {}).get("authorizations", [])
            if auths:
                return auths[0]
        return None

    def get_authorization_details(self, authorization_id: str) -> Dict[str, Any]:
        """Fetch live authorization status and remaining balance from Payments v2."""
        if self.mode == "mock":
            return self._mock_authorizations.get(
                authorization_id,
                {"id": authorization_id, "status": "CREATED"},
            )
        return self._request_with_retry("GET", f"/v2/payments/authorizations/{authorization_id}")

    def capture_escrow_order(
        self,
        *,
        order_id: str,
        contract_id: Optional[int | str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Capture a payer-approved `intent: CAPTURE` escrow deposit order upfront
        (`POST /v2/checkout/orders/{order_id}/capture`).
        Debits the buyer into TrustPay's Escrow Vault immediately (compatible with IN & US merchants).
        """
        req_id = idempotency_key or build_idempotency_key("capord", contract_id or order_id, order_id)

        if self.mode == "mock":
            cap_id = f"MOCK-DEP-{uuid.uuid4().hex[:12].upper()}"
            order_obj = self._mock_orders.get(order_id, {})
            pu = (order_obj.get("purchase_units") or [{}])[0]
            amt = pu.get("amount", {"currency_code": "USD", "value": "0.00"})
            cap_record = {"id": cap_id, "status": "COMPLETED", "amount": amt}
            self._mock_captures[cap_id] = cap_record
            raw = {
                "id": order_id,
                "status": "COMPLETED",
                "intent": "CAPTURE",
                "purchase_units": [{**pu, "payments": {"captures": [cap_record]}}],
            }
            return {
                "order_id": order_id,
                "capture_id": cap_id,
                "status": "COMPLETED",
                "order_status": "COMPLETED",
                "amount": amt.get("value"),
                "currency": amt.get("currency_code", "USD"),
                "idempotency_key": req_id,
                "mode": self.mode,
                "raw": raw,
            }

        try:
            raw = self._request_with_retry(
                "POST",
                f"/v2/checkout/orders/{order_id}/capture",
                json_body={},
                idempotency_key=req_id,
            )
        except PayPalPaymentError as exc:
            if "ORDER_ALREADY_CAPTURED" in exc.code or "already captured" in exc.message.lower():
                raw = self.get_order_details(order_id)
            else:
                raise

        cap_obj = None
        for pu in raw.get("purchase_units", []):
            caps = pu.get("payments", {}).get("captures", [])
            if caps:
                cap_obj = caps[0]
                break

        if not cap_obj or not cap_obj.get("id"):
            raise PayPalPaymentError(
                f"PayPal order {order_id} did not return a capture object.",
                code="MISSING_CAPTURE",
                status_code=422,
                raw=raw,
            )

        cap_status = cap_obj.get("status", "UNKNOWN")
        if cap_status not in ("COMPLETED", "PENDING"):
            raise PayPalPaymentError(
                f"PayPal escrow deposit capture failed with status '{cap_status}'.",
                code=f"CAPTURE_{cap_status}",
                status_code=422,
                raw=raw,
            )

        amt = cap_obj.get("amount", {})
        return {
            "order_id": raw.get("id", order_id),
            "capture_id": cap_obj["id"],
            "status": cap_status,
            "order_status": raw.get("status", "COMPLETED"),
            "amount": amt.get("value"),
            "currency": amt.get("currency_code", "USD"),
            "idempotency_key": req_id,
            "mode": self.mode,
            "raw": raw,
        }

    # -----------------------------------------------------------------------
    # 5. Payments v2: Partwise Milestone Capture
    # -----------------------------------------------------------------------
    def capture_milestone_payment(
        self,
        *,
        authorization_id: str,
        amount: Decimal | float | str,
        currency: str = "USD",
        contract_id: Optional[int | str] = None,
        milestone_id: Optional[int | str] = None,
        final_capture: bool = False,
        note_to_payer: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute a partial or final capture against an authorized escrow payment:
        `POST /v2/payments/authorizations/{authorization_id}/capture`
        """
        currency_code, formatted_amount = normalize_paypal_currency_and_amount(amount, currency)
        req_id = idempotency_key or build_idempotency_key(
            "capture", contract_id or authorization_id, milestone_id or formatted_amount
        )

        payload: Dict[str, Any] = {
            "amount": {
                "currency_code": currency_code,
                "value": formatted_amount,
            },
            "final_capture": bool(final_capture),
        }
        if note_to_payer:
            payload["note_to_payer"] = note_to_payer[:255]
        if contract_id is not None and milestone_id is not None:
            payload["invoice_id"] = f"TP-C{contract_id}-M{milestone_id}"[:127]

        if self.mode == "mock":
            capture_id = f"MOCK-CAP-{uuid.uuid4().hex[:12].upper()}"
            raw = {
                "id": capture_id,
                "status": "COMPLETED",
                "amount": payload["amount"],
                "final_capture": bool(final_capture),
                "invoice_id": payload.get("invoice_id"),
            }
            self._mock_captures[capture_id] = raw
            return {
                "capture_id": capture_id,
                "authorization_id": authorization_id,
                "status": "COMPLETED",
                "amount": formatted_amount,
                "currency": currency_code,
                "final_capture": bool(final_capture),
                "idempotency_key": req_id,
                "mode": self.mode,
                "raw": raw,
            }

        raw = self._request_with_retry(
            "POST",
            f"/v2/payments/authorizations/{authorization_id}/capture",
            json_body=payload,
            idempotency_key=req_id,
        )

        capture_status = raw.get("status", "UNKNOWN")
        if capture_status not in ("COMPLETED", "PENDING"):
            raise PayPalPaymentError(
                f"PayPal capture failed with status '{capture_status}'.",
                code=f"CAPTURE_{capture_status}",
                status_code=422,
                raw=raw,
            )

        cap_amt = raw.get("amount", {})
        return {
            "capture_id": raw["id"],
            "authorization_id": authorization_id,
            "status": capture_status,
            "amount": cap_amt.get("value", formatted_amount),
            "currency": cap_amt.get("currency_code", currency_code),
            "final_capture": bool(raw.get("final_capture", final_capture)),
            "idempotency_key": req_id,
            "mode": self.mode,
            "raw": raw,
        }

    # -----------------------------------------------------------------------
    # 6. Void Authorization & Refund Capture (Cancellations / Disputes)
    # -----------------------------------------------------------------------
    def void_authorization(
        self,
        *,
        authorization_id: str,
        contract_id: Optional[int | str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Void remaining uncaptured authorized escrow funds."""
        req_id = idempotency_key or build_idempotency_key("void", contract_id or authorization_id, authorization_id)

        if self.mode == "mock":
            if authorization_id in self._mock_authorizations:
                self._mock_authorizations[authorization_id]["status"] = "VOIDED"
            return {
                "authorization_id": authorization_id,
                "status": "VOIDED",
                "idempotency_key": req_id,
                "mode": self.mode,
            }

        raw = self._request_with_retry(
            "POST",
            f"/v2/payments/authorizations/{authorization_id}/void",
            idempotency_key=req_id,
        )
        return {
            "authorization_id": authorization_id,
            "status": raw.get("status", "VOIDED"),
            "idempotency_key": req_id,
            "mode": self.mode,
            "raw": raw,
        }

    def refund_capture(
        self,
        *,
        capture_id: str,
        amount: Optional[Decimal | float | str] = None,
        currency: str = "USD",
        note_to_payer: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Refund a full or partial captured milestone payment (used in dispute splits)."""
        req_id = idempotency_key or build_idempotency_key("refund", capture_id, amount or "full")
        payload: Dict[str, Any] = {}
        currency_code = (currency or "USD").upper()
        if amount is not None:
            currency_code, formatted_refund = normalize_paypal_currency_and_amount(amount, currency_code)
            payload["amount"] = {
                "currency_code": currency_code,
                "value": formatted_refund,
            }
        if note_to_payer:
            payload["note_to_payer"] = note_to_payer[:255]

        if self.mode == "mock":
            refund_id = f"MOCK-REF-{uuid.uuid4().hex[:12].upper()}"
            raw = {
                "id": refund_id,
                "status": "COMPLETED",
                "amount": payload.get("amount"),
            }
            return {
                "refund_id": refund_id,
                "capture_id": capture_id,
                "status": "COMPLETED",
                "amount": payload.get("amount", {}).get("value"),
                "currency": (currency or "USD").upper(),
                "idempotency_key": req_id,
                "mode": self.mode,
                "raw": raw,
            }

        raw = self._request_with_retry(
            "POST",
            f"/v2/payments/captures/{capture_id}/refund",
            json_body=payload or {},
            idempotency_key=req_id,
        )
        refund_status = raw.get("status", "UNKNOWN")
        if refund_status not in ("COMPLETED", "PENDING"):
            raise PayPalPaymentError(
                f"PayPal refund failed with status '{refund_status}'.",
                code=f"REFUND_{refund_status}",
                status_code=422,
                raw=raw,
            )
        return {
            "refund_id": raw["id"],
            "capture_id": capture_id,
            "status": refund_status,
            "amount": raw.get("amount", {}).get("value") or (payload.get("amount", {}) or {}).get("value"),
            "currency": (currency or "USD").upper(),
            "idempotency_key": req_id,
            "mode": self.mode,
            "raw": raw,
        }

    # -----------------------------------------------------------------------
    # 7. Payouts v1: Disburse Funds to Freelancer / Influencer PayPal Email
    # -----------------------------------------------------------------------
    def create_payout(
        self,
        *,
        recipient_email: str,
        amount: Decimal | float | str,
        currency: str = "USD",
        contract_id: Optional[int | str] = None,
        milestone_id: Optional[int | str] = None,
        note: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Disburse verified milestone funds to talent's PayPal email via Payouts v1 API."""
        if not recipient_email or "@" not in recipient_email:
            raise ValueError(f"Invalid PayPal recipient email: {recipient_email}")

        currency_code, formatted_amount = normalize_paypal_currency_and_amount(amount, currency)
        req_id = idempotency_key or build_idempotency_key(
            "payout", contract_id or "c", milestone_id or uuid.uuid4().hex[:8]
        )

        payload = {
            "sender_batch_header": {
                "sender_batch_id": req_id[:127],
                "email_subject": "TrustPay AI Milestone Escrow Payout",
                "email_message": note or "Your verified milestone deliverable has been paid out via TrustPay AI.",
            },
            "items": [
                {
                    "recipient_type": "EMAIL",
                    "amount": {
                        "value": formatted_amount,
                        "currency": currency_code,
                    },
                    "note": note or f"Milestone #{milestone_id} payout on Contract #{contract_id}",
                    "sender_item_id": f"c{contract_id}-m{milestone_id}"[:63],
                    "receiver": recipient_email.strip(),
                }
            ],
        }

        if self.mode == "mock":
            batch_id = f"MOCK-BATCH-{uuid.uuid4().hex[:10].upper()}"
            raw = {
                "batch_header": {
                    "payout_batch_id": batch_id,
                    "batch_status": "PENDING",
                }
            }
            return {
                "payout_batch_id": batch_id,
                "batch_status": "PENDING",
                "recipient_email": recipient_email.strip(),
                "amount": formatted_amount,
                "currency": currency_code,
                "idempotency_key": req_id,
                "mode": self.mode,
                "raw": raw,
            }

        raw = self._request_with_retry(
            "POST",
            "/v1/payments/payouts",
            json_body=payload,
            idempotency_key=req_id,
        )
        batch_header = raw.get("batch_header", {})
        return {
            "payout_batch_id": batch_header.get("payout_batch_id"),
            "batch_status": batch_header.get("batch_status", "PENDING"),
            "recipient_email": recipient_email.strip(),
            "amount": formatted_amount,
            "currency": currency_code,
            "idempotency_key": req_id,
            "mode": self.mode,
            "raw": raw,
        }

    # -----------------------------------------------------------------------
    # 8. Webhook Signature Verification
    # -----------------------------------------------------------------------
    def verify_webhook_signature(
        self,
        *,
        headers: Dict[str, str],
        webhook_event: Dict[str, Any],
        webhook_id: Optional[str] = None,
    ) -> bool:
        """
        Verify PayPal webhook cryptographic signature via:
        `POST /v1/notifications/verify-webhook-signature`
        """
        normalized_headers = {k.lower(): v for k, v in headers.items()}
        required_keys = (
            "paypal-auth-algo",
            "paypal-cert-url",
            "paypal-transmission-id",
            "paypal-transmission-sig",
            "paypal-transmission-time",
        )
        if not all(normalized_headers.get(k) for k in required_keys):
            return False

        if self.mode == "mock":
            return normalized_headers.get("paypal-transmission-sig") != "INVALID_SIGNATURE"

        target_webhook_id = (webhook_id or self.webhook_id or "").strip()
        if not target_webhook_id:
            logger.warning("[PayPal] PAYPAL_WEBHOOK_ID is not set; cannot verify webhook signature.")
            return False

        payload = {
            "auth_algo": normalized_headers["paypal-auth-algo"],
            "cert_url": normalized_headers["paypal-cert-url"],
            "transmission_id": normalized_headers["paypal-transmission-id"],
            "transmission_sig": normalized_headers["paypal-transmission-sig"],
            "transmission_time": normalized_headers["paypal-transmission-time"],
            "webhook_id": target_webhook_id,
            "webhook_event": webhook_event,
        }

        raw = self._request_with_retry(
            "POST",
            "/v1/notifications/verify-webhook-signature",
            json_body=payload,
        )
        return raw.get("verification_status") == "SUCCESS"
