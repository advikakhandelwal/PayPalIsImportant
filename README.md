# TrustPay AI

> **Zero-Trust Milestone Escrow Marketplace** powered by **PayPal Orders v2 & Payouts**, **Google Gemini AI**, **Render Workflows**, **Zapier Webhooks**, **Postman v2.1**, **AG Grid**, and **GSAP**.

TrustPay AI protects startups and independent freelancers by locking project funds upfront in **PayPal Escrow**, shortlisting candidates from real **PDF & DOCX** resumes with **Gemini AI**, auditing milestone deliverables, and releasing payments partwise as work passes review.

---

## Core Capabilities

- **PayPal Orders v2 & Payouts Engine:** Upfront escrow authorization/capture, partwise milestone releases, direct talent payouts, dispute refunds/splits, and mutual early settlement.
- **Google Gemini AI Integration:**
  - Automated milestone scoping & percentage breakdowns from a project brief.
  - Multimodal PDF & DOCX resume parsing, candidate fit scoring (`AI Shortlist`), and full-screen **Candidate Dossier** review.
  - Deliverable verification audits and AI-assisted dispute mediation.
- **Dual Workspaces (Client & Freelancer):**
  - **Client:** Post projects, browse **Find Talent** scorecards, inspect CV dossiers, lock PayPal escrow, request tracked revisions, approve milestones, and rate talent.
  - **Freelancer:** Link PayPal payout email, browse **Find Work**, upload PDF/DOCX CVs, submit deliverables, track escrow status, and receive partwise payouts.
- **Real-Time Notifications & Unified Messaging:** SQLite/PostgreSQL-persisted contract chat (`/messages`), dispute resolution (`/disputes`), and notification centre (`/notifications`).
- **Audit Ledger & Sponsor Integrations:**
  - **AG Grid** interactive financial ledger (`/ledger`) with CSV export.
  - **Zapier Webhooks** (`GET/POST /api/integrations/zapier`) for escrow & payout automation.
  - **Postman Collection v2.1** (`GET /api/integrations/postman-collection`) exportable directly from the ledger.
  - **Render Workflows** (`workflows/main.py`) for distributed AI dossier scoring, deliverable auditing, and webhook dispatch.
  - **GSAP + ScrollTrigger** scroll-driven colour transitions on the landing page.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, GSAP, AG Grid |
| Backend | FastAPI, SQLAlchemy 2.0, JWT + HttpOnly Cookie Auth, Bcrypt |
| Database | PostgreSQL (Render Managed) / SQLite (Local Dev) |
| Payments | PayPal Orders v2 (`AUTHORIZE` / `CAPTURE`), PayPal Payouts v1 |
| AI | Google Gemini (`gemini-2.5-flash`), optional xAI Grok / Ollama routing |
| Automation & Cloud | Render Web Services, Render Workflows, Zapier Webhooks, Postman v2.1 |

---

## Local Development

### 1. Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, GEMINI_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## Deploy on Render (Blueprint)

This repository includes a complete [`render.yaml`](./render.yaml) Blueprint that provisions:
1. `trustpay-ai-db` — Managed PostgreSQL database
2. `trustpay-ai-backend` — FastAPI backend service
3. `trustpay-ai-frontend` — Next.js frontend service
4. `trustpay-ai-workflows` — Render Workflows background task service

### Deployment Steps
1. Open [Render Dashboard](https://dashboard.render.com) → **New + → Blueprint**.
2. Select this repository (`TrustPay_AI`) and branch (`main` or `devansh`).
3. Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `GEMINI_API_KEY`.
4. After `trustpay-ai-backend` is live, set `NEXT_PUBLIC_API_URL=https://<backend-url>.onrender.com/api` on `trustpay-ai-frontend` and run **Manual Deploy → Clear build cache & deploy**.

---

## License

This project is licensed under the **MIT License** — see [`LICENSE`](./LICENSE) for details.
