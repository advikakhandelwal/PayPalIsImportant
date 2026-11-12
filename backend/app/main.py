"""
TrustPay AI — FastAPI Application Entry Point
==============================================
Configures:
- Application lifespan (JWT validation, DB tables, demo seeding)
- CORS with an explicit origin whitelist (not wildcard)
- CSRF protection middleware for cookie-authenticated mutating requests
- Route registration
"""

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env for local/sandbox runs while keeping pytest deterministic
if "pytest" not in sys.modules:
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(dotenv_path=_env_path, override=False)

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.ai_routes import router as ai_router
from app.api.project_routes import router as project_router
from app.api.contract_routes import router as contract_router
from app.api.application_routes import (
    router as application_router,
    apps_router as applications_direct_router,
)
from app.api.user_routes import router as user_router
from app.api.auth_routes import router as auth_router
from app.api.paypal_routes import router as paypal_router
from app.api.dispute_notification_routes import disputes_router, notifications_router
from app.api.integrations_routes import router as integrations_router
from app.database import engine, Base
from app.core.security import validate_jwt_configuration, is_production_environment

logger = logging.getLogger("trustpay.main")

# Import all models so Base.metadata knows about every table before create_all() runs.
from app.models import User, Project, Application, Contract, Milestone, Submission, PayPalTransaction, ContractMessage, Dispute, Notification  # noqa: F401


# ─── CORS ─────────────────────────────────────────────────────────────────────
# Parse allowed origins from env var; default to localhost dev origins.
# IMPORTANT: allow_origins=["*"] is incompatible with allow_credentials=True in
# the CORS spec (browsers reject it). We always use an explicit whitelist.
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
ALLOWED_ORIGINS: list = [o.strip() for o in _raw_origins.split(",") if o.strip()]


# ─── CSRF exempt paths ────────────────────────────────────────────────────────
# Login, register, and logout don't require an existing session cookie.
_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_CSRF_EXEMPT_PATHS = {"/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/paypal/webhook"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan hook — runs once when the server starts.
    1. Validates JWT secret configuration (fails fast in production if missing/weak).
    2. Creates all database tables that don't already exist.
    3. Conditionally seeds demonstration data only in non-production environments.
    """
    # Phase 7: Explicitly validate JWT configuration at startup
    validate_jwt_configuration()

    Base.metadata.create_all(bind=engine)
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()}
            user_migrations = {
                "paypal_payout_email": "VARCHAR(255)",
                "city": "VARCHAR(120)",
                "state": "VARCHAR(120)",
                "country": "VARCHAR(120)",
                "address": "TEXT",
                "postal_code": "VARCHAR(40)",
                "skills": "JSON",
                "experience_years": "INTEGER",
                "education": "JSON",
            }
            for col_name, col_type in user_migrations.items():
                if col_name not in cols:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
            app_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(applications)")).fetchall()}
            if "freelancer_profile" not in app_cols:
                conn.execute(text("ALTER TABLE applications ADD COLUMN freelancer_profile JSON"))
    except Exception as mig_err:
        logger.warning(f"Non-blocking SQLite column check: {mig_err}")

    if os.getenv("SEED_DEMO_DATA", "false").strip().lower() == "true":
        if is_production_environment():
            logger.warning("SEED_DEMO_DATA=true ignored: demo seeding is strictly prohibited in production.")
        else:
            from app.utils.seed_data import seed_demo_data
            seed_demo_data()

    yield


app = FastAPI(
    title="TrustPay AI API",
    description="Autonomous Milestone Escrow Marketplace Engine powered by PayPal Sandbox and Google Gemini AI.",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS Middleware ───────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Requested-With", "X-CSRF-Token"],
)


# ─── CSRF Protection Middleware ────────────────────────────────────────────────
@app.middleware("http")
async def csrf_protection_middleware(request: Request, call_next):
    """
    CSRF guard for cookie-authenticated mutating requests.

    Rules:
    1. GET / HEAD / OPTIONS are always safe — skip.
    2. Paths in _CSRF_EXEMPT_PATHS (login / register / logout) are exempt.
    3. If the request carries a valid 'Authorization: Bearer ...' header, it is
       using Bearer token auth (not cookie auth). Bearer auth is not vulnerable
       to CSRF, so skip.
    4. If the request carries NO 'access_token' cookie, there is no cookie
       session to protect — skip.
    5. Otherwise (cookie-authenticated, state-changing, non-exempt), require
       X-Requested-With: XMLHttpRequest or X-CSRF-Token. Reject with 403 if absent.
    """
    if request.method in _CSRF_SAFE_METHODS:
        return await call_next(request)

    if request.url.path in _CSRF_EXEMPT_PATHS:
        return await call_next(request)

    # Bearer token auth is NOT subject to CSRF (cookie not the auth mechanism)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        return await call_next(request)

    # Only enforce CSRF for cookie-based sessions
    if "access_token" not in request.cookies:
        return await call_next(request)

    xrw = request.headers.get("X-Requested-With", "")
    xcsrf = request.headers.get("X-CSRF-Token", "")
    if not xrw and not xcsrf:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "detail": (
                    "CSRF check failed: 'X-Requested-With' or 'X-CSRF-Token' header "
                    "required for cookie-authenticated requests."
                )
            },
        )

    return await call_next(request)


# ─── Route Registration ────────────────────────────────────────────────────────
app.include_router(ai_router)
app.include_router(project_router)
app.include_router(contract_router)
app.include_router(application_router)
app.include_router(applications_direct_router)
app.include_router(user_router)
app.include_router(auth_router)
app.include_router(paypal_router)
app.include_router(integrations_router)
app.include_router(disputes_router)
app.include_router(notifications_router)


@app.get("/")
def root():
    return {
        "message": "Welcome to TrustPay AI API",
        "docs": "/docs",
        "health": "/api/ai/health",
        "endpoints": [
            "/api/projects",
            "/api/contracts/{id}",
            "/api/contracts/{cid}/milestones/{mid}/submit",
            "/api/projects/{projectId}/applications",
        ],
    }
