"""
TrustPay AI — Zapier Webhook Automation Service
================================================
Dispatches real-time JSON lifecycle events to a configured Zapier Catch Hook URL
(from ZAPIER_WEBHOOK_URL env var or runtime UI configuration) and keeps a recent
delivery log for live inspection.
"""

from __future__ import annotations

import logging
import os
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional

import requests

logger = logging.getLogger("trustpay.zapier")

_runtime_zapier_url: str = os.getenv("ZAPIER_WEBHOOK_URL", "").strip()
_delivery_log: Deque[Dict[str, Any]] = deque(maxlen=25)


def get_zapier_webhook_url() -> str:
    return (_runtime_zapier_url or os.getenv("ZAPIER_WEBHOOK_URL", "")).strip()


def set_zapier_webhook_url(url: str) -> str:
    global _runtime_zapier_url
    _runtime_zapier_url = (url or "").strip()
    return _runtime_zapier_url


def get_recent_zapier_deliveries() -> List[Dict[str, Any]]:
    return list(_delivery_log)


def dispatch_zapier_event(
    event: str,
    data: Dict[str, Any],
    *,
    webhook_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Send a structured lifecycle event to Zapier Catch Hook (non-blocking on business flow).
    """
    target_url = (webhook_url or get_zapier_webhook_url()).strip()
    envelope = {
        "event": event,
        "source": "TrustPay AI",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }

    if not target_url:
        entry = {
            "event": event,
            "status": "READY_NO_WEBHOOK",
            "httpStatus": None,
            "timestamp": envelope["timestamp"],
            "payload": envelope,
        }
        _delivery_log.appendleft(entry)
        return entry

    try:
        resp = requests.post(target_url, json=envelope, timeout=4.0)
        entry = {
            "event": event,
            "status": "DELIVERED" if 200 <= resp.status_code < 300 else "FAILED",
            "httpStatus": resp.status_code,
            "timestamp": envelope["timestamp"],
            "payload": envelope,
        }
    except Exception as exc:
        logger.warning(f"Zapier webhook delivery error for {event}: {exc}")
        entry = {
            "event": event,
            "status": "FAILED",
            "httpStatus": None,
            "error": str(exc),
            "timestamp": envelope["timestamp"],
            "payload": envelope,
        }

    _delivery_log.appendleft(entry)
    return entry
