"""
TrustPay AI — Standalone Idempotent Demo Data Seeder
=====================================================
Seeds initial demonstration users, projects, contracts, and applications
matching the frontend's mock datasets (SAMPLE_PROJECTS, SAMPLE_ACTIVE_CONTRACT).

Usage:
    PYTHONPATH=backend backend/.venv/bin/python3 -m app.utils.seed_data

Guarantees:
- Strictly idempotent: repeated execution creates zero duplicate rows.
- Never overwrites existing user profiles or projects.
- Fully decoupled from production application startup.
"""

import sys
import os
from decimal import Decimal
from datetime import datetime

# Path setup when run standalone
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal, engine, Base
from app.models.user import User, UserRole
from app.core.security import hash_password
from app.models.project import Project, ProjectStatus, ListingType
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.models.submission import Submission, SubmissionType, VerificationStatus
from app.models.application import Application, ApplicationStatus


def is_production_environment() -> bool:
    """Normalizes environment detection: treats 'production', 'prod', and case variations as production."""
    env = os.getenv("ENVIRONMENT", "development").strip().lower()
    return env in ("production", "prod")


def seed_demo_data(session=None) -> bool:
    """
    Idempotently populates the database with demo users, projects, contracts, and applications.
    Returns True if seeding occurred, False if data was already present or aborted.
    Strictly prohibited in production environments (production, prod).
    """
    if is_production_environment():
        print("⚠️ Demo seeding aborted: strictly prohibited in production environments (ENVIRONMENT is set to production/prod).")
        return False

    db = session or SessionLocal()
    created_any = False

    try:
        # Ensure schema exists
        Base.metadata.create_all(bind=engine)

        # -------------------------------------------------------------------
        # 1. Demo Users
        # -------------------------------------------------------------------
        demo_hashed_password = hash_password("DemoPass123!")

        client = db.query(User).filter(User.email == "contracts@acmeventures.com").first()
        if not client:
            client = User(
                name="Acme Global Ventures",
                email="contracts@acmeventures.com",
                hashed_password=demo_hashed_password,
                role=UserRole.CLIENT,
                domain="Fintech & Autonomous Commerce",
                company_name="Acme Corp",
                bio="Enterprise brand building next-gen autonomous marketplace protocols.",
                rating=4.9,
                on_time_rate=100,
                compliance_score=100,
                completed_projects=38,
                total_earnings_or_spent=182000.0,
                badges=["Escrow Protected"],
            )
            db.add(client)
            db.commit()
            db.refresh(client)
            created_any = True
            print("  Created demo client: Acme Global Ventures")
        elif client.hashed_password.startswith("mock_hashed_secret_"):
            client.hashed_password = demo_hashed_password
            db.commit()

        freelancer = db.query(User).filter(User.email == "vachan@talent.trustpay.ai").first()
        if not freelancer:
            freelancer = User(
                name="Vachan Singh rajpurohit",
                email="vachan@talent.trustpay.ai",
                hashed_password=demo_hashed_password,
                role=UserRole.FREELANCER,
                domain="Full-Stack & Smart Escrow UI",
                bio="Senior Frontend Engineer specializing in Next.js, fintech dashboards, and accessible UI engineering.",
                rating=4.95,
                on_time_rate=98,
                compliance_score=97,
                completed_projects=24,
                total_earnings_or_spent=48500.0,
                badges=["Verified Creator", "Clean Code Certified", "Top Timeliness", "Escrow Protected"],
            )
            db.add(freelancer)
            db.commit()
            db.refresh(freelancer)
            created_any = True
            print("  Created demo freelancer: Vachan Singh rajpurohit")
        elif freelancer.hashed_password.startswith("mock_hashed_secret_"):
            freelancer.hashed_password = demo_hashed_password
            db.commit()

        second_freelancer = db.query(User).filter(User.email == "alex@talent.trustpay.ai").first()
        if not second_freelancer:
            second_freelancer = User(
                name="Alex Chen",
                email="alex@talent.trustpay.ai",
                hashed_password=demo_hashed_password,
                role=UserRole.FREELANCER,
                domain="Full-Stack Development",
                bio="10+ years of React and Python development experience.",
                rating=4.8,
                on_time_rate=94,
                compliance_score=92,
                completed_projects=18,
                total_earnings_or_spent=32000.0,
                badges=["Clean Code Certified"],
            )
            db.add(second_freelancer)
            db.commit()
            db.refresh(second_freelancer)
            created_any = True
        elif second_freelancer.hashed_password.startswith("mock_hashed_secret_"):
            second_freelancer.hashed_password = demo_hashed_password
            db.commit()

        # -------------------------------------------------------------------
        # 2. Demo Projects
        # -------------------------------------------------------------------
        proj1 = db.query(Project).filter(
            Project.title == "Autonomous Milestone Escrow Portal for Web3 Freelancers"
        ).first()

        if not proj1:
            proj1 = Project(
                client_id=client.id,
                client_name=client.name,
                client_company="Acme Corp",
                title="Autonomous Milestone Escrow Portal for Web3 Freelancers",
                domain="Full-Stack Development",
                description="Build an interactive escrow dashboard with milestone state visualization, deliverable inspection, and responsive design.",
                listing_type=ListingType.GIG,
                total_budget=Decimal("4000.00"),
                currency="USD",
                status=ProjectStatus.IN_PROGRESS,
                required_skills=["Next.js 14", "TypeScript", "Tailwind CSS", "Lucide Icons"],
                experience_level="Expert",
                additional_requirements="Must sign non-disclosure agreement and demonstrate accessible responsive layouts.",
                proposed_milestones=[
                    {
                        "step_number": 1,
                        "title": "Architecture Blueprint & Responsive Design System",
                        "description": "Scaffold App Router, design tokens, responsive layout, and theme badges.",
                        "deliverable_requirements": ["Next.js 14 App Router layout configured", "Custom Tailwind fintech color tokens implemented"],
                        "percentage": 25,
                        "payment_amount": 1000.0,
                    },
                    {
                        "step_number": 2,
                        "title": "Dual Marketplace Portals & Deliverable Dropzone",
                        "description": "Implement separate Client & Freelancer dashboards, project posting wizard, and deliverable upload.",
                        "deliverable_requirements": ["Client dashboard with project manager", "Freelancer dashboard with domain filters"],
                        "percentage": 50,
                        "payment_amount": 2000.0,
                    },
                    {
                        "step_number": 3,
                        "title": "AI Verification Advisory Modal & Dispute Suite",
                        "description": "Add advisory AI inspection modal, evidence upload, and human-in-the-loop review actions.",
                        "deliverable_requirements": ["Advisory inspection checklist with score visualization"],
                        "percentage": 25,
                        "payment_amount": 1000.0,
                    },
                ],
            )
            db.add(proj1)
            db.commit()
            db.refresh(proj1)
            created_any = True
            print("  Created demo project: Autonomous Milestone Escrow Portal")

        proj2 = db.query(Project).filter(
            Project.title == "Sponsored Product Video Campaign & Disclosure Audit"
        ).first()

        if not proj2:
            proj2 = Project(
                client_id=client.id,
                client_name="Horizon Media Labs",
                client_company="Horizon Digital",
                title="Sponsored Product Video Campaign & Disclosure Audit",
                domain="Video Production & Influencer",
                description="Create high-engagement 60-second product review video adhering to FTC disclosure guidelines (#ad) and talking points.",
                listing_type=ListingType.CAMPAIGN,
                total_budget=Decimal("2500.00"),
                currency="EUR",
                status=ProjectStatus.OPEN,
                required_skills=["4K Video Editing", "FTC Compliance", "Voiceover Audio"],
                experience_level="Intermediate",
                additional_requirements="Must provide sample product review reels with on-screen disclosure tags.",
                proposed_milestones=[
                    {
                        "step_number": 1,
                        "title": "Script & Talking Points Outline",
                        "description": "Submit video script with brand discount code and required hashtag placements.",
                        "deliverable_requirements": ["Full spoken script", "Discount code mention included"],
                        "percentage": 40,
                        "payment_amount": 1000.0,
                    },
                    {
                        "step_number": 2,
                        "title": "Final High-Definition Video & Live Publication",
                        "description": "Produce 4K video, publish to social platform, and maintain live post.",
                        "deliverable_requirements": ["4K video file upload", "Public post URL with active #ad disclosure"],
                        "percentage": 60,
                        "payment_amount": 1500.0,
                    },
                ],
            )
            db.add(proj2)
            db.commit()
            db.refresh(proj2)
            created_any = True
            print("  Created demo project: Sponsored Product Video Campaign")

        # -------------------------------------------------------------------
        # 3. Demo Contract for Project 1 (Contract 4040)
        # -------------------------------------------------------------------
        contract = db.query(Contract).filter(Contract.project_id == proj1.id).first()
        if not contract:
            contract = Contract(
                project_id=proj1.id,
                client_id=client.id,
                talent_id=freelancer.id,
                project_title=proj1.title,
                client_name=client.name,
                talent_name=freelancer.name,
                total_budget=Decimal("4000.00"),
                held_in_escrow_amount=Decimal("3000.00"),
                released_amount=Decimal("1000.00"),
                currency="USD",
                escrow_status=EscrowStatus.PARTIALLY_RELEASED,
                paypal_auth_id="PAYPAL-DEMO-AUTH-4040",
            )
            db.add(contract)
            db.commit()
            db.refresh(contract)
            created_any = True
            print(f"  Created demo contract: ID {contract.id} ({contract.project_title})")

            # Contract Milestones
            m1 = Milestone(
                contract_id=contract.id,
                step_number=1,
                title="Architecture Blueprint & Responsive Design System",
                description="Scaffold App Router, design tokens, responsive layout, and theme badges.",
                deliverable_requirements=["Next.js 14 App Router layout configured", "Custom Tailwind fintech color tokens implemented"],
                percentage=25,
                amount=Decimal("1000.00"),
                currency="USD",
                status=MilestoneStatus.RELEASED,
            )
            m2 = Milestone(
                contract_id=contract.id,
                step_number=2,
                title="Dual Marketplace Portals & Deliverable Dropzone",
                description="Implement separate Client & Freelancer dashboards, project posting wizard, and deliverable upload.",
                deliverable_requirements=["Client dashboard with project manager", "Freelancer dashboard with domain filters"],
                percentage=50,
                amount=Decimal("2000.00"),
                currency="USD",
                status=MilestoneStatus.ACTIVE,
            )
            m3 = Milestone(
                contract_id=contract.id,
                step_number=3,
                title="AI Verification Advisory Modal & Dispute Suite",
                description="Add advisory AI inspection modal, evidence upload, and human-in-the-loop review actions.",
                deliverable_requirements=["Advisory inspection checklist with score visualization"],
                percentage=25,
                amount=Decimal("1000.00"),
                currency="USD",
                status=MilestoneStatus.LOCKED,
            )
            db.add_all([m1, m2, m3])
            db.commit()
            db.refresh(m1)

            # Submission for Milestone 1
            sub1 = Submission(
                milestone_id=m1.id,
                submission_type=SubmissionType.URL,
                submission_url="https://github.com/PayPalIsImportant/frontend",
                notes="Initial foundation and design tokens completed.",
                verification_status=VerificationStatus.COMPLETED,
                ai_score=96,
                quality_grade="Grade A",
                ai_verification_report={
                    "overallScore": 96,
                    "qualityGrade": "A",
                    "checklist": [
                        {"criterion": "App Router scaffolded", "passed": True, "evidenceNotes": "src/app/layout.tsx present"},
                        {"criterion": "Tailwind fintech tokens", "passed": True, "evidenceNotes": "Colors aligned with spec"},
                        {"criterion": "Zero type errors", "passed": True, "evidenceNotes": "tsc passed with strict mode"},
                    ],
                    "missingRequirements": [],
                    "feedbackNotes": "All specifications met. Responsive tokens and type safety verified.",
                    "evaluatedAt": "2026-11-03T12:05:00Z",
                    "isAdvisoryOnly": True,
                },
            )
            db.add(sub1)
            db.commit()
            print("  Created live contract milestones and deliverable submission")

        # -------------------------------------------------------------------
        # 4. Demo Applications for Project 1
        # -------------------------------------------------------------------
        app1 = db.query(Application).filter(
            Application.project_id == proj1.id,
            Application.freelancer_id == freelancer.id
        ).first()

        if not app1:
            app1 = Application(
                project_id=proj1.id,
                freelancer_id=freelancer.id,
                freelancer_name=freelancer.name,
                freelancer_domain=freelancer.domain,
                cover_letter="I specialize in building accessible, high-performance fintech dashboards. I have already drafted the App Router architecture.",
                bid_amount=Decimal("4000.00"),
                currency="USD",
                status=ApplicationStatus.ACCEPTED,
                ai_recommendation={
                    "fitScore": 97,
                    "domainMatchRate": 98,
                    "summaryExplanation": "Top candidate. High compliance rate (97%) and extensive experience in Next.js fintech interfaces.",
                    "isTopPick": True,
                },
            )
            app2 = Application(
                project_id=proj1.id,
                freelancer_id=second_freelancer.id,
                freelancer_name=second_freelancer.name,
                freelancer_domain=second_freelancer.domain,
                cover_letter="10+ years of React development experience. Available to start immediately.",
                bid_amount=Decimal("4200.00"),
                currency="USD",
                status=ApplicationStatus.PENDING,
                ai_recommendation={
                    "fitScore": 89,
                    "domainMatchRate": 90,
                    "summaryExplanation": "Strong technical background, slightly higher bid than client budget.",
                    "isTopPick": False,
                },
            )
            db.add_all([app1, app2])
            db.commit()
            created_any = True
            print("  Created demo applications with AI fit recommendations")

        print("🎉 Demo seeding finished successfully!")
        return created_any

    except Exception as e:
        db.rollback()
        print(f"❌ Error during demo seeding: {e}")
        raise e
    finally:
        if session is None:
            db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("TrustPay AI — Running Standalone Demo Data Seeder")
    print("=" * 60)
    seed_demo_data()

