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
from decimal import Decimal
from datetime import datetime

# Setup backend on path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.models.contract import Contract
from app.models.milestone import Milestone, MilestoneStatus
from app.models.submission import Submission, SubmissionType, VerificationStatus
from app.utils.seed_data import seed_demo_data

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
        res = client.post("/api/projects", json=payload)
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
        res = client.post("/api/projects", json=payload)
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
        res = client.post("/api/projects", json=payload)
        assert res.status_code == 403
        assert "CLIENT" in res.json()["detail"]

    run_test("GET  /api/projects returns listings with blueprint milestones", test_get_projects_structure)
    run_test("POST /api/projects creates listing and returns 201 Created", test_create_project_success)
    run_test("POST /api/projects rejects milestone percentages not summing to 100%", test_create_project_invalid_percentage)
    run_test("POST /api/projects rejects non-CLIENT user from posting projects", test_create_project_forbidden_role)


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
        res = client.get("/api/projects/all/applications")
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
        res = client.get("/api/projects/proj-101/applications")
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 2
        for a in data:
            assert a["projectId"] == "1"

    def test_get_project_applications_by_numeric_id():
        res = client.get("/api/projects/1/applications")
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 2

    def test_get_project_applications_not_found():
        res = client.get("/api/projects/99999/applications")
        assert res.status_code == 404

    run_test("GET  /api/projects/all/applications returns multi-project applicant inbox", test_get_all_applications_inbox)
    run_test("GET  /api/projects/proj-101/applications returns project applications", test_get_project_applications_by_alias)
    run_test("GET  /api/projects/1/applications returns project applications by numeric ID", test_get_project_applications_by_numeric_id)
    run_test("GET  /api/projects/99999/applications returns 404 for missing project", test_get_project_applications_not_found)


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
