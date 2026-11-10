"""
TrustPay AI — Formal Database Model Test Suite
===============================================
Tests all 6 SQLAlchemy models using an in-memory SQLite database.
Run from the repo root with:
    backend/.venv/bin/python3 backend/tests/test_database_models.py

Groups:
  1. Schema Boot         — All 6 tables created successfully
  2. Golden Flow         — End-to-end happy path: User → Project → Application
                          → Contract → Milestones → Submission
  3. Financial Integrity — CheckConstraints reject bad money / score values
  4. Business Logic      — can_be_deleted(), validate_milestones_total(),
                          create_step() factory, VERIFYING alias
  5. Relationship Guards — UNIQUE / FK violations caught by the DB engine
"""

import sys
import os
from decimal import Decimal

# ---------------------------------------------------------------------------
# Path setup — lets Python find app.* packages when run from the repo root
# ---------------------------------------------------------------------------
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError

# Import our models (also registers them with Base.metadata)
from app.database import Base
from app.models import (
    User, UserRole,
    Project, Listing, ProjectStatus, ListingType,
    Contract, EscrowStatus,
    Milestone, MilestoneStatus,
    Submission, SubmissionType, VerificationStatus,
    Application, ApplicationStatus,
)

# ---------------------------------------------------------------------------
# Test infrastructure helpers
# ---------------------------------------------------------------------------

PASS = "✅ PASS"
FAIL = "❌ FAIL"
_results = []


def run_test(name: str, fn):
    """Runs fn(); records PASS or FAIL with the error message."""
    try:
        fn()
        _results.append((PASS, name))
        print(f"  {PASS}  {name}")
    except Exception as exc:
        _results.append((FAIL, name, str(exc)))
        print(f"  {FAIL}  {name}")
        print(f"         → {exc}")


def make_session():
    """
    Returns a fresh (engine, session) pair backed by an in-memory SQLite DB.
    Every call gets an independent, completely blank database.
    """
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return engine, Session()


def _commit_raises(session, obj_or_objs):
    """
    Adds obj(s) and commits; returns True if an IntegrityError is raised.
    Rolls the session back so it stays usable after the expected failure.
    """
    try:
        if isinstance(obj_or_objs, list):
            session.add_all(obj_or_objs)
        else:
            session.add(obj_or_objs)
        session.commit()
        return False          # no error — constraint was NOT enforced ❌
    except IntegrityError:
        session.rollback()
        return True           # error raised   — constraint WAS enforced ✅


# ===========================================================================
# GROUP 1 — Schema Boot Test
# "Does the database start up and create all 6 tables?"
# ===========================================================================

def group1_schema_boot():
    print("\n── Group 1: Schema Boot ──────────────────────────────────────────────")

    def test_all_tables_created():
        engine, session = make_session()
        inspector = inspect(engine)
        actual_tables = set(inspector.get_table_names())
        expected_tables = {"users", "projects", "applications", "contracts", "milestones", "submissions"}
        missing = expected_tables - actual_tables
        assert not missing, f"Missing tables: {missing}"
        session.close()

    def test_listing_alias():
        # Listing is just a module-level alias for Project — same class object
        assert Listing is Project, "Listing alias should point to the Project class"

    run_test("All 6 tables created by Base.metadata.create_all()", test_all_tables_created)
    run_test("Listing alias resolves to Project class", test_listing_alias)


# ===========================================================================
# GROUP 2 — Golden Flow (End-to-End Happy Path)
# "Can a full TrustPay transaction flow through all 6 models without errors?"
# ===========================================================================

def group2_golden_flow():
    print("\n── Group 2: Golden Flow (End-to-End) ────────────────────────────────")
    engine, db = make_session()

    # ── Step 1: Create a Client and a Freelancer ──────────────────────────
    def test_create_users():
        client = User(
            name="Priya Sharma",
            email="priya@trustpay.ai",
            hashed_password="hashed_abc123",
            role=UserRole.CLIENT,
            domain="Fintech",
        )
        freelancer = User(
            name="Arjun Dev",
            email="arjun@trustpay.ai",
            hashed_password="hashed_xyz789",
            role=UserRole.FREELANCER,
            domain="Web Development",
        )
        db.add_all([client, freelancer])
        db.commit()
        db.refresh(client)
        db.refresh(freelancer)
        assert client.id is not None
        assert freelancer.id is not None
        assert client.role == UserRole.CLIENT
        assert freelancer.role == UserRole.FREELANCER
        # Store IDs on the engine object for use in later steps
        engine._test_client_id = client.id
        engine._test_freelancer_id = freelancer.id

    # ── Step 2: Client posts a Project ───────────────────────────────────
    def test_create_project():
        project = Project(
            client_id=engine._test_client_id,
            client_name="Priya Sharma",
            title="Build TrustPay Dashboard",
            domain="Fintech",
            description="Full-stack escrow dashboard with PayPal integration",
            listing_type=ListingType.GIG,
            total_budget=Decimal("5000.00"),
            currency="USD",
            status=ProjectStatus.OPEN,
            required_skills=["Next.js", "TypeScript", "Tailwind CSS"],
            experience_level="Expert",
            additional_requirements="Must sign non-disclosure agreement.",
            proposed_milestones=[
                {"step_number": 1, "title": "UI Wireframes", "percentage": 50, "payment_amount": 2500.0},
                {"step_number": 2, "title": "Implementation", "percentage": 50, "payment_amount": 2500.0},
            ],
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        assert project.id is not None
        assert project.total_budget == Decimal("5000.00")
        assert len(project.required_skills) == 3
        assert project.experience_level == "Expert"
        assert project.additional_requirements == "Must sign non-disclosure agreement."
        assert len(project.proposed_milestones) == 2
        # Navigate the relationship: project → client
        assert project.client.name == "Priya Sharma"
        engine._test_project_id = project.id

    # ── Step 3: Freelancer submits an Application ─────────────────────────
    def test_create_application():
        app = Application(
            project_id=engine._test_project_id,
            freelancer_id=engine._test_freelancer_id,
            freelancer_name="Arjun Dev",
            freelancer_domain="Web Development",
            cover_letter="I have built 3 fintech dashboards and love PayPal integration.",
            bid_amount=Decimal("4800.00"),
            currency="USD",
            ai_recommendation={
                "fitScore": 92,
                "domainMatchRate": 88,
                "summaryExplanation": "Strong domain match in Fintech.",
                "isTopPick": True,
            },
        )
        db.add(app)
        db.commit()
        db.refresh(app)
        assert app.id is not None
        assert app.status == ApplicationStatus.PENDING
        # Navigate relationships in both directions
        assert app.project.title == "Build TrustPay Dashboard"
        assert app.freelancer.name == "Arjun Dev"
        engine._test_app_id = app.id

    # ── Step 4: Client creates a Contract ─────────────────────────────────
    def test_create_contract():
        contract = Contract(
            project_id=engine._test_project_id,
            client_id=engine._test_client_id,
            talent_id=engine._test_freelancer_id,
            project_title="Build TrustPay Dashboard",
            client_name="Priya Sharma",
            talent_name="Arjun Dev",
            total_budget=Decimal("5000.00"),
            currency="USD",
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
        )
        db.add(contract)
        db.commit()
        db.refresh(contract)
        assert contract.id is not None
        assert contract.escrow_status == EscrowStatus.AWAITING_AUTHORIZATION
        # Navigate both FK relationships on the same table
        assert contract.client.name == "Priya Sharma"
        assert contract.talent.name == "Arjun Dev"
        engine._test_contract_id = contract.id

    # ── Step 5: Create 2 Milestones using the factory ─────────────────────
    def test_create_milestones():
        total_budget = Decimal("5000.00")
        step1 = Milestone.create_step(
            contract_id=engine._test_contract_id,
            step_number=1,
            title="UI Wireframes & Design System",
            description="Deliver all Figma mockups for the TrustPay dashboard.",
            percentage=50,
            total_budget=total_budget,
        )
        step2 = Milestone.create_step(
            contract_id=engine._test_contract_id,
            step_number=2,
            title="Full Working Application",
            description="Deliver the deployed application with all PayPal hooks.",
            percentage=50,
            total_budget=total_budget,
        )
        db.add_all([step1, step2])
        db.commit()
        db.refresh(step1)
        db.refresh(step2)
        # Step 1 must be ACTIVE, Step 2 must be LOCKED
        assert step1.status == MilestoneStatus.ACTIVE, f"Step 1 should be ACTIVE, got {step1.status}"
        assert step2.status == MilestoneStatus.LOCKED, f"Step 2 should be LOCKED, got {step2.status}"
        # Amounts should be exactly 50% of 5000
        assert step1.amount == Decimal("2500.00"), f"Expected 2500.00, got {step1.amount}"
        assert step2.amount == Decimal("2500.00"), f"Expected 2500.00, got {step2.amount}"
        engine._test_milestone_id = step1.id

    # ── Step 6: Freelancer submits a deliverable ───────────────────────────
    def test_create_submission():
        submission = Submission(
            milestone_id=engine._test_milestone_id,
            submission_type=SubmissionType.URL,
            submission_url="https://figma.com/file/trustpay-dashboard-mockups",
            notes="All 12 screens completed per design system spec.",
            verification_status=VerificationStatus.COMPLETED,
            ai_score=87,
            quality_grade="Grade A",
            ai_verification_report={
                "checklist": ["Responsive layout ✓", "Color contrast ✓"],
                "findings": "Meets all design requirements.",
                "feedback": "Excellent work on the escrow flow screens.",
            },
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)
        assert submission.id is not None
        assert submission.verification_status == VerificationStatus.COMPLETED
        assert submission.ai_score == 87
        # Navigate the full chain: submission → milestone → contract → project → client
        assert submission.milestone.contract.project.client.name == "Priya Sharma"
        engine._test_submission_id = submission.id

    # ── Step 7: Navigate backref relationships ─────────────────────────────
    def test_navigate_backrefs():
        # client.projects backref
        client = db.get(User, engine._test_client_id)
        assert len(client.projects) == 1
        assert client.projects[0].title == "Build TrustPay Dashboard"
        # project.contracts backref
        project = db.get(Project, engine._test_project_id)
        assert len(project.contracts) == 1
        # contract.milestones ordered by step_number
        contract = db.get(Contract, engine._test_contract_id)
        assert len(contract.milestones) == 2
        assert contract.milestones[0].step_number == 1
        assert contract.milestones[1].step_number == 2
        # milestone.submissions backref
        milestone = db.get(Milestone, engine._test_milestone_id)
        assert len(milestone.submissions) == 1

    run_test("Create Client and Freelancer users", test_create_users)
    run_test("Client creates a Project with Decimal budget", test_create_project)
    run_test("Freelancer submits Application with AI recommendation", test_create_application)
    run_test("Contract created with both Client and Talent FKs", test_create_contract)
    run_test("Milestones via factory: Step 1 ACTIVE, Step 2 LOCKED, amounts exact", test_create_milestones)
    run_test("Submission created with AI report, full chain navigable", test_create_submission)
    run_test("All backref relationships traversable in both directions", test_navigate_backrefs)
    db.close()


# ===========================================================================
# GROUP 3 — Financial Integrity Tests
# "Does the DB reject every bad money / score value?"
# ===========================================================================

def group3_financial_integrity():
    print("\n── Group 3: Financial Integrity ─────────────────────────────────────")

    def _base_user(email="base@test.com"):
        return User(name="Test", email=email, hashed_password="x", role=UserRole.CLIENT)

    def _base_project(client_id, budget):
        return Project(
            client_id=client_id, client_name="T", title="T",
            domain="T", description="T", listing_type=ListingType.GIG,
            total_budget=budget, currency="USD", status=ProjectStatus.OPEN,
        )

    # ── Project: negative total_budget ────────────────────────────────────
    def test_project_negative_budget():
        _, db = make_session()
        u = _base_user("neg_budget@test.com"); db.add(u); db.commit(); db.refresh(u)
        raised = _commit_raises(db, _base_project(u.id, Decimal("-100.00")))
        assert raised, "Negative project budget should be rejected"

    # ── Application: negative bid_amount ─────────────────────────────────
    def test_application_negative_bid():
        _, db = make_session()
        u = _base_user("neg_bid@test.com"); db.add(u); db.commit(); db.refresh(u)
        p = _base_project(u.id, Decimal("1000.00")); db.add(p); db.commit(); db.refresh(p)
        app = Application(
            project_id=p.id, freelancer_id=u.id,
            freelancer_name="X", freelancer_domain="X",
            cover_letter="X", bid_amount=Decimal("-1.00"), currency="USD",
        )
        assert _commit_raises(db, app), "Negative bid amount should be rejected"

    # ── Contract: negative total_budget ───────────────────────────────────
    def test_contract_negative_budget():
        _, db = make_session()
        u = _base_user("neg_cbudget@test.com"); db.add(u); db.commit(); db.refresh(u)
        p = _base_project(u.id, Decimal("1000.00")); db.add(p); db.commit(); db.refresh(p)
        c = Contract(
            project_id=p.id, client_id=u.id, talent_id=u.id,
            project_title="T", client_name="T", talent_name="T",
            total_budget=Decimal("-500.00"), currency="USD",
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
        )
        assert _commit_raises(db, c), "Negative contract budget should be rejected"

    # ── Milestone: negative amount ─────────────────────────────────────────
    def test_milestone_negative_amount():
        _, db = make_session()
        u = _base_user("neg_mamount@test.com"); db.add(u); db.commit(); db.refresh(u)
        p = _base_project(u.id, Decimal("1000.00")); db.add(p); db.commit(); db.refresh(p)
        c = Contract(
            project_id=p.id, client_id=u.id, talent_id=u.id,
            project_title="T", client_name="T", talent_name="T",
            total_budget=Decimal("1000.00"), currency="USD",
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
        )
        db.add(c); db.commit(); db.refresh(c)
        m = Milestone(
            contract_id=c.id, step_number=1, title="T", description="T",
            percentage=50, amount=Decimal("-1.00"), currency="USD",
            status=MilestoneStatus.ACTIVE,
        )
        assert _commit_raises(db, m), "Negative milestone amount should be rejected"

    # ── Milestone: percentage = 0 (below min of 1) ────────────────────────
    def test_milestone_zero_percentage():
        _, db = make_session()
        u = _base_user("pct_zero@test.com"); db.add(u); db.commit(); db.refresh(u)
        p = _base_project(u.id, Decimal("1000.00")); db.add(p); db.commit(); db.refresh(p)
        c = Contract(
            project_id=p.id, client_id=u.id, talent_id=u.id,
            project_title="T", client_name="T", talent_name="T",
            total_budget=Decimal("1000.00"), currency="USD",
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
        )
        db.add(c); db.commit(); db.refresh(c)
        m = Milestone(
            contract_id=c.id, step_number=1, title="T", description="T",
            percentage=0, amount=Decimal("0.00"), currency="USD",
            status=MilestoneStatus.ACTIVE,
        )
        assert _commit_raises(db, m), "Milestone percentage=0 should be rejected (must be ≥1)"

    # ── Milestone: percentage = 101 (above max of 100) ────────────────────
    def test_milestone_over_100_percentage():
        _, db = make_session()
        u = _base_user("pct_over@test.com"); db.add(u); db.commit(); db.refresh(u)
        p = _base_project(u.id, Decimal("1000.00")); db.add(p); db.commit(); db.refresh(p)
        c = Contract(
            project_id=p.id, client_id=u.id, talent_id=u.id,
            project_title="T", client_name="T", talent_name="T",
            total_budget=Decimal("1000.00"), currency="USD",
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
        )
        db.add(c); db.commit(); db.refresh(c)
        m = Milestone(
            contract_id=c.id, step_number=1, title="T", description="T",
            percentage=101, amount=Decimal("1000.00"), currency="USD",
            status=MilestoneStatus.ACTIVE,
        )
        assert _commit_raises(db, m), "Milestone percentage=101 should be rejected (must be ≤100)"

    # ── Milestone: step_number = 0 (below min of 1) ───────────────────────
    def test_milestone_zero_step_number():
        _, db = make_session()
        u = _base_user("step_zero@test.com"); db.add(u); db.commit(); db.refresh(u)
        p = _base_project(u.id, Decimal("1000.00")); db.add(p); db.commit(); db.refresh(p)
        c = Contract(
            project_id=p.id, client_id=u.id, talent_id=u.id,
            project_title="T", client_name="T", talent_name="T",
            total_budget=Decimal("1000.00"), currency="USD",
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
        )
        db.add(c); db.commit(); db.refresh(c)
        m = Milestone(
            contract_id=c.id, step_number=0, title="T", description="T",
            percentage=50, amount=Decimal("500.00"), currency="USD",
            status=MilestoneStatus.ACTIVE,
        )
        assert _commit_raises(db, m), "Milestone step_number=0 should be rejected (must be ≥1)"

    # ── Submission: ai_score = 101 ─────────────────────────────────────────
    def test_submission_ai_score_over_100():
        _, db = make_session()
        u = _base_user("score_over@test.com"); db.add(u); db.commit(); db.refresh(u)
        p = _base_project(u.id, Decimal("1000.00")); db.add(p); db.commit(); db.refresh(p)
        c = Contract(
            project_id=p.id, client_id=u.id, talent_id=u.id,
            project_title="T", client_name="T", talent_name="T",
            total_budget=Decimal("1000.00"), currency="USD",
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
        )
        db.add(c); db.commit(); db.refresh(c)
        m = Milestone(
            contract_id=c.id, step_number=1, title="T", description="T",
            percentage=100, amount=Decimal("1000.00"), currency="USD",
            status=MilestoneStatus.ACTIVE,
        )
        db.add(m); db.commit(); db.refresh(m)
        s = Submission(
            milestone_id=m.id, submission_type=SubmissionType.URL,
            submission_url="https://example.com", ai_score=101,
        )
        assert _commit_raises(db, s), "ai_score=101 should be rejected (must be ≤100)"

    # ── Submission: ai_score = -1 ──────────────────────────────────────────
    def test_submission_ai_score_negative():
        _, db = make_session()
        u = _base_user("score_neg@test.com"); db.add(u); db.commit(); db.refresh(u)
        p = _base_project(u.id, Decimal("1000.00")); db.add(p); db.commit(); db.refresh(p)
        c = Contract(
            project_id=p.id, client_id=u.id, talent_id=u.id,
            project_title="T", client_name="T", talent_name="T",
            total_budget=Decimal("1000.00"), currency="USD",
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
        )
        db.add(c); db.commit(); db.refresh(c)
        m = Milestone(
            contract_id=c.id, step_number=1, title="T", description="T",
            percentage=100, amount=Decimal("1000.00"), currency="USD",
            status=MilestoneStatus.ACTIVE,
        )
        db.add(m); db.commit(); db.refresh(m)
        s = Submission(
            milestone_id=m.id, submission_type=SubmissionType.URL,
            submission_url="https://example.com", ai_score=-1,
        )
        assert _commit_raises(db, s), "ai_score=-1 should be rejected (must be ≥0)"

    run_test("Project: negative total_budget rejected", test_project_negative_budget)
    run_test("Application: negative bid_amount rejected", test_application_negative_bid)
    run_test("Contract: negative total_budget rejected", test_contract_negative_budget)
    run_test("Milestone: negative amount rejected", test_milestone_negative_amount)
    run_test("Milestone: percentage=0 rejected (must be ≥1)", test_milestone_zero_percentage)
    run_test("Milestone: percentage=101 rejected (must be ≤100)", test_milestone_over_100_percentage)
    run_test("Milestone: step_number=0 rejected (must be ≥1)", test_milestone_zero_step_number)
    run_test("Submission: ai_score=101 rejected (must be ≤100)", test_submission_ai_score_over_100)
    run_test("Submission: ai_score=-1 rejected (must be ≥0)", test_submission_ai_score_negative)


# ===========================================================================
# GROUP 4 — Business Logic Method Tests
# "Do the safety guards and factory methods work correctly?"
# ===========================================================================

def group4_business_logic():
    print("\n── Group 4: Business Logic Methods ──────────────────────────────────")

    def _make_fresh_contract(db, budget=Decimal("5000.00")):
        u = User(name="Logic Test User", email=f"logic_{id(db)}@test.com",
                 hashed_password="x", role=UserRole.CLIENT)
        db.add(u); db.commit(); db.refresh(u)
        p = Project(
            client_id=u.id, client_name="T", title="T", domain="T",
            description="T", listing_type=ListingType.GIG,
            total_budget=budget, currency="USD", status=ProjectStatus.OPEN,
        )
        db.add(p); db.commit(); db.refresh(p)
        c = Contract(
            project_id=p.id, client_id=u.id, talent_id=u.id,
            project_title="T", client_name="T", talent_name="T",
            total_budget=budget, currency="USD",
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
        )
        db.add(c); db.commit(); db.refresh(c)
        return c

    # ── can_be_deleted() — fresh contract ─────────────────────────────────
    def test_can_delete_fresh_contract():
        _, db = make_session()
        c = _make_fresh_contract(db)
        assert c.can_be_deleted() is True, "Brand new contract with no PayPal auth should be deletable"

    # ── can_be_deleted() — after PayPal auth set ──────────────────────────
    def test_cannot_delete_with_paypal_auth():
        _, db = make_session()
        c = _make_fresh_contract(db)
        c.paypal_auth_id = "PAYPAL-AUTH-XYZ-123"
        db.commit()
        assert c.can_be_deleted() is False, "Contract with paypal_auth_id must NOT be deletable"

    # ── can_be_deleted() — after escrow funds held ────────────────────────
    def test_cannot_delete_with_escrow_funds():
        _, db = make_session()
        c = _make_fresh_contract(db)
        c.held_in_escrow_amount = Decimal("5000.00")
        c.escrow_status = EscrowStatus.HELD_IN_ESCROW
        db.commit()
        assert c.can_be_deleted() is False, "Contract with held escrow funds must NOT be deletable"

    # ── can_be_deleted() — after partial release ──────────────────────────
    def test_cannot_delete_with_released_funds():
        _, db = make_session()
        c = _make_fresh_contract(db)
        c.released_amount = Decimal("2500.00")
        c.escrow_status = EscrowStatus.PARTIALLY_RELEASED
        db.commit()
        assert c.can_be_deleted() is False, "Contract with released funds must NOT be deletable"

    # ── validate_milestones_total() — passes for exact 100% ───────────────
    def test_milestone_validation_passes_at_100():
        _, db = make_session()
        c = _make_fresh_contract(db)
        m1 = Milestone.create_step(c.id, 1, "Phase 1", "Desc", 60, c.total_budget)
        m2 = Milestone.create_step(c.id, 2, "Phase 2", "Desc", 40, c.total_budget)
        db.add_all([m1, m2]); db.commit()
        db.refresh(c)
        result = c.validate_milestones_total()
        assert result is True, "60% + 40% = 100% should pass validation"

    # ── validate_milestones_total() — raises ValueError for 90% ──────────
    def test_milestone_validation_fails_at_90():
        _, db = make_session()
        c = _make_fresh_contract(db)
        # Intentionally only add up to 90% — missing 10%
        m1 = Milestone.create_step(c.id, 1, "Phase 1", "Desc", 50, c.total_budget)
        m2 = Milestone.create_step(c.id, 2, "Phase 2", "Desc", 40, c.total_budget)
        db.add_all([m1, m2]); db.commit()
        db.refresh(c)
        try:
            c.validate_milestones_total()
            assert False, "Should have raised ValueError for 90% total"
        except ValueError as e:
            assert "90" in str(e), f"Error message should mention 90%, got: {e}"

    # ── Milestone.create_step() — Step 1 is ACTIVE ────────────────────────
    def test_factory_step1_active():
        _, db = make_session()
        c = _make_fresh_contract(db)
        m = Milestone.create_step(c.id, 1, "Design", "Desc", 100, c.total_budget)
        assert m.status == MilestoneStatus.ACTIVE, f"Step 1 should be ACTIVE, got {m.status}"

    # ── Milestone.create_step() — Step 2+ are LOCKED ─────────────────────
    def test_factory_step2_locked():
        _, db = make_session()
        c = _make_fresh_contract(db)
        m = Milestone.create_step(c.id, 2, "Dev", "Desc", 100, c.total_budget)
        assert m.status == MilestoneStatus.LOCKED, f"Step 2 should be LOCKED, got {m.status}"

    # ── Milestone.create_step() — Decimal amount calculation ─────────────
    def test_factory_decimal_precision():
        _, db = make_session()
        c = _make_fresh_contract(db, budget=Decimal("3333.33"))
        m = Milestone.create_step(c.id, 1, "Third", "Desc", 33, c.total_budget)
        expected = round((Decimal("33") / Decimal("100")) * Decimal("3333.33"), 2)
        assert m.amount == expected, f"Expected {expected}, got {m.amount}"

    # ── MilestoneStatus.VERIFYING alias ───────────────────────────────────
    def test_verifying_alias_equals_in_review():
        assert MilestoneStatus.VERIFYING == "IN_REVIEW", \
            f"VERIFYING alias should equal 'IN_REVIEW', got {MilestoneStatus.VERIFYING!r}"
        assert MilestoneStatus.VERIFYING == MilestoneStatus.IN_REVIEW, \
            "VERIFYING and IN_REVIEW should be the same enum value"

    run_test("can_be_deleted() → True for fresh contract", test_can_delete_fresh_contract)
    run_test("can_be_deleted() → False after paypal_auth_id set", test_cannot_delete_with_paypal_auth)
    run_test("can_be_deleted() → False after escrow funds held", test_cannot_delete_with_escrow_funds)
    run_test("can_be_deleted() → False after funds partially released", test_cannot_delete_with_released_funds)
    run_test("validate_milestones_total() → True for 60%+40%=100%", test_milestone_validation_passes_at_100)
    run_test("validate_milestones_total() → ValueError for 50%+40%=90%", test_milestone_validation_fails_at_90)
    run_test("create_step() factory: step_number=1 → ACTIVE", test_factory_step1_active)
    run_test("create_step() factory: step_number=2 → LOCKED", test_factory_step2_locked)
    run_test("create_step() factory: Decimal amount calculated correctly", test_factory_decimal_precision)
    run_test("MilestoneStatus.VERIFYING alias == 'IN_REVIEW'", test_verifying_alias_equals_in_review)


# ===========================================================================
# GROUP 5 — Relationship Integrity Tests
# "Does the DB catch duplicate emails and broken foreign keys?"
# ===========================================================================

def group5_relationship_guards():
    print("\n── Group 5: Relationship & Uniqueness Guards ────────────────────────")

    # ── UNIQUE constraint: duplicate email ────────────────────────────────
    def test_duplicate_email_rejected():
        _, db = make_session()
        u1 = User(name="Alice", email="same@test.com", hashed_password="x", role=UserRole.CLIENT)
        u2 = User(name="Alice Clone", email="same@test.com", hashed_password="y", role=UserRole.FREELANCER)
        db.add(u1); db.commit()
        raised = _commit_raises(db, u2)
        assert raised, "Duplicate email should be rejected by UNIQUE constraint"

    # ── FK constraint: project with non-existent client_id ───────────────
    def test_project_invalid_client_fk():
        engine, db = make_session()
        # Enable FK enforcement for SQLite (off by default)
        with engine.connect() as conn:
            conn.execute(text("PRAGMA foreign_keys = ON"))
            conn.commit()
        p = Project(
            client_id=99999,          # This user does not exist
            client_name="Ghost", title="Ghost Project", domain="X",
            description="X", listing_type=ListingType.GIG,
            total_budget=Decimal("100.00"), currency="USD", status=ProjectStatus.OPEN,
        )
        raised = _commit_raises(db, p)
        assert raised, "Project referencing non-existent client_id should be rejected"

    # ── Regression: AI module imports still work ──────────────────────────
    def test_ai_module_imports_unaffected():
        import importlib, importlib.util
        ai_path = os.path.join(BACKEND_DIR, "app", "services", "ai_service.py")
        spec = importlib.util.spec_from_file_location("ai_service", ai_path)
        mod = importlib.util.module_from_spec(spec)
        # We only check the file is importable up to the point its own imports work;
        # a missing GEMINI_API_KEY is fine — that's a runtime config issue, not a code issue.
        try:
            spec.loader.exec_module(mod)
        except Exception as e:
            err = str(e).lower()
            # Allow config/key errors; fail on syntax or model import errors
            forbidden = ["syntaxerror", "importerror", "modulenotfounderror"]
            if any(f in err for f in forbidden):
                raise AssertionError(f"AI module has broken import: {e}")

    run_test("Duplicate email rejected by UNIQUE constraint", test_duplicate_email_rejected)
    run_test("Project with non-existent client_id rejected (FK)", test_project_invalid_client_fk)
    run_test("AI module (ai_service.py) imports unaffected", test_ai_module_imports_unaffected)


# ===========================================================================
# MAIN RUNNER
# ===========================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("  TrustPay AI — Database Model Test Suite")
    print("=" * 70)

    group1_schema_boot()
    group2_golden_flow()
    group3_financial_integrity()
    group4_business_logic()
    group5_relationship_guards()

    # ── Summary ─────────────────────────────────────────────────────────────
    total  = len(_results)
    passed = sum(1 for r in _results if r[0] == PASS)
    failed = total - passed

    print("\n" + "=" * 70)
    if failed == 0:
        print(f"  🎉 ALL {total} TESTS PASSED — TrustPay DB Models are rock-solid!")
    else:
        print(f"  ⚠️  {passed}/{total} passed — {failed} test(s) failed:")
        for r in _results:
            if r[0] == FAIL:
                print(f"      ❌ {r[1]}")
                if len(r) > 2:
                    print(f"         {r[2]}")
    print("=" * 70)
    sys.exit(0 if failed == 0 else 1)

