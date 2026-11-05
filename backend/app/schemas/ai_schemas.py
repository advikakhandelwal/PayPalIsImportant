from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# -------------------------------------------------------------
# 0. Provider Health & Multi-Model Schemas
# -------------------------------------------------------------
class ProviderStatus(BaseModel):
    name: str = Field(..., description="Provider name ('Google Gemini', 'Ollama (Local)', 'xAI Grok')")
    key: str = Field(..., description="'gemini', 'ollama', 'grok'")
    is_available: bool = Field(..., description="Whether this provider is currently reachable")
    model: str = Field(..., description="Configured model name")
    role: str = Field(..., description="Primary strength (e.g. 'Multimodal Vision/Audio', 'Local Privacy Code Audit', 'Dispute Arbitration')")
    privacy_compliant: bool = Field(..., description="True if runs on-premise without cloud data transfer")
    details: Optional[str] = None

class ProviderHealthResponse(BaseModel):
    active_providers: List[ProviderStatus]
    recommended_routing: Dict[str, str] = {
        "code_security_nda": "ollama (100% on-prem privacy)",
        "influencer_multimodal": "gemini (native video/audio parsing)",
        "dispute_arbitration": "grok (fast unbiased reasoning)",
        "default": "gemini (gemini-2.5-flash)",
    }


# -------------------------------------------------------------
# 1. Milestone Spec Decomposer Schemas
# -------------------------------------------------------------
class MilestoneStep(BaseModel):
    step_number: int = Field(..., description="Step sequence number (1, 2, 3...)")
    title: str = Field(..., description="Concise milestone title")
    description: str = Field(..., description="Specific scope and deliverables for this step")
    percentage_weight: int = Field(..., description="Percentage of total contract budget allocated to this step")
    amount: float = Field(..., description="Calculated payout amount for this step in USD")
    verification_criteria: List[str] = Field(..., description="Concrete, testable acceptance criteria for this step")
    deliverable_type: str = Field(
        ...,
        description="Type of deliverable expected (e.g. 'github_repo', 'code_file', 'video', 'image', 'document')"
    )

class MilestoneDecomposeRequest(BaseModel):
    prompt: str = Field(..., description="Raw project, campaign, or gig brief from company")
    total_budget: float = Field(..., description="Total budget in USD for the contract")
    category: Optional[str] = Field(
        default="software",
        description="Category: 'software', 'influencer', 'design', 'writing', 'general'"
    )
    step_count: Optional[int] = Field(
        default=3,
        description="Target number of sequential milestones (recommended 2-4)"
    )
    provider: Optional[str] = Field(
        default="auto",
        description="AI engine to route to: 'auto', 'gemini', 'ollama', 'grok'"
    )

class MilestoneDecomposeResponse(BaseModel):
    project_title: str
    project_summary: str
    total_budget: float
    category: str
    steps: List[MilestoneStep]
    anti_ghosting_policy: str = "Autonomous escrow release triggered after 72 hours of company inactivity on verified deliverables."
    ai_provider_used: str = Field(default="Google Gemini", description="AI provider that processed this request")
    ai_model_used: str = Field(default="gemini-2.5-flash", description="Model version used")


# -------------------------------------------------------------
# 2. Code Deliverable & Security Inspector Schemas
# -------------------------------------------------------------
class SecurityFinding(BaseModel):
    severity: str = Field(..., description="'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', or 'INFO'")
    category: str = Field(..., description="e.g. 'Hardcoded Secret', 'Injection Risk', 'Vulnerable Dependency'")
    description: str = Field(..., description="Details of the vulnerability detected")
    location: Optional[str] = Field(default=None, description="File name or line reference where detected")
    recommendation: str = Field(..., description="How to remediate this finding")

class CodeInspectionRequest(BaseModel):
    code_content: str = Field(..., description="Source code text or aggregated file contents to inspect")
    milestone_spec: str = Field(..., description="The agreed verification criteria for this milestone")
    repo_url: Optional[str] = Field(default=None, description="Optional GitHub repo URL")
    file_name: Optional[str] = Field(default="deliverable.py", description="Main file name / context")
    privacy_mode: Optional[bool] = Field(
        default=False,
        description="If True, routes exclusively to local Ollama on-prem to protect proprietary code under NDA."
    )
    provider: Optional[str] = Field(
        default="auto",
        description="AI engine: 'auto', 'gemini', 'ollama', 'grok'"
    )

class CodeInspectionResult(BaseModel):
    score: int = Field(..., ge=0, le=100, description="Overall compliance score from 0 to 100")
    security_grade: str = Field(..., description="'Grade A', 'Grade B', 'Grade C', 'Grade D', or 'Grade F'")
    is_approved: bool = Field(..., description="True if score >= 85 and security_grade in ['Grade A', 'Grade B']")
    passed_checks: List[str] = Field(default_factory=list, description="Criteria successfully met")
    failed_checks: List[str] = Field(default_factory=list, description="Criteria failed or missing")
    security_findings: List[SecurityFinding] = Field(default_factory=list, description="List of detected security risks or leaks")
    feedback: str = Field(..., description="Detailed constructive feedback for the developer")
    payout_recommendation: str = Field(
        ...,
        description="'FULL_RELEASE', 'PARTIAL_RELEASE', or 'REJECT_REMEDIATION_REQUIRED'"
    )
    ai_provider_used: str = Field(default="Google Gemini", description="AI provider that performed the audit")
    ai_model_used: str = Field(default="gemini-2.5-flash", description="Model version used")
    privacy_mode_active: bool = Field(default=False, description="True if executed on-premise without external cloud APIs")


# -------------------------------------------------------------
# 3. Influencer Campaign Inspector Schemas (Multimodal)
# -------------------------------------------------------------
class InfluencerInspectionRequest(BaseModel):
    caption: str = Field(..., description="Social media post caption or accompanying text")
    milestone_spec: str = Field(..., description="Campaign deliverable requirements")
    required_keywords: List[str] = Field(default_factory=list, description="Required brand hashtags, mentions, or phrases")
    required_coupon: Optional[str] = Field(default=None, description="Required promotional discount code (e.g. 'SAVE30')")
    brand_name: str = Field(default="Brand", description="Name of sponsoring brand/product")
    audio_transcript: Optional[str] = Field(default=None, description="Optional pre-extracted transcript of speech in video/audio")
    provider: Optional[str] = Field(
        default="auto",
        description="AI engine: 'auto' or 'gemini' (multimodal requires Gemini)"
    )

class InfluencerInspectionResult(BaseModel):
    score: int = Field(..., ge=0, le=100, description="Overall campaign fulfillment score from 0 to 100")
    is_approved: bool = Field(..., description="True if score >= 85 and FTC compliance passed")
    ftc_compliant: bool = Field(..., description="Whether #ad, #sponsored, or clear partnership disclosure is present")
    brand_logo_detected: bool = Field(..., description="Whether brand branding/logo was identified")
    promo_code_detected: bool = Field(..., description="Whether unique coupon code was verbalized or shown")
    talking_points_adherence: int = Field(..., ge=0, le=100, description="Percentage of required talking points verbalized")
    passed_checks: List[str] = Field(default_factory=list)
    failed_checks: List[str] = Field(default_factory=list)
    detected_transcript: Optional[str] = Field(default=None, description="Transcribed audio dialog summary")
    feedback: str = Field(..., description="Feedback for the influencer or brand reviewer")
    payout_recommendation: str = Field(
        ...,
        description="'FULL_RELEASE', 'PARTIAL_RELEASE', or 'REJECT_REMEDIATION_REQUIRED'"
    )
    ai_provider_used: str = Field(default="Google Gemini (Multimodal)", description="AI provider used")
    ai_model_used: str = Field(default="gemini-2.5-flash", description="Model version used")


# -------------------------------------------------------------
# 4. AI Dispute Mediator Schemas
# -------------------------------------------------------------
class DisputeMediationRequest(BaseModel):
    milestone_spec: str = Field(..., description="Original milestone acceptance criteria")
    deliverable_summary: str = Field(..., description="What the freelancer/influencer actually submitted")
    company_complaint: str = Field(..., description="Why the company contested the payout")
    freelancer_statement: str = Field(..., description="Freelancer's counter-argument and delivery proof")
    step_amount: float = Field(..., description="Dollar amount locked in escrow for this contested step")
    provider: Optional[str] = Field(
        default="auto",
        description="AI engine: 'auto', 'grok', 'gemini', 'ollama'"
    )

class RemediationAction(BaseModel):
    task: str
    deadline_hours: int = 48
    impact_amount: float

class DisputeMediationResult(BaseModel):
    talent_payout_percentage: int = Field(..., ge=0, le=100, description="Recommended percentage to release to talent")
    company_refund_percentage: int = Field(..., ge=0, le=100, description="Recommended percentage to refund to company")
    talent_payout_amount: float = Field(..., description="Dollar amount released to freelancer/influencer")
    company_refund_amount: float = Field(..., description="Dollar amount returned to company via PayPal Refund")
    settlement_rationale: str = Field(..., description="Impartial AI explanation balancing contract specs vs delivered value")
    punch_list: List[RemediationAction] = Field(
        default_factory=list,
        description="Action items for talent to complete within 48h to claim remaining disputed funds"
    )
    is_split_settlement: bool = Field(..., description="True if settlement is a partial split between both parties")
    ai_provider_used: str = Field(default="Google Gemini", description="AI provider that mediated the dispute")
    ai_model_used: str = Field(default="gemini-2.5-flash", description="Model version used")
