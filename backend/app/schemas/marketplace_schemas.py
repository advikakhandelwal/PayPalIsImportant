"""
TrustPay AI — Marketplace Pydantic Schemas
===========================================
Defines request and response schemas matching frontend TypeScript contracts
(frontend/src/types/index.ts) with exact camelCase serialization aliases.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field

from app.models.project import ProjectStatus, ListingType
from app.models.contract import EscrowStatus
from app.models.milestone import MilestoneStatus
from app.models.submission import SubmissionType, VerificationStatus
from app.models.application import ApplicationStatus


# ---------------------------------------------------------------------------
# Base Configuration
# ---------------------------------------------------------------------------
class BaseMarketplaceSchema(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


# ---------------------------------------------------------------------------
# 1. Milestone Schemas (Separated: Blueprint vs Live Contract)
# ---------------------------------------------------------------------------
class MilestoneBlueprintCreate(BaseModel):
    """Client proposal when designing project milestone roadmap."""
    step_number: int = Field(..., alias="stepNumber")
    title: str
    description: str
    deliverable_requirements: List[str] = Field(default_factory=list, alias="deliverableRequirements")
    percentage: int
    payment_amount: Optional[float] = Field(None, alias="paymentAmount")
    deadline: Optional[str] = None
    currency: str = "USD"


class MilestoneBlueprintResponse(BaseMarketplaceSchema):
    """Proposed milestone roadmap returned inside Project listing."""
    id: str
    step_number: int = Field(..., serialization_alias="stepNumber")
    title: str
    description: str
    deliverable_requirements: List[str] = Field(default_factory=list, serialization_alias="deliverableRequirements")
    percentage: int
    payment_amount: float = Field(..., serialization_alias="paymentAmount")
    currency: str = "USD"
    deadline: Optional[str] = None
    status: str = "LOCKED"


class RevisionRequestCreate(BaseModel):
    """Client request body when requesting revisions on a deliverable."""
    feedback: str
    specific_corrections: Optional[str] = Field(None, alias="specificCorrections")
    additional_instructions: Optional[str] = Field(None, alias="additionalInstructions")


class RevisionRequestResponse(BaseMarketplaceSchema):
    """Structured record of a client revision request."""
    id: str
    feedback: str
    specific_corrections: Optional[str] = Field(None, serialization_alias="specificCorrections")
    additional_instructions: Optional[str] = Field(None, serialization_alias="additionalInstructions")
    requested_at: str = Field(..., serialization_alias="requestedAt")
    requested_by: str = Field("Client", serialization_alias="requestedBy")


class DeliverableSubmissionCreate(BaseModel):
    """Payload sent by Freelancer when submitting a deliverable."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    submission_type: SubmissionType = Field(default=SubmissionType.URL, alias="submissionType")
    submission_url: str = Field(..., alias="submissionUrl")
    file_name: Optional[str] = Field(None, alias="fileName")
    notes: Optional[str] = "Deliverable submitted for milestone review."


class DeliverableSubmissionResponse(BaseMarketplaceSchema):
    """Deliverable record attached to a Contract Milestone."""
    id: str
    milestone_id: str = Field(..., serialization_alias="milestoneId")
    submission_type: SubmissionType = Field(..., serialization_alias="submissionType")
    submission_url: str = Field(..., serialization_alias="submissionUrl")
    file_name: Optional[str] = Field(None, serialization_alias="fileName")
    notes: str
    verification_status: VerificationStatus = Field(..., serialization_alias="verificationStatus")
    ai_score: Optional[int] = Field(None, serialization_alias="aiScore")
    quality_grade: Optional[str] = Field(None, serialization_alias="qualityGrade")
    ai_verification_report: Optional[Dict[str, Any]] = Field(None, serialization_alias="aiVerificationReport")
    submitted_at: str = Field(..., serialization_alias="submittedAt")
    revision_number: int = Field(1, serialization_alias="revisionNumber")
    review_status: str = Field("IN_REVIEW", serialization_alias="reviewStatus")
    revision_request: Optional[RevisionRequestResponse] = Field(None, serialization_alias="revisionRequest")


class ContractMilestoneResponse(BaseMarketplaceSchema):
    """Live Escrow Milestone belonging to an active Contract."""
    id: str
    step_number: int = Field(..., serialization_alias="stepNumber")
    title: str
    description: str
    deliverable_requirements: List[str] = Field(default_factory=list, serialization_alias="deliverableRequirements")
    payment_amount: float = Field(..., serialization_alias="paymentAmount")
    percentage: int
    currency: str = "USD"
    deadline: Optional[str] = None
    status: MilestoneStatus
    submission: Optional[DeliverableSubmissionResponse] = None
    submission_history: List[DeliverableSubmissionResponse] = Field(default_factory=list, serialization_alias="submissionHistory")
    latest_revision_request: Optional[RevisionRequestResponse] = Field(None, serialization_alias="latestRevisionRequest")
    revision_count: int = Field(0, serialization_alias="revisionCount")
    max_revisions_reached: bool = Field(False, serialization_alias="maxRevisionsReached")


# ---------------------------------------------------------------------------
# 2. Project Schemas
# ---------------------------------------------------------------------------
class ProjectCreateRequest(BaseModel):
    """Client POST payload when publishing a project."""
    client_id: Optional[str] = Field(None, alias="clientId")
    client_name: Optional[str] = Field(None, alias="clientName")
    client_company: Optional[str] = Field(None, alias="clientCompany")
    title: str
    domain: str = "Full-Stack Development"
    description: str
    total_budget: float = Field(..., alias="totalBudget")
    currency: str = "USD"
    deadline: Optional[str] = None
    required_skills: List[str] = Field(default_factory=list, alias="requiredSkills")
    experience_level: str = Field(default="Intermediate", alias="experienceLevel")
    additional_requirements: Optional[str] = Field(None, alias="additionalRequirements")
    milestones: List[MilestoneBlueprintCreate] = Field(default_factory=list)


class ProjectResponse(BaseMarketplaceSchema):
    """Full Project listing for marketplace and client management."""
    id: str
    client_id: str = Field(..., serialization_alias="clientId")
    client_name: str = Field(..., serialization_alias="clientName")
    client_company: Optional[str] = Field(None, serialization_alias="clientCompany")
    title: str
    domain: str
    description: str
    total_budget: float = Field(..., serialization_alias="totalBudget")
    currency: str
    deadline: Optional[str] = None
    status: ProjectStatus
    created_at: str = Field(..., serialization_alias="createdAt")
    applications_count: int = Field(default=0, serialization_alias="applicationsCount")
    required_skills: List[str] = Field(default_factory=list, serialization_alias="requiredSkills")
    experience_level: str = Field(default="Intermediate", serialization_alias="experienceLevel")
    additional_requirements: Optional[str] = Field(None, serialization_alias="additionalRequirements")
    milestones: List[MilestoneBlueprintResponse] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 3. Contract Schemas
# ---------------------------------------------------------------------------
class ContractResponse(BaseMarketplaceSchema):
    """Active Escrow Contract with balances and live milestone states."""
    id: str
    project_id: str = Field(..., serialization_alias="projectId")
    project_title: str = Field(..., serialization_alias="projectTitle")
    project_description: Optional[str] = Field(None, serialization_alias="projectDescription")
    project_domain: Optional[str] = Field(None, serialization_alias="projectDomain")
    project_deadline: Optional[str] = Field(None, serialization_alias="projectDeadline")
    required_skills: List[str] = Field(default_factory=list, serialization_alias="requiredSkills")
    client_id: str = Field(..., serialization_alias="clientId")
    client_name: str = Field(..., serialization_alias="clientName")
    client_email: Optional[str] = Field(None, serialization_alias="clientEmail")
    freelancer_id: str = Field(..., serialization_alias="freelancerId")
    freelancer_name: str = Field(..., serialization_alias="freelancerName")
    freelancer_email: Optional[str] = Field(None, serialization_alias="freelancerEmail")
    freelancer_payout_email: Optional[str] = Field(None, serialization_alias="freelancerPayoutEmail")
    freelancer_domain: Optional[str] = Field(None, serialization_alias="freelancerDomain")
    freelancer_rating: Optional[float] = Field(None, serialization_alias="freelancerRating")
    freelancer_badges: List[str] = Field(default_factory=list, serialization_alias="freelancerBadges")
    total_budget: float = Field(..., serialization_alias="totalBudget")
    held_in_escrow_amount: float = Field(..., serialization_alias="heldInEscrowAmount")
    released_amount: float = Field(..., serialization_alias="releasedAmount")
    currency: str
    escrow_status: EscrowStatus = Field(..., serialization_alias="escrowStatus")
    paypal_auth_id: Optional[str] = Field(None, serialization_alias="paypalAuthId")
    paypal_capture_id: Optional[str] = Field(None, serialization_alias="paypalCaptureId")
    created_at: str = Field(..., serialization_alias="createdAt")
    milestones: List[ContractMilestoneResponse] = Field(default_factory=list)
    client_rating: Optional[float] = Field(None, serialization_alias="clientRating")
    client_review: Optional[str] = Field(None, serialization_alias="clientReview")
    reviewed_at: Optional[str] = Field(None, serialization_alias="reviewedAt")


class ContractMessageCreate(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    message: str = Field(..., min_length=1, max_length=2000)


class ContractMessageResponse(BaseMarketplaceSchema):
    id: str
    contract_id: str = Field(..., serialization_alias="contractId")
    sender_id: str = Field(..., serialization_alias="senderId")
    sender_name: str = Field(..., serialization_alias="senderName")
    sender_role: str = Field(..., serialization_alias="senderRole")
    message: str
    created_at: str = Field(..., serialization_alias="createdAt")


class OverrideReleaseRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    password: str = Field(..., min_length=1, description="Owner account password required to authorize override payment")
    reason: Optional[str] = Field(None, max_length=500)


# ---------------------------------------------------------------------------
# 4. Application & Trust Scorecard Schemas
# ---------------------------------------------------------------------------
class TrustScorecardData(BaseMarketplaceSchema):
    rating: Optional[float] = None
    on_time_delivery_rate: Optional[int] = Field(None, serialization_alias="onTimeDeliveryRate")
    compliance_score: int = Field(100, serialization_alias="complianceScore")
    completed_projects: int = Field(0, serialization_alias="completedProjects")
    total_earnings_or_spent: float = Field(0.0, serialization_alias="totalEarningsOrSpent")
    currency: str = "USD"
    badges: List[str] = Field(default_factory=list)
    is_unrated: bool = Field(False, serialization_alias="isUnrated")


class ContractReviewRequest(BaseModel):
    """Client review and rating payload for a completed contract."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    rating: float = Field(..., ge=1.0, le=5.0, description="Star rating from 1.0 to 5.0")
    review: Optional[str] = Field(None, max_length=1000, description="Optional written review feedback")


class ContractReviewResponse(BaseMarketplaceSchema):
    """Response confirming submitted review on a contract."""
    contract_id: str = Field(..., serialization_alias="contractId")
    client_id: str = Field(..., serialization_alias="clientId")
    freelancer_id: str = Field(..., serialization_alias="freelancerId")
    client_rating: float = Field(..., serialization_alias="clientRating")
    client_review: Optional[str] = Field(None, serialization_alias="clientReview")
    reviewed_at: str = Field(..., serialization_alias="reviewedAt")


class ApplicationCreateRequest(BaseModel):
    """Proposal payload submitted by Freelancer."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    cover_letter: str = Field(..., alias="coverLetter")
    bid_amount: float = Field(..., alias="bidAmount")
    currency: Optional[str] = "USD"
    freelancer_id: Optional[str] = Field(None, alias="freelancerId")
    freelancer_name: Optional[str] = Field(None, alias="freelancerName")
    freelancer_domain: Optional[str] = Field(None, alias="freelancerDomain")


class ApplicationResponse(BaseMarketplaceSchema):
    """Application record including applicant's trust scorecard."""
    id: str
    project_id: str = Field(..., serialization_alias="projectId")
    freelancer_id: str = Field(..., serialization_alias="freelancerId")
    freelancer_name: str = Field(..., serialization_alias="freelancerName")
    freelancer_domain: str = Field(..., serialization_alias="freelancerDomain")
    cover_letter: str = Field(..., serialization_alias="coverLetter")
    bid_amount: float = Field(..., serialization_alias="bidAmount")
    currency: str
    status: ApplicationStatus
    created_at: str = Field(..., serialization_alias="createdAt")
    trust_scorecard: TrustScorecardData = Field(..., serialization_alias="trustScorecard")
    ai_recommendation: Optional[Dict[str, Any]] = Field(None, serialization_alias="aiRecommendation")

