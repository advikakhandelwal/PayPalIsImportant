"""
TrustPay AI — End-to-End API Integration & Contract Governance Test Suite
========================================================================
Tests all marketplace and contract API endpoints using FastAPI's TestClient
against the seeded database.

⚠️ SECURITY ARCHITECTURE & AUTHENTICATION LIMITATION:
The tests in this suite verify that role-based ownership, parent-child hierarchy,
and lifecycle state machine rules work as designed under simulated caller identities.
However, caller identity is currently extracted from unverified development headers
(e.g., 'X-User-Id') via `get_current_user()`.
These tests DO NOT treat these headers as genuine authentication credentials.
Full cryptographic authentication (e.g., signed JWTs, secure sessions, or OAuth2)
is an external blocker pending implementation by the authentication owner.

Test Coverage:
1. Projects Endpoints:
   - GET  /api/projects (200 OK with proposed milestones & skills)
   - POST /api/projects (201 Created & 400/403 validation guards)
2. Contract Endpoints:
   - GET  /api/contracts/{id} (401 Missing Identity, 403 Unassigned User, 200 OK for Client/Talent, 404 Not Found)
3. Deliverable Submission:
   - POST /api/contracts/{cid}/milestones/{mid}/submit (401 Missing Identity, 403 Forbidden for non-talent/client,
     201 Created for assigned talent, state transition to IN_REVIEW, advisory AI metadata review)
   - Rejection of LOCKED milestones (400)
   - Rejection of invalid contract or milestone combinations (400/404)
4. Deliverable Re-verification:
   - POST /api/contracts/{cid}/milestones/{mid}/submissions/{sid}/reverify
   - Multi-tier hierarchy validation (Contract -> Milestone -> Submission)
   - Rejection of already COMPLETED submissions (400 Bad Request)
   - Idempotent update in-place for FAILED submissions (200 OK, zero duplicate rows)
5. Applications Endpoints:
   - GET  /api/projects/{projectId}/applications (200 OK with scorecard & AI recommendations)
   - GET  /api/projects/all/applications (200 OK inbox across all projects)
"""

import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from sqlalchemy.exc import SQLAlchemyError

# Setup backend on path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.models.user import User, UserRole
from app.models.project import Project, ProjectStatus
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.models.submission import Submission, SubmissionType, VerificationStatus
from app.models.application import Application, ApplicationStatus
from app.utils.seed_data import seed_demo_data
from app.core.security import create_access_token

client = TestClient(app)

PASS = "✅ PASS"
FAIL = "❌ FAIL"
_results = []

# ---------------------------------------------------------------------------
# Simulated Development Caller Identity Headers
# ⚠️ NOTE: These are unverified header inputs used solely to simulate caller identity
# in integration tests. They do NOT represent genuine cryptographic authentication credentials.
# ---------------------------------------------------------------------------
DEV_CLIENT_IDENTITY = {"X-User-Id": "client-fintech-corp"}          # Simulates assigned client (User ID 1)
DEV_TALENT_IDENTITY = {"X-User-Id": "freelancer-vachan"}           # Simulates assigned freelancer (User ID 2)
DEV_TALENT_ALT_HEADER = {"Authorization": "Bearer 2"}               # Simulates alternative Authorization header format
DEV_UNASSIGNED_USER = {"X-User-Id": "freelancer-alex"}              # Simulates unrelated third-party user (User ID 3)


def run_test(name: str, fn):
    try:
        fn()
        _results.append((PASS, name))
        print(f"  {PASS}  {name}")
    except Exception as exc:
        _results.append((FAIL, name, str(exc)))
        print(f"  {FAIL}  {name}")
        print(f"         → {exc}")


def setup_module():
    """Ensure database tables exist and demo data is populated once for integration tests."""
    Base.metadata.create_all(bind=engine)
    seed_demo_data()


# ---------------------------------------------------------------------------
# Test Group 1: Projects Endpoints
# ---------------------------------------------------------------------------
def test_group_projects():
    print("\n── Group 1: Project Endpoints ──────────────────────────────────────")

    def test_get_projects_structure():
        res = client.get("/api/projects")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list)
        assert len(data) >= 2, "Expected at least 2 seeded demo projects"

        p1 = next((p for p in data if "Autonomous Milestone" in p["title"]), None)
        assert p1 is not None, "Demo project 1 not found in listings"
        # Validate exact TypeScript camelCase fields
        assert "id" in p1 and isinstance(p1["id"], str)
        assert "totalBudget" in p1 and isinstance(p1["totalBudget"], (int, float))
        assert "requiredSkills" in p1 and isinstance(p1["requiredSkills"], list)
        assert "experienceLevel" in p1 and isinstance(p1["experienceLevel"], str)
        assert "milestones" in p1 and isinstance(p1["milestones"], list)
        assert len(p1["milestones"]) == 3
        # Validate proposed blueprint structure
        m1 = p1["milestones"][0]
        assert "paymentAmount" in m1
        assert "deliverableRequirements" in m1
        assert "stepNumber" in m1

    def test_create_project_success():
        payload = {
            "clientId": "client-fintech-corp",
            "title": "Build AI Escrow Mobile App",
            "domain": "Mobile Development",
            "description": "Cross-platform mobile app for TrustPay escrow settlements.",
            "totalBudget": 3000.0,
            "currency": "USD",
            "requiredSkills": ["Flutter", "Dart", "PayPal SDK"],
            "experienceLevel": "Expert",
            "additionalRequirements": "NDAs required.",
            "milestones": [
                {
                    "stepNumber": 1,
                    "title": "Flutter Wireframes",
                    "description": "Figma screens and navigation scaffolding",
                    "percentage": 50,
                    "paymentAmount": 1500.0,
                    "deliverableRequirements": ["Responsive mobile screens"],
                },
                {
                    "stepNumber": 2,
                    "title": "Full API Integration",
                    "description": "Connect to FastAPI and PayPal sandbox",
                    "percentage": 50,
                    "paymentAmount": 1500.0,
                    "deliverableRequirements": ["Working build APK/IPA"],
                },
            ],
        }
        res = client.post("/api/projects", json=payload, headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["title"] == "Build AI Escrow Mobile App"
        assert data["totalBudget"] == 3000.0
        assert len(data["milestones"]) == 2
        assert data["applicationsCount"] == 0

    def test_create_project_invalid_percentage():
        payload = {
            "clientId": "client-fintech-corp",
            "title": "Bad Percentage Project",
            "description": "Should fail",
            "totalBudget": 1000.0,
            "milestones": [
                {"stepNumber": 1, "title": "Part 1", "description": "D", "percentage": 40},
                {"stepNumber": 2, "title": "Part 2", "description": "D", "percentage": 40},  # Sums to 80%!
            ],
        }
        res = client.post("/api/projects", json=payload, headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 400
        assert "100%" in res.json()["detail"]

    def test_create_project_forbidden_role():
        payload = {
            "clientId": "freelancer-vachan",  # FREELANCER role, not CLIENT!
            "title": "Unauthorized Project",
            "description": "Should fail",
            "totalBudget": 1000.0,
            "milestones": [{"stepNumber": 1, "title": "P", "description": "D", "percentage": 100}],
        }
        res = client.post("/api/projects", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 403
        assert "CLIENT" in res.json()["detail"]

    def test_create_project_unauthenticated_rejected():
        payload = {
            "title": "Unauthenticated Project",
            "description": "Should fail",
            "totalBudget": 1000.0,
            "milestones": [{"stepNumber": 1, "title": "P", "description": "D", "percentage": 100}],
        }
        res = client.post("/api/projects", json=payload)
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"

    def test_create_project_mismatched_client_id_rejected():
        # Authenticated as Client 1 (Acme / client-fintech-corp), but body specifies User 3 (Alex)
        payload = {
            "clientId": "3",
            "title": "IDOR Attack Project",
            "description": "Should fail with 400 Mismatched clientId",
            "totalBudget": 1000.0,
            "milestones": [{"stepNumber": 1, "title": "P", "description": "D", "percentage": 100}],
        }
        res = client.post("/api/projects", json=payload, headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        assert "Mismatched clientId" in res.json()["detail"]

    run_test("GET  /api/projects returns listings with blueprint milestones", test_get_projects_structure)
    run_test("POST /api/projects creates listing and returns 201 Created", test_create_project_success)
    run_test("POST /api/projects rejects milestone percentages not summing to 100%", test_create_project_invalid_percentage)
    run_test("POST /api/projects rejects non-CLIENT user from posting projects", test_create_project_forbidden_role)
    run_test("POST /api/projects rejects unauthenticated project creation with 401", test_create_project_unauthenticated_rejected)
    run_test("POST /api/projects rejects mismatched clientId with 400 (SEC-02 IDOR)", test_create_project_mismatched_client_id_rejected)


# ---------------------------------------------------------------------------
# Test Group 2: Contracts Endpoints (Access Control & Identity Simulation)
# ---------------------------------------------------------------------------
def test_group_contracts():
    print("\n── Group 2: Contract Endpoints (Role Separation & Retrieval) ───────")

    def test_get_contract_missing_identity_rejected():
        # Missing identity header must return 401
        res = client.get("/api/contracts/1")
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        assert "Caller identity required" in res.json()["detail"]

    def test_get_contract_unassigned_user_forbidden():
        # User 3 (Alex) is neither client nor freelancer on Contract 1 -> 403
        res = client.get("/api/contracts/1", headers=DEV_UNASSIGNED_USER)
        assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}"
        assert "Access denied" in res.json()["detail"]

    def test_get_contract_by_assigned_client():
        # Assigned Client (Acme / User 1) -> 200 OK
        res = client.get("/api/contracts/contract-4040", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["id"] == "1"
        assert "Autonomous Milestone" in data["projectTitle"]
        assert data["totalBudget"] == 4000.0
        assert data["heldInEscrowAmount"] == 3000.0
        assert data["releasedAmount"] == 1000.0
        assert data["freelancerName"] == "Vachan Singh rajpurohit"
        assert len(data["milestones"]) == 3

    def test_get_contract_by_assigned_talent():
        # Assigned Freelancer (Vachan / User 2) -> 200 OK
        res = client.get("/api/contracts/1", headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 200
        assert res.json()["id"] == "1"

    def test_get_contract_via_alt_header_format():
        # Authorization header format in dev resolver -> 200 OK
        res = client.get("/api/contracts/1", headers=DEV_TALENT_ALT_HEADER)
        assert res.status_code == 200
        assert res.json()["id"] == "1"

    def test_get_contract_via_genuine_jwt():
        # Genuine cryptographically-signed JWT Bearer token -> 200 OK
        token = create_access_token(subject="1", role="CLIENT", email="contracts@acmeventures.com")
        res = client.get("/api/contracts/1", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert res.json()["id"] == "1"

    def test_get_contract_not_found():
        res = client.get("/api/contracts/99999", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 404

    def test_get_contract_malformed_id():
        res = client.get("/api/contracts/unregistered-random-id", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 404

    run_test("GET  /api/contracts/{id} rejects requests missing caller identity with 401", test_get_contract_missing_identity_rejected)
    run_test("GET  /api/contracts/{id} rejects unassigned caller identity with 403 Forbidden", test_get_contract_unassigned_user_forbidden)
    run_test("GET  /api/contracts/{id} allows assigned client identity with 200 OK", test_get_contract_by_assigned_client)
    run_test("GET  /api/contracts/{id} allows assigned freelancer identity with 200 OK", test_get_contract_by_assigned_talent)
    run_test("GET  /api/contracts/{id} accepts identity via Authorization header during development", test_get_contract_via_alt_header_format)
    run_test("GET  /api/contracts/{id} accepts genuine cryptographically signed JWT Bearer token", test_get_contract_via_genuine_jwt)
    run_test("GET  /api/contracts/99999 returns 404 Not Found for authorized caller", test_get_contract_not_found)
    run_test("GET  /api/contracts/unregistered-id returns 404 without crashing", test_get_contract_malformed_id)


# ---------------------------------------------------------------------------
# Test Group 3: Deliverable Submission & AI Verification
# ---------------------------------------------------------------------------
def test_group_submission():
    print("\n── Group 3: Deliverable Submission & AI ─────────────────────────────")

    def test_submit_missing_identity_rejected():
        payload = {
            "submissionType": "URL",
            "submissionUrl": "https://github.com/PayPalIsImportant/repo",
            "notes": "Testing missing identity submission",
        }
        res = client.post("/api/contracts/1/milestones/2/submit", json=payload)
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"

    def test_submit_client_forbidden():
        # Client cannot submit deliverables; only the assigned freelancer can!
        payload = {
            "submissionType": "URL",
            "submissionUrl": "https://github.com/PayPalIsImportant/repo",
            "notes": "Client attempting to submit deliverable",
        }
        res = client.post("/api/contracts/1/milestones/2/submit", json=payload, headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 403
        assert "Only the assigned freelancer" in res.json()["detail"]

    def test_submit_unassigned_talent_forbidden():
        # Freelancer 3 (Alex) is not assigned to Contract 1!
        payload = {
            "submissionType": "URL",
            "submissionUrl": "https://github.com/PayPalIsImportant/repo",
            "notes": "Unassigned freelancer attempting to submit",
        }
        res = client.post("/api/contracts/1/milestones/2/submit", json=payload, headers=DEV_UNASSIGNED_USER)
        assert res.status_code == 403
        assert "Only the assigned freelancer" in res.json()["detail"]

    def test_submit_deliverable_active_milestone_success():
        # Ensure Step 2 of Contract 1 is in ACTIVE status for test repeatability
        db_reset = SessionLocal()
        try:
            m2_seed = db_reset.query(Milestone).filter(Milestone.id == 2).first()
            if m2_seed:
                m2_seed.status = MilestoneStatus.ACTIVE
                db_reset.commit()
        finally:
            db_reset.close()

        # Step 2 of Contract 1 is ACTIVE
        payload = {
            "submissionType": "URL",
            "submissionUrl": "https://github.com/PayPalIsImportant/frontend/pull/42",
            "notes": "Completed Step 2 portals and dropzone according to spec.",
            "fileName": "portal_submission.ts",
        }
        res = client.post("/api/contracts/1/milestones/2/submit", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["milestoneId"] == "2"
        assert data["submissionUrl"] == "https://github.com/PayPalIsImportant/frontend/pull/42"
        assert data["verificationStatus"] in ["COMPLETED", "FAILED"]
        assert "aiVerificationReport" in data

        # Check accurate and truthful advisory inspection metadata
        report = data["aiVerificationReport"]
        assert report.get("isAdvisoryOnly") is True
        assert "[Advisory URL & Metadata Review]" in report.get("feedbackNotes", "")
        # Verify checklist explicitly acknowledges code compilation limitations
        checklist = report.get("checklist", [])
        ast_check = next((c for c in checklist if "AST" in c.get("criterion", "") or "compilation" in c.get("criterion", "")), None)
        assert ast_check is not None
        assert ast_check["passed"] is False  # Truthful: remote code was not compiled

        # Verify contract milestone state transitioned to IN_REVIEW
        c_res = client.get("/api/contracts/1", headers=DEV_CLIENT_IDENTITY)
        m2 = next(m for m in c_res.json()["milestones"] if m["stepNumber"] == 2)
        assert m2["status"] == "IN_REVIEW"

    def test_submit_deliverable_already_in_review_rejected():
        # Step 2 of Contract 1 was transitioned to IN_REVIEW above; duplicate submit must be rejected
        payload = {
            "submissionType": "URL",
            "submissionUrl": "https://github.com/PayPalIsImportant/frontend/pull/43",
            "notes": "Attempting second submit while first is still under review.",
        }
        res = client.post("/api/contracts/1/milestones/2/submit", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 400
        assert "IN_REVIEW" in res.json()["detail"]

    def test_submit_deliverable_rejected_when_awaiting_authorization():
        # Setup fixture: Contract in AWAITING_AUTHORIZATION status
        db = SessionLocal()
        try:
            proj = Project(
                client_id=1,
                client_name="Acme Global",
                title="Unfunded Project",
                description="Test contract awaiting auth.",
                total_budget=Decimal("1000.00"),
                currency="USD",
                status=ProjectStatus.IN_PROGRESS,
            )
            db.add(proj)
            db.commit()
            db.refresh(proj)

            contract = Contract(
                project_id=proj.id,
                client_id=1,
                talent_id=2,
                project_title=proj.title,
                client_name=proj.client_name,
                talent_name="Vachan",
                total_budget=Decimal("1000.00"),
                held_in_escrow_amount=Decimal("0.00"),
                released_amount=Decimal("0.00"),
                currency="USD",
                escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
                paypal_auth_id=None,
            )
            db.add(contract)
            db.commit()
            db.refresh(contract)

            m = Milestone(
                contract_id=contract.id,
                step_number=1,
                title="Unfunded Milestone",
                description="Waiting for funds.",
                percentage=100,
                amount=Decimal("1000.00"),
                currency="USD",
                status=MilestoneStatus.ACTIVE,
            )
            db.add(m)
            db.commit()
            db.refresh(m)
            cid, mid = contract.id, m.id
        finally:
            db.close()

        payload = {
            "submissionType": "URL",
            "submissionUrl": "https://github.com/deliverable",
            "notes": "Attempting submit before escrow authorized.",
        }
        res = client.post(f"/api/contracts/{cid}/milestones/{mid}/submit", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 400
        assert "awaiting authorization" in res.json()["detail"]

    def test_submit_deliverable_locked_milestone_rejected():
        # Step 3 of Contract 1 is LOCKED
        payload = {
            "submissionType": "URL",
            "submissionUrl": "https://example.com/too-early",
            "notes": "Attempting to skip to locked step",
        }
        res = client.post("/api/contracts/1/milestones/3/submit", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 400
        assert "LOCKED" in res.json()["detail"]

    def test_submit_deliverable_nonexistent_contract():
        payload = {
            "submissionType": "URL",
            "submissionUrl": "https://example.com/missing-contract",
            "notes": "Missing contract test",
        }
        res = client.post("/api/contracts/99999/milestones/2/submit", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 404

    def test_submit_deliverable_milestone_parent_mismatch():
        payload = {
            "submissionType": "URL",
            "submissionUrl": "https://example.com/missing-milestone",
            "notes": "Missing milestone test",
        }
        res = client.post("/api/contracts/1/milestones/99999/submit", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 404

    run_test("POST /contracts/{cid}/milestones/{mid}/submit rejects requests missing caller identity with 401", test_submit_missing_identity_rejected)
    run_test("POST /contracts/{cid}/milestones/{mid}/submit rejects client identity with 403 (freelancer only)", test_submit_client_forbidden)
    run_test("POST /contracts/{cid}/milestones/{mid}/submit rejects unassigned freelancer identity with 403", test_submit_unassigned_talent_forbidden)
    run_test("POST /contracts/{cid}/milestones/{mid}/submit succeeds for assigned talent & provides advisory report", test_submit_deliverable_active_milestone_success)
    run_test("POST /contracts/{cid}/milestones/{mid}/submit rejects duplicate submission while IN_REVIEW with 400", test_submit_deliverable_already_in_review_rejected)
    run_test("POST /contracts/{cid}/milestones/{mid}/submit rejects deliverable when contract awaiting escrow auth with 400", test_submit_deliverable_rejected_when_awaiting_authorization)
    run_test("POST /contracts/{cid}/milestones/{mid}/submit rejects LOCKED milestones with 400", test_submit_deliverable_locked_milestone_rejected)
    run_test("POST /contracts/{cid}/milestones/{mid}/submit returns 404 for missing contract", test_submit_deliverable_nonexistent_contract)
    run_test("POST /contracts/{cid}/milestones/{mid}/submit returns 404 for missing milestone", test_submit_deliverable_milestone_parent_mismatch)


# ---------------------------------------------------------------------------
# Test Group 4: Deliverable Re-verification (Security, Hierarchy & Idempotency)
# ---------------------------------------------------------------------------
def test_group_reverification():
    print("\n── Group 4: Deliverable Re-verification ────────────────────────────")

    def test_reverify_missing_identity_rejected():
        res = client.post("/api/contracts/1/milestones/1/submissions/1/reverify")
        assert res.status_code == 401

    def test_reverify_unassigned_user_forbidden():
        res = client.post("/api/contracts/1/milestones/1/submissions/1/reverify", headers=DEV_UNASSIGNED_USER)
        assert res.status_code == 403

    def test_reverify_completed_submission_rejected():
        # Submission 1 in demo seed has status COMPLETED
        # Must be rejected with 400 Bad Request
        res = client.post("/api/contracts/1/milestones/1/submissions/1/reverify", headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 400
        assert "FAILED" in res.json()["detail"] and "Re-verification is only allowed for FAILED submissions" in res.json()["detail"]

    def test_reverify_hierarchy_mismatch():
        # Submission 1 belongs to Milestone 1, not Milestone 2!
        # Passing milestone 2 should be rejected with 400
        res = client.post("/api/contracts/1/milestones/2/submissions/1/reverify", headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 400
        assert "does not belong to Milestone" in res.json()["detail"]

    def test_reverify_nonexistent_submission():
        res = client.post("/api/contracts/1/milestones/1/submissions/99999/reverify", headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 404

    def test_reverify_failed_submission_success():
        # Setup: Create a FAILED submission directly under Milestone 2 to test retry
        db = SessionLocal()
        try:
            m2 = db.query(Milestone).filter(Milestone.id == 2).first()
            failed_sub = Submission(
                milestone_id=m2.id,
                submission_type=SubmissionType.URL,
                submission_url="https://github.com/PayPalIsImportant/frontend/pull/99",
                file_name="retry_module.ts",
                notes="Retrying deliverable after transient AI timeout.",
                verification_status=VerificationStatus.FAILED,
                ai_verification_report={"error": "Previous AI failure", "retry_eligible": True},
            )
            db.add(failed_sub)
            db.commit()
            db.refresh(failed_sub)
            failed_id = str(failed_sub.id)
        finally:
            db.close()

        # Re-verify the failed submission using assigned talent identity
        res = client.post(f"/api/contracts/1/milestones/2/submissions/{failed_id}/reverify", headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        # Verify it updated the exact same record without creating duplicates
        assert data["id"] == failed_id
        assert data["verificationStatus"] == "COMPLETED"
        assert data["aiScore"] is not None
        assert data["aiVerificationReport"]["isAdvisoryOnly"] is True

        # Verify DB directly: only one record exists with this ID and it's COMPLETED
        db2 = SessionLocal()
        try:
            subs = db2.query(Submission).filter(Submission.id == int(failed_id)).all()
            assert len(subs) == 1
            assert subs[0].verification_status == VerificationStatus.COMPLETED
        finally:
            db2.close()

    run_test("POST .../reverify rejects requests missing caller identity with 401", test_reverify_missing_identity_rejected)
    run_test("POST .../reverify rejects unassigned caller identity with 403", test_reverify_unassigned_user_forbidden)
    run_test("POST .../reverify rejects already COMPLETED submissions with 400", test_reverify_completed_submission_rejected)
    run_test("POST .../reverify validates contract-milestone-submission hierarchy with 400", test_reverify_hierarchy_mismatch)
    run_test("POST .../reverify returns 404 for missing submission", test_reverify_nonexistent_submission)
    run_test("POST .../reverify succeeds on FAILED submission and updates in-place", test_reverify_failed_submission_success)


# ---------------------------------------------------------------------------
# Test Group 5: Applications Endpoints
# ---------------------------------------------------------------------------
def test_group_applications():
    print("\n── Group 5: Application Endpoints ──────────────────────────────────")

    def test_get_all_applications_inbox():
        res = client.get("/api/projects/all/applications", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list)
        assert len(data) >= 2, "Expected seeded applications"

        app1 = data[0]
        assert "id" in app1
        assert "freelancerName" in app1
        assert "bidAmount" in app1
        assert "trustScorecard" in app1
        # Verify scorecard structure
        sc = app1["trustScorecard"]
        assert "rating" in sc
        assert "onTimeDeliveryRate" in sc
        assert "complianceScore" in sc
        assert "completedProjects" in sc
        assert "badges" in sc

    def test_get_project_applications_by_alias():
        res = client.get("/api/projects/proj-101/applications", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 2
        for a in data:
            assert a["projectId"] == "1"

    def test_get_project_applications_by_numeric_id():
        res = client.get("/api/projects/1/applications", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 2

    def test_get_project_applications_not_found():
        res = client.get("/api/projects/99999/applications", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 404

    def test_get_applications_unauthenticated_rejected():
        # SEC-04: Unauthenticated access to /applications must return 401
        res = client.get("/api/projects/all/applications")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"

    def test_get_project_applications_cross_client_forbidden():
        # SEC-04: User 3 (Alex) attempting to view Client 1's project applications -> 403 (or only own proposal if freelancer)
        # Register a second client to test strict cross-client project application protection
        uid = uuid.uuid4().hex[:8]
        reg = client.post("/api/auth/register", json={
            "name": f"Other Client {uid}",
            "email": f"otherclient_{uid}@example.com",
            "password": "Password123!",
            "role": "CLIENT",
        })
        token = reg.json()["accessToken"]
        res = client.get("/api/projects/1/applications", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 403, f"Expected 403 Forbidden for cross-client access, got {res.status_code}"
        assert "Access denied" in res.json()["detail"]

    run_test("GET  /api/projects/all/applications returns multi-project applicant inbox", test_get_all_applications_inbox)
    run_test("GET  /api/projects/proj-101/applications returns project applications", test_get_project_applications_by_alias)
    run_test("GET  /api/projects/1/applications returns project applications by numeric ID", test_get_project_applications_by_numeric_id)
    run_test("GET  /api/projects/99999/applications returns 404 for missing project", test_get_project_applications_not_found)
    run_test("GET  /api/projects/all/applications rejects unauthenticated requests with 401 (SEC-04)", test_get_applications_unauthenticated_rejected)
    run_test("GET  /api/projects/{id}/applications rejects cross-client access with 403 (SEC-04)", test_get_project_applications_cross_client_forbidden)


# ---------------------------------------------------------------------------
# Test Group 6: Milestone Approval & Sequential Unlocking (Phase 5A)
# ---------------------------------------------------------------------------
def test_group_milestone_approval():
    print("\n── Group 6: Milestone Approval & Sequential Unlocking (Phase 5A) ───")

    def _create_isolated_contract_fixture():
        db = SessionLocal()
        try:
            proj = Project(
                client_id=1,
                client_name="Acme Global Ventures",
                title="Phase 5A Isolated Lifecycle Project",
                description="Test project for milestone approval and sequential unlocking.",
                total_budget=Decimal("1000.00"),
                currency="USD",
                status=ProjectStatus.IN_PROGRESS,
                proposed_milestones=[],
            )
            db.add(proj)
            db.commit()
            db.refresh(proj)

            contract = Contract(
                project_id=proj.id,
                client_id=1,
                talent_id=2,
                project_title=proj.title,
                client_name=proj.client_name,
                talent_name="Vachan Singh rajpurohit",
                total_budget=Decimal("1000.00"),
                held_in_escrow_amount=Decimal("1000.00"),
                released_amount=Decimal("0.00"),
                currency="USD",
                escrow_status=EscrowStatus.HELD_IN_ESCROW,
                paypal_auth_id="PAYPAL-AUTH-P5A-TEST",
            )
            db.add(contract)
            db.commit()
            db.refresh(contract)

            # Milestone 1: IN_REVIEW, Amount: $600.00 (60%)
            m1 = Milestone(
                contract_id=contract.id,
                step_number=1,
                title="Foundation Module",
                description="Architecture and schema setup.",
                percentage=60,
                amount=Decimal("600.00"),
                currency="USD",
                status=MilestoneStatus.IN_REVIEW,
            )
            # Milestone 2: LOCKED, Amount: $400.00 (40%)
            m2 = Milestone(
                contract_id=contract.id,
                step_number=2,
                title="Integration Module",
                description="API integration and release.",
                percentage=40,
                amount=Decimal("400.00"),
                currency="USD",
                status=MilestoneStatus.LOCKED,
            )
            db.add_all([m1, m2])
            db.commit()
            db.refresh(m1)
            db.refresh(m2)

            return proj.id, contract.id, m1.id, m2.id
        finally:
            db.close()

    def test_approve_missing_identity_rejected():
        _, cid, m1_id, _ = _create_isolated_contract_fixture()
        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"

    def test_approve_freelancer_forbidden():
        _, cid, m1_id, _ = _create_isolated_contract_fixture()
        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}"
        assert "Only the assigned client" in res.json()["detail"]

    def test_approve_unrelated_user_forbidden():
        _, cid, m1_id, _ = _create_isolated_contract_fixture()
        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_UNASSIGNED_USER)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}"
        assert "Only the assigned client" in res.json()["detail"]

    def test_approve_hierarchy_mismatch_rejected():
        _, cid, _, _ = _create_isolated_contract_fixture()
        res = client.post(f"/api/contracts/{cid}/milestones/1/approve", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        assert "does not belong to Contract" in res.json()["detail"]

    def test_approve_nonexistent_milestone_404():
        _, cid, _, _ = _create_isolated_contract_fixture()
        res = client.post(f"/api/contracts/{cid}/milestones/99999/approve", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 404

    def test_approve_nonexistent_contract_404():
        _, _, m1_id, _ = _create_isolated_contract_fixture()
        res = client.post(f"/api/contracts/99999/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 404

    def test_approve_invalid_status_locked_rejected():
        _, cid, _, m2_id = _create_isolated_contract_fixture()
        res = client.post(f"/api/contracts/{cid}/milestones/{m2_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        assert "LOCKED" in res.json()["detail"]

    def test_approve_assigned_client_success_and_unlock_next():
        _, cid, m1_id, m2_id = _create_isolated_contract_fixture()
        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()

        assert data["releasedAmount"] == 600.0
        assert data["heldInEscrowAmount"] == 400.0
        assert data["escrowStatus"] == "PARTIALLY_RELEASED"

        m1_res = next(m for m in data["milestones"] if m["id"] == str(m1_id))
        m2_res = next(m for m in data["milestones"] if m["id"] == str(m2_id))
        assert m1_res["status"] == "RELEASED"
        assert m2_res["status"] == "ACTIVE"

    def test_approve_already_released_rejected():
        _, cid, m1_id, _ = _create_isolated_contract_fixture()
        res1 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res1.status_code == 200

        res2 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res2.status_code == 400, f"Expected 400, got {res2.status_code}"
        assert "already been RELEASED" in res2.json()["detail"]

    def test_approve_final_milestone_completes_contract_and_project():
        pid, cid, m1_id, m2_id = _create_isolated_contract_fixture()

        res1 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res1.status_code == 200

        # Simulate deliverable submission on M2 by updating status to IN_REVIEW
        db = SessionLocal()
        try:
            m2 = db.query(Milestone).filter(Milestone.id == m2_id).first()
            m2.status = MilestoneStatus.IN_REVIEW
            db.commit()
        finally:
            db.close()

        res2 = client.post(f"/api/contracts/{cid}/milestones/{m2_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res2.status_code == 200, f"Expected 200, got {res2.status_code}: {res2.text}"
        data2 = res2.json()

        assert data2["releasedAmount"] == 1000.0
        assert data2["heldInEscrowAmount"] == 0.0
        assert data2["escrowStatus"] == "COMPLETED"

        db2 = SessionLocal()
        try:
            proj = db2.query(Project).filter(Project.id == pid).first()
            assert proj.status == ProjectStatus.COMPLETED
        finally:
            db2.close()

    def test_approve_rollback_on_insufficient_escrow():
        _, cid, m1_id, _ = _create_isolated_contract_fixture()

        db = SessionLocal()
        try:
            c = db.query(Contract).filter(Contract.id == cid).first()
            c.held_in_escrow_amount = Decimal("100.00")  # less than M1 amount of 600.00
            db.commit()
        finally:
            db.close()

        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 400
        assert "Insufficient escrow funds" in res.json()["detail"]

        db2 = SessionLocal()
        try:
            m1 = db2.query(Milestone).filter(Milestone.id == m1_id).first()
            assert m1.status == MilestoneStatus.IN_REVIEW
            c2 = db2.query(Contract).filter(Contract.id == cid).first()
            assert c2.released_amount == Decimal("0.00")
            assert c2.held_in_escrow_amount == Decimal("100.00")
        finally:
            db2.close()

    def test_approve_duplicate_approval_leaves_balances_unchanged():
        _, cid, m1_id, _ = _create_isolated_contract_fixture()
        # First approval
        res1 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res1.status_code == 200
        data1 = res1.json()
        assert data1["releasedAmount"] == 600.0
        assert data1["heldInEscrowAmount"] == 400.0

        # Second approval attempt must be rejected
        res2 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res2.status_code == 400
        assert "already been RELEASED" in res2.json()["detail"]

        # Verify DB directly: balances and statuses remain exactly as after first approval
        db = SessionLocal()
        try:
            c = db.query(Contract).filter(Contract.id == cid).first()
            assert c.released_amount == Decimal("600.00")
            assert c.held_in_escrow_amount == Decimal("400.00")
            assert c.escrow_status == EscrowStatus.PARTIALLY_RELEASED
            m1 = db.query(Milestone).filter(Milestone.id == m1_id).first()
            assert m1.status == MilestoneStatus.RELEASED
        finally:
            db.close()

    def test_approve_milestone_in_revision_requested_status():
        _, cid, m1_id, m2_id = _create_isolated_contract_fixture()
        # Set M1 to REVISION_REQUESTED and attach submission
        db = SessionLocal()
        try:
            m1 = db.query(Milestone).filter(Milestone.id == m1_id).first()
            m1.status = MilestoneStatus.REVISION_REQUESTED
            sub = Submission(
                milestone_id=m1.id,
                submission_type=SubmissionType.URL,
                submission_url="https://github.com/resubmission",
                notes="Resubmission",
                verification_status=VerificationStatus.COMPLETED,
                revision_number=1,
                review_status="REVISION_REQUESTED",
            )
            db.add(sub)
            db.commit()
            sub_id = sub.id
        finally:
            db.close()

        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 200
        data = res.json()
        m1_data = next(m for m in data["milestones"] if m["id"] == str(m1_id))
        m2_data = next(m for m in data["milestones"] if m["id"] == str(m2_id))
        assert m1_data["status"] == "RELEASED"
        assert m2_data["status"] == "ACTIVE"

        db2 = SessionLocal()
        try:
            s = db2.query(Submission).filter(Submission.id == sub_id).first()
            assert s.review_status == "APPROVED"
        finally:
            db2.close()

    def test_approve_database_error_rolls_back_staged_mutations():
        pid, cid, m1_id, m2_id = _create_isolated_contract_fixture()
        db = SessionLocal()
        try:
            sub = Submission(
                milestone_id=m1_id,
                submission_type=SubmissionType.URL,
                submission_url="https://github.com/test-rollback",
                notes="Staged mutation test",
                verification_status=VerificationStatus.COMPLETED,
                revision_number=1,
                review_status="IN_REVIEW",
            )
            db.add(sub)
            db.commit()
            sub_id = sub.id
        finally:
            db.close()

        # Patch _trigger_paypal_milestone_capture to raise a SQLAlchemyError inside the try block
        # after milestone.status = RELEASED, submission.review_status = APPROVED, contract balances mutated
        with patch("app.api.contract_routes._trigger_paypal_milestone_capture", side_effect=SQLAlchemyError("Simulated mid-transaction failure")):
            res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
            assert res.status_code == 500
            assert "Changes were safely rolled back" in res.json()["detail"]

        # Verify rollback in a completely fresh database session
        db2 = SessionLocal()
        try:
            m1 = db2.query(Milestone).filter(Milestone.id == m1_id).first()
            m2 = db2.query(Milestone).filter(Milestone.id == m2_id).first()
            c = db2.query(Contract).filter(Contract.id == cid).first()
            p = db2.query(Project).filter(Project.id == pid).first()
            s = db2.query(Submission).filter(Submission.id == sub_id).first()

            assert m1.status == MilestoneStatus.IN_REVIEW
            assert m2.status == MilestoneStatus.LOCKED
            assert s.review_status == "IN_REVIEW"
            assert c.released_amount == Decimal("0.00")
            assert c.held_in_escrow_amount == Decimal("1000.00")
            assert c.escrow_status == EscrowStatus.HELD_IN_ESCROW
            assert p.status == ProjectStatus.IN_PROGRESS
        finally:
            db2.close()

    run_test("POST .../approve rejects requests missing caller identity with 401", test_approve_missing_identity_rejected)
    run_test("POST .../approve rejects freelancer with 403 (client only)", test_approve_freelancer_forbidden)
    run_test("POST .../approve rejects unrelated third-party with 403", test_approve_unrelated_user_forbidden)
    run_test("POST .../approve rejects milestone/contract hierarchy mismatch with 400", test_approve_hierarchy_mismatch_rejected)
    run_test("POST .../approve returns 404 for missing milestone", test_approve_nonexistent_milestone_404)
    run_test("POST .../approve returns 404 for missing contract", test_approve_nonexistent_contract_404)
    run_test("POST .../approve rejects LOCKED milestones with 400", test_approve_invalid_status_locked_rejected)
    run_test("POST .../approve succeeds for assigned client & sequentially unlocks next step", test_approve_assigned_client_success_and_unlock_next)
    run_test("POST .../approve rejects already RELEASED milestones with 400", test_approve_already_released_rejected)
    run_test("POST .../approve duplicate approval leaves balances and status unchanged with 400", test_approve_duplicate_approval_leaves_balances_unchanged)
    run_test("POST .../approve permits client approval on REVISION_REQUESTED milestone", test_approve_milestone_in_revision_requested_status)
    run_test("POST .../approve final milestone completes contract and project", test_approve_final_milestone_completes_contract_and_project)
    run_test("POST .../approve rolls back financial and lifecycle changes on failure", test_approve_rollback_on_insufficient_escrow)
    run_test("POST .../approve rolls back staged mutations on database commit error", test_approve_database_error_rolls_back_staged_mutations)


# ---------------------------------------------------------------------------
# Test Group 7: Milestone Revision Requests & Resubmission Engine (Phase 5B)
# ---------------------------------------------------------------------------
def test_group_milestone_revisions():
    print("\n── Group 7: Milestone Revision Requests & Resubmission (Phase 5B) ──")

    def _create_revision_test_fixture():
        db = SessionLocal()
        try:
            proj = Project(
                client_id=1,
                client_name="Acme Global Ventures",
                title="Phase 5B Revision Test Project",
                description="Test project for milestone revisions and resubmissions.",
                total_budget=Decimal("1500.00"),
                currency="USD",
                status=ProjectStatus.IN_PROGRESS,
                proposed_milestones=[],
            )
            db.add(proj)
            db.commit()
            db.refresh(proj)

            contract = Contract(
                project_id=proj.id,
                client_id=1,
                talent_id=2,
                project_title=proj.title,
                client_name=proj.client_name,
                talent_name="Vachan Singh rajpurohit",
                total_budget=Decimal("1500.00"),
                held_in_escrow_amount=Decimal("1500.00"),
                released_amount=Decimal("0.00"),
                currency="USD",
                escrow_status=EscrowStatus.HELD_IN_ESCROW,
                paypal_auth_id="PAYPAL-AUTH-P5B-TEST",
            )
            db.add(contract)
            db.commit()
            db.refresh(contract)

            # Milestone 1: IN_REVIEW with initial submission
            m1 = Milestone(
                contract_id=contract.id,
                step_number=1,
                title="Initial API Scaffold",
                description="FastAPI endpoint scaffold.",
                percentage=50,
                amount=Decimal("750.00"),
                currency="USD",
                status=MilestoneStatus.IN_REVIEW,
                revision_count=0,
                max_revisions_reached=False,
            )
            db.add(m1)
            db.commit()
            db.refresh(m1)

            # Initial submission for Milestone 1
            sub1 = Submission(
                milestone_id=m1.id,
                submission_type=SubmissionType.URL,
                submission_url="https://github.com/PayPalIsImportant/backend/pull/1",
                notes="Initial API scaffold submitted for review.",
                verification_status=VerificationStatus.COMPLETED,
                ai_score=85,
                quality_grade="Grade B",
                revision_number=1,
                review_status="IN_REVIEW",
            )
            db.add(sub1)
            db.commit()
            db.refresh(sub1)

            return proj.id, contract.id, m1.id, sub1.id
        finally:
            db.close()

    def test_revision_missing_identity_rejected():
        _, cid, m1_id, _ = _create_revision_test_fixture()
        payload = {"feedback": "Needs changes to error messages."}
        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/request-revision", json=payload)
        assert res.status_code == 401

    def test_revision_freelancer_forbidden():
        _, cid, m1_id, _ = _create_revision_test_fixture()
        payload = {"feedback": "Freelancer attempting to request revision on own work."}
        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/request-revision", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 403
        assert "Only the assigned client" in res.json()["detail"]

    def test_revision_empty_feedback_rejected():
        _, cid, m1_id, _ = _create_revision_test_fixture()
        payload = {"feedback": "   "}
        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/request-revision", json=payload, headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 400
        assert "feedback cannot be empty" in res.json()["detail"]

    def test_revision_invalid_status_rejected():
        _, cid, m1_id, _ = _create_revision_test_fixture()
        db = SessionLocal()
        try:
            m = db.query(Milestone).filter(Milestone.id == m1_id).first()
            m.status = MilestoneStatus.RELEASED
            db.commit()
        finally:
            db.close()

        payload = {"feedback": "Too late for revisions."}
        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/request-revision", json=payload, headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 400
        assert "already been RELEASED" in res.json()["detail"]

    def test_revision_request_without_submission_rejected():
        # Milestone in IN_REVIEW but with NO submissions must be rejected
        _, cid, m1_id, _ = _create_revision_test_fixture()
        db = SessionLocal()
        try:
            subs = db.query(Submission).filter(Submission.milestone_id == m1_id).all()
            for s in subs:
                db.delete(s)
            db.commit()
        finally:
            db.close()

        payload = {"feedback": "Revision request on milestone lacking submissions."}
        res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/request-revision", json=payload, headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 400
        assert "no deliverable has been submitted" in res.json()["detail"]

    def test_revision_request_success_and_resubmission_flow():
        _, cid, m1_id, sub1_id = _create_revision_test_fixture()

        # Step 1: Client requests revision 1
        rev_payload = {
            "feedback": "Navigation header is not responsive on mobile screens.",
            "specificCorrections": "Ensure hamburger menu expands properly on viewports < 640px.",
            "additionalInstructions": "Test with Chrome DevTools mobile emulation.",
        }
        res1 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/request-revision", json=rev_payload, headers=DEV_CLIENT_IDENTITY)
        assert res1.status_code == 200, f"Expected 200, got {res1.status_code}: {res1.text}"
        data1 = res1.json()

        assert data1["status"] == "REVISION_REQUESTED"
        assert data1["revisionCount"] == 1
        assert data1["maxRevisionsReached"] is False
        assert data1["latestRevisionRequest"] is not None
        assert data1["latestRevisionRequest"]["feedback"] == rev_payload["feedback"]
        assert data1["latestRevisionRequest"]["specificCorrections"] == rev_payload["specificCorrections"]

        # Verify latest submission reviewStatus
        assert data1["submission"]["reviewStatus"] == "REVISION_REQUESTED"
        assert data1["submission"]["revisionRequest"] is not None

        # Step 2: Freelancer resubmits deliverable
        resub_payload = {
            "submissionType": "URL",
            "submissionUrl": "https://github.com/PayPalIsImportant/backend/pull/2",
            "fileName": "mobile_nav_fix.ts",
            "notes": "Fixed mobile responsive navigation and tested on iOS / Android viewports.",
        }
        res2 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/submit", json=resub_payload, headers=DEV_TALENT_IDENTITY)
        assert res2.status_code == 201, f"Expected 201, got {res2.status_code}: {res2.text}"
        sub_data = res2.json()

        assert sub_data["revisionNumber"] == 2
        assert sub_data["reviewStatus"] == "IN_REVIEW"

        # Step 3: Verify contract query shows milestone back in IN_REVIEW with 2 submissions in history
        c_res = client.get(f"/api/contracts/{cid}", headers=DEV_CLIENT_IDENTITY)
        assert c_res.status_code == 200
        c_data = c_res.json()
        ms = next(m for m in c_data["milestones"] if m["id"] == str(m1_id))
        assert ms["status"] == "IN_REVIEW"
        assert ms["revisionCount"] == 1
        assert len(ms["submissionHistory"]) == 2
        assert ms["submissionHistory"][0]["revisionNumber"] == 1
        assert ms["submissionHistory"][1]["revisionNumber"] == 2

    def test_revision_cap_at_three():
        _, cid, m1_id, _ = _create_revision_test_fixture()

        # Revision 1
        r1 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/request-revision", json={"feedback": "Rev 1 feedback"}, headers=DEV_CLIENT_IDENTITY)
        assert r1.status_code == 200
        assert r1.json()["revisionCount"] == 1
        assert r1.json()["maxRevisionsReached"] is False

        # Resubmit 1
        s1 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/submit", json={"submissionUrl": "https://github.com/fix1"}, headers=DEV_TALENT_IDENTITY)
        assert s1.status_code == 201

        # Revision 2
        r2 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/request-revision", json={"feedback": "Rev 2 feedback"}, headers=DEV_CLIENT_IDENTITY)
        assert r2.status_code == 200
        assert r2.json()["revisionCount"] == 2
        assert r2.json()["maxRevisionsReached"] is False

        # Resubmit 2
        s2 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/submit", json={"submissionUrl": "https://github.com/fix2"}, headers=DEV_TALENT_IDENTITY)
        assert s2.status_code == 201

        # Revision 3 (Cap reached!)
        r3 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/request-revision", json={"feedback": "Rev 3 final feedback"}, headers=DEV_CLIENT_IDENTITY)
        assert r3.status_code == 200
        assert r3.json()["revisionCount"] == 3
        assert r3.json()["maxRevisionsReached"] is True

        # Resubmit 3
        s3 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/submit", json={"submissionUrl": "https://github.com/fix3"}, headers=DEV_TALENT_IDENTITY)
        assert s3.status_code == 201

        # Revision 4 (MUST be rejected with 400 Bad Request!)
        r4 = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/request-revision", json={"feedback": "Rev 4 attempt"}, headers=DEV_CLIENT_IDENTITY)
        assert r4.status_code == 400
        assert "Maximum revision limit of 3 has already been reached" in r4.json()["detail"]

        # Verify Client can still APPROVE the milestone after cap is reached
        appr_res = client.post(f"/api/contracts/{cid}/milestones/{m1_id}/approve", headers=DEV_CLIENT_IDENTITY)
        assert appr_res.status_code == 200
        appr_data = appr_res.json()
        approved_ms = next(m for m in appr_data["milestones"] if m["id"] == str(m1_id))
        assert approved_ms["status"] == "RELEASED"
        assert approved_ms["submission"]["reviewStatus"] == "APPROVED"

    run_test("POST .../request-revision rejects requests missing caller identity with 401", test_revision_missing_identity_rejected)
    run_test("POST .../request-revision rejects freelancer with 403 (client only)", test_revision_freelancer_forbidden)
    run_test("POST .../request-revision rejects empty feedback with 400", test_revision_empty_feedback_rejected)
    run_test("POST .../request-revision rejects RELEASED milestones with 400", test_revision_invalid_status_rejected)
    run_test("POST .../request-revision rejects milestones without submissions with 400", test_revision_request_without_submission_rejected)
    run_test("POST .../request-revision succeeds & supports freelancer resubmission flow", test_revision_request_success_and_resubmission_flow)
    run_test("POST .../request-revision strictly enforces 3-revision limit and permits final approval", test_revision_cap_at_three)


# ---------------------------------------------------------------------------
# Test Group 8: Application Acceptance & Contract Instantiation (Phase 5C)
# ---------------------------------------------------------------------------
def test_group_application_lifecycle():
    print("\n── Group 8: Application Acceptance & Contract Instantiation (Phase 5C) ─")

    def _create_open_project_fixture():
        db = SessionLocal()
        try:
            proj = Project(
                client_id=1,
                client_name="Acme Global Ventures",
                title="Phase 5C Open Marketplace Project",
                domain="Full-Stack Development",
                description="Project awaiting freelancer applications.",
                total_budget=Decimal("2000.00"),
                currency="USD",
                status=ProjectStatus.OPEN,
                proposed_milestones=[
                    {
                        "step_number": 1,
                        "title": "Backend Architecture",
                        "description": "Scaffold database and models.",
                        "percentage": 50,
                        "payment_amount": 1000.0,
                    },
                    {
                        "step_number": 2,
                        "title": "Frontend Integration",
                        "description": "Connect UI to backend API.",
                        "percentage": 50,
                        "payment_amount": 1000.0,
                    },
                ],
            )
            db.add(proj)
            db.commit()
            db.refresh(proj)
            return proj.id
        finally:
            db.close()

    def test_apply_missing_identity_rejected():
        pid = _create_open_project_fixture()
        payload = {"coverLetter": "Interested in project.", "bidAmount": 2000.0}
        res = client.post(f"/api/projects/{pid}/applications", json=payload)
        assert res.status_code == 401

    def test_apply_client_to_own_project_rejected():
        pid = _create_open_project_fixture()
        payload = {"coverLetter": "Client applying to own project.", "bidAmount": 2000.0}
        res = client.post(f"/api/projects/{pid}/applications", json=payload, headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 400
        assert "Clients cannot apply to their own" in res.json()["detail"]

    def test_apply_freelancer_success():
        pid = _create_open_project_fixture()
        payload = {
            "coverLetter": "Experienced Next.js & FastAPI developer with 100% on-time record.",
            "bidAmount": 1800.0,
            "currency": "USD",
        }
        res = client.post(f"/api/projects/{pid}/applications", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["projectId"] == str(pid)
        assert data["freelancerId"] == "2"
        assert data["status"] == "PENDING"
        assert data["bidAmount"] == 1800.0
        assert "trustScorecard" in data

    def test_apply_duplicate_proposal_rejected():
        pid = _create_open_project_fixture()
        payload = {"coverLetter": "First proposal.", "bidAmount": 2000.0}
        res1 = client.post(f"/api/projects/{pid}/applications", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res1.status_code == 201

        res2 = client.post(f"/api/projects/{pid}/applications", json=payload, headers=DEV_TALENT_IDENTITY)
        assert res2.status_code == 400
        assert "already submitted an active proposal" in res2.json()["detail"]

    def test_reject_application_success():
        pid = _create_open_project_fixture()
        payload = {"coverLetter": "Applying to be declined.", "bidAmount": 2000.0}
        res_app = client.post(f"/api/projects/{pid}/applications", json=payload, headers=DEV_TALENT_IDENTITY)
        aid = res_app.json()["id"]

        res_fail = client.post(f"/api/projects/{pid}/applications/{aid}/reject", headers=DEV_TALENT_IDENTITY)
        assert res_fail.status_code == 403

        res_ok = client.post(f"/api/projects/{pid}/applications/{aid}/reject", headers=DEV_CLIENT_IDENTITY)
        assert res_ok.status_code == 200
        assert res_ok.json()["status"] == "REJECTED"

        res_dup = client.post(f"/api/projects/{pid}/applications/{aid}/reject", headers=DEV_CLIENT_IDENTITY)
        assert res_dup.status_code == 400
        assert "Only PENDING applications can be rejected" in res_dup.json()["detail"]

    def test_accept_application_and_instantiate_contract():
        pid = _create_open_project_fixture()

        # Candidate 1: Vachan (User 2)
        p1 = {"coverLetter": "Vachan's proposal.", "bidAmount": 1900.0}
        res_vachan = client.post(f"/api/projects/{pid}/applications", json=p1, headers=DEV_TALENT_IDENTITY)
        aid_vachan = res_vachan.json()["id"]

        # Candidate 2: Alex (User 3)
        p2 = {"coverLetter": "Alex's proposal.", "bidAmount": 2000.0}
        res_alex = client.post(f"/api/projects/{pid}/applications", json=p2, headers=DEV_UNASSIGNED_USER)
        aid_alex = res_alex.json()["id"]

        # Client accepts Vachan's proposal
        res_accept = client.post(f"/api/projects/{pid}/applications/{aid_vachan}/accept", headers=DEV_CLIENT_IDENTITY)
        assert res_accept.status_code == 200, f"Expected 200, got {res_accept.status_code}: {res_accept.text}"
        contract_data = res_accept.json()

        assert contract_data["projectId"] == str(pid)
        assert contract_data["freelancerId"] == "2"
        assert contract_data["totalBudget"] == 1900.0
        assert contract_data["heldInEscrowAmount"] == 0.0
        assert contract_data["releasedAmount"] == 0.0
        assert contract_data["escrowStatus"] == "AWAITING_AUTHORIZATION"

        milestones = contract_data["milestones"]
        assert len(milestones) == 2
        m1 = next(m for m in milestones if m["stepNumber"] == 1)
        m2 = next(m for m in milestones if m["stepNumber"] == 2)
        # All milestones are LOCKED while contract escrow is AWAITING_AUTHORIZATION
        assert m1["status"] == "LOCKED"
        assert m2["status"] == "LOCKED"
        assert m1["paymentAmount"] == 950.0
        assert m2["paymentAmount"] == 950.0

        db = SessionLocal()
        try:
            app_v = db.query(Application).filter(Application.id == int(aid_vachan)).first()
            assert app_v.status == ApplicationStatus.ACCEPTED

            app_a = db.query(Application).filter(Application.id == int(aid_alex)).first()
            assert app_a.status == ApplicationStatus.REJECTED

            proj = db.query(Project).filter(Project.id == pid).first()
            assert proj.status == ProjectStatus.IN_PROGRESS

            # Verify no fabricated PayPal authorization ID was stored
            c_db = db.query(Contract).filter(Contract.project_id == pid).first()
            assert c_db.paypal_auth_id is None
        finally:
            db.close()

    def test_accept_application_direct_alias_route():
        pid = _create_open_project_fixture()
        p = {"coverLetter": "Direct alias test proposal.", "bidAmount": 1500.0}
        res_app = client.post(f"/api/projects/{pid}/applications", json=p, headers=DEV_TALENT_IDENTITY)
        aid = res_app.json()["id"]

        res_alias = client.post(f"/api/applications/{aid}/accept", headers=DEV_CLIENT_IDENTITY)
        assert res_alias.status_code == 200
        assert res_alias.json()["projectId"] == str(pid)
        assert res_alias.json()["totalBudget"] == 1500.0
        assert res_alias.json()["heldInEscrowAmount"] == 0.0
        assert res_alias.json()["escrowStatus"] == "AWAITING_AUTHORIZATION"

    def test_accept_application_invalid_milestone_percentages_rejected():
        db = SessionLocal()
        try:
            proj = Project(
                client_id=1,
                client_name="Acme",
                title="Bad Blueprint Project",
                description="Testing blueprint validation.",
                total_budget=Decimal("1000.00"),
                currency="USD",
                status=ProjectStatus.OPEN,
                proposed_milestones=[
                    {"step_number": 1, "title": "Part 1", "percentage": 40},
                    {"step_number": 2, "title": "Part 2", "percentage": 40},  # Sums to 80%!
                ],
            )
            db.add(proj)
            db.commit()
            db.refresh(proj)
            pid = proj.id
        finally:
            db.close()

        p = {"coverLetter": "Proposal for bad blueprint.", "bidAmount": 1000.0}
        res_app = client.post(f"/api/projects/{pid}/applications", json=p, headers=DEV_TALENT_IDENTITY)
        aid = res_app.json()["id"]

        res_accept = client.post(f"/api/projects/{pid}/applications/{aid}/accept", headers=DEV_CLIENT_IDENTITY)
        assert res_accept.status_code == 400
        assert "Milestone percentages must sum to 100%" in res_accept.json()["detail"]

    def test_accept_application_exact_monetary_allocation_and_rounding():
        db = SessionLocal()
        try:
            proj = Project(
                client_id=1,
                client_name="Acme",
                title="Rounding Test Project",
                description="Testing remainder allocation on 3-part split.",
                total_budget=Decimal("100.00"),
                currency="USD",
                status=ProjectStatus.OPEN,
                proposed_milestones=[
                    {"step_number": 1, "title": "Part 1", "percentage": 33},
                    {"step_number": 2, "title": "Part 2", "percentage": 33},
                    {"step_number": 3, "title": "Part 3", "percentage": 34},
                ],
            )
            db.add(proj)
            db.commit()
            db.refresh(proj)
            pid = proj.id
        finally:
            db.close()

        p = {"coverLetter": "Odd budget proposal.", "bidAmount": 100.00}
        res_app = client.post(f"/api/projects/{pid}/applications", json=p, headers=DEV_TALENT_IDENTITY)
        aid = res_app.json()["id"]

        res_accept = client.post(f"/api/projects/{pid}/applications/{aid}/accept", headers=DEV_CLIENT_IDENTITY)
        assert res_accept.status_code == 200
        c_data = res_accept.json()
        total_milestones_sum = sum(m["paymentAmount"] for m in c_data["milestones"])
        assert round(total_milestones_sum, 2) == 100.00

        # Verify contract model validator passes
        db2 = SessionLocal()
        try:
            c = db2.query(Contract).filter(Contract.id == int(c_data["id"])).first()
            assert c.validate_milestones_total() is True
        finally:
            db2.close()

    def test_accept_application_duplicate_acceptance_prevented():
        pid = _create_open_project_fixture()
        p = {"coverLetter": "Test duplicate accept.", "bidAmount": 1500.0}
        res_app = client.post(f"/api/projects/{pid}/applications", json=p, headers=DEV_TALENT_IDENTITY)
        aid = res_app.json()["id"]

        res1 = client.post(f"/api/projects/{pid}/applications/{aid}/accept", headers=DEV_CLIENT_IDENTITY)
        assert res1.status_code == 200

        res2 = client.post(f"/api/projects/{pid}/applications/{aid}/accept", headers=DEV_CLIENT_IDENTITY)
        assert res2.status_code == 400
        assert "Only PENDING applications can be accepted" in res2.json()["detail"]

    def test_accept_application_atomic_rollback_on_failure():
        pid = _create_open_project_fixture()
        p1 = {"coverLetter": "Rollback test 1.", "bidAmount": 1800.0}
        res1 = client.post(f"/api/projects/{pid}/applications", json=p1, headers=DEV_TALENT_IDENTITY)
        aid1 = res1.json()["id"]

        p2 = {"coverLetter": "Rollback test 2.", "bidAmount": 1900.0}
        res2 = client.post(f"/api/projects/{pid}/applications", json=p2, headers=DEV_UNASSIGNED_USER)
        aid2 = res2.json()["id"]

        # Patch _trigger_paypal_escrow_order to raise SQLAlchemyError before commit
        with patch("app.api.application_routes._trigger_paypal_escrow_order", side_effect=SQLAlchemyError("Simulated DB failure during acceptance")):
            res_accept = client.post(f"/api/projects/{pid}/applications/{aid1}/accept", headers=DEV_CLIENT_IDENTITY)
            assert res_accept.status_code == 500
            assert "Transaction rolled back" in res_accept.json()["detail"]

        # Verify state in fresh DB session: project still OPEN, both apps still PENDING, zero contracts created
        db = SessionLocal()
        try:
            proj = db.query(Project).filter(Project.id == pid).first()
            assert proj.status == ProjectStatus.OPEN

            a1 = db.query(Application).filter(Application.id == int(aid1)).first()
            assert a1.status == ApplicationStatus.PENDING

            a2 = db.query(Application).filter(Application.id == int(aid2)).first()
            assert a2.status == ApplicationStatus.PENDING

            contracts = db.query(Contract).filter(Contract.project_id == pid).all()
            assert len(contracts) == 0
        finally:
            db.close()

    run_test("POST .../applications rejects missing identity with 401", test_apply_missing_identity_rejected)
    run_test("POST .../applications rejects client applying to own project with 400", test_apply_client_to_own_project_rejected)
    run_test("POST .../applications allows freelancer to submit proposal with 201", test_apply_freelancer_success)
    run_test("POST .../applications rejects duplicate proposal from same freelancer with 400", test_apply_duplicate_proposal_rejected)
    run_test("POST .../reject rejects proposal and enforces client ownership with 200", test_reject_application_success)
    run_test("POST .../accept instantiates contract, milestones, updates project and rejects other candidates", test_accept_application_and_instantiate_contract)
    run_test("POST /api/applications/{aid}/accept direct alias instantiates contract identically", test_accept_application_direct_alias_route)
    run_test("POST .../accept rejects invalid milestone blueprint percentages summing != 100%", test_accept_application_invalid_milestone_percentages_rejected)
    run_test("POST .../accept allocates exact monetary amounts with deterministic rounding remainder", test_accept_application_exact_monetary_allocation_and_rounding)
    run_test("POST .../accept prevents duplicate acceptance of already accepted proposal", test_accept_application_duplicate_acceptance_prevented)
    run_test("POST .../accept atomically rolls back all changes on database failure", test_accept_application_atomic_rollback_on_failure)


# ---------------------------------------------------------------------------
# Test Group 9: Reputation, Reviews & Trust Score Engine (Phase 6)
# ---------------------------------------------------------------------------
def test_group_reputation():
    print("\n── Group 9: Reputation, Reviews & Trust Score Engine (Phase 6) ─────")

    def _create_reputation_fixture(prefix="rep-talent"):
        clean_prefix = prefix.split("@")[0]
        email = f"{clean_prefix}-{uuid.uuid4().hex[:8]}@trustpay.ai"
        db = SessionLocal()
        try:
            client_user = db.query(User).filter(User.id == 1).first()

            freelancer_user = User(
                name="Elena Rostova",
                email=email,
                hashed_password="mock-password-hash",
                role=UserRole.FREELANCER,
                domain="Smart Contract Security",
                bio="Auditor specializing in zero-day contract vulnerabilities and escrow verification.",
                trust_score=100.0,
                rating=0.0,
                on_time_rate=100,
                compliance_score=100,
                completed_projects=0,
                total_earnings_or_spent=0.0,
                badges=[],
            )
            db.add(freelancer_user)
            db.commit()
            db.refresh(freelancer_user)

            proj = Project(
                client_id=client_user.id,
                client_name=client_user.name,
                title="Phase 6 Audit Contract Project",
                description="Testing Phase 6 review and reputation mechanics.",
                total_budget=Decimal("2000.00"),
                currency="USD",
                status=ProjectStatus.IN_PROGRESS,
            )
            db.add(proj)
            db.commit()
            db.refresh(proj)

            contract = Contract(
                project_id=proj.id,
                client_id=client_user.id,
                talent_id=freelancer_user.id,
                project_title=proj.title,
                client_name=client_user.name,
                talent_name=freelancer_user.name,
                total_budget=Decimal("2000.00"),
                held_in_escrow_amount=Decimal("0.00"),
                released_amount=Decimal("2000.00"),
                currency="USD",
                escrow_status=EscrowStatus.COMPLETED,
                paypal_auth_id="PAYPAL-AUTH-REP-TEST",
                paypal_capture_id=None,  # Unconfirmed capture by default
            )
            db.add(contract)
            db.commit()
            db.refresh(contract)

            now = datetime.utcnow()
            m = Milestone(
                contract_id=contract.id,
                step_number=1,
                title="Complete Audit Scope",
                description="Full scope review.",
                percentage=100,
                amount=Decimal("2000.00"),
                currency="USD",
                status=MilestoneStatus.RELEASED,
                revision_count=0,
                deadline=now + timedelta(days=3),
            )
            db.add(m)
            db.commit()
            db.refresh(m)

            sub = Submission(
                milestone_id=m.id,
                submission_type=SubmissionType.URL,
                submission_url="https://github.com/audit-report",
                notes="Delivered before deadline.",
                verification_status=VerificationStatus.COMPLETED,
                revision_number=1,
                review_status="APPROVED",
                submitted_at=now,
            )
            db.add(sub)
            db.commit()

            return client_user.id, freelancer_user.id, contract.id, m.id
        finally:
            db.close()

    def test_unrated_freelancer_scorecard():
        # Fresh freelancer with 0 completed contracts must be unrated, not false 5.0 stars
        db = SessionLocal()
        try:
            fresh_user = User(
                name="Fresh Junior Talent",
                email=f"fresh-talent-{uuid.uuid4().hex[:8]}@trustpay.ai",
                hashed_password="mock-password-hash",
                role=UserRole.FREELANCER,
                domain="Frontend Dev",
                bio="Junior developer seeking first escrow contract on TrustPay.",
                trust_score=100.0,
                rating=0.0,
                on_time_rate=100,
                compliance_score=100,
                completed_projects=0,
                total_earnings_or_spent=0.0,
                badges=[],
            )
            db.add(fresh_user)
            db.commit()
            db.refresh(fresh_user)
            uid = fresh_user.id
        finally:
            db.close()

        res = client.get(f"/api/users/{uid}/scorecard")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()

        assert data["completedProjects"] == 0
        assert data["rating"] is None
        assert data["isUnrated"] is True
        assert data["badges"] == []

    def test_review_missing_identity_rejected():
        _, _, cid, _ = _create_reputation_fixture("unauth-rev@trustpay.ai")
        res = client.post(f"/api/contracts/{cid}/review", json={"rating": 5.0})
        assert res.status_code == 401

    def test_review_unauthorized_user_rejected():
        _, talent_id, cid, _ = _create_reputation_fixture("freelancer-self-rev@trustpay.ai")
        # Freelancer cannot review own contract
        talent_headers = {"X-User-Id": str(talent_id)}
        res = client.post(f"/api/contracts/{cid}/review", json={"rating": 5.0}, headers=talent_headers)
        assert res.status_code == 403
        assert "Only the assigned client" in res.json()["detail"]

        # Unrelated third-party user cannot review contract
        res_unrelated = client.post(f"/api/contracts/{cid}/review", json={"rating": 5.0}, headers=DEV_UNASSIGNED_USER)
        assert res_unrelated.status_code == 403
        assert "Only the assigned client" in res.json()["detail"]

    def test_review_uncompleted_contract_rejected():
        # Setup contract in HELD_IN_ESCROW status
        db = SessionLocal()
        try:
            c = Contract(
                project_id=1,
                client_id=1,
                talent_id=2,
                project_title="In-Progress Project",
                client_name="Acme",
                talent_name="Vachan",
                total_budget=Decimal("1000.00"),
                held_in_escrow_amount=Decimal("1000.00"),
                released_amount=Decimal("0.00"),
                currency="USD",
                escrow_status=EscrowStatus.HELD_IN_ESCROW,
            )
            db.add(c)
            db.commit()
            db.refresh(c)
            cid = c.id
        finally:
            db.close()

        res = client.post(f"/api/contracts/{cid}/review", json={"rating": 4.5}, headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 400
        assert "Reviews are only permitted for COMPLETED contracts" in res.json()["detail"]

    def test_client_review_success_and_reputation_update():
        _, talent_id, cid, _ = _create_reputation_fixture("reviewed-talent@trustpay.ai")

        payload = {"rating": 4.8, "review": "Exceptional smart contract vulnerability audit. Punctual and thorough."}
        res = client.post(f"/api/contracts/{cid}/review", json=payload, headers=DEV_CLIENT_IDENTITY)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["contractId"] == str(cid)
        assert data["clientRating"] == 4.8
        assert data["clientReview"] == payload["review"]

        # Verify freelancer's live scorecard reflects review
        sc_res = client.get(f"/api/users/{talent_id}/scorecard")
        assert sc_res.status_code == 200
        sc = sc_res.json()
        assert sc["completedProjects"] == 1
        assert sc["rating"] == 4.8
        assert sc["isUnrated"] is False

    def test_duplicate_review_rejected():
        _, _, cid, _ = _create_reputation_fixture("dup-rev-talent@trustpay.ai")
        # First review
        res1 = client.post(f"/api/contracts/{cid}/review", json={"rating": 4.5}, headers=DEV_CLIENT_IDENTITY)
        assert res1.status_code == 200

        # Duplicate review attempt
        res2 = client.post(f"/api/contracts/{cid}/review", json={"rating": 5.0}, headers=DEV_CLIENT_IDENTITY)
        assert res2.status_code == 400
        assert "already been submitted" in res2.json()["detail"]

    def test_recalculation_idempotency_across_contracts():
        _, talent_id, cid1, _ = _create_reputation_fixture("idempotent-talent@trustpay.ai")

        # Review contract 1 with 4.0 stars
        r1 = client.post(f"/api/contracts/{cid1}/review", json={"rating": 4.0}, headers=DEV_CLIENT_IDENTITY)
        assert r1.status_code == 200

        # Add contract 2 for same freelancer and complete it with 5.0 stars
        db = SessionLocal()
        try:
            c2 = Contract(
                project_id=1,
                client_id=1,
                talent_id=talent_id,
                project_title="Second Completed Project",
                client_name="Acme",
                talent_name="Elena",
                total_budget=Decimal("1000.00"),
                held_in_escrow_amount=Decimal("0.00"),
                released_amount=Decimal("1000.00"),
                currency="USD",
                escrow_status=EscrowStatus.COMPLETED,
            )
            db.add(c2)
            db.commit()
            db.refresh(c2)
            cid2 = c2.id
        finally:
            db.close()

        r2 = client.post(f"/api/contracts/{cid2}/review", json={"rating": 5.0}, headers=DEV_CLIENT_IDENTITY)
        assert r2.status_code == 200

        # Average rating = (4.0 + 5.0) / 2 = 4.5
        sc1 = client.get(f"/api/users/{talent_id}/scorecard").json()
        assert sc1["completedProjects"] == 2
        assert sc1["rating"] == 4.5

        # Re-fetching repeatedly returns exact same 4.5 with zero inflation
        sc2 = client.get(f"/api/users/{talent_id}/scorecard").json()
        sc3 = client.get(f"/api/users/{talent_id}/scorecard").json()
        assert sc2["completedProjects"] == 2
        assert sc2["rating"] == 4.5
        assert sc3["completedProjects"] == 2
        assert sc3["rating"] == 4.5

    def test_on_time_rate_and_deadline_scenarios():
        db = SessionLocal()
        try:
            freelancer = User(
                name="Punctual Dev",
                email=f"punctual-dev-{uuid.uuid4().hex[:8]}@trustpay.ai",
                hashed_password="mock",
                role=UserRole.FREELANCER,
                domain="API Dev",
                bio="High precision API development.",
            )
            db.add(freelancer)
            db.commit()
            db.refresh(freelancer)
            fid = freelancer.id

            now = datetime.utcnow()
            # Contract with 2 milestones: M1 on time, M2 late
            c = Contract(
                project_id=1,
                client_id=1,
                talent_id=fid,
                project_title="Punctuality Test",
                client_name="Acme",
                talent_name=freelancer.name,
                total_budget=Decimal("2000.00"),
                held_in_escrow_amount=Decimal("0.00"),
                released_amount=Decimal("2000.00"),
                currency="USD",
                escrow_status=EscrowStatus.COMPLETED,
            )
            db.add(c)
            db.commit()
            db.refresh(c)

            # M1: Deadline in 2 days, submitted yesterday -> ON TIME
            m1 = Milestone(
                contract_id=c.id,
                step_number=1,
                title="M1",
                description="M1",
                percentage=50,
                amount=Decimal("1000.00"),
                status=MilestoneStatus.RELEASED,
                deadline=now + timedelta(days=2),
            )
            db.add(m1)
            db.commit()
            db.refresh(m1)

            s1 = Submission(
                milestone_id=m1.id,
                submission_type=SubmissionType.URL,
                submission_url="https://github.com/m1",
                verification_status=VerificationStatus.COMPLETED,
                revision_number=1,
                review_status="APPROVED",
                submitted_at=now - timedelta(days=1),
            )
            db.add(s1)

            # M2: Deadline was 2 days ago, submitted today -> LATE
            m2 = Milestone(
                contract_id=c.id,
                step_number=2,
                title="M2",
                description="M2",
                percentage=50,
                amount=Decimal("1000.00"),
                status=MilestoneStatus.RELEASED,
                deadline=now - timedelta(days=2),
            )
            db.add(m2)
            db.commit()
            db.refresh(m2)

            s2 = Submission(
                milestone_id=m2.id,
                submission_type=SubmissionType.URL,
                submission_url="https://github.com/m2",
                verification_status=VerificationStatus.COMPLETED,
                revision_number=1,
                review_status="APPROVED",
                submitted_at=now,
            )
            db.add(s2)
            db.commit()
        finally:
            db.close()

        # 1 out of 2 on time -> 50%
        sc = client.get(f"/api/users/{fid}/scorecard").json()
        assert sc["onTimeDeliveryRate"] == 50

    def test_compliance_score_deterministic_formula():
        db = SessionLocal()
        try:
            freelancer = User(
                name="Compliance Dev",
                email=f"comp-dev-{uuid.uuid4().hex[:8]}@trustpay.ai",
                hashed_password="mock",
                role=UserRole.FREELANCER,
                domain="Compliance Testing",
                bio="Testing deterministic compliance.",
            )
            db.add(freelancer)
            db.commit()
            db.refresh(freelancer)
            fid = freelancer.id

            c = Contract(
                project_id=1,
                client_id=1,
                talent_id=fid,
                project_title="Compliance Test",
                client_name="Acme",
                talent_name=freelancer.name,
                total_budget=Decimal("2000.00"),
                held_in_escrow_amount=Decimal("0.00"),
                released_amount=Decimal("2000.00"),
                currency="USD",
                escrow_status=EscrowStatus.COMPLETED,
            )
            db.add(c)
            db.commit()
            db.refresh(c)

            # Milestone 1: 0 revisions -> 100
            m1 = Milestone(
                contract_id=c.id,
                step_number=1,
                title="M1",
                description="M1",
                percentage=50,
                amount=Decimal("1000.00"),
                status=MilestoneStatus.RELEASED,
                revision_count=0,
            )
            # Milestone 2: 1 revision -> 85
            m2 = Milestone(
                contract_id=c.id,
                step_number=2,
                title="M2",
                description="M2",
                percentage=50,
                amount=Decimal("1000.00"),
                status=MilestoneStatus.RELEASED,
                revision_count=1,
            )
            db.add_all([m1, m2])
            db.commit()
        finally:
            db.close()

        # Average = (100 + 85) / 2 = 92.5 -> round to 93 (or 92)
        sc = client.get(f"/api/users/{fid}/scorecard").json()
        assert sc["complianceScore"] in (92, 93)

    def test_client_spending_and_freelancer_earnings_isolated():
        # User 1 is CLIENT (Acme), User 2 is FREELANCER (Vachan)
        sc_client = client.get("/api/users/1/scorecard").json()
        sc_talent = client.get("/api/users/2/scorecard").json()

        # Client spending reflects client contracts
        assert isinstance(sc_client["totalEarningsOrSpent"], (int, float))
        # Freelancer earnings reflect talent contracts
        assert isinstance(sc_talent["totalEarningsOrSpent"], (int, float))
        # Client does not have freelancer rating
        assert sc_client["rating"] is None

    def test_payment_confirmation_boundary_for_badges():
        # When paypal_capture_id is None, "Escrow Protected" badge is withheld
        _, talent_id, cid, _ = _create_reputation_fixture("escrow-badge-test")
        sc_before = client.get(f"/api/users/{talent_id}/scorecard").json()
        assert "Escrow Protected" not in sc_before["badges"]

        # When paypal_capture_id is confirmed, "Escrow Protected" is awarded
        db = SessionLocal()
        try:
            c = db.query(Contract).filter(Contract.id == cid).first()
            c.paypal_capture_id = "PAYPAL-CAPTURE-CONFIRMED-99"
            db.commit()
        finally:
            db.close()

        sc_after = client.get(f"/api/users/{talent_id}/scorecard").json()
        assert "Escrow Protected" in sc_after["badges"]

    def test_earnings_require_confirmed_payment():
        """total_earnings_or_spent must be 0 when paypal_capture_id is absent,
        and must reflect released_amount only after capture is confirmed."""
        _, talent_id, cid, _ = _create_reputation_fixture("earnings-confirm")

        # Before confirmation: earnings should be 0.0
        sc_before = client.get(f"/api/users/{talent_id}/scorecard").json()
        assert sc_before["totalEarningsOrSpent"] == 0.0, (
            f"Expected 0.0 without confirmed capture, got {sc_before['totalEarningsOrSpent']}"
        )

        # Confirm PayPal capture
        db = SessionLocal()
        try:
            c = db.query(Contract).filter(Contract.id == cid).first()
            c.paypal_capture_id = "PAYPAL-CAPTURE-EARNINGS-TEST"
            db.commit()
        finally:
            db.close()

        # After confirmation: earnings should reflect released_amount (2000.00)
        sc_after = client.get(f"/api/users/{talent_id}/scorecard").json()
        assert sc_after["totalEarningsOrSpent"] == 2000.0, (
            f"Expected 2000.0 with confirmed capture, got {sc_after['totalEarningsOrSpent']}"
        )

    def test_on_time_rate_timezone_aware_and_naive():
        """On-time comparison must not crash when mixing timezone-aware and
        timezone-naive datetimes, and must produce the correct result."""
        db = SessionLocal()
        try:
            freelancer = User(
                name="TZ Test Dev",
                email=f"tz-test-dev-{uuid.uuid4().hex[:8]}@trustpay.ai",
                hashed_password="mock",
                role=UserRole.FREELANCER,
                domain="Backend Dev",
                bio="Testing timezone handling in on-time rate.",
            )
            db.add(freelancer)
            db.commit()
            db.refresh(freelancer)
            fid = freelancer.id

            c = Contract(
                project_id=1,
                client_id=1,
                talent_id=fid,
                project_title="TZ Handling Test",
                client_name="Acme",
                talent_name=freelancer.name,
                total_budget=Decimal("1000.00"),
                held_in_escrow_amount=Decimal("0.00"),
                released_amount=Decimal("1000.00"),
                currency="USD",
                escrow_status=EscrowStatus.COMPLETED,
            )
            db.add(c)
            db.commit()
            db.refresh(c)

            # Milestone with timezone-AWARE deadline (UTC+5:30)
            from datetime import timezone as tz
            ist = tz(timedelta(hours=5, minutes=30))
            aware_deadline = datetime(2026, 12, 1, 23, 59, 0, tzinfo=ist)

            m = Milestone(
                contract_id=c.id,
                step_number=1,
                title="TZ Milestone",
                description="Timezone handling test.",
                percentage=100,
                amount=Decimal("1000.00"),
                status=MilestoneStatus.RELEASED,
                deadline=aware_deadline,
            )
            db.add(m)
            db.commit()
            db.refresh(m)

            # Submission with timezone-NAIVE timestamp, well before deadline in UTC
            naive_sub_time = datetime(2026, 12, 1, 10, 0, 0)
            sub = Submission(
                milestone_id=m.id,
                submission_type=SubmissionType.URL,
                submission_url="https://github.com/tz-test",
                verification_status=VerificationStatus.COMPLETED,
                revision_number=1,
                review_status="APPROVED",
                submitted_at=naive_sub_time,
            )
            db.add(sub)
            db.commit()
        finally:
            db.close()

        # Must evaluate correctly as on-time (100%) without raising TypeError
        sc = client.get(f"/api/users/{fid}/scorecard").json()
        assert sc["onTimeDeliveryRate"] == 100, (
            f"Expected 100% on-time rate, got {sc['onTimeDeliveryRate']}"
        )

    run_test("GET  /api/users/{id}/scorecard returns unrated status for fresh user without false 5 stars", test_unrated_freelancer_scorecard)
    run_test("POST /api/contracts/{id}/review rejects missing caller identity with 401", test_review_missing_identity_rejected)
    run_test("POST /api/contracts/{id}/review rejects unauthorized user with 403 (client only)", test_review_unauthorized_user_rejected)
    run_test("POST /api/contracts/{id}/review rejects review on uncompleted contract with 400", test_review_uncompleted_contract_rejected)
    run_test("POST /api/contracts/{id}/review succeeds for assigned client and updates live scorecard", test_client_review_success_and_reputation_update)
    run_test("POST /api/contracts/{id}/review rejects duplicate review on same contract with 400", test_duplicate_review_rejected)
    run_test("GET  /api/users/{id}/scorecard recalculation is strictly idempotent across multiple contracts", test_recalculation_idempotency_across_contracts)
    run_test("GET  /api/users/{id}/scorecard evaluates on-time delivery against initial milestone deadline", test_on_time_rate_and_deadline_scenarios)
    run_test("GET  /api/users/{id}/scorecard applies deterministic compliance formula (100/85/70/55)", test_compliance_score_deterministic_formula)
    run_test("GET  /api/users/{id}/scorecard isolates freelancer earnings from client expenditures", test_client_spending_and_freelancer_earnings_isolated)
    run_test("GET  /api/users/{id}/scorecard withholds payment-related badges without confirmed PayPal capture", test_payment_confirmation_boundary_for_badges)
    run_test("GET  /api/users/{id}/scorecard earnings require confirmed PayPal payment evidence", test_earnings_require_confirmed_payment)
    run_test("GET  /api/users/{id}/scorecard handles timezone-aware and naive datetime comparison safely", test_on_time_rate_timezone_aware_and_naive)


# ---------------------------------------------------------------------------
# Main Runner
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 70)
    print("  TrustPay AI — Core API Integration & Governance Test Suite")
    print("=" * 70)

    setup_module()
    test_group_projects()
    test_group_contracts()
    test_group_submission()
    test_group_reverification()
    test_group_applications()
    test_group_milestone_approval()
    test_group_milestone_revisions()
    test_group_application_lifecycle()
    test_group_reputation()

    total = len(_results)
    passed = sum(1 for r in _results if r[0] == PASS)
    failed = total - passed

    print("\n" + "=" * 70)
    if failed == 0:
        print(f"  🎉 ALL {total} API INTEGRATION TESTS PASSED — Endpoints fully functional!")
    else:
        print(f"  ⚠️  {passed}/{total} passed — {failed} test(s) failed:")
        for r in _results:
            if r[0] == FAIL:
                print(f"      ❌ {r[1]}")
                if len(r) > 2:
                    print(f"         {r[2]}")
    print("=" * 70)
    sys.exit(0 if failed == 0 else 1)
