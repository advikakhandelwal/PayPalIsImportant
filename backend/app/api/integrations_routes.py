"""
TrustPay AI — Sponsor Integrations Routes (Zapier Webhooks & Postman Collection)
===============================================================================
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from app.models.user import User
from app.services.zapier_service import (
    dispatch_zapier_event,
    get_recent_zapier_deliveries,
    get_zapier_webhook_url,
    set_zapier_webhook_url,
)
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/integrations", tags=["Sponsor Integrations"])


class ZapierConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    webhook_url: str = ""
    send_test: bool = False


@router.get("/zapier")
def get_zapier_status(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    url = get_zapier_webhook_url()
    return {
        "configured": bool(url),
        "webhookUrl": url,
        "deliveries": get_recent_zapier_deliveries(),
    }


@router.post("/zapier")
def update_zapier_webhook(
    payload: ZapierConfigUpdate,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    url = payload.webhook_url.strip()
    if url and not (url.startswith("https://") or url.startswith("http://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook URL must start with https:// or http://",
        )
    set_zapier_webhook_url(url)
    test_result: Optional[Dict[str, Any]] = None
    if payload.send_test:
        test_result = dispatch_zapier_event(
            "zapier.test",
            {
                "triggeredBy": current_user.email,
                "role": current_user.role.value,
                "message": "TrustPay AI PayPal Escrow Zapier hook connected!",
            },
        )
    return {
        "configured": bool(url),
        "webhookUrl": url,
        "testDelivery": test_result,
        "deliveries": get_recent_zapier_deliveries(),
    }


@router.get("/postman-collection")
def export_postman_collection():
    """Return a ready-to-import Postman Collection v2.1 for TrustPay AI & PayPal Escrow APIs."""
    collection = {
        "info": {
            "name": "TrustPay AI — PayPal Milestone Escrow API",
            "_postman_id": "trustpay-ai-paypal-escrow-v1",
            "description": "Complete API collection for Auth, Projects, Applications, PayPal Orders v2 Escrow, Milestone Payouts, Unified Messaging, and Zapier Automations.",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "variable": [
            {"key": "baseUrl", "value": "http://127.0.0.1:8000/api"},
            {"key": "token", "value": ""},
            {"key": "contractId", "value": "1"},
            {"key": "milestoneId", "value": "1"},
        ],
        "auth": {
            "type": "bearer",
            "bearer": [{"key": "token", "value": "{{token}}", "type": "string"}],
        },
        "item": [
            {
                "name": "Auth — Login",
                "request": {
                    "method": "POST",
                    "header": [{"key": "Content-Type", "value": "application/json"}],
                    "url": "{{baseUrl}}/auth/login",
                    "body": {
                        "mode": "raw",
                        "raw": '{"email":"contracts@acmeventures.com","password":"DemoPass123!"}',
                    },
                },
            },
            {
                "name": "PayPal — Get Config",
                "request": {"method": "GET", "url": "{{baseUrl}}/paypal/config"},
            },
            {
                "name": "PayPal — Create Escrow Order",
                "request": {
                    "method": "POST",
                    "header": [{"key": "Content-Type", "value": "application/json"}],
                    "url": "{{baseUrl}}/paypal/contracts/{{contractId}}/create-order",
                    "body": {"mode": "raw", "raw": "{}"},
                },
            },
            {
                "name": "PayPal — Authorize & Lock Escrow",
                "request": {
                    "method": "POST",
                    "header": [{"key": "Content-Type", "value": "application/json"}],
                    "url": "{{baseUrl}}/paypal/contracts/{{contractId}}/authorize",
                    "body": {"mode": "raw", "raw": '{"orderId":"PAYPAL_ORDER_ID"}'},
                },
            },
            {
                "name": "PayPal — Capture / Payout Milestone",
                "request": {
                    "method": "POST",
                    "header": [{"key": "Content-Type", "value": "application/json"}],
                    "url": "{{baseUrl}}/paypal/contracts/{{contractId}}/milestones/{{milestoneId}}/payout",
                    "body": {"mode": "raw", "raw": "{}"},
                },
            },
            {
                "name": "PayPal — Global Audit Ledger",
                "request": {"method": "GET", "url": "{{baseUrl}}/paypal/ledger"},
            },
            {
                "name": "Messages — Unified Inbox",
                "request": {"method": "GET", "url": "{{baseUrl}}/contracts/messages/inbox"},
            },
            {
                "name": "Zapier — Webhook Status & Events",
                "request": {"method": "GET", "url": "{{baseUrl}}/integrations/zapier"},
            },
        ],
    }
    return JSONResponse(
        content=collection,
        headers={
            "Content-Disposition": 'attachment; filename="TrustPay_AI_PayPal_Escrow.postman_collection.json"'
        },
    )
