"""
TrustPay AI — Application & Proposal API Endpoints
===================================================
Implements Phase 5C:
- GET  /api/projects/{projectId}/applications              (Client inbox of candidate proposals & scorecards)
- POST /api/projects/{projectId}/applications              (Freelancer proposal submission)
- POST /api/projects/{projectId}/applications/{aid}/accept (Client accepts proposal -> instantiates EscrowContract + Milestones)
- POST /api/projects/{projectId}/applications/{aid}/reject (Client rejects proposal)
- POST /api/applications/{aid}/accept                      (Direct alias for application acceptance)
- POST /api/applications/{aid}/reject                      (Direct alias for application rejection)
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from decimal import Decimal
import logging
import os
import sys
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.database import get_db
from app.models.user import User, UserRole
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.models.project import Project, ProjectStatus
from app.models.application import Application, ApplicationStatus
from app.schemas.marketplace_schemas import (
    ApplicationResponse,
    ApplicationCreateRequest,
    TrustScorecardData,
    ContractResponse,
)
from app.utils.id_converter import resolve_entity_id
from app.utils.auth import get_current_user
from app.api.contract_routes import _format_contract_response
from app.models.paypal_transaction import (
    PayPalOperationType,
    PayPalTransaction,
    PayPalTxStatus,
)
from app.services.paypal_service import (
    PayPalError,
    PayPalService,
    build_idempotency_key,
)

logger = logging.getLogger("trustpay.application_routes")
router = APIRouter(prefix="/api/projects", tags=["Project Applications"])
apps_router = APIRouter(prefix="/api/applications", tags=["Applications Direct"])


def _trigger_paypal_escrow_order(
    contract: Contract,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """
    PayPal Escrow Authorization Order Hook (Devansh's Scope):
    - When PayPal credentials (or PAYPAL_MODE=mock) are configured, creates an
      Orders v2 order (`intent: AUTHORIZE`) and logs it in `paypal_transactions`.
    - Keeps `contract.paypal_auth_id = None` and `escrow_status = AWAITING_AUTHORIZATION`
      until the client completes payer approval and invokes `/api/paypal/contracts/{id}/authorize`.
    - When PayPal is unconfigured in local/test runs, remains a safe non-blocking hook.
    """
    paypal = PayPalService()
    is_pytest_non_mock = (
        "pytest" in sys.modules
        and paypal.mode != "mock"
        and os.getenv("PAYPAL_ALLOW_LIVE_IN_TESTS", "false").lower() != "true"
    )
    if not paypal.is_configured() or is_pytest_non_mock:
        logger.info(
            f"[PayPal Integration Hook] Contract {contract.id} created for Project {contract.project_id}. "
            f"PayPal credentials not configured; awaiting manual/mock authorization."
        )
        return {
            "status": "AWAITING_PAYPAL_AUTHORIZATION",
            "contract_id": contract.id,
            "amount": float(contract.total_budget),
            "currency": contract.currency,
            "order_id": None,
            "approval_url": None,
        }

    idem_key = build_idempotency_key("order", contract.id, f"{Decimal(str(contract.total_budget)):.2f}")
    try:
        order_res = paypal.create_escrow_order(
            contract_id=contract.id,
            amount=contract.total_budget,
            currency=contract.currency,
            description=f"TrustPay Escrow: {contract.project_title}",
            idempotency_key=idem_key,
        )
        if db is not None:
            tx = PayPalTransaction(
                contract_id=contract.id,
                milestone_id=None,
                operation=PayPalOperationType.CREATE_ORDER,
                status=PayPalTxStatus.COMPLETED,
                idempotency_key=idem_key,
                paypal_order_id=order_res["order_id"],
                amount=contract.total_budget,
                currency=contract.currency,
                mode=order_res["mode"],
                raw_response=order_res["raw"],
            )
            db.add(tx)
        logger.info(
            f"[PayPal Integration Hook] Created Orders v2 order {order_res['order_id']} "
            f"for Contract {contract.id} ({contract.total_budget} {contract.currency})."
        )
        return {
            "status": "ORDER_CREATED",
            "contract_id": contract.id,
            "order_id": order_res["order_id"],
            "approval_url": order_res.get("approval_url"),
            "amount": float(contract.total_budget),
            "currency": contract.currency,
        }
    except PayPalError as exc:
        logger.warning(
            f"[PayPal Integration Hook] Non-blocking order creation failure for Contract {contract.id}: {exc.message}"
        )
        return {
            "status": "AWAITING_PAYPAL_AUTHORIZATION",
            "contract_id": contract.id,
            "amount": float(contract.total_budget),
            "currency": contract.currency,
            "error": exc.message,
        }


_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "will",
    "have", "has", "your", "you", "our", "can", "into", "about", "using", "use",
    "need", "want", "build", "make", "work", "project", "application", "please",
}

_SKILL_ALIASES = {
    "next.js": {"nextjs", "next.js", "next"},
    "react": {"react", "reactjs", "react.js"},
    "typescript": {"typescript", "ts"},
    "javascript": {"javascript", "js"},
    "node.js": {"node", "nodejs", "node.js"},
    "python": {"python", "py"},
    "postgresql": {"postgres", "postgresql", "psql"},
    "tailwind": {"tailwind", "tailwindcss"},
}


def _tokenize_meaningful(text: str) -> set[str]:
    import re
    tokens = re.findall(r"[a-z0-9\.\+#]+", (text or "").lower())
    return {t for t in tokens if len(t) > 2 and t not in _STOPWORDS}


def _extract_resume_insights(freelancer_profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Extract readable text, education credentials, and technical skills from an
    uploaded CV data URL (.txt/.md/.pdf) without requiring external OCR/PDF binaries.
    """
    import base64
    import re
    import zlib

    if not isinstance(freelancer_profile, dict):
        return {"raw_text": "", "education": [], "skills": []}
    cv = freelancer_profile.get("cvFile")
    if not isinstance(cv, dict):
        return {"raw_text": "", "education": [], "skills": []}

    url = str(cv.get("url") or "")
    if not url.startswith("data:") or ";base64," not in url:
        return {"raw_text": "", "education": [], "skills": []}

    try:
        b64_part = url.split(";base64,", 1)[1]
        raw_bytes = base64.b64decode(b64_part, validate=False)
    except Exception:
        return {"raw_text": "", "education": [], "skills": []}

    text_chunks: List[str] = []
    if raw_bytes.startswith(b"%PDF"):
        # Decompress PDF FlateDecode streams and extract literal (...) and hex <...> text runs
        for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", raw_bytes, re.DOTALL):
            stream_data = match.group(1)
            try:
                decompressed = zlib.decompress(stream_data)
            except Exception:
                decompressed = stream_data
            decoded = decompressed.decode("latin-1", errors="ignore")
            for lit in re.findall(r"\(([^()]{2,240})\)", decoded):
                cleaned = re.sub(r"\\[nrt]", " ", lit).strip()
                if cleaned and any(ch.isalpha() for ch in cleaned):
                    text_chunks.append(cleaned)
            for hex_str in re.findall(r"<([0-9A-Fa-f]{4,240})>", decoded):
                try:
                    raw_hex = bytes.fromhex(hex_str)
                    txt = raw_hex.decode("utf-16-be", errors="ignore") or raw_hex.decode("latin-1", errors="ignore")
                    txt = "".join(ch for ch in txt if ch.isprintable()).strip()
                    if len(txt) >= 2 and any(ch.isalpha() for ch in txt):
                        text_chunks.append(txt)
                except Exception:
                    pass
    elif raw_bytes.startswith(b"PK"):
        # DOCX (OpenXML ZIP archive): extract readable text from word/document.xml
        import io
        import zipfile
        try:
            with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
                for xml_name in zf.namelist():
                    if xml_name.startswith("word/") and xml_name.endswith(".xml"):
                        xml_str = zf.read(xml_name).decode("utf-8", errors="ignore")
                        runs = re.findall(r"<w:t[^>]*>(.*?)</w:t>", xml_str, re.DOTALL)
                        if runs:
                            text_chunks.append(" ".join(runs))
        except Exception:
            pass
    else:
        text_chunks.append(raw_bytes.decode("utf-8", errors="ignore"))

    if not text_chunks:
        # Fallback: extract readable ASCII runs from uncompressed sections
        ascii_runs = re.findall(rb"[A-Za-z0-9][A-Za-z0-9 ,.;:/+\-#@()]{5,}", raw_bytes)
        text_chunks.extend(r.decode("latin-1", errors="ignore") for r in ascii_runs[:200])

    raw_text = "\n".join(text_chunks)[:6000]
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in raw_text.splitlines() if len(ln.strip()) >= 4]

    edu_pattern = re.compile(
        r"\b(b\.?tech|b\.?e\.?|b\.?sc|m\.?tech|m\.?sc|mba|ph\.?d|bachelor|master|university|institute|college|diploma|certified|certification|cgpa|gpa)\b",
        re.IGNORECASE,
    )
    extracted_edu: List[str] = []
    for ln in lines:
        if edu_pattern.search(ln) and ln not in extracted_edu:
            extracted_edu.append(ln[:140])
        if len(extracted_edu) >= 4:
            break

    known_skills = [
        "Python", "FastAPI", "Django", "Flask", "JavaScript", "TypeScript",
        "React", "Next.js", "Node.js", "Tailwind CSS", "PostgreSQL", "SQLite",
        "MongoDB", "Docker", "AWS", "GCP", "PayPal", "REST API", "GraphQL",
        "Java", "C++", "Go", "Rust", "Figma", "UI/UX", "Machine Learning",
    ]
    raw_lower = raw_text.lower()
    extracted_skills = [sk for sk in known_skills if sk.lower() in raw_lower]

    return {
        "raw_text": raw_text,
        "education": extracted_edu,
        "skills": extracted_skills,
    }


def _skill_in_text(skill: str, text_lower: str, tokens: set[str], talent_skills_lower: set[str]) -> bool:
    s = skill.strip().lower()
    if not s:
        return False
    if s in talent_skills_lower or s in text_lower:
        return True
    for canonical, aliases in _SKILL_ALIASES.items():
        if s in aliases or s == canonical:
            if any(a in talent_skills_lower or a in tokens for a in aliases):
                return True
    return False


def _evaluate_resume_with_real_ai(
    project: Project,
    cv: Optional[Dict[str, Any]],
    resume_raw_text: str,
    cover_letter: str = "",
    past_experience: Optional[List[str]] = None,
    profile_skills: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Use real Google Gemini (including native PDF multimodal bytes) or xAI Grok
    via ModelRouter when an API key is configured in backend/.env.
    """
    if "pytest" in sys.modules:
        return None

    from app.services.providers.model_router import ModelRouter

    router_ai = ModelRouter()
    req_skills = [str(s).strip() for s in (getattr(project, "required_skills", None) or []) if str(s).strip()]
    prompt = (
        "You are an expert technical recruiter. Evaluate the candidate holistically using their uploaded resume, "
        "matched skills, past experience, and cover letter against the project requirements.\n\n"
        f"Project Title: {project.title}\n"
        f"Domain: {project.domain}\n"
        f"Description: {project.description}\n"
        f"Required Skills: {', '.join(req_skills) if req_skills else 'None specified'}\n"
        f"Additional Requirements: {project.additional_requirements or 'None'}\n\n"
        f"Candidate Cover Letter: {cover_letter or 'None'}\n"
        f"Profile Skills: {', '.join(profile_skills or []) or 'None'}\n"
        f"Past Experience: {', '.join(past_experience or []) or 'None'}\n\n"
        "Return STRICT JSON with keys:\n"
        "- fitScore (integer 0-100)\n"
        "- domainMatchRate (integer 0-100)\n"
        "- matchedSkills (array of strings from Required Skills matched)\n"
        "- missingSkills (array of strings from Required Skills missing)\n"
        "- extractedEducation (array of strings of degrees/certifications found)\n"
        "- extractedSkills (array of strings of technical skills found)\n"
        "- summaryExplanation (concise 2-3 sentence reasoning explaining WHY this candidate is a fit based on skills, experience, resume, and cover letter)\n"
        "- isTopPick (boolean, true if fitScore >= 65)\n"
    )
    sys_inst = "Evaluate candidates objectively and return valid JSON only."

    url = str((cv or {}).get("url") or "")
    # 1. Try Gemini native PDF multimodal first if PDF bytes are present
    if router_ai.gemini.is_available() and url.startswith("data:application/pdf;base64,"):
        try:
            import base64
            from google.genai import types
            pdf_bytes = base64.b64decode(url.split(";base64,", 1)[1], validate=False)
            pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
            ai_out = router_ai.gemini.generate_multimodal_json(
                contents=[pdf_part, prompt],
                system_instruction=sys_inst,
            )
            if isinstance(ai_out, dict) and "fitScore" in ai_out:
                ai_out["aiProvider"] = f"Google Gemini ({router_ai.gemini.default_model})"
                return ai_out
        except Exception as exc:
            logger.warning(f"Gemini multimodal resume evaluation failed, falling back: {exc}")

    # 2. Try text-based Gemini or Grok
    if resume_raw_text or cover_letter:
        prov, prov_name, model_name = router_ai.select_provider(requested_provider="auto", task_type="general")
        if prov is not None:
            ai_out = prov.generate_json(
                prompt=f"{prompt}\nResume Content:\n{resume_raw_text[:8000]}",
                system_instruction=sys_inst,
            )
            if isinstance(ai_out, dict) and "fitScore" in ai_out:
                ai_out["aiProvider"] = f"{prov_name} ({model_name})"
                return ai_out

    return None


def _compute_advisory_fit_score(
    project: Optional[Project],
    freelancer: Optional[User],
    freelancer_domain: str,
    cover_letter: str,
    bid_amount: float,
    freelancer_profile: Optional[Dict[str, Any]] = None,
    use_llm: bool = True,
) -> Dict[str, Any]:
    """
    Score and shortlist a candidate holistically using skills matched,
    uploaded resume (PDF/DOCX/TXT), past experience, and cover letter relevance,
    with clear reasoning explaining why the candidate is a fit.
    """
    if not project:
        return {
            "fitScore": 50,
            "domainMatchRate": 50,
            "matchedSkills": [],
            "missingSkills": [],
            "summaryExplanation": "Baseline candidate evaluation (no project context).",
            "isTopPick": False,
            "isPlaceholder": False,
            "scoringVersion": "v3",
        }

    profile = freelancer_profile or {}
    cv = profile.get("cvFile") if isinstance(profile.get("cvFile"), dict) else None
    resume_insights = _extract_resume_insights(profile)
    resume_raw_text = (resume_insights.get("raw_text") or "").strip()
    if not resume_raw_text and cv:
        ext = cv.get("extractedInfo") or {}
        resume_raw_text = str(ext.get("rawText") or "").strip()

    profile_skills = [str(s).strip() for s in (profile.get("skills") or []) if str(s).strip()]
    user_skills = [str(s).strip() for s in (getattr(freelancer, "skills", None) or []) if str(s).strip()]
    all_profile_skills = list(dict.fromkeys(profile_skills + user_skills + (resume_insights.get("skills") or [])))
    past_experience = [str(x).strip() for x in (profile.get("experience") or []) if str(x).strip()]
    exp_years = profile.get("experienceYears") if profile.get("experienceYears") is not None else getattr(freelancer, "experience_years", None)
    education_list = [str(x).strip() for x in (profile.get("education") or getattr(freelancer, "education", None) or []) if str(x).strip()]

    # Try real Gemini / Grok LLM evaluation when API key is configured (only on submission, never inside GET list loops)
    llm_result = (
        _evaluate_resume_with_real_ai(
            project, cv, resume_raw_text, cover_letter, past_experience, all_profile_skills
        )
        if use_llm
        else None
    )
    if llm_result:
        fit_score = max(0, min(100, int(llm_result.get("fitScore", 0))))
        return {
            "fitScore": fit_score,
            "domainMatchRate": max(0, min(100, int(llm_result.get("domainMatchRate", fit_score)))),
            "matchedSkills": list(llm_result.get("matchedSkills") or []),
            "missingSkills": list(llm_result.get("missingSkills") or []),
            "extractedEducation": list(llm_result.get("extractedEducation") or []),
            "extractedSkills": list(llm_result.get("extractedSkills") or []),
            "summaryExplanation": str(llm_result.get("summaryExplanation") or "Evaluated across resume, cover letter, skills, and experience."),
            "isTopPick": bool(llm_result.get("isTopPick", fit_score >= 60)),
            "isPlaceholder": False,
            "scoringVersion": "v3",
            "aiProvider": llm_result.get("aiProvider", "LLM"),
        }

    # Combine resume, profile skills, experience, and cover letter
    combined_text = " ".join(
        [
            resume_raw_text,
            cover_letter or "",
            freelancer_domain or "",
            getattr(freelancer, "bio", "") or "",
            " ".join(all_profile_skills),
            " ".join(past_experience),
            " ".join(education_list),
        ]
    )
    combined_lower = combined_text.lower()
    combined_tokens = _tokenize_meaningful(combined_text)
    skills_lower_set = {s.lower() for s in all_profile_skills}

    # 1. Required Skills Match across Resume + Profile + Cover Letter (0 - 40 pts)
    req_skills = [str(s).strip() for s in (getattr(project, "required_skills", None) or []) if str(s).strip()]
    matched_skills = [s for s in req_skills if _skill_in_text(s, combined_lower, combined_tokens, skills_lower_set)]
    missing_skills = [s for s in req_skills if s not in matched_skills]
    if req_skills:
        skill_pts = round((len(matched_skills) / len(req_skills)) * 40)
    else:
        skill_pts = min(40, 18 + len(all_profile_skills) * 4)

    # 2. Resume & Past Experience Strength (0 - 30 pts)
    exp_pts = 0
    if resume_raw_text:
        exp_pts += 12
    elif cv:
        exp_pts += 5
    if isinstance(exp_years, (int, float)) and exp_years > 0:
        exp_pts += min(10, int(exp_years) * 3)
    elif past_experience:
        exp_pts += 7
    if education_list:
        exp_pts += 4
    completed = int(getattr(freelancer, "completed_projects", 0) or 0)
    if completed > 0:
        exp_pts += 4
    exp_pts = min(30, exp_pts)

    # 3. Cover Letter & Project Scope Relevance (0 - 30 pts)
    proj_text = f"{project.title or ''} {project.domain or ''} {project.description or ''} {project.additional_requirements or ''}"
    proj_tokens = _tokenize_meaningful(proj_text)
    proposal_tokens = _tokenize_meaningful(cover_letter)
    raw_words = [w for w in (cover_letter or "").split() if w.strip()]
    overlap_ratio = (
        len(proj_tokens & (proposal_tokens | _tokenize_meaningful(resume_raw_text)))
        / max(1, min(len(proj_tokens), 12))
    )
    depth_pts = 12 if len(raw_words) >= 25 else (8 if len(raw_words) >= 10 else 3)
    relevance_pts = min(30, depth_pts + round(min(1.0, overlap_ratio) * 18))

    domain_tokens = _tokenize_meaningful(project.domain or "")
    domain_rate = (
        int(round((len(domain_tokens & combined_tokens) / len(domain_tokens)) * 100))
        if domain_tokens
        else 60
    )

    fit_score = max(10, min(99, skill_pts + exp_pts + relevance_pts))
    is_top_pick = fit_score >= 60

    # Brief, human-readable reasoning
    reasons: List[str] = []
    if req_skills:
        if matched_skills:
            reasons.append(f"Matches {len(matched_skills)}/{len(req_skills)} required skills ({', '.join(matched_skills[:4])}).")
        else:
            reasons.append(f"Does not explicitly cite the {len(req_skills)} required skill(s) ({', '.join(req_skills[:3])}).")
    elif all_profile_skills:
        reasons.append(f"Brings relevant technical skills ({', '.join(all_profile_skills[:4])}).")

    if exp_years:
        reasons.append(f"Brings {exp_years} year(s) of experience" + (" with verified resume details." if resume_raw_text else "."))
    elif resume_raw_text:
        reasons.append("Uploaded resume aligns with project domain keywords.")

    if len(raw_words) >= 20:
        reasons.append("Cover letter demonstrates clear understanding of project scope.")
    else:
        reasons.append("Cover letter is brief; review resume for full technical depth.")

    return {
        "fitScore": fit_score,
        "domainMatchRate": domain_rate,
        "matchedSkills": matched_skills,
        "missingSkills": missing_skills,
        "summaryExplanation": " ".join(reasons),
        "isTopPick": is_top_pick,
        "isPlaceholder": False,
        "scoringVersion": "v3",
    }


def _format_application_response(app: Application) -> ApplicationResponse:
    """Format a SQLAlchemy Application into an ApplicationResponse with nested trustScorecard."""
    from sqlalchemy.orm import object_session
    from app.services.reputation_service import calculate_user_reputation

    freelancer = app.freelancer
    session = object_session(app)
    if freelancer and session is not None:
        rep = calculate_user_reputation(freelancer, session)
        scorecard = TrustScorecardData(
            rating=rep["rating"],
            on_time_delivery_rate=rep["on_time_delivery_rate"],
            compliance_score=rep["compliance_score"],
            completed_projects=rep["completed_projects"],
            total_earnings_or_spent=rep["total_earnings_or_spent"],
            currency=rep.get("currency", app.currency or "USD"),
            badges=rep["badges"],
            is_unrated=rep["is_unrated"],
        )
    else:
        completed = int(freelancer.completed_projects) if freelancer and freelancer.completed_projects is not None else 0
        has_ratings = bool(freelancer and completed > 0 and freelancer.rating is not None and freelancer.rating > 0.0)
        scorecard = TrustScorecardData(
            rating=float(freelancer.rating) if has_ratings else None,
            on_time_delivery_rate=int(freelancer.on_time_rate) if has_ratings and freelancer and freelancer.on_time_rate is not None else None,
            compliance_score=int(freelancer.compliance_score) if has_ratings and freelancer and freelancer.compliance_score is not None else None,
            completed_projects=completed,
            total_earnings_or_spent=float(freelancer.total_earnings_or_spent) if freelancer and freelancer.total_earnings_or_spent is not None else 0.0,
            currency=app.currency or "USD",
            badges=freelancer.badges if freelancer and freelancer.badges else [],
            is_unrated=not has_ratings,
        )

    rec = app.ai_recommendation
    if not rec or rec.get("isPlaceholder") or rec.get("scoringVersion") != "v3":
        rec = _compute_advisory_fit_score(
            getattr(app, "project", None),
            freelancer,
            app.freelancer_domain or getattr(freelancer, "domain", "General") or "General",
            app.cover_letter or "",
            float(app.bid_amount or 0.0),
            getattr(app, "freelancer_profile", None),
            use_llm=False,
        )

    return ApplicationResponse(
        id=str(app.id),
        project_id=str(app.project_id),
        freelancer_id=str(app.freelancer_id),
        freelancer_name=app.freelancer_name,
        freelancer_domain=app.freelancer_domain,
        cover_letter=app.cover_letter,
        bid_amount=float(app.bid_amount),
        currency=app.currency,
        status=app.status,
        created_at=app.created_at.isoformat() if app.created_at else datetime.utcnow().isoformat(),
        trust_scorecard=scorecard,
        ai_recommendation=rec,
        freelancer_profile=getattr(app, "freelancer_profile", None),
    )


@router.get("/{projectId}/applications", response_model=List[ApplicationResponse])
def get_project_applications(
    projectId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch applications for a project (Client Applicant Inbox).
    Security & Privacy (SEC-04):
    - Strictly requires authentication (401 for unauthenticated).
    - Clients see applications ONLY for projects they own. Cross-client access is rejected with 403.
    - Freelancers see ONLY their own submitted applications (never competing applicants).
    - Unauthorized roles receive 403 Forbidden.
    """
    cleaned = projectId.strip().lower()

    if cleaned == "all":
        if current_user.role == UserRole.CLIENT:
            # Client sees applications for projects they own
            client_project_ids = [p.id for p in db.query(Project.id).filter(Project.client_id == current_user.id).all()]
            applications = (
                db.query(Application)
                .filter(Application.project_id.in_(client_project_ids))
                .order_by(Application.created_at.desc())
                .all()
            )
            return [_format_application_response(a) for a in applications]
        elif current_user.role in (UserRole.FREELANCER, UserRole.INFLUENCER):
            # Freelancer sees only their own applications across all projects
            applications = (
                db.query(Application)
                .filter(Application.freelancer_id == current_user.id)
                .order_by(Application.created_at.desc())
                .all()
            )
            return [_format_application_response(a) for a in applications]
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized role for application inbox.",
            )

    project_db_id = resolve_entity_id(projectId, "projects")
    project = db.query(Project).filter(Project.id == project_db_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID '{projectId}' not found."
        )

    # Role privacy check
    if current_user.role == UserRole.CLIENT:
        if project.client_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You can only view applications for projects you own."
            )
        applications = (
            db.query(Application)
            .filter(Application.project_id == project.id)
            .order_by(Application.created_at.desc())
            .all()
        )
        return [_format_application_response(a) for a in applications]

    elif current_user.role in (UserRole.FREELANCER, UserRole.INFLUENCER):
        # Freelancers can only inspect their own application on a project
        applications = (
            db.query(Application)
            .filter(
                Application.project_id == project.id,
                Application.freelancer_id == current_user.id,
            )
            .order_by(Application.created_at.desc())
            .all()
        )
        return [_format_application_response(a) for a in applications]
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role for project applications.",
        )


@router.post(
    "/{projectId}/applications",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_application(
    projectId: str,
    payload: ApplicationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit a proposal / application for an open project.
    Phase 5C Implementation.
    """
    project_db_id = resolve_entity_id(projectId, "projects")
    project = db.query(Project).filter(Project.id == project_db_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{projectId}' not found."
        )

    # 1. Project must be OPEN
    if project.status != ProjectStatus.OPEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot apply to project with status '{project.status.value}'. Applications are only accepted for OPEN projects."
        )

    # 2. Prevent client from applying to own project
    if project.client_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Clients cannot apply to their own project listings."
        )

    # 3. Role check: only FREELANCER or INFLUENCER can apply
    if current_user.role not in (UserRole.FREELANCER, UserRole.INFLUENCER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User '{current_user.name}' has role '{current_user.role.value}'. Only FREELANCERs can submit project proposals."
        )

    # 4. Duplicate proposal check
    existing = (
        db.query(Application)
        .filter(
            Application.project_id == project.id,
            Application.freelancer_id == current_user.id,
            Application.status.in_([ApplicationStatus.PENDING, ApplicationStatus.ACCEPTED]),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already submitted an active proposal for this project."
        )

    # 5. Financial & input validation
    if payload.bid_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bid amount must be greater than 0.00."
        )

    if not payload.cover_letter or not payload.cover_letter.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cover letter cannot be empty."
        )

    # 6. Enrich profile with parsed resume insights & compute AI fit score
    enriched_profile = dict(payload.freelancer_profile) if isinstance(payload.freelancer_profile, dict) else {}
    insights = _extract_resume_insights(enriched_profile)
    if not enriched_profile.get("education") and insights["education"]:
        enriched_profile["education"] = insights["education"]
    if not enriched_profile.get("skills") and insights["skills"]:
        enriched_profile["skills"] = insights["skills"]
    if insights["raw_text"] and isinstance(enriched_profile.get("cvFile"), dict):
        cv_copy = dict(enriched_profile["cvFile"])
        ext_copy = dict(cv_copy.get("extractedInfo") or {})
        ext_copy["rawText"] = insights["raw_text"]
        cv_copy["extractedInfo"] = ext_copy
        enriched_profile["cvFile"] = cv_copy

    advisory_recommendation = _compute_advisory_fit_score(
        project,
        current_user,
        current_user.domain or payload.freelancer_domain or "General",
        payload.cover_letter.strip(),
        float(payload.bid_amount),
        enriched_profile or None,
    )

    new_app = Application(
        project_id=project.id,
        freelancer_id=current_user.id,
        freelancer_name=current_user.name,
        freelancer_domain=current_user.domain or "General",
        cover_letter=payload.cover_letter.strip(),
        bid_amount=Decimal(str(payload.bid_amount)),
        currency=payload.currency or project.currency,
        status=ApplicationStatus.PENDING,
        ai_recommendation=advisory_recommendation,
        freelancer_profile=enriched_profile or None,
    )
    db.add(new_app)
    db.commit()
    db.refresh(new_app)

    return _format_application_response(new_app)


def _execute_application_acceptance(
    project: Project,
    application: Application,
    current_user: User,
    db: Session,
) -> ContractResponse:
    """Internal helper to atomically execute application acceptance and contract instantiation."""
    # 1. Ownership check: Only project owner client can accept
    if project.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the client who posted the project can accept applications."
        )

    # 2. Hierarchy check
    if application.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Application '{application.id}' does not belong to Project '{project.id}'."
        )

    # 3. Status check
    if application.status != ApplicationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot accept application with status '{application.status.value}'. Only PENDING applications can be accepted."
        )

    # 4. Duplicate contract check
    existing_contract = (
        db.query(Contract)
        .filter(
            Contract.project_id == project.id,
            Contract.talent_id == application.freelancer_id,
        )
        .first()
    )
    if existing_contract:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An active contract already exists for this freelancer on Project '{project.id}'."
        )

    try:
        # A. Mark application as ACCEPTED
        application.status = ApplicationStatus.ACCEPTED

        # B. Reject all other PENDING applications for this project
        other_apps = (
            db.query(Application)
            .filter(
                Application.project_id == project.id,
                Application.id != application.id,
                Application.status == ApplicationStatus.PENDING,
            )
            .all()
        )
        for other in other_apps:
            other.status = ApplicationStatus.REJECTED

        # C. Transition project to IN_PROGRESS
        project.status = ProjectStatus.IN_PROGRESS

        # D. Instantiate Contract
        # ⚠️ Escrow starts as AWAITING_AUTHORIZATION with zero held funds.
        # Devansh's PayPal integration will transition to HELD_IN_ESCROW after
        # the client authorizes/funds the escrow via PayPal.
        agreed_budget = application.bid_amount
        new_contract = Contract(
            project_id=project.id,
            client_id=project.client_id,
            talent_id=application.freelancer_id,
            project_title=project.title,
            client_name=project.client_name,
            talent_name=application.freelancer_name,
            total_budget=agreed_budget,
            held_in_escrow_amount=Decimal("0.00"),
            released_amount=Decimal("0.00"),
            currency=application.currency or project.currency,
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
            paypal_auth_id=None,
        )
        db.add(new_contract)
        db.flush()

        # E. Instantiate Milestones from Project's proposed blueprints
        blueprints = project.proposed_milestones or []
        if blueprints:
            # E.1 Validate blueprints before creating milestones
            step_numbers = []
            total_pct = 0
            for idx, bp in enumerate(blueprints):
                step_num = bp.get("step_number") or (idx + 1)
                pct = bp.get("percentage") or (100 if len(blueprints) == 1 else 0)
                if step_num < 1:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid milestone step_number ({step_num}): must be >= 1.",
                    )
                if pct < 1:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid milestone percentage ({pct}%): must be >= 1.",
                    )
                if step_num in step_numbers:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Duplicate milestone step_number: {step_num}.",
                    )
                step_numbers.append(step_num)
                total_pct += pct

            if total_pct != 100:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Milestone percentages must sum to 100%, got {total_pct}%.",
                )

            # E.2 Calculate milestone amounts with rounding remainder correction
            milestone_specs = []
            running_total = Decimal("0.00")
            for idx, bp in enumerate(blueprints):
                step_num = bp.get("step_number") or (idx + 1)
                pct = bp.get("percentage") or (100 if len(blueprints) == 1 else 0)
                amt = round((Decimal(pct) / Decimal(100)) * agreed_budget, 2)
                running_total += amt
                milestone_specs.append((step_num, pct, amt, bp))

            # Apply rounding remainder to last milestone so sum matches budget exactly
            remainder = agreed_budget - running_total
            if remainder != Decimal("0.00") and milestone_specs:
                last = milestone_specs[-1]
                milestone_specs[-1] = (last[0], last[1], last[2] + remainder, last[3])

            # E.3 Create milestones — ALL start LOCKED while escrow is AWAITING_AUTHORIZATION.
            # When Devansh's PayPal auth succeeds and escrow transitions to HELD_IN_ESCROW,
            # step 1 should be activated externally.
            def _parse_deadline(raw_val: Any, fallback_dt: Optional[datetime]) -> Optional[datetime]:
                if isinstance(raw_val, datetime):
                    return raw_val
                if isinstance(raw_val, str) and raw_val.strip():
                    try:
                        return datetime.fromisoformat(raw_val.strip().replace("Z", "+00:00"))
                    except ValueError:
                        return fallback_dt
                return fallback_dt

            for step_num, pct, amt, bp in milestone_specs:
                ms_deadline = _parse_deadline(bp.get("deadline"), getattr(project, "deadline", None))
                m = Milestone(
                    contract_id=new_contract.id,
                    step_number=step_num,
                    title=bp.get("title", f"Milestone {step_num}"),
                    description=bp.get("description", "Deliverable milestone requirements."),
                    deliverable_requirements=bp.get("deliverable_requirements") or [],
                    percentage=pct,
                    amount=amt,
                    currency=new_contract.currency,
                    deadline=ms_deadline,
                    status=MilestoneStatus.LOCKED,
                    revision_count=0,
                    max_revisions_reached=False,
                )
                db.add(m)
        else:
            # Single-milestone fallback — also LOCKED pending escrow authorization
            m = Milestone(
                contract_id=new_contract.id,
                step_number=1,
                title="Full Project Deliverable",
                description="Complete deliverables for project scope.",
                deliverable_requirements=[],
                percentage=100,
                amount=agreed_budget,
                currency=new_contract.currency,
                deadline=getattr(project, "deadline", None),
                status=MilestoneStatus.LOCKED,
                revision_count=0,
                max_revisions_reached=False,
            )
            db.add(m)

        # F. PayPal Integration Hook (Devansh's Scope)
        _trigger_paypal_escrow_order(new_contract, db=db)

        db.commit()
        db.refresh(new_contract)
    except SQLAlchemyError as db_err:
        db.rollback()
        logger.error(f"Failed to instantiate contract on application accept: {db_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to instantiate contract and milestones. Transaction rolled back."
        )

    return _format_contract_response(new_contract)


def _execute_application_rejection(
    project: Project,
    application: Application,
    current_user: User,
    db: Session,
) -> ApplicationResponse:
    """Internal helper to atomically execute application rejection."""
    if project.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the client who posted the project can reject applications."
        )

    if application.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Application '{application.id}' does not belong to Project '{project.id}'."
        )

    if application.status != ApplicationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject application with status '{application.status.value}'. Only PENDING applications can be rejected."
        )

    application.status = ApplicationStatus.REJECTED
    db.commit()
    db.refresh(application)

    return _format_application_response(application)


@router.post(
    "/{projectId}/applications/{applicationId}/accept",
    response_model=ContractResponse,
)
def accept_application_project_route(
    projectId: str,
    applicationId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Client accepts an applicant proposal via /api/projects/{projectId}/applications/{aid}/accept."""
    project_db_id = resolve_entity_id(projectId, "projects")
    app_db_id = resolve_entity_id(applicationId, "applications")

    project = db.query(Project).filter(Project.id == project_db_id).with_for_update().first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{projectId}' not found.")

    application = db.query(Application).filter(Application.id == app_db_id).with_for_update().first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Application '{applicationId}' not found.")

    return _execute_application_acceptance(project, application, current_user, db)


@router.post(
    "/{projectId}/applications/{applicationId}/reject",
    response_model=ApplicationResponse,
)
def reject_application_project_route(
    projectId: str,
    applicationId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Client rejects an applicant proposal via /api/projects/{projectId}/applications/{aid}/reject."""
    project_db_id = resolve_entity_id(projectId, "projects")
    app_db_id = resolve_entity_id(applicationId, "applications")

    project = db.query(Project).filter(Project.id == project_db_id).with_for_update().first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{projectId}' not found.")

    application = db.query(Application).filter(Application.id == app_db_id).with_for_update().first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Application '{applicationId}' not found.")

    return _execute_application_rejection(project, application, current_user, db)


@apps_router.delete("/{applicationId}", status_code=status.HTTP_200_OK)
def withdraw_application(
    applicationId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Freelancer withdraws their own PENDING application before acceptance."""
    app_db_id = resolve_entity_id(applicationId, "applications")
    application = db.query(Application).filter(Application.id == app_db_id).with_for_update().first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    if application.freelancer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the applicant can withdraw or remove this application.")
    if application.status not in (ApplicationStatus.PENDING, ApplicationStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot withdraw or remove application in '{application.status.value}' status.",
        )

    db.delete(application)
    db.commit()
    return {"withdrawn": True, "applicationId": str(app_db_id)}


@apps_router.post(
    "/{applicationId}/accept",
    response_model=ContractResponse,
)
def accept_application_direct_route(
    applicationId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Direct alias: Client accepts an applicant proposal via /api/applications/{aid}/accept."""
    app_db_id = resolve_entity_id(applicationId, "applications")

    application = db.query(Application).filter(Application.id == app_db_id).with_for_update().first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Application '{applicationId}' not found.")

    project = db.query(Project).filter(Project.id == application.project_id).with_for_update().first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found.")

    return _execute_application_acceptance(project, application, current_user, db)


@apps_router.post(
    "/{applicationId}/reject",
    response_model=ApplicationResponse,
)
def reject_application_direct_route(
    applicationId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Direct alias: Client rejects an applicant proposal via /api/applications/{aid}/reject."""
    app_db_id = resolve_entity_id(applicationId, "applications")

    application = db.query(Application).filter(Application.id == app_db_id).with_for_update().first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Application '{applicationId}' not found.")

    project = db.query(Project).filter(Project.id == application.project_id).with_for_update().first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found.")

    return _execute_application_rejection(project, application, current_user, db)


@apps_router.delete("/{applicationId}", status_code=status.HTTP_200_OK)
def withdraw_application(
    applicationId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Freelancer withdraws their own PENDING application before acceptance."""
    app_db_id = resolve_entity_id(applicationId, "applications")
    application = db.query(Application).filter(Application.id == app_db_id).with_for_update().first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    if application.freelancer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the applicant can withdraw or remove this application.")
    if application.status not in (ApplicationStatus.PENDING, ApplicationStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot withdraw or remove application in '{application.status.value}' status.",
        )

    db.delete(application)
    db.commit()
    return {"withdrawn": True, "applicationId": str(app_db_id)}


