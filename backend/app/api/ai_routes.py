from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional, List
import json

from app.schemas.ai_schemas import (
    MilestoneDecomposeRequest,
    MilestoneDecomposeResponse,
    CodeInspectionRequest,
    CodeInspectionResult,
    InfluencerInspectionRequest,
    InfluencerInspectionResult,
    DisputeMediationRequest,
    DisputeMediationResult,
)
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/ai", tags=["TrustPay AI Verifier & Security"])


@router.get("/health")
def ai_health():
    """Returns AI verifier operational status and mode."""
    return {
        "status": "healthy",
        "service": "TrustPay AI Verifier & Security Engine",
        "model": ai_service.model_name,
        "gemini_active": ai_service.client is not None,
        "mode": "live_gemini" if ai_service.client else "deterministic_sandbox",
    }


@router.post("/decompose-spec", response_model=MilestoneDecomposeResponse)
def decompose_spec(request: MilestoneDecomposeRequest):
    """
    Milestone Spec Decomposer:
    Converts raw company brief into structured sequential milestones
    with percentage weights (strictly summing to 100%) and concrete verification criteria.
    """
    try:
        return ai_service.decompose_milestones(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decomposition failed: {str(e)}")


@router.post("/verify/code", response_model=CodeInspectionResult)
def verify_code(request: CodeInspectionRequest):
    """
    Code Deliverable & Security Inspector:
    Inspects code submissions for compliance against specs and scans for
    leaked credentials (AWS, PayPal secrets, JWTs, DB URIs) and dangerous functions.
    """
    try:
        return ai_service.inspect_code_deliverable(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Code inspection failed: {str(e)}")


@router.post("/verify/influencer", response_model=InfluencerInspectionResult)
def verify_influencer(request: InfluencerInspectionRequest):
    """
    Influencer Campaign Inspector (JSON payload):
    Analyzes post caption, audio transcript, and brand criteria for #ad disclosure,
    promo coupon code, and talking points adherence.
    """
    try:
        return ai_service.inspect_influencer_deliverable(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Influencer inspection failed: {str(e)}")


@router.post("/verify/influencer-multimodal", response_model=InfluencerInspectionResult)
async def verify_influencer_multimodal(
    caption: str = Form(...),
    milestone_spec: str = Form(...),
    brand_name: str = Form("Brand"),
    required_coupon: Optional[str] = Form(None),
    required_keywords_json: Optional[str] = Form("[]"),
    audio_transcript: Optional[str] = Form(None),
    media_file: Optional[UploadFile] = File(None),
):
    """
    Influencer Campaign Inspector (Multimodal Upload):
    Analyzes video/image file uploads with Gemini multimodal vision,
    verifying #ad disclosure, logo presence, and audio keywords.
    """
    try:
        keywords = json.loads(required_keywords_json) if required_keywords_json else []
    except Exception:
        keywords = []

    media_bytes = None
    media_mime = None
    if media_file:
        media_bytes = await media_file.read()
        media_mime = media_file.content_type

    req = InfluencerInspectionRequest(
        caption=caption,
        milestone_spec=milestone_spec,
        brand_name=brand_name,
        required_coupon=required_coupon,
        required_keywords=keywords,
        audio_transcript=audio_transcript,
    )

    try:
        return ai_service.inspect_influencer_deliverable(
            request=req,
            media_bytes=media_bytes,
            media_mime_type=media_mime,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multimodal inspection failed: {str(e)}")


@router.post("/dispute/mediate", response_model=DisputeMediationResult)
def mediate_dispute(request: DisputeMediationRequest):
    """
    AI Dispute Mediator:
    Generates objective, equitable split payout recommendations and 48-hour
    remediation punch-lists when deliverable is contested.
    """
    try:
        return ai_service.mediate_dispute(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mediation failed: {str(e)}")
