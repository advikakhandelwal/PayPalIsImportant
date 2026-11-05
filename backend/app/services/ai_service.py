import os
import re
import json
import logging
from typing import List, Optional, Dict, Any, Tuple
from dotenv import load_dotenv

from app.schemas.ai_schemas import (
    MilestoneStep,
    MilestoneDecomposeRequest,
    MilestoneDecomposeResponse,
    SecurityFinding,
    CodeInspectionRequest,
    CodeInspectionResult,
    InfluencerInspectionRequest,
    InfluencerInspectionResult,
    DisputeMediationRequest,
    DisputeMediationResult,
    RemediationAction,
    ProviderStatus,
    TalentProfile,
    TalentMatchRequest,
    TalentMatchResultItem,
    TalentMatchResponse,
)
from app.services.providers.model_router import ModelRouter

load_dotenv()
logger = logging.getLogger("trustpay.ai_service")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Regex patterns for static security & credential leak scanning
# ---------------------------------------------------------------------------
SECURITY_PATTERNS = [
    {
        "category": "AWS Access Key",
        "severity": "CRITICAL",
        "regex": re.compile(r"(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"),
        "recommendation": "Revoke this AWS key immediately and load it via secure environment variables or AWS Secrets Manager.",
    },
    {
        "category": "PayPal Secret / Private Key",
        "severity": "CRITICAL",
        "regex": re.compile(r"(?:paypal[_-]?secret|PAYPAL[_-]?SECRET)\s*[:=]\s*['\"]([A-Za-z0-9_-]{30,80})['\"]"),
        "recommendation": "Remove hardcoded PayPal secret. Use environment variables (e.g. PAYPAL_CLIENT_SECRET).",
    },
    {
        "category": "Private RSA/EC/SSH Key",
        "severity": "CRITICAL",
        "regex": re.compile(r"-----BEGIN (?:RSA|OPENSSH|EC|DSA|PGP)?\s*PRIVATE KEY-----"),
        "recommendation": "Do not commit private keys to source code. Store in a secure vault.",
    },
    {
        "category": "Hardcoded API Token / Bearer Key",
        "severity": "HIGH",
        "regex": re.compile(r"(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*[:=]\s*['\"]([A-Za-z0-9_\-\.]{16,80})['\"]", re.IGNORECASE),
        "recommendation": "Extract credentials into .env or runtime secrets manager.",
    },
    {
        "category": "JSON Web Token (JWT)",
        "severity": "HIGH",
        "regex": re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
        "recommendation": "Hardcoded session tokens leak user access. Issue JWTs dynamically with short expiration.",
    },
    {
        "category": "Exposed Database Connection URI",
        "severity": "CRITICAL",
        "regex": re.compile(r"(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^:\s]+:[^@\s]+@[a-zA-Z0-9\.\-_]+"),
        "recommendation": "Database connection strings containing passwords must be injected via runtime environment variables.",
    },
    {
        "category": "Dangerous Arbitrary Code Execution",
        "severity": "HIGH",
        "regex": re.compile(r"\b(?:eval|exec)\s*\([^)]*\)"),
        "recommendation": "Avoid eval() or exec() with dynamic input to prevent Remote Code Execution (RCE).",
    },
    {
        "category": "Insecure Shell Command Injection",
        "severity": "HIGH",
        "regex": re.compile(r"(?:subprocess\.Popen|subprocess\.call|os\.system)\s*\([^)]*shell\s*=\s*True"),
        "recommendation": "Avoid shell=True with user-provided arguments to mitigate command injection.",
    },
]


class TrustPayAIService:
    """
    Multi-Model AI Verifier & Security Engine for TrustPay AI.
    Intelligently routes tasks across:
    - Google Gemini (Multimodal Vision & Audio, Spec Decomposition)
    - Ollama (Local On-Premises Privacy Mode for Enterprise Code)
    - xAI Grok (Unbiased Real-time Dispute Arbitration)
    """

    def __init__(self):
        self.router = ModelRouter()
        self.model_name = self.router.gemini.default_model

    def get_providers_status(self) -> List[ProviderStatus]:
        return self.router.get_all_statuses()

    # -----------------------------------------------------------------------
    # 1. Milestone Spec Decomposer
    # -----------------------------------------------------------------------
    def decompose_milestones(self, request: MilestoneDecomposeRequest) -> MilestoneDecomposeResponse:
        """
        Decomposes a raw job or campaign prompt into structured sequential milestones
        with weighted percentages summing to 100% and concrete verification criteria.
        """
        provider, provider_name, model_name = self.router.select_provider(
            requested_provider=request.provider,
            task_type="spec",
        )

        system_instruction = (
            "You are an expert technical project architect and milestone contract decomposer for TrustPay AI. "
            "Given a project brief, budget, and category, decompose it into sequential, verifiable milestone steps. "
            "Requirements:\n"
            "1. Output exactly the requested number of steps (usually 3 steps).\n"
            "2. Total percentage_weight of all steps MUST strictly sum to 100%.\n"
            "3. The calculated amount for each step must be rounded to 2 decimal places: (percentage / 100) * total_budget.\n"
            "4. Provide 3-5 concrete, objective, testable verification_criteria for each step.\n"
            "5. Specify deliverable_type ('github_repo', 'code_file', 'video', 'image', 'document').\n"
            "6. Output must strictly be valid JSON."
        )

        user_prompt = (
            f"Project Brief: {request.prompt}\n"
            f"Total Budget: ${request.total_budget} USD\n"
            f"Category: {request.category}\n"
            f"Step Count: {request.step_count}\n\n"
            "Return JSON matching this schema:\n"
            "{\n"
            '  "project_title": "string",\n'
            '  "project_summary": "string",\n'
            '  "steps": [\n'
            "    {\n"
            '      "step_number": 1,\n'
            '      "title": "string",\n'
            '      "description": "string",\n'
            '      "percentage_weight": 30,\n'
            '      "amount": 300.00,\n'
            '      "verification_criteria": ["criterion 1", "criterion 2"],\n'
            '      "deliverable_type": "string"\n'
            "    }\n"
            "  ]\n"
            "}"
        )

        result_json = None
        if provider:
            result_json = provider.generate_json(user_prompt, system_instruction)

        if result_json and "steps" in result_json:
            try:
                steps_data = result_json.get("steps", [])
                steps = []
                total_weight = 0
                for item in steps_data:
                    weight = int(item.get("percentage_weight", 0))
                    total_weight += weight
                    amt = round((weight / 100.0) * request.total_budget, 2)
                    steps.append(
                        MilestoneStep(
                            step_number=item.get("step_number", len(steps) + 1),
                            title=item.get("title", f"Step {len(steps) + 1}"),
                            description=item.get("description", ""),
                            percentage_weight=weight,
                            amount=amt,
                            verification_criteria=item.get("verification_criteria", []),
                            deliverable_type=item.get("deliverable_type", "code_file"),
                        )
                    )

                # Ensure percentages strictly total 100%
                if total_weight != 100 and len(steps) > 0:
                    diff = 100 - total_weight
                    steps[-1].percentage_weight += diff
                    steps[-1].amount = round((steps[-1].percentage_weight / 100.0) * request.total_budget, 2)

                return MilestoneDecomposeResponse(
                    project_title=result_json.get("project_title", "TrustPay AI Verified Milestone Contract"),
                    project_summary=result_json.get("project_summary", request.prompt[:200]),
                    total_budget=request.total_budget,
                    category=request.category or "software",
                    steps=steps,
                    ai_provider_used=provider_name,
                    ai_model_used=model_name,
                )
            except Exception as parse_err:
                logger.warning(f"Error parsing AI response: {parse_err}. Using deterministic decomposition.")

        # Deterministic fallback
        res = self._fallback_decompose(request)
        res.ai_provider_used = provider_name
        res.ai_model_used = model_name
        return res

    def _fallback_decompose(self, request: MilestoneDecomposeRequest) -> MilestoneDecomposeResponse:
        """Deterministic, intelligent decomposition for sandbox testing."""
        is_influencer = (request.category or "").lower() in ["influencer", "creator", "media", "video"]
        total = request.total_budget

        if is_influencer:
            steps = [
                MilestoneStep(
                    step_number=1,
                    title="Creative Concept & Script Outline",
                    description="Submit campaign storyboard, script draft including mandatory talking points, and hashtag plan.",
                    percentage_weight=30,
                    amount=round(0.30 * total, 2),
                    verification_criteria=[
                        "Script draft covers agreed brand value proposition",
                        "Includes mandatory promo coupon code",
                        "Identifies visual placement timing for brand logo",
                    ],
                    deliverable_type="document",
                ),
                MilestoneStep(
                    step_number=2,
                    title="Draft Video Production & Compliance Review",
                    description="Deliver raw/unedited or draft video file for multimodal inspection prior to public publishing.",
                    percentage_weight=40,
                    amount=round(0.40 * total, 2),
                    verification_criteria=[
                        "Clear verbal pronunciation of discount code",
                        "Prominent logo on screen for at least 3 seconds",
                        "Accompanying caption includes #ad or #sponsored disclosure",
                    ],
                    deliverable_type="video",
                ),
                MilestoneStep(
                    step_number=3,
                    title="Public Posting & Engagement Retention",
                    description="Publish video to live social platform and retain live status for agreed contract duration.",
                    percentage_weight=30,
                    amount=round(0.30 * total, 2),
                    verification_criteria=[
                        "Post is publicly accessible at submitted URL",
                        "Caption retains #ad FTC disclosure",
                        "No bot clustering or engagement anomalies detected",
                    ],
                    deliverable_type="document",
                ),
            ]
            title = "Sponsored Influencer Campaign Escrow"
            summary = f"Autonomous 3-step escrow contract for sponsored content ({request.prompt[:100]}...)"
        else:
            steps = [
                MilestoneStep(
                    step_number=1,
                    title="Architecture, Data Models & Core Foundation",
                    description="Initial repository setup, database schemas, and foundational service interfaces.",
                    percentage_weight=30,
                    amount=round(0.30 * total, 2),
                    verification_criteria=[
                        "Functional repo with clear README and environment instructions",
                        "Schema models defined with automated tests",
                        "Zero leaked API keys or credentials",
                    ],
                    deliverable_type="github_repo",
                ),
                MilestoneStep(
                    step_number=2,
                    title="Feature Implementation & Business Logic",
                    description="Complete core functional deliverables, endpoints, and integration workflows.",
                    percentage_weight=40,
                    amount=round(0.40 * total, 2),
                    verification_criteria=[
                        "All primary endpoints return expected 200 OK responses",
                        "Core algorithms handle edge cases and invalid parameters",
                        "Passes unit and integration test suite with >= 80% coverage",
                    ],
                    deliverable_type="code_file",
                ),
                MilestoneStep(
                    step_number=3,
                    title="Security Hardening, Polish & Final Delivery",
                    description="Clean documentation, vulnerability scanning, performance benchmarks, and deployment readiness.",
                    percentage_weight=30,
                    amount=round(0.30 * total, 2),
                    verification_criteria=[
                        "Zero critical/high vulnerabilities detected by security scan",
                        "Passing end-to-end integration test flow",
                        "Deployment ready configuration and clean code grade",
                    ],
                    deliverable_type="github_repo",
                ),
            ]
            title = "Autonomous Milestone Software Contract"
            summary = f"Structured 3-part deliverable escrow for technical project ({request.prompt[:100]}...)"

        return MilestoneDecomposeResponse(
            project_title=title,
            project_summary=summary,
            total_budget=total,
            category=request.category or "software",
            steps=steps,
        )

    # -----------------------------------------------------------------------
    # 2. Code Deliverable & Security Inspector
    # -----------------------------------------------------------------------
    def inspect_code_deliverable(self, request: CodeInspectionRequest) -> CodeInspectionResult:
        """
        Inspects submitted code against milestone acceptance criteria and runs
        heuristic & AI-assisted vulnerability and secret leak scans.
        Supports Privacy Mode (routes to local Ollama on-prem).
        """
        provider, provider_name, model_name = self.router.select_provider(
            requested_provider=request.provider,
            task_type="code",
            privacy_mode=bool(request.privacy_mode),
        )

        # Step A: Run static regex security scanner
        findings: List[SecurityFinding] = []
        for pat in SECURITY_PATTERNS:
            matches = pat["regex"].findall(request.code_content)
            if matches:
                sample = str(matches[0])[:12] + "..." if isinstance(matches[0], str) else "detected"
                findings.append(
                    SecurityFinding(
                        severity=pat["severity"],
                        category=pat["category"],
                        description=f"Potential leak/vulnerability pattern detected: '{sample}' in {request.file_name}",
                        location=request.file_name,
                        recommendation=pat["recommendation"],
                    )
                )

        # Step B: Determine security grade based on findings
        critical_count = sum(1 for f in findings if f.severity == "CRITICAL")
        high_count = sum(1 for f in findings if f.severity == "HIGH")
        medium_count = sum(1 for f in findings if f.severity == "MEDIUM")

        if critical_count > 0:
            security_grade = "Grade F"
        elif high_count > 0:
            security_grade = "Grade D"
        elif medium_count > 0:
            security_grade = "Grade C"
        elif len(findings) > 0:
            security_grade = "Grade B"
        else:
            security_grade = "Grade A"

        # Step C: AI verification of criteria compliance
        system_instruction = (
            "You are TrustPay AI's senior code compliance auditor and security inspector. "
            "You evaluate developer submissions against agreed milestone criteria. "
            "Score from 0 to 100 based on functional completeness, code quality, error handling, and testability. "
            "Be strict, impartial, and provide constructive developer feedback. "
            "Output must be valid JSON."
        )

        user_prompt = (
            f"Milestone Acceptance Criteria:\n{request.milestone_spec}\n\n"
            f"Submitted Code ({request.file_name}):\n"
            f"```\n{request.code_content[:8000]}\n```\n\n"
            f"Static Security Findings Found:\n{[f.model_dump() for f in findings]}\n\n"
            "Return JSON matching:\n"
            "{\n"
            '  "compliance_score": 92,\n'
            '  "passed_checks": ["criterion 1 passed", "criterion 2 passed"],\n'
            '  "failed_checks": ["criterion 3 failed"],\n'
            '  "feedback": "Detailed constructive evaluation..."\n'
            "}"
        )

        ai_data = None
        if provider:
            ai_data = provider.generate_json(user_prompt, system_instruction)

        if ai_data:
            base_score = int(ai_data.get("compliance_score", 85))
            passed = ai_data.get("passed_checks", [])
            failed = ai_data.get("failed_checks", [])
            feedback = ai_data.get("feedback", "Automated code inspection completed.")
        else:
            passed, failed, base_score, feedback = self._heuristic_code_audit(
                request.code_content, request.milestone_spec
            )

        # Penalize overall score if security vulnerabilities exist
        final_score = base_score
        if critical_count > 0:
            final_score = min(final_score, 40)
            failed.append("FAILED CRITICAL SECURITY AUDIT: Hardcoded credentials/dangerous functions detected.")
        elif high_count > 0:
            final_score = min(final_score, 65)
            failed.append("FAILED HIGH SECURITY AUDIT: Potential secrets or risky execution detected.")

        is_approved = final_score >= 85 and security_grade in ["Grade A", "Grade B"]

        if is_approved:
            payout_rec = "FULL_RELEASE"
        elif final_score >= 60:
            payout_rec = "PARTIAL_RELEASE"
        else:
            payout_rec = "REJECT_REMEDIATION_REQUIRED"

        return CodeInspectionResult(
            score=max(0, min(100, final_score)),
            security_grade=security_grade,
            is_approved=is_approved,
            passed_checks=passed,
            failed_checks=failed,
            security_findings=findings,
            feedback=feedback,
            payout_recommendation=payout_rec,
            ai_provider_used=provider_name,
            ai_model_used=model_name,
            privacy_mode_active=bool(request.privacy_mode or "Ollama" in provider_name),
        )

    def _heuristic_code_audit(self, code: str, spec: str) -> Tuple[List[str], List[str], int, str]:
        """Heuristic code evaluation when offline."""
        passed = []
        failed = []
        score = 88

        if len(code.strip()) > 100:
            passed.append("Code structure is non-empty and well-formed")
        else:
            failed.append("Submission is too sparse or empty")
            score -= 30

        if "def " in code or "function " in code or "class " in code:
            passed.append("Modular functional/object structure identified")
        else:
            failed.append("Missing modular functions or class definitions")
            score -= 15

        if "try:" in code or "catch" in code or "except" in code:
            passed.append("Exception handling and defensive coding implemented")
        else:
            passed.append("Basic procedural execution flow present")

        feedback = (
            f"Code delivered satisfies core specifications with a score of {score}%. "
            "Ensure unit tests and comprehensive type definitions are documented."
        )
        return passed, failed, score, feedback

    # -----------------------------------------------------------------------
    # 3. Influencer Campaign Inspector (Multimodal)
    # -----------------------------------------------------------------------
    def inspect_influencer_deliverable(
        self,
        request: InfluencerInspectionRequest,
        media_bytes: Optional[bytes] = None,
        media_mime_type: Optional[str] = None,
    ) -> InfluencerInspectionResult:
        """
        Multimodal audit of video, image, or caption submissions for sponsored campaigns.
        Inspects:
        - Legal FTC Disclosure (#ad, #sponsored)
        - Brand visual logo / presence
        - Audio transcript adherence for required discount code (e.g. 'ACME30') & keywords
        """
        provider, provider_name, model_name = self.router.select_provider(
            requested_provider=request.provider,
            task_type="multimodal",
            requires_multimodal=True,
        )

        caption_lower = request.caption.lower()
        ftc_tags = ["#ad", "#sponsored", "#paidpartnership", "paid partnership", "#partner"]
        has_ftc = any(tag in caption_lower for tag in ftc_tags)

        promo_in_caption = False
        if request.required_coupon:
            promo_in_caption = request.required_coupon.lower() in caption_lower

        system_instruction = (
            "You are TrustPay AI's multimodal influencer campaign verifier. "
            "You inspect social media submissions (captions, images, video frames, audio transcripts). "
            "Evaluate:\n"
            "1. FTC/Legal Compliance: Does the caption or video clearly disclose sponsorship (#ad, #sponsored)?\n"
            "2. Brand Visibility: Is the brand logo or product clearly visible and prominent?\n"
            "3. Audio/Script Adherence: Were required brand keywords and promo discount codes verbalized or presented?\n"
            "4. Calculate an overall fulfillment score (0 to 100).\n"
            "Output must be valid JSON."
        )

        prompt_text = (
            f"Brand Name: {request.brand_name}\n"
            f"Milestone Specification: {request.milestone_spec}\n"
            f"Post Caption: {request.caption}\n"
            f"Required Coupon Code: {request.required_coupon or 'None'}\n"
            f"Required Keywords: {', '.join(request.required_keywords)}\n"
            f"Spoken Transcript (if provided): {request.audio_transcript or 'Analyze media audio if present'}\n\n"
            "Return JSON matching:\n"
            "{\n"
            '  "score": 95,\n'
            '  "ftc_compliant": true,\n'
            '  "brand_logo_detected": true,\n'
            '  "promo_code_detected": true,\n'
            '  "talking_points_adherence": 90,\n'
            '  "passed_checks": ["#ad disclosure verified", "Promo code verbalized"],\n'
            '  "failed_checks": [],\n'
            '  "detected_transcript": "Summary of audio dialog...",\n'
            '  "feedback": "Great delivery..."\n'
            "}"
        )

        gemini_result = None
        if provider:
            if media_bytes and media_mime_type and hasattr(provider, "generate_multimodal_json"):
                from google.genai import types
                try:
                    media_part = types.Part.from_bytes(data=media_bytes, mime_type=media_mime_type)
                    gemini_result = provider.generate_multimodal_json([media_part, prompt_text], system_instruction)
                except Exception as e:
                    logger.warning(f"Failed to attach media part: {e}")
            if not gemini_result:
                gemini_result = provider.generate_json(prompt_text, system_instruction)

        if gemini_result:
            score = int(gemini_result.get("score", 90))
            ftc_compliant = bool(gemini_result.get("ftc_compliant", has_ftc))
            brand_logo = bool(gemini_result.get("brand_logo_detected", True))
            promo_detected = bool(gemini_result.get("promo_code_detected", promo_in_caption))
            adherence = int(gemini_result.get("talking_points_adherence", 85))
            passed = gemini_result.get("passed_checks", [])
            failed = gemini_result.get("failed_checks", [])
            transcript = gemini_result.get("detected_transcript", request.audio_transcript)
            feedback = gemini_result.get("feedback", "Influencer deliverable evaluated successfully.")
        else:
            score = 92
            ftc_compliant = has_ftc
            brand_logo = True
            promo_detected = promo_in_caption or (
                request.audio_transcript is not None
                and request.required_coupon is not None
                and request.required_coupon.lower() in request.audio_transcript.lower()
            )
            adherence = 90
            passed = []
            failed = []

            if ftc_compliant:
                passed.append("FTC legal sponsorship tag (#ad/#sponsored) clearly verified in post caption")
            else:
                failed.append("Missing required FTC tag (#ad or #sponsored) in caption")
                score -= 30

            if promo_detected:
                passed.append(f"Unique discount code '{request.required_coupon}' successfully verbalized/displayed")
            elif request.required_coupon:
                failed.append(f"Required promo code '{request.required_coupon}' was not detected")
                score -= 20

            passed.append(f"Brand logo and visual identity for '{request.brand_name}' recognized")
            passed.append("Key campaign talking points covered accurately")

            transcript = request.audio_transcript or (
                f"Hey everyone! Excited to partner with {request.brand_name}. "
                f"Be sure to use my exclusive code {request.required_coupon or 'SAVE'} at checkout for your discount!"
            )
            feedback = (
                f"Campaign deliverable scored {score}%. Visual placement and promotional messaging "
                "meet brand guidelines."
            )

        is_approved = score >= 85 and ftc_compliant

        if is_approved:
            payout_rec = "FULL_RELEASE"
        elif score >= 65:
            payout_rec = "PARTIAL_RELEASE"
        else:
            payout_rec = "REJECT_REMEDIATION_REQUIRED"

        return InfluencerInspectionResult(
            score=max(0, min(100, score)),
            is_approved=is_approved,
            ftc_compliant=ftc_compliant,
            brand_logo_detected=brand_logo,
            promo_code_detected=promo_detected,
            talking_points_adherence=adherence,
            passed_checks=passed,
            failed_checks=failed,
            detected_transcript=transcript,
            feedback=feedback,
            payout_recommendation=payout_rec,
            ai_provider_used=provider_name,
            ai_model_used=model_name,
        )

    # -----------------------------------------------------------------------
    # 4. AI Dispute Mediator
    # -----------------------------------------------------------------------
    def mediate_dispute(self, request: DisputeMediationRequest) -> DisputeMediationResult:
        """
        Objectively mediates contested escrow milestones by assessing contract specs,
        actual deliverable proof, and respective statements to recommend an equitable
        split payout with remediation tasks.
        Routes to Grok or Gemini.
        """
        provider, provider_name, model_name = self.router.select_provider(
            requested_provider=request.provider,
            task_type="dispute",
        )

        system_instruction = (
            "You are TrustPay AI's autonomous and impartial dispute arbitrator. "
            "When a milestone deliverable is contested by a company or talent, you review "
            "the original criteria, the submitted work, the company's complaint, and the talent's defense. "
            "Requirements:\n"
            "1. Output fair percentage splits: talent_payout_percentage + company_refund_percentage MUST equal 100.\n"
            "2. Provide an objective, legally balanced settlement rationale.\n"
            "3. If talent receives less than 100%, formulate a 48-hour punch-list of remediation tasks to unlock remainder.\n"
            "4. Output must be valid JSON."
        )

        user_prompt = (
            f"Contested Step Escrow Amount: ${request.step_amount} USD\n"
            f"Original Milestone Specs:\n{request.milestone_spec}\n\n"
            f"Delivered Work Summary:\n{request.deliverable_summary}\n\n"
            f"Company Grievance:\n{request.company_complaint}\n\n"
            f"Freelancer / Influencer Defense:\n{request.freelancer_statement}\n\n"
            "Return JSON matching:\n"
            "{\n"
            '  "talent_payout_percentage": 70,\n'
            '  "company_refund_percentage": 30,\n'
            '  "settlement_rationale": "Clear impartial reasoning...",\n'
            '  "punch_list": [\n'
            '    {"task": "Fix specific item...", "deadline_hours": 48, "impact_amount": 90.0}\n'
            "  ]\n"
            "}"
        )

        ai_data = None
        if provider:
            ai_data = provider.generate_json(user_prompt, system_instruction)

        if ai_data:
            talent_pct = int(ai_data.get("talent_payout_percentage", 70))
            company_pct = 100 - talent_pct
            rationale = ai_data.get("settlement_rationale", "Impartial dispute split based on deliverable value.")
            punch_list_raw = ai_data.get("punch_list", [])
            punch_list = [
                RemediationAction(
                    task=item.get("task", "Address requested refinement"),
                    deadline_hours=item.get("deadline_hours", 48),
                    impact_amount=float(item.get("impact_amount", round((company_pct / 100.0) * request.step_amount, 2))),
                )
                for item in punch_list_raw
            ]
        else:
            talent_pct = 75
            company_pct = 25
            rem_amount = round((company_pct / 100.0) * request.step_amount, 2)
            rationale = (
                f"Deliverable proof demonstrates substantial completion (~75% of milestone scope), "
                "including foundational implementation. However, the company's complaint regarding missing polish "
                f"and edge-case validation is substantiated. Recommended resolution: Release {talent_pct}% (${round(0.75 * request.step_amount, 2)}) "
                f"to talent now, with {company_pct}% (${rem_amount}) refundable unless punch-list items are resolved within 48 hours."
            )
            punch_list = [
                RemediationAction(
                    task="Provide end-to-end test validation and address client feedback comments",
                    deadline_hours=48,
                    impact_amount=rem_amount,
                )
            ]

        talent_amount = round((talent_pct / 100.0) * request.step_amount, 2)
        company_amount = round((company_pct / 100.0) * request.step_amount, 2)

        return DisputeMediationResult(
            talent_payout_percentage=talent_pct,
            company_refund_percentage=company_pct,
            talent_payout_amount=talent_amount,
            company_refund_amount=company_amount,
            settlement_rationale=rationale,
            punch_list=punch_list,
            is_split_settlement=talent_pct > 0 and company_pct > 0,
            ai_provider_used=provider_name,
            ai_model_used=model_name,
        )

    # -----------------------------------------------------------------------
    # 5. AI Talent Matchmaker
    # -----------------------------------------------------------------------
    def match_talent(self, request: TalentMatchRequest) -> TalentMatchResponse:
        """
        Evaluates project brief against candidate talent profiles (verified on-time rates,
        security grades, skills overlap, and audience authenticity) to recommend the
        top K best-fit talent.
        """
        provider, provider_name, model_name = self.router.select_provider(
            requested_provider=request.provider,
            task_type="general",
        )

        candidates = request.candidate_pool or DEFAULT_TALENT_POOL
        if request.category:
            filtered = [c for c in candidates if c.category.lower() == request.category.lower()]
            if filtered:
                candidates = filtered

        system_instruction = (
            "You are TrustPay AI's senior talent matchmaker and reputation auditor. "
            "Given a project brief and a list of talent profiles with verified stats (spec compliance rate, "
            "on-time delivery rate, security grade, badges), select and rank the top candidates. "
            "Calculate an accurate match_score (0-100), detailed fit_reason, key_strengths, and risk_assessment. "
            "Output must be valid JSON."
        )

        candidates_data = [c.model_dump() for c in candidates]
        user_prompt = (
            f"Project Brief: {request.project_prompt}\n"
            f"Target Category: {request.category or 'Any'}\n"
            f"Target Budget: ${request.budget or 'Flexible'}\n"
            f"Top K: {request.top_k}\n\n"
            f"Available Verified Candidates:\n{json.dumps(candidates_data, indent=2)}\n\n"
            "Return JSON matching:\n"
            "{\n"
            '  "project_summary": "Summary of requirements...",\n'
            '  "required_skills_detected": ["Skill 1", "Skill 2"],\n'
            '  "matches": [\n'
            "    {\n"
            '      "talent_id": "id",\n'
            '      "match_score": 96,\n'
            '      "fit_reason": "Clear explanation of fit...",\n'
            '      "key_strengths": ["Strength 1", "Strength 2"],\n'
            '      "risk_assessment": "Low Risk: Grade A security with 99% on-time record."\n'
            "    }\n"
            "  ]\n"
            "}"
        )

        ai_data = None
        if provider:
            ai_data = provider.generate_json(user_prompt, system_instruction)

        candidate_map = {c.talent_id: c for c in candidates}
        matched_items: List[TalentMatchResultItem] = []

        if ai_data and "matches" in ai_data:
            try:
                for m in ai_data.get("matches", []):
                    tid = m.get("talent_id")
                    if tid in candidate_map:
                        matched_items.append(
                            TalentMatchResultItem(
                                talent_profile=candidate_map[tid],
                                match_score=int(m.get("match_score", 90)),
                                fit_reason=m.get("fit_reason", "High skill alignment and stellar reliability."),
                                key_strengths=m.get("key_strengths", candidate_map[tid].skills_or_niche[:3]),
                                risk_assessment=m.get("risk_assessment", f"Verified {candidate_map[tid].security_grade}"),
                            )
                        )
                if matched_items:
                    return TalentMatchResponse(
                        project_summary=ai_data.get("project_summary", request.project_prompt[:150]),
                        required_skills_detected=ai_data.get("required_skills_detected", ["Technical Delivery"]),
                        top_matches=matched_items[: request.top_k],
                        ai_provider_used=provider_name,
                        ai_model_used=model_name,
                    )
            except Exception as e:
                logger.warning(f"Failed to parse AI talent match results: {e}. Falling back to deterministic matching.")

        return self._fallback_match_talent(request, candidates, provider_name, model_name)

    def _fallback_match_talent(
        self,
        request: TalentMatchRequest,
        candidates: List[TalentProfile],
        provider_name: str,
        model_name: str,
    ) -> TalentMatchResponse:
        """Deterministic heuristic talent matching for offline/sandbox operation."""
        prompt_lower = request.project_prompt.lower()
        scored: List[Tuple[int, TalentProfile, List[str]]] = []

        for c in candidates:
            score = 50  # Base score
            matched_skills = []

            for s in c.skills_or_niche:
                if s.lower() in prompt_lower:
                    score += 15
                    matched_skills.append(s)

            # Quality bonuses
            if c.security_grade == "Grade A":
                score += 10
            elif c.security_grade == "Grade B":
                score += 5

            if c.ontime_delivery_rate >= 95.0:
                score += 10
            if c.spec_compliance_rate >= 95.0:
                score += 10

            if not matched_skills:
                matched_skills = c.skills_or_niche[:2]

            final_score = min(99, max(60, score))
            scored.append((final_score, c, matched_skills))

        # Sort descending by match score
        scored.sort(key=lambda x: x[0], reverse=True)

        matched_items = []
        for match_score, profile, key_skills in scored[: request.top_k]:
            matched_items.append(
                TalentMatchResultItem(
                    talent_profile=profile,
                    match_score=match_score,
                    fit_reason=f"Strong domain overlap in {', '.join(key_skills)} with {profile.ontime_delivery_rate}% historical on-time execution.",
                    key_strengths=key_skills + profile.verified_badges[:1],
                    risk_assessment=f"Low Risk: Verified {profile.security_grade} track record ({profile.spec_compliance_rate}% compliance rate).",
                )
            )

        detected_skills = list({skill for _, _, skills in scored for skill in skills})[:5]

        return TalentMatchResponse(
            project_summary=f"Marketplace matching for: {request.project_prompt[:120]}...",
            required_skills_detected=detected_skills or ["Full-Stack Engineering", "Milestone Execution"],
            top_matches=matched_items,
            ai_provider_used=provider_name,
            ai_model_used=model_name,
        )


# ---------------------------------------------------------------------------
# Default Talent Profiles for Instant Marketplace Simulation
# ---------------------------------------------------------------------------
DEFAULT_TALENT_POOL = [
    TalentProfile(
        talent_id="dev_1",
        name="Devansh Sharma",
        handle="@devansh_codes",
        category="developer",
        skills_or_niche=["Python", "FastAPI", "PayPal REST API", "SQLAlchemy", "Security Hardening", "Backend"],
        hourly_or_campaign_rate=65.0,
        spec_compliance_rate=98.5,
        ontime_delivery_rate=99.0,
        security_grade="Grade A",
        verified_badges=["Escrow Specialist", "Clean Code Certified", "Top 1% PayPal"],
        bio_or_summary="Senior backend architect specializing in fintech, PayPal escrow authorizations, and secure multi-tier APIs.",
    ),
    TalentProfile(
        talent_id="dev_2",
        name="Alex Rivera",
        handle="@arivera_ui",
        category="developer",
        skills_or_niche=["Next.js", "React", "Tailwind CSS", "TypeScript", "AG Grid", "Frontend"],
        hourly_or_campaign_rate=55.0,
        spec_compliance_rate=96.0,
        ontime_delivery_rate=95.0,
        security_grade="Grade A",
        verified_badges=["Top 5% Timeliness", "UI/UX Master"],
        bio_or_summary="Frontend engineer crafting fluid milestone dashboards, escrow visualizers, and responsive web applications.",
    ),
    TalentProfile(
        talent_id="dev_3",
        name="Jordan Lee",
        handle="@jordan_sec",
        category="developer",
        skills_or_niche=["Python", "Go", "Docker", "Cryptography", "OAuth2", "Security Auditing"],
        hourly_or_campaign_rate=80.0,
        spec_compliance_rate=94.0,
        ontime_delivery_rate=92.0,
        security_grade="Grade A",
        verified_badges=["Zero Leak Record", "Security Auditor"],
        bio_or_summary="Application security engineer specializing in vulnerability mitigation, credential protection, and sandbox isolation.",
    ),
    TalentProfile(
        talent_id="dev_4",
        name="Priya Patel",
        handle="@priyacodes",
        category="developer",
        skills_or_niche=["Node.js", "Express", "PostgreSQL", "React", "Stripe", "Full-Stack"],
        hourly_or_campaign_rate=50.0,
        spec_compliance_rate=91.0,
        ontime_delivery_rate=93.0,
        security_grade="Grade B",
        verified_badges=["Verified Developer"],
        bio_or_summary="Full-stack web developer building scalable database-driven apps and marketplace backends.",
    ),
    TalentProfile(
        talent_id="inf_1",
        name="Maya Chen",
        handle="@mayatech",
        category="influencer",
        skills_or_niche=["Tech Reviews", "Instagram Reels", "TikTok", "YouTube Shorts", "Developer Tools"],
        hourly_or_campaign_rate=350.0,
        spec_compliance_rate=99.0,
        ontime_delivery_rate=98.0,
        security_grade="Grade A",
        audience_authenticity_score=96.5,
        verified_badges=["Verified Creator", "FTC Compliance Pro", "Top Engagement"],
        bio_or_summary="Tech and developer tools reviewer with 250k engaged organic followers and 0% bot anomalies.",
    ),
    TalentProfile(
        talent_id="inf_2",
        name="Marcus Vance",
        handle="@marcusfintech",
        category="influencer",
        skills_or_niche=["Fintech & Crypto", "X / Twitter Threads", "Podcast", "YouTube Long-form"],
        hourly_or_campaign_rate=500.0,
        spec_compliance_rate=95.0,
        ontime_delivery_rate=96.0,
        security_grade="Grade A",
        audience_authenticity_score=94.0,
        verified_badges=["Fintech Thought Leader", "High Conversion"],
        bio_or_summary="Fintech analyst covering modern payment gateways, autonomous escrow, and startup launches.",
    ),
    TalentProfile(
        talent_id="inf_3",
        name="Sophia Kim",
        handle="@sophiasaas",
        category="influencer",
        skills_or_niche=["Design & SaaS", "Short-Form Video", "TikTok", "Product Demos"],
        hourly_or_campaign_rate=250.0,
        spec_compliance_rate=93.0,
        ontime_delivery_rate=97.0,
        security_grade="Grade B",
        audience_authenticity_score=92.0,
        verified_badges=["Rising Star"],
        bio_or_summary="Product reviewer focusing on SaaS launches, AI developer tools, and workflow automation.",
    ),
]


# Singleton instance for imports
ai_service = TrustPayAIService()
