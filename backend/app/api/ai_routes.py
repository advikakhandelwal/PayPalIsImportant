from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import Optional, List
import json

from app.models.user import User
from app.utils.auth import get_current_user
from app.schemas.ai_schemas import (
    MilestoneDecomposeRequest,
    MilestoneDecomposeResponse,
    CodeInspectionRequest,
    CodeInspectionResult,
    InfluencerInspectionRequest,
    InfluencerInspectionResult,
    DisputeMediationRequest,
    DisputeMediationResult,
    ProviderHealthResponse,
    TalentMatchRequest,
    TalentMatchResponse,
)
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/ai", tags=["TrustPay AI Verifier & Security"])

# SEC-07: Request payload and text input limits to prevent DoS and cost inflation
MAX_PROMPT_CHARS = 10_000
MAX_CODE_CHARS = 50_000
MAX_TEXT_FIELD_CHARS = 10_000


@router.get("/health")
def ai_health():
    """Returns AI verifier operational status and model connectivity."""
    statuses = ai_service.get_providers_status()
    available_providers = [p.name for p in statuses if p.is_available]
    return {
        "status": "healthy",
        "service": "TrustPay AI Multi-Model Router",
        "active_providers": available_providers or ["Deterministic Sandbox Engine"],
        "default_model": ai_service.model_name,
        "multi_model_enabled": True,
    }


@router.get("/providers", response_model=ProviderHealthResponse)
def list_providers():
    """
    Returns live connectivity status of all configured AI providers:
    - Google Gemini (Multimodal Cloud)
    - Ollama (Local Privacy / On-Prem)
    - xAI Grok (Unbiased Arbitration)
    """
    return ProviderHealthResponse(
        active_providers=ai_service.get_providers_status()
    )


@router.post("/decompose-spec", response_model=MilestoneDecomposeResponse)
def decompose_spec(
    request: MilestoneDecomposeRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Milestone Spec Decomposer:
    Converts raw company brief into structured sequential milestones
    with percentage weights (strictly summing to 100%) and concrete verification criteria.
    Supports provider routing: 'auto', 'gemini', 'ollama', 'grok'.
    Requires authenticated user (SEC-07).
    """
    if len(request.prompt) > MAX_PROMPT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Prompt exceeds maximum limit of {MAX_PROMPT_CHARS} characters",
        )
    try:
        return ai_service.decompose_milestones(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decomposition failed: {str(e)}")


@router.post("/verify/code", response_model=CodeInspectionResult)
def verify_code(
    request: CodeInspectionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Code Deliverable & Security Inspector:
    Inspects code submissions for compliance against specs and scans for
    leaked credentials (AWS, PayPal secrets, JWTs, DB URIs) and dangerous functions.
    Supports 'privacy_mode=true' to route 100% on-premises via local Ollama.
    Requires authenticated user (SEC-07).
    """
    if len(request.code_content) > MAX_CODE_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Code content exceeds maximum limit of {MAX_CODE_CHARS} characters",
        )
    if len(request.milestone_spec) > MAX_TEXT_FIELD_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Milestone spec exceeds maximum limit of {MAX_TEXT_FIELD_CHARS} characters",
        )
    try:
        return ai_service.inspect_code_deliverable(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Code inspection failed: {str(e)}")


@router.post("/verify/influencer", response_model=InfluencerInspectionResult)
def verify_influencer(
    request: InfluencerInspectionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Influencer Campaign Inspector (JSON payload):
    Analyzes post caption, audio transcript, and brand criteria for #ad disclosure,
    promo coupon code, and talking points adherence.
    Requires authenticated user (SEC-07).
    """
    if len(request.caption) > MAX_TEXT_FIELD_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Caption exceeds maximum limit of {MAX_TEXT_FIELD_CHARS} characters",
        )
    if len(request.milestone_spec) > MAX_TEXT_FIELD_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Milestone spec exceeds maximum limit of {MAX_TEXT_FIELD_CHARS} characters",
        )
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
    provider: Optional[str] = Form("gemini"),
    current_user: User = Depends(get_current_user),
):
    """
    Influencer Campaign Inspector (Multimodal Upload):
    Analyzes video/image file uploads with Gemini multimodal vision,
    verifying #ad disclosure, logo presence, and audio keywords.
    Requires authenticated user (SEC-07).
    """
    if len(caption) > MAX_TEXT_FIELD_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Caption exceeds maximum limit of {MAX_TEXT_FIELD_CHARS} characters",
        )
    if len(milestone_spec) > MAX_TEXT_FIELD_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Milestone spec exceeds maximum limit of {MAX_TEXT_FIELD_CHARS} characters",
        )
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
        provider=provider,
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
def mediate_dispute(
    request: DisputeMediationRequest,
    current_user: User = Depends(get_current_user),
):
    """
    AI Dispute Mediator:
    Generates objective, equitable split payout recommendations and 48-hour
    remediation punch-lists when deliverable is contested.
    Supports routing to xAI Grok or Google Gemini.
    Requires authenticated user (SEC-07).
    """
    if len(request.milestone_spec) > MAX_TEXT_FIELD_CHARS:
        raise HTTPException(status_code=400, detail="Milestone spec exceeds maximum limit")
    if len(request.company_complaint) > MAX_TEXT_FIELD_CHARS:
        raise HTTPException(status_code=400, detail="Company complaint exceeds maximum limit")
    if len(request.freelancer_statement) > MAX_TEXT_FIELD_CHARS:
        raise HTTPException(status_code=400, detail="Freelancer statement exceeds maximum limit")
    try:
        return ai_service.mediate_dispute(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mediation failed: {str(e)}")


@router.post("/match-talent", response_model=TalentMatchResponse)
def match_talent(
    request: TalentMatchRequest,
    current_user: User = Depends(get_current_user),
):
    """
    AI Talent Matchmaker:
    Analyzes company job or influencer campaign brief, identifying required technical
    skills or niches, and ranks registered talent based on verified track records
    (on-time rate, security grade, audience authenticity, badges).
    Requires authenticated user (SEC-07).
    """
    if len(request.project_prompt) > MAX_PROMPT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Project prompt exceeds maximum limit of {MAX_PROMPT_CHARS} characters",
        )
    try:
        return ai_service.match_talent(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Talent matching failed: {str(e)}")
