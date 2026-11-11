"""
TrustPay AI — Phase 7 Authentication & Security Remediation Test Suite
======================================================================
Validates all Phase 7 security remediations (SEC-01 through SEC-07):
1. SEC-01: Environment-gated development authentication bypass (production rejects X-User-Id and plain Bearer).
2. SEC-02: Project creation IDOR elimination (authenticated CLIENT required, mismatched client IDs rejected).
3. SEC-03: JWT secret validation (fails fast in production on missing or weak secrets < 32 bytes).
4. SEC-04: Application proposal protection (authenticated access only, cross-client access forbidden).
5. SEC-05: Bcrypt 72-byte limit enforcement (UTF-8 byte length validation, HTTP 422 on oversized passwords).
6. SEC-06: Elimination of hardcoded demo credentials / mock password backdoors.
7. SEC-07: AI endpoint protection (authentication required for inference, input limits enforced, public health).
"""

import sys
import os
import uuid
from datetime import timedelta
from unittest.mock import patch
import jwt
import pytest

# Setup backend on path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend") if not os.path.exists(os.path.join(REPO_ROOT, "app")) else REPO_ROOT
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.models.user import User, UserRole
from app.models.project import Project, ProjectStatus, ListingType
from app.models.application import Application, ApplicationStatus
from app.utils.seed_data import seed_demo_data
from app.core.security import (
    create_access_token,
    JWT_SECRET_KEY,
    JWT_ALGORITHM,
    validate_jwt_configuration,
    hash_password,
)
from app.utils.auth import is_dev_auth_allowed

client = TestClient(app)

PASS = "✅ PASS"
FAIL = "❌ FAIL"
_results = []


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
    """Ensure database tables exist and demo data is populated once for auth tests."""
    Base.metadata.create_all(bind=engine)
    seed_demo_data()


# ---------------------------------------------------------------------------
# Test Group 1: Registration Endpoint & SEC-05 Password Length Limit
# ---------------------------------------------------------------------------
def test_group_registration():
    print("\n── Group 1: Registration Endpoint & Password Enforcement ───────────")

    def test_register_client_success():
        uid = uuid.uuid4().hex[:8]
        payload = {
            "name": f"Client Test {uid}",
            "email": f"client_{uid}@example.com",
            "password": "SecurePassword123!",
            "role": "CLIENT",
            "domain": "Fintech & Web3",
            "companyName": "Acme Test Corp",
            "bio": "Building cutting-edge escrow tools.",
        }
        res = client.post("/api/auth/register", json=payload)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data = res.json()
        assert "accessToken" in data
        assert data["tokenType"] == "bearer"
        assert "user" in data
        u = data["user"]
        assert u["email"] == payload["email"]
        assert u["role"] == "CLIENT"
        assert u["companyName"] == "Acme Test Corp"

    def test_register_freelancer_success():
        uid = uuid.uuid4().hex[:8]
        payload = {
            "name": f"Freelancer Test {uid}",
            "email": f"freelancer_{uid}@example.com",
            "password": "StrongPassword456!",
            "role": "FREELANCER",
            "domain": "Mobile Development",
            "bio": "Expert in Flutter and React Native.",
        }
        res = client.post("/api/auth/register", json=payload)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data = res.json()
        assert "accessToken" in data
        assert data["user"]["role"] == "FREELANCER"

    def test_register_duplicate_email_rejected():
        uid = uuid.uuid4().hex[:8]
        email = f"duplicate_{uid}@example.com"
        payload = {
            "name": "Original User",
            "email": email,
            "password": "Password123!",
            "role": "CLIENT",
        }
        res1 = client.post("/api/auth/register", json=payload)
        assert res1.status_code == 201

        # Second registration with same email
        res2 = client.post("/api/auth/register", json=payload)
        assert res2.status_code == 400
        assert "already registered" in res2.json()["detail"]

    def test_register_invalid_role_rejected():
        uid = uuid.uuid4().hex[:8]
        for bad_role in ["ADMIN", "INFLUENCER", "SUPERUSER", "GUEST"]:
            payload = {
                "name": "Bad Role User",
                "email": f"badrole_{bad_role.lower()}_{uid}@example.com",
                "password": "Password123!",
                "role": bad_role,
            }
            res = client.post("/api/auth/register", json=payload)
            assert res.status_code == 422, f"Expected 422 for role '{bad_role}', got {res.status_code}"

    def test_register_short_password_rejected():
        uid = uuid.uuid4().hex[:8]
        payload = {
            "name": "Short Pass User",
            "email": f"shortpass_{uid}@example.com",
            "password": "short",  # < 8 chars
            "role": "CLIENT",
        }
        res = client.post("/api/auth/register", json=payload)
        assert res.status_code == 422

    def test_register_blank_name_rejected():
        uid = uuid.uuid4().hex[:8]
        payload = {
            "name": "   ",
            "email": f"blankname_{uid}@example.com",
            "password": "Password123!",
            "role": "CLIENT",
        }
        res = client.post("/api/auth/register", json=payload)
        assert res.status_code == 422

    def test_register_oversized_password_rejected_sec05():
        # SEC-05: Passwords exceeding 72 UTF-8 bytes must be rejected with 422, never 500
        uid = uuid.uuid4().hex[:8]
        oversized_ascii = "A" * 73
        payload = {
            "name": "Oversized User",
            "email": f"oversized_{uid}@example.com",
            "password": oversized_ascii,
            "role": "CLIENT",
        }
        res = client.post("/api/auth/register", json=payload)
        assert res.status_code == 422, f"Expected 422 for oversized password, got {res.status_code}"
        assert "72 bytes" in str(res.json())

        # Test multi-byte UTF-8 string exceeding 72 bytes even if character count < 72
        # € is 3 bytes in UTF-8; 25 * 3 = 75 bytes
        multi_byte_pass = "€" * 25
        payload["email"] = f"multibyte_{uid}@example.com"
        payload["password"] = multi_byte_pass
        res2 = client.post("/api/auth/register", json=payload)
        assert res2.status_code == 422
        assert "72 bytes" in str(res2.json())

    run_test("POST /api/auth/register succeeds for CLIENT role", test_register_client_success)
    run_test("POST /api/auth/register succeeds for FREELANCER role", test_register_freelancer_success)
    run_test("POST /api/auth/register rejects duplicate email with 400", test_register_duplicate_email_rejected)
    run_test("POST /api/auth/register rejects unauthorized roles (ADMIN, INFLUENCER) with 422", test_register_invalid_role_rejected)
    run_test("POST /api/auth/register rejects passwords shorter than 8 characters", test_register_short_password_rejected)
    run_test("POST /api/auth/register rejects blank name with 422", test_register_blank_name_rejected)
    run_test("POST /api/auth/register rejects passwords exceeding 72 UTF-8 bytes with 422 (SEC-05)", test_register_oversized_password_rejected_sec05)


# ---------------------------------------------------------------------------
# Test Group 2: Login Endpoint & SEC-06 Elimination of Mock Backdoors
# ---------------------------------------------------------------------------
def test_group_login():
    print("\n── Group 2: Login Endpoint & Demo Credential Isolation ─────────────")

    def test_login_success():
        uid = uuid.uuid4().hex[:8]
        email = f"login_test_{uid}@example.com"
        password = "ValidPassword123!"

        reg_res = client.post("/api/auth/register", json={
            "name": "Login Tester",
            "email": email,
            "password": password,
            "role": "CLIENT",
        })
        assert reg_res.status_code == 201

        login_res = client.post("/api/auth/login", json={
            "email": email,
            "password": password,
        })
        assert login_res.status_code == 200
        data = login_res.json()
        assert "accessToken" in data
        assert data["tokenType"] == "bearer"
        assert data["user"]["email"] == email

    def test_login_demo_seed_user():
        # Demo client seeded with real bcrypt hash of DemoPass123!
        login_res = client.post("/api/auth/login", json={
            "email": "contracts@acmeventures.com",
            "password": "DemoPass123!",
        })
        assert login_res.status_code == 200
        data = login_res.json()
        assert "accessToken" in data
        assert data["user"]["role"] == "CLIENT"

    def test_login_wrong_password_rejected():
        uid = uuid.uuid4().hex[:8]
        email = f"wrongpass_{uid}@example.com"
        client.post("/api/auth/register", json={
            "name": "Tester",
            "email": email,
            "password": "CorrectPassword123!",
            "role": "FREELANCER",
        })
        res = client.post("/api/auth/login", json={
            "email": email,
            "password": "WrongPassword999!",
        })
        assert res.status_code == 401
        assert "Invalid email or password" in res.json()["detail"]

    def test_login_nonexistent_email_rejected():
        res = client.post("/api/auth/login", json={
            "email": "doesnotexist_999999@nowhere.com",
            "password": "SomePassword123!",
        })
        assert res.status_code == 401
        assert "Invalid email or password" in res.json()["detail"]

    def test_login_mock_placeholder_hash_rejected_sec06():
        # SEC-06: Create a user with legacy mock_hashed_secret_ placeholder string
        # Attempting to log in with DemoPass123! must be REJECTED (no backdoor)
        db = SessionLocal()
        uid = uuid.uuid4().hex[:8]
        mock_user = User(
            name="Mock User",
            email=f"mock_user_{uid}@example.com",
            hashed_password="mock_hashed_secret_for_legacy_test",
            role=UserRole.CLIENT,
        )
        db.add(mock_user)
        db.commit()
        db.close()

        res = client.post("/api/auth/login", json={
            "email": f"mock_user_{uid}@example.com",
            "password": "DemoPass123!",
        })
        assert res.status_code == 401, f"Expected 401 Unauthorized for mock password backdoor, got {res.status_code}"
        assert "Invalid email or password" in res.json()["detail"]

    def test_login_oversized_password_rejected_sec05():
        # SEC-05: Passwords exceeding 72 UTF-8 bytes must be rejected with 422 during login
        oversized = "A" * 73
        res = client.post("/api/auth/login", json={
            "email": "contracts@acmeventures.com",
            "password": oversized,
        })
        assert res.status_code == 422, f"Expected 422 for oversized login password, got {res.status_code}"
        assert "72 bytes" in str(res.json())

    run_test("POST /api/auth/login succeeds with valid credentials", test_login_success)
    run_test("POST /api/auth/login succeeds for seeded demo user", test_login_demo_seed_user)
    run_test("POST /api/auth/login rejects incorrect password with 401", test_login_wrong_password_rejected)
    run_test("POST /api/auth/login rejects unregistered email with 401", test_login_nonexistent_email_rejected)
    run_test("POST /api/auth/login rejects legacy mock_hashed_secret_ bypass (SEC-06)", test_login_mock_placeholder_hash_rejected_sec06)
    run_test("POST /api/auth/login rejects passwords exceeding 72 UTF-8 bytes with 422 (SEC-05)", test_login_oversized_password_rejected_sec05)


# ---------------------------------------------------------------------------
# Test Group 3: Token Verification & /api/auth/me
# ---------------------------------------------------------------------------
def test_group_token_verification():
    print("\n── Group 3: Token Verification & User Profile (GET /api/auth/me) ────")

    def test_get_me_with_valid_jwt():
        uid = uuid.uuid4().hex[:8]
        email = f"me_test_{uid}@example.com"
        reg = client.post("/api/auth/register", json={
            "name": f"User {uid}",
            "email": email,
            "password": "Password123!",
            "role": "FREELANCER",
            "domain": "UI Design",
        })
        token = reg.json()["accessToken"]

        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == email
        assert data["role"] == "FREELANCER"
        assert data["domain"] == "UI Design"

    def test_get_me_missing_token_rejected():
        res = client.get("/api/auth/me")
        assert res.status_code == 401

    def test_get_me_expired_token_rejected():
        expired_token = create_access_token(
            subject="1",
            role="CLIENT",
            email="contracts@acmeventures.com",
            expires_delta=timedelta(seconds=-10),
        )
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert res.status_code == 401
        assert "expired" in res.json()["detail"].lower()

    def test_get_me_tampered_token_rejected():
        uid = uuid.uuid4().hex[:8]
        reg = client.post("/api/auth/register", json={
            "name": "Tamper Test",
            "email": f"tamper_{uid}@example.com",
            "password": "Password123!",
            "role": "CLIENT",
        })
        valid_token = reg.json()["accessToken"]
        parts = valid_token.split(".")
        tampered_token = f"{parts[0]}.eyJyYW5kb20iOiJib2d1cyJ9.{parts[2]}"

        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tampered_token}"})
        assert res.status_code == 401
        assert "invalid" in res.json()["detail"].lower()

    def test_get_me_wrong_secret_rejected():
        bad_token = jwt.encode(
            {"sub": "1", "email": "contracts@acmeventures.com", "role": "CLIENT"},
            "wrong-secret-key-that-is-at-least-32-bytes-long",
            algorithm=JWT_ALGORITHM,
        )
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad_token}"})
        assert res.status_code == 401

    run_test("GET  /api/auth/me returns profile with valid Bearer JWT", test_get_me_with_valid_jwt)
    run_test("GET  /api/auth/me rejects missing token with 401", test_get_me_missing_token_rejected)
    run_test("GET  /api/auth/me rejects expired JWT with 401", test_get_me_expired_token_rejected)
    run_test("GET  /api/auth/me rejects tampered JWT with 401", test_get_me_tampered_token_rejected)
    run_test("GET  /api/auth/me rejects JWT signed with foreign secret with 401", test_get_me_wrong_secret_rejected)


# ---------------------------------------------------------------------------
# Test Group 4: SEC-01 & SEC-03 Production Environment & Secret Security
# ---------------------------------------------------------------------------
def test_group_production_security():
    print("\n── Group 4: SEC-01 & SEC-03 Production Environment Security ────────")

    def test_production_rejects_x_user_id_sec01():
        # In production, X-User-Id header must be REJECTED with 401
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}):
            assert is_dev_auth_allowed() is False
            res = client.get("/api/contracts/1", headers={"X-User-Id": "1"})
            assert res.status_code == 401, f"Expected 401 in production, got {res.status_code}"
            assert "disabled in production" in res.json()["detail"].lower()

    def test_production_rejects_plain_bearer_sec01():
        # In production, Authorization: Bearer 1 (non-JWT) must be REJECTED with 401
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}):
            res = client.get("/api/contracts/1", headers={"Authorization": "Bearer 1"})
            assert res.status_code == 401
            assert "disabled in production" in res.json()["detail"].lower()

    def test_production_accepts_valid_jwt_sec01():
        # In production, a valid cryptographically signed JWT must be accepted
        prod_secret = "a" * 32
        with patch.dict(os.environ, {"ENVIRONMENT": "production", "JWT_SECRET_KEY": prod_secret}):
            token = jwt.encode(
                {"sub": "1", "email": "contracts@acmeventures.com", "role": "CLIENT"},
                prod_secret,
                algorithm="HS256",
            )
            res = client.get("/api/contracts/1", headers={"Authorization": f"Bearer {token}"})
            assert res.status_code == 200, f"Expected 200 for valid JWT in production, got {res.status_code}"

    def test_production_fails_on_missing_or_weak_jwt_secret_sec03():
        # SEC-03: In production, missing JWT_SECRET_KEY must raise RuntimeError
        with patch.dict(os.environ, {"ENVIRONMENT": "production", "JWT_SECRET_KEY": ""}):
            with pytest.raises(RuntimeError) as exc_info:
                validate_jwt_configuration()
            assert "mandatory" in str(exc_info.value).lower()

        # In production, JWT_SECRET_KEY < 32 bytes must raise RuntimeError
        with patch.dict(os.environ, {"ENVIRONMENT": "production", "JWT_SECRET_KEY": "too-short-secret"}):
            with pytest.raises(RuntimeError) as exc_info:
                validate_jwt_configuration()
            assert "at least 32 bytes" in str(exc_info.value).lower()

        # In production, valid >= 32 byte secret succeeds without raising
        with patch.dict(os.environ, {"ENVIRONMENT": "production", "JWT_SECRET_KEY": "x" * 32}):
            validate_jwt_configuration()  # Should not raise

    def test_environment_normalization_variations_sec01_sec03():
        # Test case variations and abbreviations: 'PROD', 'Production', 'prod'
        for env_var in ("PROD", "Production", "prod", "  production  "):
            with patch.dict(os.environ, {"ENVIRONMENT": env_var, "JWT_SECRET_KEY": ""}):
                assert is_dev_auth_allowed() is False
                with pytest.raises(RuntimeError) as exc_info:
                    validate_jwt_configuration()
                assert "mandatory" in str(exc_info.value).lower()

    def test_demo_seeding_blocked_in_production():
        # Demo seeding must return False and refuse execution in production environments
        for env_var in ("production", "prod", "PROD", "Production"):
            with patch.dict(os.environ, {"ENVIRONMENT": env_var}):
                result = seed_demo_data()
                assert result is False, f"Expected seed_demo_data() to return False in '{env_var}', got {result}"

    run_test("Production rejects X-User-Id with 401 (SEC-01)", test_production_rejects_x_user_id_sec01)
    run_test("Production rejects plain Bearer tokens with 401 (SEC-01)", test_production_rejects_plain_bearer_sec01)
    run_test("Production accepts valid cryptographic JWTs (SEC-01)", test_production_accepts_valid_jwt_sec01)
    run_test("Production validates JWT_SECRET_KEY >= 32 bytes & fails fast (SEC-03)", test_production_fails_on_missing_or_weak_jwt_secret_sec03)
    run_test("Environment normalization treats PROD/Production/prod securely (SEC-01 & SEC-03)", test_environment_normalization_variations_sec01_sec03)
    run_test("Demo seeding strictly prohibited and blocked in production", test_demo_seeding_blocked_in_production)


# ---------------------------------------------------------------------------
# Test Group 5: SEC-02 & SEC-04 Project IDOR & Proposal Data Protection
# ---------------------------------------------------------------------------
def test_group_idor_and_proposal_protection():
    print("\n── Group 5: SEC-02 & SEC-04 IDOR & Application Data Protection ─────")

    def test_anonymous_project_creation_rejected_sec02():
        # SEC-02: Anonymous attempt to create project must be rejected with 401
        payload = {
            "title": "Anonymous Project",
            "domain": "Mobile Development",
            "description": "Should fail",
            "totalBudget": 1000.0,
            "currency": "USD",
            "milestones": [{"stepNumber": 1, "title": "M1", "description": "D1", "percentage": 100}],
        }
        res = client.post("/api/projects", json=payload)
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"

    def test_project_creation_rejects_mismatched_client_id_sec02():
        # SEC-02: Client A attempting to create project with Client B's ID in body is rejected with 400
        uid_a = uuid.uuid4().hex[:8]
        uid_b = uuid.uuid4().hex[:8]
        reg_a = client.post("/api/auth/register", json={
            "name": "Client A", "email": f"ca_{uid_a}@example.com", "password": "Password123!", "role": "CLIENT",
        })
        token_a = reg_a.json()["accessToken"]

        reg_b = client.post("/api/auth/register", json={
            "name": "Client B", "email": f"cb_{uid_b}@example.com", "password": "Password123!", "role": "CLIENT",
        })
        user_b = reg_b.json()["user"]

        payload = {
            "clientId": user_b["id"],  # Client A targeting Client B
            "title": "IDOR Attack Project",
            "domain": "Full-Stack Development",
            "description": "Should fail with 400 Mismatched clientId",
            "totalBudget": 1500.0,
            "currency": "USD",
            "milestones": [{"stepNumber": 1, "title": "Scope", "description": "Desc", "percentage": 100}],
        }
        res = client.post("/api/projects", json=payload, headers={"Authorization": f"Bearer {token_a}"})
        assert res.status_code == 400, f"Expected 400 Mismatched clientId, got {res.status_code}"
        assert "Mismatched clientId" in res.json()["detail"]

    def test_anonymous_applications_listing_rejected_sec04():
        # SEC-04: Anonymous access to /applications must return 401
        res = client.get("/api/projects/all/applications")
        assert res.status_code == 401, f"Expected 401 for anonymous /all/applications, got {res.status_code}"

        res_proj = client.get("/api/projects/1/applications")
        assert res_proj.status_code == 401, f"Expected 401 for anonymous project applications, got {res_proj.status_code}"

    def test_cross_client_project_applications_forbidden_sec04():
        # SEC-04: Client B attempting to view applications for Client A's project must return 403
        uid = uuid.uuid4().hex[:8]
        reg_client_b = client.post("/api/auth/register", json={
            "name": "Unrelated Client", "email": f"unrelated_{uid}@example.com", "password": "Password123!", "role": "CLIENT",
        })
        token_b = reg_client_b.json()["accessToken"]

        # Project 1 is owned by Client 1 (Acme), not Client B
        res = client.get("/api/projects/1/applications", headers={"Authorization": f"Bearer {token_b}"})
        assert res.status_code == 403, f"Expected 403 Forbidden for cross-client access, got {res.status_code}"
        assert "Access denied" in res.json()["detail"]

    def test_freelancer_sees_only_own_application_sec04():
        # SEC-04: A freelancer requesting applications for Project 1 sees ONLY their own application
        uid = uuid.uuid4().hex[:8]
        reg_freelancer = client.post("/api/auth/register", json={
            "name": "Private Freelancer", "email": f"freelancer_priv_{uid}@example.com", "password": "Password123!", "role": "FREELANCER",
        })
        f_user = reg_freelancer.json()["user"]
        f_token = reg_freelancer.json()["accessToken"]

        # Submit an application for Project 2 (open project)
        app_res = client.post(
            "/api/projects/2/applications",
            json={"coverLetter": "My private proposal", "bidAmount": 2000.0},
            headers={"Authorization": f"Bearer {f_token}"},
        )
        assert app_res.status_code == 201

        # Query project applications
        get_res = client.get("/api/projects/2/applications", headers={"Authorization": f"Bearer {f_token}"})
        assert get_res.status_code == 200
        apps = get_res.json()
        assert len(apps) == 1
        assert apps[0]["freelancerId"] == f_user["id"]

    run_test("POST /api/projects rejects anonymous callers with 401 (SEC-02)", test_anonymous_project_creation_rejected_sec02)
    run_test("POST /api/projects rejects mismatched clientId with 400 (SEC-02 IDOR)", test_project_creation_rejects_mismatched_client_id_sec02)
    run_test("GET /api/projects/all/applications rejects anonymous callers with 401 (SEC-04)", test_anonymous_applications_listing_rejected_sec04)
    run_test("GET /api/projects/{id}/applications rejects cross-client access with 403 (SEC-04)", test_cross_client_project_applications_forbidden_sec04)
    run_test("GET /api/projects/{id}/applications limits freelancer to own proposal (SEC-04)", test_freelancer_sees_only_own_application_sec04)


# ---------------------------------------------------------------------------
# Test Group 6: SEC-07 AI Endpoint Authentication & Request Limits
# ---------------------------------------------------------------------------
def test_group_ai_endpoint_protection():
    print("\n── Group 6: SEC-07 AI Endpoint Protection ──────────────────────────")

    def test_ai_health_and_providers_public():
        # Public diagnostics remain accessible without authentication
        res_health = client.get("/api/ai/health")
        assert res_health.status_code == 200
        assert res_health.json()["status"] == "healthy"

        res_prov = client.get("/api/ai/providers")
        assert res_prov.status_code == 200
        assert "active_providers" in res_prov.json()

    def test_ai_inference_endpoints_require_auth_sec07():
        # SEC-07: Unauthenticated calls to LLM inference endpoints must return 401
        res1 = client.post(
            "/api/ai/decompose-spec",
            json={"prompt": "Test spec", "total_budget": 1000.0},
        )
        assert res1.status_code == 401, f"Expected 401 for anonymous AI decompose, got {res1.status_code}"

        res2 = client.post(
            "/api/ai/verify/code",
            json={"code_content": "def test(): pass", "milestone_spec": "Write unit tests", "file_name": "test.py"},
        )
        assert res2.status_code == 401, f"Expected 401 for anonymous code verification, got {res2.status_code}"

        res3 = client.post(
            "/api/ai/dispute/mediate",
            json={
                "milestone_spec": "M1",
                "deliverable_summary": "Code submitted",
                "company_complaint": "Buggy code",
                "freelancer_statement": "Works on my machine",
                "step_amount": 500.0,
            },
        )
        assert res3.status_code == 401, f"Expected 401 for anonymous mediation, got {res3.status_code}"

        res4 = client.post(
            "/api/ai/match-talent",
            json={"project_prompt": "Looking for developer"},
        )
        assert res4.status_code == 401, f"Expected 401 for anonymous match talent, got {res4.status_code}"

    def test_ai_inference_authenticated_success_sec07():
        # Authenticated user can invoke inference endpoint
        uid = uuid.uuid4().hex[:8]
        reg = client.post("/api/auth/register", json={
            "name": "AI Caller", "email": f"ai_caller_{uid}@example.com", "password": "Password123!", "role": "CLIENT",
        })
        token = reg.json()["accessToken"]

        res = client.post(
            "/api/ai/decompose-spec",
            json={
                "prompt": "Build an escrow dashboard with TypeScript and Next.js",
                "total_budget": 2000.0,
                "step_count": 3,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert len(data["steps"]) >= 1
        assert sum(s["percentage_weight"] for s in data["steps"]) == 100

    def test_ai_oversized_payload_rejected_sec07():
        # SEC-07: Requests exceeding input character limits must be rejected with 400
        uid = uuid.uuid4().hex[:8]
        reg = client.post("/api/auth/register", json={
            "name": "Limit Tester", "email": f"limit_{uid}@example.com", "password": "Password123!", "role": "CLIENT",
        })
        token = reg.json()["accessToken"]

        oversized_prompt = "X" * 10001
        res = client.post(
            "/api/ai/decompose-spec",
            json={"prompt": oversized_prompt, "total_budget": 1000.0},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400, f"Expected 400 for oversized prompt, got {res.status_code}"
        assert "exceeds maximum limit" in res.json()["detail"]

    run_test("GET /api/ai/health and /providers are public", test_ai_health_and_providers_public)
    run_test("POST /api/ai/* inference endpoints reject anonymous callers with 401 (SEC-07)", test_ai_inference_endpoints_require_auth_sec07)
    run_test("POST /api/ai/* succeeds for authenticated users (SEC-07)", test_ai_inference_authenticated_success_sec07)
    run_test("POST /api/ai/* rejects oversized payloads exceeding limit with 400 (SEC-07)", test_ai_oversized_payload_rejected_sec07)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
def run_all_tests():
    print("=" * 70)
    print("  TrustPay AI — Phase 7 Security Remediation Test Suite")
    print("=" * 70)

    setup_module()
    test_group_registration()
    test_group_login()
    test_group_token_verification()
    test_group_production_security()
    test_group_idor_and_proposal_protection()
    test_group_ai_endpoint_protection()

    print("\n" + "=" * 70)
    passed = sum(1 for r in _results if r[0] == PASS)
    failed = sum(1 for r in _results if r[0] == FAIL)
    total = len(_results)

    if failed == 0:
        print(f"  🎉 ALL {total} PHASE 7 REMEDIATION TESTS PASSED!")
    else:
        print(f"  ❌ {failed}/{total} TESTS FAILED!")
        for r in _results:
            if r[0] == FAIL:
                print(f"     FAILED: {r[1]} -> {r[2] if len(r) > 2 else ''}")

    print("=" * 70)
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_all_tests()
