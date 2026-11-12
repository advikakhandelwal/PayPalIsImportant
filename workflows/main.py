"""
TrustPay AI — Render Workflows Orchestration Service
====================================================
Distributed background tasks for AI candidate dossier scoring,
milestone deliverable auditing, and post-payout Zapier webhook dispatch.
"""

import os
from typing import Any, Dict

import requests
from render import TaskContext, Workflows

app = Workflows()


@app.task
def evaluate_candidate_dossier(
    ctx: TaskContext,
    project_title: str,
    domain: str,
    resume_text: str,
) -> Dict[str, Any]:
    """Score a freelancer CV/proposal against a project scope using Gemini AI."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    snippet = (resume_text or "")[:3000]

    if api_key and snippet:
        try:
            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                f"gemini-2.5-flash:generateContent?key={api_key}"
            )
            prompt = (
                f"Evaluate candidate fit (0-100) for project '{project_title}' in domain '{domain}'. "
                "Return JSON with keys: fitScore (int), summary (str), strengths (list[str]), gaps (list[str]).\n\n"
                f"Resume:\n{snippet}"
            )
            resp = requests.post(
                url,
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=20,
            )
            if resp.ok:
                text = (
                    resp.json()
                    .get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                )
                return {"provider": "gemini-2.5-flash", "raw": text, "project": project_title}
        except Exception as exc:
            return {"provider": "fallback", "error": str(exc), "fitScore": 78}

    return {
        "provider": "deterministic",
        "project": project_title,
        "domain": domain,
        "fitScore": 82 if len(snippet) > 120 else 65,
        "summary": "Automated Render Workflow dossier pre-screen completed.",
    }


@app.task
def audit_milestone_deliverable(
    ctx: TaskContext,
    milestone_title: str,
    submission_url: str,
    notes: str,
) -> Dict[str, Any]:
    """Verify submitted milestone URL reachability and deliverable notes."""
    url_ok = False
    status_code = None
    if submission_url and submission_url.startswith(("http://", "https://")):
        try:
            r = requests.head(submission_url, allow_redirects=True, timeout=8)
            status_code = r.status_code
            url_ok = r.status_code < 400
        except Exception:
            url_ok = False

    return {
        "milestoneTitle": milestone_title,
        "submissionUrl": submission_url,
        "urlReachable": url_ok,
        "httpStatus": status_code,
        "notesLength": len((notes or "").strip()),
        "verified": bool(notes and len(notes.strip()) >= 10),
    }


@app.task
def dispatch_escrow_settlement_pipeline(
    ctx: TaskContext,
    contract_id: str,
    event: str,
    amount_usd: float,
    zapier_webhook_url: str = "",
) -> Dict[str, Any]:
    """Durable post-settlement pipeline that forwards PayPal escrow events to Zapier."""
    payload = {
        "source": "trustpay-ai-render-workflow",
        "contractId": contract_id,
        "event": event,
        "amountUsd": amount_usd,
    }
    target = (zapier_webhook_url or os.getenv("ZAPIER_WEBHOOK_URL", "")).strip()
    if target:
        try:
            res = requests.post(target, json=payload, timeout=10)
            return {"dispatched": res.ok, "statusCode": res.status_code, "payload": payload}
        except Exception as exc:
            return {"dispatched": False, "error": str(exc), "payload": payload}

    return {"dispatched": False, "reason": "No Zapier webhook configured", "payload": payload}


if __name__ == "__main__":
    app.start()
