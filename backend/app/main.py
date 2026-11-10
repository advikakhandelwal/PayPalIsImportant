import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.ai_routes import router as ai_router
from app.api.project_routes import router as project_router
from app.api.contract_routes import router as contract_router
from app.api.application_routes import router as application_router
from app.database import engine, Base

# Import all models so Base.metadata knows about every table before create_all() runs.
from app.models import User, Project, Application, Contract, Milestone, Submission  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan hook — runs once when the server starts.
    Creates all database tables that don't already exist.
    Safe to call repeatedly: existing tables are never dropped or modified.
    Optionally seeds initial demonstration data if SEED_DEMO_DATA=true.
    """
    Base.metadata.create_all(bind=engine)

    if os.getenv("SEED_DEMO_DATA", "false").lower() == "true":
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
