"""
TrustPay AI — PayPal Escrow API Pydantic Schemas
=================================================
Request/response models with camelCase serialization aliases matching frontend TypeScript types.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class BasePayPalSchema(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class PayPalConfigResponse(BasePayPalSchema):
    mode: str
    intent: str = "AUTHORIZE"
    configured: bool
    has_live_credentials: bool = Field(..., serialization_alias="hasLiveCredentials")
    client_id: Optional[str] = Field(None, serialization_alias="clientId")


class EscrowOrderCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    return_url: Optional[str] = Field(None, alias="returnUrl")
    cancel_url: Optional[str] = Field(None, alias="cancelUrl")
    idempotency_key: Optional[str] = Field(None, alias="idempotencyKey")


class EscrowOrderCreateResponse(BasePayPalSchema):
    contract_id: str = Field(..., serialization_alias="contractId")
    order_id: str = Field(..., serialization_alias="orderId")
    status: str
    intent: str = "AUTHORIZE"
    approval_url: Optional[str] = Field(None, serialization_alias="approvalUrl")
    amount: float
    currency: str
    idempotency_key: str = Field(..., serialization_alias="idempotencyKey")
    mode: str


class EscrowOrderAuthorizeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    order_id: Optional[str] = Field(None, alias="orderId")
    authorization_id: Optional[str] = Field(None, alias="authorizationId")
    idempotency_key: Optional[str] = Field(None, alias="idempotencyKey")
    simulate: bool = False


class EscrowOrderAuthorizeResponse(BasePayPalSchema):
    contract_id: str = Field(..., serialization_alias="contractId")
    order_id: Optional[str] = Field(None, serialization_alias="orderId")
    authorization_id: str = Field(..., serialization_alias="authorizationId")
    status: str
    escrow_status: str = Field(..., serialization_alias="escrowStatus")
    held_in_escrow_amount: float = Field(..., serialization_alias="heldInEscrowAmount")
    currency: str
    active_milestone_id: Optional[str] = Field(None, serialization_alias="activeMilestoneId")
    idempotency_key: str = Field(..., serialization_alias="idempotencyKey")
    mode: str


class MilestoneCaptureRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    note_to_payer: Optional[str] = Field(None, alias="noteToPayer")
    idempotency_key: Optional[str] = Field(None, alias="idempotencyKey")


class MilestoneCaptureResponse(BasePayPalSchema):
    contract_id: str = Field(..., serialization_alias="contractId")
    milestone_id: str = Field(..., serialization_alias="milestoneId")
    authorization_id: str = Field(..., serialization_alias="authorizationId")
    capture_id: str = Field(..., serialization_alias="captureId")
    status: str
    amount: float
    currency: str
    final_capture: bool = Field(False, serialization_alias="finalCapture")
    idempotency_key: str = Field(..., serialization_alias="idempotencyKey")
    mode: str


class MilestonePayoutRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    recipient_email: Optional[str] = Field(None, alias="recipientEmail")
    note: Optional[str] = None
    idempotency_key: Optional[str] = Field(None, alias="idempotencyKey")


class MilestonePayoutResponse(BasePayPalSchema):
    contract_id: str = Field(..., serialization_alias="contractId")
    milestone_id: str = Field(..., serialization_alias="milestoneId")
    payout_batch_id: Optional[str] = Field(None, serialization_alias="payoutBatchId")
    batch_status: str = Field(..., serialization_alias="batchStatus")
    recipient_email: str = Field(..., serialization_alias="recipientEmail")
    amount: float
    currency: str
    idempotency_key: str = Field(..., serialization_alias="idempotencyKey")
    mode: str


class EscrowRefundRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    capture_id: Optional[str] = Field(None, alias="captureId")
    amount: Optional[float] = Field(None, gt=0)
    reason: Optional[str] = None
    void_remaining_authorization: bool = Field(True, alias="voidRemainingAuthorization")
    idempotency_key: Optional[str] = Field(None, alias="idempotencyKey")


class EscrowRefundResponse(BasePayPalSchema):
    contract_id: str = Field(..., serialization_alias="contractId")
    action: str  # "VOID_AUTHORIZATION" | "REFUND_CAPTURE"
    refund_id: Optional[str] = Field(None, serialization_alias="refundId")
    authorization_id: Optional[str] = Field(None, serialization_alias="authorizationId")
    status: str
    escrow_status: str = Field(..., serialization_alias="escrowStatus")
    amount: Optional[float] = None
    currency: str
    mode: str


class PayPalTransactionRecordResponse(BasePayPalSchema):
    id: str
    contract_id: str = Field(..., serialization_alias="contractId")
    milestone_id: Optional[str] = Field(None, serialization_alias="milestoneId")
    operation: str
    status: str
    idempotency_key: str = Field(..., serialization_alias="idempotencyKey")
    paypal_order_id: Optional[str] = Field(None, serialization_alias="paypalOrderId")
    paypal_auth_id: Optional[str] = Field(None, serialization_alias="paypalAuthId")
    paypal_capture_id: Optional[str] = Field(None, serialization_alias="paypalCaptureId")
    paypal_refund_id: Optional[str] = Field(None, serialization_alias="paypalRefundId")
    paypal_payout_batch_id: Optional[str] = Field(None, serialization_alias="paypalPayoutBatchId")
    paypal_debug_id: Optional[str] = Field(None, serialization_alias="paypalDebugId")
    amount: float
    currency: str
    mode: str
    error_message: Optional[str] = Field(None, serialization_alias="errorMessage")
    created_at: str = Field(..., serialization_alias="createdAt")
