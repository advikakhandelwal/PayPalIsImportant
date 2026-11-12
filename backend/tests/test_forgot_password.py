"""Tests for Forgot Password & Single-Use Reset Password endpoints."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_forgot_and_reset_password_lifecycle():
    email = "reset_tester@example.com"
    old_password = "OldPassword123!"
    new_password = "NewPassword456!"

    # Ensure user exists (register or login if already present)
    reg_res = client.post(
        "/api/auth/register",
        json={
            "name": "Reset Tester",
            "email": email,
            "password": old_password,
            "role": "FREELANCER",
        },
    )
    assert reg_res.status_code in (201, 400)

    # 1. Request reset token for unknown email still returns 200 without leaking a token
    unknown_res = client.post(
        "/api/auth/forgot-password",
        json={"email": "nobody_here@example.com"},
    )
    assert unknown_res.status_code == 200
    assert unknown_res.json().get("resetToken") is None

    # 2. Request reset token for registered email
    forgot_res = client.post(
        "/api/auth/forgot-password",
        json={"email": email},
    )
    assert forgot_res.status_code == 200
    token = forgot_res.json().get("resetToken")
    assert token and isinstance(token, str)

    # 3. Complete password reset
    reset_res = client.post(
        "/api/auth/reset-password",
        json={"token": token, "newPassword": new_password},
    )
    assert reset_res.status_code == 200

    # 4. Reusing the same token must fail (single-use)
    reuse_res = client.post(
        "/api/auth/reset-password",
        json={"token": token, "newPassword": "AnotherPassword789!"},
    )
    assert reuse_res.status_code == 400

    # 5. Old password fails, new password succeeds
    old_login = client.post(
        "/api/auth/login",
        json={"email": email, "password": old_password},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/auth/login",
        json={"email": email, "password": new_password},
    )
    assert new_login.status_code == 200
    assert new_login.json().get("accessToken")
