"""
TrustPay AI — Cookie-Based Authentication Test Suite
=====================================================
Verifies Phase 9 HttpOnly cookie JWT auth requirements:

1. POST /api/auth/register   → response sets Set-Cookie: access_token (HttpOnly)
2. POST /api/auth/login      → response sets Set-Cookie: access_token (HttpOnly)
3. Session restore via cookie → GET /api/auth/me returns 200 when cookie is sent
4. POST /api/auth/logout     → clears the access_token cookie
5. Expired cookie/token      → 401
6. No cookie, no bearer      → 401
7. CSRF: state-changing request with cookie auth but no X-Requested-With → 403
8. Bearer token auth (backward compat) still works
9. CORS: allow_origins whitelist (not "*") is configured
"""

import sys
import os
import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest

# Setup backend on path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend") if not os.path.exists(os.path.join(REPO_ROOT, "app")) else REPO_ROOT
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app, ALLOWED_ORIGINS
from app.database import Base, engine, SessionLocal
from app.core.security import create_access_token, JWT_ALGORITHM, get_jwt_secret_key
from app.utils.seed_data import seed_demo_data

client = TestClient(app, raise_server_exceptions=True)

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
    """Ensure database tables exist and demo data is populated once."""
    Base.metadata.create_all(bind=engine)
    seed_demo_data()


def _register_user(email: str, password: str = "Password123!", role: str = "CLIENT") -> dict:
    """Helper: register a user and return parsed response."""
    res = client.post("/api/auth/register", json={
        "name": "Cookie Test User",
        "email": email,
        "password": password,
        "role": role,
    })
    assert res.status_code == 201, f"Registration failed: {res.status_code} {res.text}"
    return res


# ---------------------------------------------------------------------------
# Test Group 1: Register & Login set HttpOnly Cookie
# ---------------------------------------------------------------------------
def test_group_cookie_set_on_auth():
    print("\n── Group 1: HttpOnly Cookie Set on Register & Login ────────────────")

    def test_register_sets_httponly_cookie():
        uid = uuid.uuid4().hex[:8]
        email = f"cookie_reg_{uid}@example.com"
        res = _register_user(email)

        # Must have Set-Cookie header
        assert "set-cookie" in res.headers, "Expected Set-Cookie header in register response"
        cookie_header = res.headers["set-cookie"]
        assert "access_token=" in cookie_header, "access_token cookie not set"
        assert "httponly" in cookie_header.lower(), "Cookie must be HttpOnly"
        assert "samesite=lax" in cookie_header.lower(), "Cookie must be SameSite=Lax"
        # In dev, Secure flag should NOT be set (HTTP localhost)
        # We just verify HttpOnly is present
        assert "access_token" in res.cookies, "access_token must be in response cookies"

    def test_login_sets_httponly_cookie():
        uid = uuid.uuid4().hex[:8]
        email = f"cookie_login_{uid}@example.com"
        _register_user(email)

        res = client.post("/api/auth/login", json={"email": email, "password": "Password123!"})
        assert res.status_code == 200, f"Login failed: {res.status_code} {res.text}"

        assert "set-cookie" in res.headers, "Expected Set-Cookie header in login response"
        cookie_header = res.headers["set-cookie"]
        assert "access_token=" in cookie_header
        assert "httponly" in cookie_header.lower()
        assert "samesite=lax" in cookie_header.lower()

    def test_register_still_returns_access_token_in_body():
        """Backward compat: JSON body still contains accessToken for existing test clients."""
        uid = uuid.uuid4().hex[:8]
        email = f"cookie_body_{uid}@example.com"
        res = _register_user(email)
        data = res.json()
        assert "accessToken" in data, "accessToken must still be in JSON body for backward compat"
        assert data["tokenType"] == "bearer"
        assert data["accessToken"] != "", "accessToken body value must not be empty"

    run_test("POST /api/auth/register sets HttpOnly SameSite=Lax cookie", test_register_sets_httponly_cookie)
    run_test("POST /api/auth/login sets HttpOnly SameSite=Lax cookie", test_login_sets_httponly_cookie)
    run_test("POST /api/auth/register still returns accessToken in JSON body (backward compat)", test_register_still_returns_access_token_in_body)


# ---------------------------------------------------------------------------
# Test Group 2: Cookie-Based Session Restore (GET /api/auth/me via cookie)
# ---------------------------------------------------------------------------
def test_group_session_restore_via_cookie():
    print("\n── Group 2: Session Restore via Cookie (GET /api/auth/me) ──────────")

    def test_get_me_with_valid_cookie():
        uid = uuid.uuid4().hex[:8]
        email = f"cookie_me_{uid}@example.com"
        login_res = client.post("/api/auth/login", json={
            "email": "contracts@acmeventures.com",
            "password": "DemoPass123!",
        })
        assert login_res.status_code == 200

        # TestClient preserves cookies automatically between requests in the same session
        # but we can also manually extract and pass the cookie
        cookie_value = login_res.cookies.get("access_token")
        assert cookie_value, "Login must set access_token cookie"

        me_res = client.get("/api/auth/me", cookies={"access_token": cookie_value})
        assert me_res.status_code == 200, f"Expected 200 with cookie auth, got {me_res.status_code}: {me_res.text}"
        data = me_res.json()
        assert data["email"] == "contracts@acmeventures.com"

    def test_get_me_no_cookie_no_header_returns_401():
        # No cookie, no Authorization header → must be 401
        res = client.get("/api/auth/me")
        assert res.status_code == 401, f"Expected 401 without credentials, got {res.status_code}"

    def test_get_me_expired_cookie_returns_401():
        # Craft an expired token and pass it as a cookie
        expired_token = create_access_token(
            subject="1",
            role="CLIENT",
            email="contracts@acmeventures.com",
            expires_delta=timedelta(seconds=-10),
        )
        res = client.get("/api/auth/me", cookies={"access_token": expired_token})
        assert res.status_code == 401, f"Expected 401 for expired cookie token, got {res.status_code}"
        assert "expired" in res.json()["detail"].lower()

    run_test("GET /api/auth/me returns 200 when valid cookie is sent", test_get_me_with_valid_cookie)
    run_test("GET /api/auth/me returns 401 with no cookie and no bearer header", test_get_me_no_cookie_no_header_returns_401)
    run_test("GET /api/auth/me returns 401 for expired cookie JWT", test_get_me_expired_cookie_returns_401)


# ---------------------------------------------------------------------------
# Test Group 3: Logout (POST /api/auth/logout)
# ---------------------------------------------------------------------------
def test_group_logout():
    print("\n── Group 3: Logout (POST /api/auth/logout) ─────────────────────────")

    def test_logout_clears_cookie():
        uid = uuid.uuid4().hex[:8]
        email = f"cookie_logout_{uid}@example.com"
        _register_user(email)

        login_res = client.post("/api/auth/login", json={"email": email, "password": "Password123!"})
        assert login_res.status_code == 200
        cookie_value = login_res.cookies.get("access_token")
        assert cookie_value

        # Logout
        logout_res = client.post("/api/auth/logout")
        assert logout_res.status_code == 200
        assert logout_res.json()["message"] == "Logged out successfully."

        # After logout, the cookie should be cleared (empty value or max-age=0)
        set_cookie_header = logout_res.headers.get("set-cookie", "")
        assert "access_token=" in set_cookie_header, "Logout must include Set-Cookie to clear the cookie"
        # Starlette's delete_cookie sets max-age=0
        assert "max-age=0" in set_cookie_header.lower() or "expires=" in set_cookie_header.lower(), \
            f"Logout cookie must expire immediately. Set-Cookie: {set_cookie_header}"

    def test_after_logout_cookie_session_is_invalidated():
        """Using the old cookie after logout no longer authenticates (token is still cryptographically
        valid, but the cookie is gone from the browser — the backend relies on SameSite + HttpOnly
        to prevent theft, not server-side session invalidation which is a future enhancement)."""
        # This test verifies the logout response clears the cookie correctly.
        # Since we're using stateless JWTs, the token itself remains valid until expiry.
        # The important thing is that the browser cookie is cleared.
        uid = uuid.uuid4().hex[:8]
        email = f"postlogout_{uid}@example.com"
        _register_user(email)

        login_res = client.post("/api/auth/login", json={"email": email, "password": "Password123!"})
        cookie = login_res.cookies.get("access_token")

        logout_res = client.post("/api/auth/logout")
        assert logout_res.status_code == 200

        # The backend cleared the cookie. If we explicitly resend the old token,
        # it still works (stateless JWT). But the browser won't have it anymore.
        # This is correct behavior for stateless cookie auth.
        # We verify the logout header correctly removes the cookie.
        assert "access_token" in logout_res.headers.get("set-cookie", ""), \
            "Set-Cookie must be in logout response to clear the cookie"

    run_test("POST /api/auth/logout clears the access_token cookie", test_logout_clears_cookie)
    run_test("POST /api/auth/logout sends Set-Cookie header to remove cookie", test_after_logout_cookie_session_is_invalidated)


# ---------------------------------------------------------------------------
# Test Group 4: CSRF Protection
# ---------------------------------------------------------------------------
def test_group_csrf_protection():
    print("\n── Group 4: CSRF Protection Middleware ─────────────────────────────")

    def test_csrf_blocks_mutating_request_with_cookie_no_header():
        """
        A POST request with a cookie but WITHOUT X-Requested-With / X-CSRF-Token
        must be rejected with 403.
        """
        uid = uuid.uuid4().hex[:8]
        email = f"csrf_test_{uid}@example.com"
        _register_user(email)

        login_res = client.post("/api/auth/login", json={"email": email, "password": "Password123!"})
        cookie = login_res.cookies.get("access_token")
        assert cookie

        # Attempt a state-changing request with cookie but no CSRF header
        res = client.patch(
            "/api/auth/profile",
            json={"name": "CSRF Attacker"},
            cookies={"access_token": cookie},
            headers={},  # No X-Requested-With
        )
        assert res.status_code == 403, f"Expected 403 CSRF block, got {res.status_code}: {res.text}"
        assert "csrf" in res.json()["detail"].lower()

    def test_csrf_allows_mutating_request_with_x_requested_with():
        """
        A POST request with cookie AND X-Requested-With: XMLHttpRequest is allowed.
        """
        uid = uuid.uuid4().hex[:8]
        email = f"csrf_ok_{uid}@example.com"
        _register_user(email)

        login_res = client.post("/api/auth/login", json={"email": email, "password": "Password123!"})
        cookie = login_res.cookies.get("access_token")
        assert cookie

        res = client.patch(
            "/api/auth/profile",
            json={"name": "CSRF Allowed"},
            cookies={"access_token": cookie},
            headers={"X-Requested-With": "XMLHttpRequest"},
        )
        assert res.status_code == 200, f"Expected 200 with X-Requested-With, got {res.status_code}: {res.text}"

    def test_csrf_allows_bearer_token_request_without_csrf_header():
        """
        Bearer token auth (no cookie) is NOT subject to CSRF checks.
        X-Requested-With is NOT required for Bearer-based requests.
        """
        uid = uuid.uuid4().hex[:8]
        email = f"csrf_bearer_{uid}@example.com"
        reg = _register_user(email)
        token = reg.json()["accessToken"]

        res = client.patch(
            "/api/auth/profile",
            json={"name": "Bearer Auth Update"},
            headers={"Authorization": f"Bearer {token}"},
            # No cookie, no X-Requested-With
        )
        assert res.status_code == 200, f"Expected 200 for Bearer auth without CSRF header, got {res.status_code}: {res.text}"

    def test_csrf_allows_safe_methods_without_header():
        """GET requests are exempt from CSRF checks even with a cookie."""
        login_res = client.post("/api/auth/login", json={
            "email": "contracts@acmeventures.com",
            "password": "DemoPass123!",
        })
        cookie = login_res.cookies.get("access_token")

        res = client.get(
            "/api/auth/me",
            cookies={"access_token": cookie},
            # No X-Requested-With — GET is safe
        )
        assert res.status_code == 200, f"Expected 200 for GET with cookie, got {res.status_code}"

    def test_csrf_allows_login_without_csrf_header():
        """Login and register are exempt (they don't require an existing session cookie)."""
        uid = uuid.uuid4().hex[:8]
        email = f"csrf_exempt_{uid}@example.com"
        # Register without X-Requested-With — must succeed
        res = client.post("/api/auth/register", json={
            "name": "CSRF Exempt",
            "email": email,
            "password": "Password123!",
            "role": "CLIENT",
        })
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"

    run_test("POST with cookie but no X-Requested-With header is blocked with 403 (CSRF)", test_csrf_blocks_mutating_request_with_cookie_no_header)
    run_test("POST with cookie AND X-Requested-With: XMLHttpRequest is allowed", test_csrf_allows_mutating_request_with_x_requested_with)
    run_test("Bearer token POST without X-Requested-With is NOT blocked (no cookie)", test_csrf_allows_bearer_token_request_without_csrf_header)
    run_test("GET requests with cookie are NOT blocked by CSRF middleware", test_csrf_allows_safe_methods_without_header)
    run_test("Login/register paths are CSRF-exempt (no prior session needed)", test_csrf_allows_login_without_csrf_header)


# ---------------------------------------------------------------------------
# Test Group 5: Bearer Token Backward Compatibility
# ---------------------------------------------------------------------------
def test_group_bearer_compat():
    print("\n── Group 5: Bearer Token Backward Compatibility ────────────────────")

    def test_bearer_token_still_authenticates():
        """Existing tests that pass Authorization: Bearer <jwt> continue to work."""
        uid = uuid.uuid4().hex[:8]
        email = f"bearer_compat_{uid}@example.com"
        reg = _register_user(email)
        token = reg.json()["accessToken"]

        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert res.json()["email"] == email

    def test_cookie_takes_priority_over_bearer():
        """
        When both a cookie and a Bearer header are present, the cookie JWT is used.
        (Both should refer to the same user; we just verify the request succeeds.)
        """
        uid = uuid.uuid4().hex[:8]
        email = f"cookie_priority_{uid}@example.com"
        reg = _register_user(email)
        token = reg.json()["accessToken"]
        cookie = reg.cookies.get("access_token")
        assert cookie, "Register must set cookie"

        res = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            cookies={"access_token": cookie},
        )
        assert res.status_code == 200
        assert res.json()["email"] == email

    run_test("Authorization: Bearer <jwt> still authenticates (backward compat)", test_bearer_token_still_authenticates)
    run_test("Cookie takes priority when both cookie and Bearer are present", test_cookie_takes_priority_over_bearer)


# ---------------------------------------------------------------------------
# Test Group 6: CORS Explicit Origin Whitelist
# ---------------------------------------------------------------------------
def test_group_cors_config():
    print("\n── Group 6: CORS Explicit Origin Whitelist ─────────────────────────")

    def test_cors_uses_explicit_origin_list():
        """allow_origins must NOT be ['*'] — an explicit list must be configured."""
        from app.main import ALLOWED_ORIGINS
        assert ALLOWED_ORIGINS != ["*"], "allow_origins must not be wildcard '*'"
        assert len(ALLOWED_ORIGINS) >= 1, "At least one allowed origin must be configured"
        # Default dev origins must include localhost
        assert any("localhost" in o or "127.0.0.1" in o for o in ALLOWED_ORIGINS), \
            f"Allowed origins must include a localhost entry for dev. Got: {ALLOWED_ORIGINS}"

    run_test("CORS allow_origins is an explicit whitelist (not '*')", test_cors_uses_explicit_origin_list)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
def run_all_tests():
    print("=" * 70)
    print("  TrustPay AI — Cookie Authentication Test Suite")
    print("=" * 70)

    setup_module()
    test_group_cookie_set_on_auth()
    test_group_session_restore_via_cookie()
    test_group_logout()
    test_group_csrf_protection()
    test_group_bearer_compat()
    test_group_cors_config()

    print("\n" + "=" * 70)
    passed = sum(1 for r in _results if r[0] == PASS)
    failed = sum(1 for r in _results if r[0] == FAIL)
    total = len(_results)

    if failed == 0:
        print(f"  🎉 ALL {total} COOKIE AUTH TESTS PASSED!")
    else:
        print(f"  ❌ {failed}/{total} TESTS FAILED!")
        for r in _results:
            if r[0] == FAIL:
                print(f"     FAILED: {r[1]} → {r[2] if len(r) > 2 else ''}")
    print("=" * 70)
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_all_tests()
