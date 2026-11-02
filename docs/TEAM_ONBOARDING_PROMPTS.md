# 🚀 Antigravity Onboarding Prompts for Teammates

Copy and send each person their specific prompt below. When they paste it into a **fresh Antigravity chat**, Antigravity will clone the repository, switch to their feature branch, read `docs/HACKATHON_BLUEPRINT.md`, and start building their module immediately.

---

## 🎨 1. Prompt for VACHAN (Frontend & Marketplace Lead)

```markdown
Hi Antigravity! We are participating in the PayPal & AI Hackathon building **TrustPay AI** (an autonomous milestone escrow marketplace bridging companies with freelancers and influencers).

Please help me set up the repository and start building my assigned module:

1. Clone our repository if not already cloned:
   git clone https://github.com/advikakhandelwal/PayPalIsImportant.git
   cd PayPalIsImportant
2. Switch to main, pull the latest changes, and create my feature branch:
   git checkout main && git pull origin main
   git checkout -b feature/frontend
3. Read the master blueprint at `docs/HACKATHON_BLUEPRINT.md` in the project root to understand the whole architecture.
4. I am **Vachan**, the **Frontend Lead**. My job is to build the frontend inside the `/frontend` directory:
   - Scaffold a Next.js (React) app with Tailwind CSS and Lucide icons.
   - Dual Marketplace Views: Company Portal (post gig/campaign, fund escrow) vs. Talent Portal (browse gigs, view criteria).
   - Step-by-Step Milestone Visualizer (Step 1 Paid ➔ Step 2 In Review ➔ Step 3 Locked).
   - Deliverable Upload Dropzone & AI Audit Inspection modal.
   - Trust & Performance Scorecards (badges, compliance %, on-time rate).

Let's start by scaffolding the Next.js app in `/frontend` and building the first dashboard component!
```

---

## 🧠 2. Prompt for ADVIKA (AI Multimodal Verifier & Security Lead)

```markdown
Hi Antigravity! We are participating in the PayPal & AI Hackathon building **TrustPay AI** (an autonomous milestone escrow marketplace bridging companies with freelancers and influencers).

Please help me set up the repository and start building my assigned module:

1. Clone our repository if not already cloned:
   git clone https://github.com/advikakhandelwal/PayPalIsImportant.git
   cd PayPalIsImportant
2. Switch to main, pull the latest changes, and create my feature branch:
   git checkout main && git pull origin main
   git checkout -b feature/ai
3. Read the master blueprint at `docs/HACKATHON_BLUEPRINT.md` in the project root to understand the whole architecture.
4. I am **Advika**, the **AI Verifier & Security Lead**. My job is to build the AI services using Google Gemini (`google-genai` Python SDK) inside `/backend/app/services/ai_service.py`:
   - Milestone Spec Decomposer: converts raw job/campaign prompts into structured JSON steps with weighted percentages and verification criteria.
   - Code Deliverable & Security Inspector: checks code compliance against specs, and scans for hardcoded API keys, secrets, or vulnerabilities.
   - Influencer Campaign Inspector (Multimodal): analyzes video/image submissions for brand logos, `#ad` disclosure, and transcribes spoken audio to check for brand keywords/coupon codes.
   - Returns a structured JSON score (0–100%), security grade, passed/failed checks, and feedback.
   - AI Dispute Mediator: generates split payout recommendations when a deliverable is contested.

Let's start by implementing `backend/app/services/ai_service.py` with the Gemini SDK!
```

---

## ⚙️ 3. Prompt for TANISHA (Backend Core, Database & Glue Lead)

```markdown
Hi Antigravity! We are participating in the PayPal & AI Hackathon building **TrustPay AI** (an autonomous milestone escrow marketplace bridging companies with freelancers and influencers).

Please help me set up the repository and start building my assigned module:

1. Clone our repository if not already cloned:
   git clone https://github.com/advikakhandelwal/PayPalIsImportant.git
   cd PayPalIsImportant
2. Switch to main, pull the latest changes, and create my feature branch:
   git checkout main && git pull origin main
   git checkout -b feature/backend
3. Read the master blueprint at `docs/HACKATHON_BLUEPRINT.md` in the project root to understand the whole architecture.
4. I am **Tanisha**, the **Backend Core Lead**. My job is to build the core FastAPI server and database inside `/backend`:
   - Setup FastAPI application in `backend/app/main.py` with CORS and auto-docs at `/docs`.
   - Setup SQLite database with SQLAlchemy models in `backend/app/models/`:
     - `User` (Company, Freelancer, Influencer, trust_score, badges)
     - `Listing` (Gigs & Campaigns, budgets, requirements)
     - `Contract` (Escrow status, paypal_auth_id)
     - `Milestone` (Step number, percentage, amount, status: LOCKED, ACTIVE, SUBMITTED, VERIFYING, RELEASED)
     - `Submission` (Deliverable URL, AI score, security grade, audit log)
   - Implement the Step-by-Step State Machine (unlocks Step N+1 only when Step N is RELEASED).
   - Reputation & Trust Metrics calculation engine.

Let's start by creating the database models and the FastAPI main server!
```

---

## 💳 4. Prompt for DEVANSH (You — PayPal Engine & Partwise Escrow Lead)

```markdown
Hi Antigravity! We are participating in the PayPal & AI Hackathon building **TrustPay AI**.

I am **Devansh**, the **PayPal Engine Lead**.
I am currently working in `PayPalIsImportant` on my branch `devansh`.
Please read `docs/HACKATHON_BLUEPRINT.md` to see my assigned responsibilities.

My job is to build the PayPal escrow and payout engine inside `backend/app/services/paypal_service.py` and `backend/app/api/paypal_routes.py`:
1. PayPal Sandbox authentication helper using CLIENT_ID and CLIENT_SECRET.
2. Escrow Order Authorization endpoint (`intent: AUTHORIZE`) to lock the full project budget upfront.
3. Partwise Milestone Capture endpoint (`/v2/payments/authorizations/{id}/capture`) to capture specific partial amounts as milestones pass AI verification.
4. Direct Payouts API (`/v1/payments/payouts`) to disburse captured funds directly to the talent's PayPal email.
5. Refund endpoint for dispute settlements.

Let's begin by writing `backend/app/services/paypal_service.py` with testable sandbox endpoints!
```
