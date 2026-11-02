from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.ai_routes import router as ai_router

app = FastAPI(
    title="TrustPay AI API",
    description="Autonomous Milestone Escrow Marketplace Engine powered by PayPal Sandbox and Google Gemini AI.",
    version="1.0.0",
)

# Enable CORS for Next.js frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register AI module routes
app.include_router(ai_router)


@app.get("/")
def root():
    return {
        "message": "Welcome to TrustPay AI API",
        "docs": "/docs",
        "health": "/api/ai/health",
    }
