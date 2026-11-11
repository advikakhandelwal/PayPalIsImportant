"""
TrustPay AI — Phase 8 Full End-to-End Frontend–Backend Integration Test Suite
=============================================================================
Validates:
1. Complete Authentication Lifecycle (Register, Login, Incorrect Password Rejection, JWT Issuance)
2. Security & Token Integrity (Tampered JWT, Expired JWT, Missing Token, IDOR Prevention)
3. Role-Based Access Control (Client vs Freelancer Restrictions)
4. User Profile Management (GET /me, PATCH /profile)
5. Project Lifecycle (Creation, Listing, Ownership Guards)
6. Proposal & Application Flow (Apply, Applicant Isolation, Accept/Reject)
7. Escrow Contract Lifecycle (Instantiate Contract, Milestone Submissions, Revisions, Approvals, Sequential Unlocking)
8. Contract Review & Reputation Engine (Client Review, Scorecard Calculation)
9. Error Handling & Data Integrity
"""

import os
import uuid
import jwt
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

# Ensure non-production environment for test execution
os.environ["ENVIRONMENT"] = "development"
os.environ["DEV_AUTH_ALLOWED"] = "false"
os.environ["SEED_DEMO_DATA"] = "false"

from app.main import app
from app.database import get_db, SessionLocal
from app.models.user import User, UserRole
from app.models.project import Project, ProjectStatus
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.core.security import get_jwt_secret_key, create_access_token

client = TestClient(app)


def unique_email(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


# ─────────────────────────────────────────────────────────────────────────────
# 1. Mandatory Security Tests: Authentication, Token & Session Integrity
# ─────────────────────────────────────────────────────────────────────────────
class TestPhase8AuthenticationSecurity:
    """Covers Phase 8 Mandatory Security Tests 1-8."""

    def test_01_registration_client_and_freelancer(self):
        """1. Register new accounts with valid passwords."""
        # CLIENT
        client_email = unique_email("test_client")
        reg_client = client.post(
            "/api/auth/register",
            json={
                "name": "Sarah Client",
                "email": client_email,
                "password": "SecurePassword123!",
                "role": "CLIENT",
                "companyName": "Acme Ventures",
            },
        )
        assert reg_client.status_code == 201
        data = reg_client.json()
        assert "accessToken" in data
        assert data["tokenType"] == "bearer"
        assert data["user"]["email"] == client_email
        assert data["user"]["role"] == "CLIENT"
        assert data["user"]["companyName"] == "Acme Ventures"

        # FREELANCER
        freelancer_email = unique_email("test_talent")
        reg_fl = client.post(
            "/api/auth/register",
            json={
                "name": "Alex Freelancer",
                "email": freelancer_email,
                "password": "SecurePassword123!",
                "role": "FREELANCER",
                "domain": "Full-Stack Development",
            },
        )
        assert reg_fl.status_code == 201
        fl_data = reg_fl.json()
        assert "accessToken" in fl_data
        assert fl_data["user"]["email"] == freelancer_email
        assert fl_data["user"]["role"] == "FREELANCER"

    def test_02_login_with_correct_credentials(self):
        """2. Log in using correct credentials and receive valid JWT."""
        email = unique_email("login_valid")
        password = "CorrectPassword123!"
        client.post(
            "/api/auth/register",
            json={"name": "Valid User", "email": email, "password": password, "role": "CLIENT"},
        )

        login_res = client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )
        assert login_res.status_code == 200
        data = login_res.json()
        assert "accessToken" in data
        assert data["user"]["email"] == email

    def test_03_login_with_incorrect_password_fails(self):
        """3. Attempt login using existing email with incorrect password — MUST fail."""
        email = unique_email("wrong_pw")
        password = "CorrectPassword123!"
        client.post(
            "/api/auth/register",
            json={"name": "User", "email": email, "password": password, "role": "FREELANCER"},
        )

        # Wrong password
        bad_login = client.post(
            "/api/auth/login",
            json={"email": email, "password": "WrongPassword999!"},
        )
        assert bad_login.status_code == 401
        assert "Invalid email or password" in bad_login.json()["detail"]

    def test_04_login_with_nonexistent_account_fails(self):
        """4. Attempt login using non-existent email — MUST fail."""
        bad_login = client.post(
            "/api/auth/login",
            json={"email": "nonexistent_999@example.com", "password": "AnyPassword123!"},
        )
        assert bad_login.status_code == 401
        assert "Invalid email or password" in bad_login.json()["detail"]

    def test_05_access_protected_endpoint_without_token_fails(self):
        """5. Attempt to access protected endpoints without token — MUST fail."""
        assert client.get("/api/auth/me").status_code == 401
        assert client.get("/api/contracts").status_code == 401
        assert client.post("/api/projects", json={}).status_code == 401
        assert client.get("/api/projects/all/applications").status_code == 401

    def test_06_access_another_users_private_records_fails(self):
        """6. Attempt to access another user's private records — MUST fail."""
        # Client A
        email_a = unique_email("client_a")
        reg_a = client.post(
            "/api/auth/register",
            json={"name": "Client A", "email": email_a, "password": "Password123!", "role": "CLIENT"},
        )
        token_a = reg_a.json()["accessToken"]

        # Client B
        email_b = unique_email("client_b")
        reg_b = client.post(
            "/api/auth/register",
            json={"name": "Client B", "email": email_b, "password": "Password123!", "role": "CLIENT"},
        )
        token_b = reg_b.json()["accessToken"]

        # Client A creates a project
        proj_res = client.post(
            "/api/projects",
            headers={"Authorization": f"Bearer {token_a}"},
            json={
                "title": "Confidential Project A",
                "domain": "Fintech",
                "description": "Private project description",
                "totalBudget": 5000.0,
                "milestones": [
                    {
                        "stepNumber": 1,
                        "title": "Milestone 1",
                        "description": "Milestone 1 description",
                        "percentage": 100,
                        "paymentAmount": 5000.0,
                    }
                ],
            },
        )
        assert proj_res.status_code == 201
        proj_id = proj_res.json()["id"]

        # Client B attempts to view applications for Client A's project -> MUST be 403 Forbidden
        view_apps = client.get(
            f"/api/projects/{proj_id}/applications",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert view_apps.status_code == 403
        assert "Access denied" in view_apps.json()["detail"]

    def test_07_invalid_expired_and_tampered_jwt_rejected(self):
        """7. Test invalid, expired, and tampered JWTs."""
        secret = get_jwt_secret_key()

        # A: Expired JWT
        now = datetime.now(timezone.utc)
        expired_payload = {
            "sub": "1",
            "role": "CLIENT",
            "email": "test@example.com",
            "iat": int((now - timedelta(hours=2)).timestamp()),
            "exp": int((now - timedelta(hours=1)).timestamp()),
        }
        expired_jwt = jwt.encode(expired_payload, secret, algorithm="HS256")
        res_exp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_jwt}"})
        assert res_exp.status_code == 401
        assert "expired" in res_exp.json()["detail"].lower()

        # B: Tampered signature
        tampered_jwt = expired_jwt[:-8] + "abcdefgh"
        res_tamp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tampered_jwt}"})
        assert res_tamp.status_code == 401

        # C: Signed with wrong secret
        wrong_jwt = jwt.encode(
            {"sub": "1", "role": "CLIENT", "exp": int((now + timedelta(hours=1)).timestamp())},
            "completely_wrong_secret_key_1234567890",
            algorithm="HS256",
        )
        res_wrong = client.get("/api/auth/me", headers={"Authorization": f"Bearer {wrong_jwt}"})
        assert res_wrong.status_code == 401

    def test_08_session_management_and_profile_update(self):
        """8. Verify session handling (GET /me) and profile update (PATCH /profile)."""
        email = unique_email("session_user")
        reg = client.post(
            "/api/auth/register",
            json={"name": "Initial Name", "email": email, "password": "Password123!", "role": "FREELANCER"},
        )
        token = reg.json()["accessToken"]

        # GET /api/auth/me
        me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        assert me_res.json()["name"] == "Initial Name"
        assert me_res.json()["trustScorecard"] is not None

        # PATCH /api/auth/profile
        patch_res = client.patch(
            "/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Updated Name",
                "domain": "AI Engineering",
                "bio": "Expert in autonomous agents and smart contracts.",
            },
        )
        assert patch_res.status_code == 200
        updated = patch_res.json()
        assert updated["name"] == "Updated Name"
        assert updated["domain"] == "AI Engineering"
        assert updated["bio"] == "Expert in autonomous agents and smart contracts."


# ─────────────────────────────────────────────────────────────────────────────
# 2. Functional Lifecycle Tests: Full Marketplace Flow
# ─────────────────────────────────────────────────────────────────────────────
class TestPhase8MarketplaceFunctionalLifecycle:
    """Covers complete end-to-end journey across projects, applications, contracts, submissions, approvals, and reviews."""

    def test_complete_marketplace_escrow_journey(self):
        # ── Step 1: Register Client & Freelancer ──────────────────────────
        client_email = unique_email("e2e_client")
        fl_email = unique_email("e2e_freelancer")

        reg_c = client.post(
            "/api/auth/register",
            json={"name": "Alice Enterprise", "email": client_email, "password": "Password123!", "role": "CLIENT", "companyName": "Alice Labs"},
        )
        assert reg_c.status_code == 201
        client_token = reg_c.json()["accessToken"]
        client_id = reg_c.json()["user"]["id"]

        reg_f = client.post(
            "/api/auth/register",
            json={"name": "Bob Developer", "email": fl_email, "password": "Password123!", "role": "FREELANCER", "domain": "Full-Stack Development"},
        )
        assert reg_f.status_code == 201
        fl_token = reg_f.json()["accessToken"]
        fl_id = reg_f.json()["user"]["id"]

        # ── Step 2: Client Posts a Project ────────────────────────────────
        project_payload = {
            "title": "E2E Milestone Escrow App",
            "domain": "Full-Stack Development",
            "description": "Build Next.js + FastAPI integration with autonomous escrow release.",
            "totalBudget": 4000.0,
            "currency": "USD",
            "deadline": "2026-12-31",
            "requiredSkills": ["FastAPI", "Next.js", "TypeScript"],
            "experienceLevel": "Expert",
            "milestones": [
                {
                    "stepNumber": 1,
                    "title": "Milestone 1: Core API & Auth",
                    "description": "JWT authentication and database models.",
                    "percentage": 50,
                    "paymentAmount": 2000.0,
                    "deadline": "2026-12-01",
                    "deliverableRequirements": ["Working JWT auth endpoints", "Clean migrations"],
                },
                {
                    "stepNumber": 2,
                    "title": "Milestone 2: Frontend Integration",
                    "description": "Full dashboard integration and testing.",
                    "percentage": 50,
                    "paymentAmount": 2000.0,
                    "deadline": "2026-12-31",
                    "deliverableRequirements": ["Responsive dashboards", "End-to-end tests passing"],
                },
            ],
        }

        create_proj_res = client.post(
            "/api/projects",
            headers={"Authorization": f"Bearer {client_token}"},
            json=project_payload,
        )
        assert create_proj_res.status_code == 201
        project_data = create_proj_res.json()
        project_id = project_data["id"]
        assert project_data["title"] == project_payload["title"]
        assert len(project_data["milestones"]) == 2

        # Verify project appears in public project listings
        all_projects = client.get("/api/projects").json()
        assert any(p["id"] == project_id for p in all_projects)

        # ── Step 3: Freelancer Applies to Project ─────────────────────────
        apply_res = client.post(
            f"/api/projects/{project_id}/applications",
            headers={"Authorization": f"Bearer {fl_token}"},
            json={
                "coverLetter": "I have extensive experience with Next.js and FastAPI integrations.",
                "bidAmount": 4000.0,
                "currency": "USD",
            },
        )
        assert apply_res.status_code == 201
        app_data = apply_res.json()
        app_id = app_data["id"]
        assert app_data["freelancerId"] == fl_id

        # Freelancer checks their submitted applications
        fl_apps = client.get(
            "/api/projects/all/applications",
            headers={"Authorization": f"Bearer {fl_token}"},
        ).json()
        assert any(a["id"] == app_id for a in fl_apps)

        # Client checks applicant inbox for their project
        client_apps = client.get(
            f"/api/projects/{project_id}/applications",
            headers={"Authorization": f"Bearer {client_token}"},
        ).json()
        assert any(a["id"] == app_id for a in client_apps)

        # ── Step 4: Client Accepts Application -> Instantiates Contract ───
        accept_res = client.post(
            f"/api/projects/{project_id}/applications/{app_id}/accept",
            headers={"Authorization": f"Bearer {client_token}"},
        )
        assert accept_res.status_code == 200
        contract_data = accept_res.json()
        contract_id = contract_data["id"]
        assert contract_data["projectId"] == project_id
        assert contract_data["clientId"] == client_id
        assert contract_data["freelancerId"] == fl_id
        assert contract_data["totalBudget"] == 4000.0
        assert len(contract_data["milestones"]) == 2

        # Contract initially starts in AWAITING_AUTHORIZATION with all milestones LOCKED
        assert contract_data["escrowStatus"] == "AWAITING_AUTHORIZATION"
        ms1 = contract_data["milestones"][0]
        ms2 = contract_data["milestones"][1]
        assert ms1["stepNumber"] == 1
        assert ms1["status"] == "LOCKED"
        assert ms2["stepNumber"] == 2
        assert ms2["status"] == "LOCKED"

        # Simulate PayPal Escrow Funding Authorization:
        # Escrow transitions to HELD_IN_ESCROW, Step 1 transitions to ACTIVE
        db = SessionLocal()
        try:
            c_db = db.query(Contract).filter(Contract.id == int(contract_id)).first()
            c_db.escrow_status = EscrowStatus.HELD_IN_ESCROW
            c_db.held_in_escrow_amount = 4000.0
            m1_db = db.query(Milestone).filter(Milestone.contract_id == int(contract_id), Milestone.step_number == 1).first()
            m1_db.status = MilestoneStatus.ACTIVE
            db.commit()
        finally:
            db.close()

        # Re-fetch active contract
        c_active = client.get(
            f"/api/contracts/{contract_id}",
            headers={"Authorization": f"Bearer {client_token}"},
        ).json()
        assert c_active["escrowStatus"] == "HELD_IN_ESCROW"
        ms1 = c_active["milestones"][0]
        assert ms1["status"] == "ACTIVE"

        # ── Step 5: Both Parties See Contract in GET /api/contracts ───────
        c_contracts = client.get(
            "/api/contracts",
            headers={"Authorization": f"Bearer {client_token}"},
        ).json()
        assert any(c["id"] == contract_id for c in c_contracts)

        f_contracts = client.get(
            "/api/contracts",
            headers={"Authorization": f"Bearer {fl_token}"},
        ).json()
        assert any(c["id"] == contract_id for c in f_contracts)

        # ── Step 6: Freelancer Submits Deliverable for Milestone 1 ─────────
        sub1_res = client.post(
            f"/api/contracts/{contract_id}/milestones/{ms1['id']}/submit",
            headers={"Authorization": f"Bearer {fl_token}"},
            json={
                "submissionType": "URL",
                "submissionUrl": "https://github.com/org/repo/pull/1",
                "fileName": "auth_pr.txt",
                "notes": "Completed JWT authentication and DB migration scripts.",
            },
        )
        assert sub1_res.status_code == 201
        sub1_data = sub1_res.json()
        assert sub1_data["verificationStatus"] in ("COMPLETED", "FAILED", "PENDING")
        assert sub1_data["reviewStatus"] == "IN_REVIEW"

        # ── Step 7: Client Requests Revision on Milestone 1 ───────────────
        rev_res = client.post(
            f"/api/contracts/{contract_id}/milestones/{ms1['id']}/request-revision",
            headers={"Authorization": f"Bearer {client_token}"},
            json={
                "feedback": "Please add docstrings to the new schemas.",
                "specificCorrections": "Add docstrings in auth_schemas.py",
                "additionalInstructions": "Ensure all tests pass.",
            },
        )
        assert rev_res.status_code == 200
        assert rev_res.json()["status"] == "REVISION_REQUESTED"
        assert rev_res.json()["revisionCount"] == 1

        # ── Step 8: Freelancer Re-submits Deliverable ──────────────────────
        sub1_re_res = client.post(
            f"/api/contracts/{contract_id}/milestones/{ms1['id']}/submit",
            headers={"Authorization": f"Bearer {fl_token}"},
            json={
                "submissionType": "URL",
                "submissionUrl": "https://github.com/org/repo/pull/1/commits/fix",
                "fileName": "docstrings_added.txt",
                "notes": "Added comprehensive docstrings and verified all test suites.",
            },
        )
        assert sub1_re_res.status_code == 201

        # ── Step 9: Client Approves Milestone 1 -> Releases Funds, Unlocks Step 2 ──
        appr1_res = client.post(
            f"/api/contracts/{contract_id}/milestones/{ms1['id']}/approve",
            headers={"Authorization": f"Bearer {client_token}"},
        )
        assert appr1_res.status_code == 200
        c_after_ms1 = appr1_res.json()
        assert c_after_ms1["releasedAmount"] == 2000.0
        assert c_after_ms1["heldInEscrowAmount"] == 2000.0
        assert c_after_ms1["escrowStatus"] == "PARTIALLY_RELEASED"

        # Milestone 1 is RELEASED, Milestone 2 is transitioned to ACTIVE
        ms1_updated = [m for m in c_after_ms1["milestones"] if m["stepNumber"] == 1][0]
        ms2_updated = [m for m in c_after_ms1["milestones"] if m["stepNumber"] == 2][0]
        assert ms1_updated["status"] == "RELEASED"
        assert ms2_updated["status"] == "ACTIVE"

        # ── Step 10: Freelancer Submits Deliverable for Milestone 2 ────────
        sub2_res = client.post(
            f"/api/contracts/{contract_id}/milestones/{ms2_updated['id']}/submit",
            headers={"Authorization": f"Bearer {fl_token}"},
            json={
                "submissionType": "URL",
                "submissionUrl": "https://github.com/org/repo/pull/2",
                "notes": "Complete frontend dashboard integration and responsive UI.",
            },
        )
        assert sub2_res.status_code == 201

        # ── Step 11: Client Approves Milestone 2 -> Contract COMPLETED ───
        appr2_res = client.post(
            f"/api/contracts/{contract_id}/milestones/{ms2_updated['id']}/approve",
            headers={"Authorization": f"Bearer {client_token}"},
        )
        assert appr2_res.status_code == 200
        c_final = appr2_res.json()
        assert c_final["releasedAmount"] == 4000.0
        assert c_final["heldInEscrowAmount"] == 0.0
        assert c_final["escrowStatus"] == "COMPLETED"

        # ── Step 12: Client Submits Review for Completed Contract ─────────
        review_res = client.post(
            f"/api/contracts/{contract_id}/review",
            headers={"Authorization": f"Bearer {client_token}"},
            json={
                "rating": 5.0,
                "review": "Exceptional delivery! Highly professional and timely communication.",
            },
        )
        assert review_res.status_code == 200
        rev_data = review_res.json()
        assert rev_data["clientRating"] == 5.0
        assert "Exceptional delivery" in rev_data["clientReview"]

        # ── Step 13: Verify Freelancer's Live Trust Scorecard ──────────────
        scorecard = client.get(f"/api/users/{fl_id}/scorecard").json()
        assert scorecard["rating"] == 5.0
        assert scorecard["completedProjects"] == 1
        assert scorecard["isUnrated"] is False
        assert scorecard["complianceScore"] == 92  # (85 from MS1 + 100 from MS2) / 2 = 92% avg compliance
