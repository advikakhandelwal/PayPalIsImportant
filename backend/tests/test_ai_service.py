import os
import sys

# Ensure backend root is in python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.services.ai_service import TrustPayAIService
from app.schemas.ai_schemas import (
    MilestoneDecomposeRequest,
    CodeInspectionRequest,
    InfluencerInspectionRequest,
    DisputeMediationRequest,
)


def test_provider_health():
    print("\n--- 0. Testing Multi-Model Provider Health & Discovery ---")
    service = TrustPayAIService()
    statuses = service.get_providers_status()
    print(f"Configured Providers: {len(statuses)}")
    for p in statuses:
        status_str = "ACTIVE" if p.is_available else "OFFLINE/STANDBY"
        privacy_str = "[On-Prem Privacy]" if p.privacy_compliant else "[Cloud]"
        print(f"  * {p.name} ({p.model}): {status_str} {privacy_str}")

    assert len(statuses) >= 3, "Expected at least Gemini, Ollama, and Grok providers"
    provider_keys = [p.key for p in statuses]
    assert "gemini" in provider_keys
    assert "ollama" in provider_keys
    assert "grok" in provider_keys
    print(">>> Multi-Model Provider Health Check Passed! [OK]")


def test_milestone_decomposition():
    print("\n--- 1. Testing Milestone Spec Decomposer with Multi-Model Metadata ---")
    service = TrustPayAIService()
    req = MilestoneDecomposeRequest(
        prompt="Build a full-stack Airbnb clone with Stripe/PayPal escrow payment and real-time chat",
        total_budget=1500.0,
        category="software",
        step_count=3,
        provider="auto",
    )
    result = service.decompose_milestones(req)
    print(f"Project Title: {result.project_title}")
    print(f"Total Budget: ${result.total_budget}")
    print(f"AI Provider Used: {result.ai_provider_used} ({result.ai_model_used})")
    print(f"Generated Steps: {len(result.steps)}")

    total_weight = sum(s.percentage_weight for s in result.steps)
    total_amount = sum(s.amount for s in result.steps)
    print(f"Total Percentage: {total_weight}% (Must be 100%)")
    print(f"Total Amount Sum: ${total_amount:.2f}")

    assert total_weight == 100, f"Expected 100%, got {total_weight}%"
    assert len(result.steps) == 3, f"Expected 3 steps, got {len(result.steps)}"
    assert result.ai_provider_used is not None
    assert result.ai_model_used is not None
    for s in result.steps:
        print(f"  Step {s.step_number} [{s.percentage_weight}% - ${s.amount}]: {s.title}")
        assert len(s.verification_criteria) > 0, f"Step {s.step_number} has no criteria"
    print(">>> Milestone Spec Decomposer Passed! [OK]")


def test_code_clean_inspection_with_privacy_mode():
    print("\n--- 2A. Testing Clean Code Inspector (Enterprise Privacy Mode) ---")
    service = TrustPayAIService()
    clean_code = '''
import os
from typing import Dict, Any

def process_transaction(user_id: str, amount: float) -> Dict[str, Any]:
    """Processes a valid transaction using secure environment variables."""
    client_id = os.getenv("PAYPAL_CLIENT_ID")
    if not client_id:
        raise ValueError("Missing PayPal Client ID in environment.")
    
    try:
        return {"status": "SUCCESS", "user_id": user_id, "amount": amount}
    except Exception as e:
        return {"status": "FAILED", "error": str(e)}
'''
    req = CodeInspectionRequest(
        code_content=clean_code,
        milestone_spec="Implement process_transaction with error handling and secure env vars.",
        file_name="transaction_service.py",
        privacy_mode=True,  # Demands on-prem / local privacy
    )
    result = service.inspect_code_deliverable(req)
    print(f"Score: {result.score}/100")
    print(f"Security Grade: {result.security_grade}")
    print(f"Approved: {result.is_approved}")
    print(f"AI Provider Used: {result.ai_provider_used} ({result.ai_model_used})")
    print(f"Privacy Mode Active: {result.privacy_mode_active}")
    print(f"Payout Recommendation: {result.payout_recommendation}")

    assert result.security_grade in ["Grade A", "Grade B"], f"Expected clean grade, got {result.security_grade}"
    assert len(result.security_findings) == 0, "Expected 0 security leaks"
    assert result.is_approved is True
    assert result.privacy_mode_active is True, "Privacy mode should be marked active"
    print(">>> Clean Code Inspection with Privacy Mode Passed! [OK]")


def test_code_vulnerable_inspection():
    print("\n--- 2B. Testing Leaked Secret & Vulnerability Detection ---")
    service = TrustPayAIService()
    vulnerable_code = '''
# HARDCODED SECRET LEAK TEST
PAYPAL_SECRET = "EILk291_sample_fake_secret_key_889911223344"
AWS_KEY = "AKIAIOSFODNN7EXAMPLE"

def run_dangerous_command(user_input):
    eval(user_input)
'''
    req = CodeInspectionRequest(
        code_content=vulnerable_code,
        milestone_spec="Secure backend handler",
        file_name="risky_module.py",
    )
    result = service.inspect_code_deliverable(req)
    print(f"Score: {result.score}/100")
    print(f"Security Grade: {result.security_grade}")
    print(f"Approved: {result.is_approved}")
    print(f"Findings count: {len(result.security_findings)}")
    for f in result.security_findings:
        print(f"  [{f.severity}] {f.category}: {f.description}")

    assert result.security_grade in ["Grade F", "Grade D"], "Should fail security grade on credential leak"
    assert result.is_approved is False, "Leaked credentials must NOT be approved"
    assert result.payout_recommendation == "REJECT_REMEDIATION_REQUIRED"
    assert len(result.security_findings) >= 2, "Expected detection of secrets"
    print(">>> Vulnerability Detection Passed! [OK]")


def test_influencer_verification():
    print("\n--- 3. Testing Multimodal Influencer Campaign Inspector ---")
    service = TrustPayAIService()
    req = InfluencerInspectionRequest(
        caption="Super excited to share my new morning routine with Acme Glow! #ad #sponsored Use my code ACME30 for 30% off!",
        milestone_spec="Deliverable must include #ad tag in caption and mention coupon ACME30.",
        required_keywords=["Acme Glow", "morning routine"],
        required_coupon="ACME30",
        brand_name="Acme Glow",
        audio_transcript="Hey everyone! I have been using Acme Glow daily and loving it. Use code ACME30 for 30% off!",
    )
    result = service.inspect_influencer_deliverable(req)
    print(f"Score: {result.score}/100")
    print(f"Approved: {result.is_approved}")
    print(f"FTC Compliant: {result.ftc_compliant}")
    print(f"Promo Code Detected: {result.promo_code_detected}")
    print(f"AI Provider Used: {result.ai_provider_used}")
    print(f"Payout Rec: {result.payout_recommendation}")

    assert result.ftc_compliant is True
    assert result.promo_code_detected is True
    assert result.is_approved is True
    assert "Gemini" in result.ai_provider_used or "Multimodal" in result.ai_provider_used
    print(">>> Influencer Campaign Inspection Passed! [OK]")


def test_dispute_mediator_with_grok_routing():
    print("\n--- 4. Testing AI Dispute Mediator with Grok Routing ---")
    service = TrustPayAIService()
    req = DisputeMediationRequest(
        milestone_spec="Step 2: Deliver responsive dashboard with 5 chart widgets and export to CSV.",
        deliverable_summary="Dashboard implemented with 4 working chart widgets. CSV export feature missing.",
        company_complaint="The developer did not implement CSV export and only 4 charts are working instead of 5.",
        freelancer_statement="I built all core charts and responsive layout. CSV export library had a breaking upstream bug, will add it in 24 hours.",
        step_amount=400.0,
        provider="grok",  # Target xAI Grok
    )
    result = service.mediate_dispute(req)
    print(f"Talent Split: {result.talent_payout_percentage}% (${result.talent_payout_amount})")
    print(f"Company Refund: {result.company_refund_percentage}% (${result.company_refund_amount})")
    print(f"AI Provider Used: {result.ai_provider_used} ({result.ai_model_used})")
    print(f"Rationale: {result.settlement_rationale}")
    print(f"Punch-list tasks: {len(result.punch_list)}")
    for item in result.punch_list:
        print(f"  Punch-list: {item.task} (Remediation window: {item.deadline_hours}h, ${item.impact_amount})")

    assert (result.talent_payout_percentage + result.company_refund_percentage) == 100
    assert result.is_split_settlement is True
    assert len(result.punch_list) > 0
    assert result.ai_provider_used is not None
    print(">>> AI Dispute Mediator Passed! [OK]")


if __name__ == "__main__":
    test_provider_health()
    test_milestone_decomposition()
    test_code_clean_inspection_with_privacy_mode()
    test_code_vulnerable_inspection()
    test_influencer_verification()
    test_dispute_mediator_with_grok_routing()
    print("\n==========================================")
    print("ALL 5 TRUSTPAY AI TEST SUITES PASSED! [OK]")
    print("==========================================")
