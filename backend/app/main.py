import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.ai_routes import router as ai_router
from app.api.project_routes import router as project_router
from app.api.contract_routes import router as contract_router
from app.api.application_routes import router as application_router, apps_router as applications_direct_router
from app.api.user_routes import router as user_router
from app.api.auth_routes import router as auth_router
from app.database import engine, Base
from app.core.security import validate_jwt_configuration, is_production_environment

logger = logging.getLogger("trustpay.main")

# Import all models so Base.metadata knows about every table before create_all() runs.
from app.models import User, Project, Application, Contract, Milestone, Submission  # noqa: F401


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

# Enable CORS for Next.js frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Marketplace & AI module routes
app.include_router(ai_router)
app.include_router(project_router)
app.include_router(contract_router)
app.include_router(application_router)
app.include_router(applications_direct_router)
app.include_router(user_router)
app.include_router(auth_router)


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
