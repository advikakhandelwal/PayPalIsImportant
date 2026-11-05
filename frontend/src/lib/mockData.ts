/**
 * TrustPay AI - Sample & Mock Datasets
 * Clearly labeled for frontend testing and UI demonstration.
 * Ready to be replaced by live FastAPI endpoints in services/api.ts.
 */

import { UserProfile, Project, EscrowContract, Application } from "@/types";

export const SAMPLE_FREELANCER: UserProfile = {
  id: "freelancer-vachan",
  name: "Vachan Singh rajpurohit",
  email: "vachan@talent.trustpay.ai",
  role: "FREELANCER",
  domain: "Full-Stack & Smart Escrow UI",
  bio: "Senior Frontend Engineer specializing in Next.js, fintech dashboards, and accessible UI engineering.",
  portfolioLinks: ["https://github.com/vachan", "https://trustpay-demo.vercel.app"],
  createdAt: "2026-01-15T00:00:00Z",
  trustScorecard: {
    rating: 4.95,
    onTimeDeliveryRate: 98,
    complianceScore: 97,
    completedProjects: 24,
    totalEarningsOrSpent: 48500,
    currency: "USD",
    badges: ["Verified Creator", "Clean Code Certified", "Top Timeliness", "Escrow Protected"],
  },
};

export const SAMPLE_CLIENT: UserProfile = {
  id: "client-fintech-corp",
  name: "Acme Global Ventures",
  email: "contracts@acmeventures.com",
  role: "CLIENT",
  domain: "Fintech & Autonomous Commerce",
  bio: "Enterprise brand building next-gen autonomous marketplace protocols.",
  portfolioLinks: ["https://acmeventures.com"],
  createdAt: "2025-11-01T00:00:00Z",
  trustScorecard: {
    rating: 4.9,
    onTimeDeliveryRate: 100,
    complianceScore: 100,
    completedProjects: 38,
    totalEarningsOrSpent: 182000,
    currency: "USD",
    badges: ["Escrow Protected"],
  },
};

// Demonstration of flexible milestone breakdown (e.g. 25% / 50% / 25%, NOT hardcoded 30/40/30)
export const SAMPLE_PROJECTS: Project[] = [
  {
    id: "proj-101",
    clientId: "client-fintech-corp",
    clientName: "Acme Global Ventures",
    clientCompany: "Acme Corp",
    title: "Autonomous Milestone Escrow Portal for Web3 Freelancers",
    domain: "Full-Stack Development",
    description: "Build an interactive escrow dashboard with milestone state visualization, deliverable inspection, and responsive design.",
    totalBudget: 4000,
    currency: "USD",
    deadline: "2026-12-01T00:00:00Z",
    status: "IN_PROGRESS",
    createdAt: "2026-11-01T00:00:00Z",
    applicationsCount: 4,
    milestones: [
      {
        id: "ms-1",
        stepNumber: 1,
        title: "Architecture Blueprint & Responsive Design System",
        description: "Scaffold App Router, design tokens, responsive layout, and theme badges.",
        deliverableRequirements: [
          "Next.js 14 App Router layout configured",
          "Custom Tailwind fintech color tokens implemented",
          "TypeScript contracts defined without errors",
        ],
        paymentAmount: 1000,
        percentage: 25, // 25% configurable
        currency: "USD",
        deadline: "2026-11-10T00:00:00Z",
        status: "RELEASED",
        submission: {
          id: "sub-1",
          milestoneId: "ms-1",
          submissionType: "URL",
          submissionUrl: "https://github.com/PayPalIsImportant/frontend",
          notes: "Initial foundation and design tokens completed.",
          submittedAt: "2026-11-03T12:00:00Z",
          aiVerificationReport: {
            overallScore: 96,
            qualityGrade: "A",
            isAdvisoryOnly: true,
            evaluatedAt: "2026-11-03T12:05:00Z",
            feedbackNotes: "All specifications met. Responsive tokens and type safety verified.",
            checklist: [
              { criterion: "App Router scaffolded", passed: true, evidenceNotes: "src/app/layout.tsx present" },
              { criterion: "Tailwind fintech tokens", passed: true, evidenceNotes: "Colors aligned with spec" },
              { criterion: "Zero type errors", passed: true, evidenceNotes: "tsc passed with strict mode" },
            ],
            missingRequirements: [],
          },
        },
      },
      {
        id: "ms-2",
        stepNumber: 2,
        title: "Dual Marketplace Portals & Deliverable Dropzone",
        description: "Implement separate Client & Freelancer dashboards, project posting wizard, and deliverable upload.",
        deliverableRequirements: [
          "Client dashboard with project manager",
          "Freelancer dashboard with domain filters",
          "Deliverable upload dropzone with preview modal",
        ],
        paymentAmount: 2000,
        percentage: 50, // 50% configurable
        currency: "USD",
        deadline: "2026-11-20T00:00:00Z",
        status: "ACTIVE",
      },
      {
        id: "ms-3",
        stepNumber: 3,
        title: "AI Verification Advisory Modal & Dispute Suite",
        description: "Add advisory AI inspection modal, evidence upload, and human-in-the-loop review actions.",
        deliverableRequirements: [
          "Advisory inspection checklist with score visualization",
          "Dispute evidence upload form",
          "Settlement summary with human confirmation",
        ],
        paymentAmount: 1000,
        percentage: 25, // 25% configurable
        currency: "USD",
        deadline: "2026-12-01T00:00:00Z",
        status: "LOCKED",
      },
    ],
  },
  {
    id: "proj-102",
    clientId: "client-media-house",
    clientName: "Horizon Media Labs",
    clientCompany: "Horizon Digital",
    title: "Sponsored Product Video Campaign & Disclosure Audit",
    domain: "Video Production & Influencer",
    description: "Create high-engagement 60-second product review video adhering to FTC disclosure guidelines (#ad) and talking points.",
    totalBudget: 2500,
    currency: "EUR", // Configurable non-USD currency
    deadline: "2026-11-28T00:00:00Z",
    status: "OPEN",
    createdAt: "2026-11-04T00:00:00Z",
    applicationsCount: 7,
    milestones: [
      {
        id: "ms-102-1",
        stepNumber: 1,
        title: "Script & Talking Points Outline",
        description: "Submit video script with brand discount code and required hashtag placements.",
        deliverableRequirements: ["Full spoken script", "Discount code mention included"],
        paymentAmount: 1000,
        percentage: 40, // 40% configurable
        currency: "EUR",
        deadline: "2026-11-12T00:00:00Z",
        status: "ACTIVE",
      },
      {
        id: "ms-102-2",
        stepNumber: 2,
        title: "Final High-Definition Video & Live Publication",
        description: "Produce 4K video, publish to social platform, and maintain live post.",
        deliverableRequirements: ["4K video file upload", "Public post URL with active #ad disclosure"],
        paymentAmount: 1500,
        percentage: 60, // 60% configurable
        currency: "EUR",
        deadline: "2026-11-28T00:00:00Z",
        status: "LOCKED",
      },
    ],
  },
];

// Sample Applications for project 101 showing AI-recommended vs. standard applicants
export const SAMPLE_APPLICATIONS: Application[] = [
  {
    id: "app-1",
    projectId: "proj-101",
    freelancerId: "freelancer-vachan",
    freelancerName: "Vachan Sharma",
    freelancerDomain: "Full-Stack & Smart Escrow UI",
    coverLetter: "I specialize in building accessible, high-performance fintech dashboards. I have already drafted the App Router architecture.",
    bidAmount: 4000,
    currency: "USD",
    status: "ACCEPTED",
    createdAt: "2026-11-01T14:30:00Z",
    trustScorecard: SAMPLE_FREELANCER.trustScorecard,
    aiRecommendation: {
      fitScore: 97,
      domainMatchRate: 98,
      summaryExplanation: "Top candidate. High compliance rate (97%) and extensive experience in Next.js fintech interfaces.",
      isTopPick: true,
    },
  },
  {
    id: "app-2",
    projectId: "proj-101",
    freelancerId: "freelancer-alex",
    freelancerName: "Alex Chen",
    freelancerDomain: "Full-Stack Development",
    coverLetter: "10+ years of React development experience. Available to start immediately.",
    bidAmount: 4200,
    currency: "USD",
    status: "PENDING",
    createdAt: "2026-11-02T09:15:00Z",
    trustScorecard: {
      rating: 4.8,
      onTimeDeliveryRate: 94,
      complianceScore: 92,
      completedProjects: 18,
      totalEarningsOrSpent: 32000,
      currency: "USD",
      badges: ["Clean Code Certified"],
    },
    aiRecommendation: {
      fitScore: 89,
      domainMatchRate: 90,
      summaryExplanation: "Strong technical background, slightly higher bid than client budget.",
      isTopPick: false,
    },
  },
];

export const SAMPLE_ACTIVE_CONTRACT: EscrowContract = {
  id: "contract-4040",
  projectId: "proj-101",
  projectTitle: "Autonomous Milestone Escrow Portal for Web3 Freelancers",
  clientId: "client-fintech-corp",
  clientName: "Acme Global Ventures",
  freelancerId: "freelancer-vachan",
  freelancerName: "Vachan Sharma",
  totalBudget: 4000,
  heldInEscrowAmount: 3000, // 3000 still in escrow ($1000 released for milestone 1)
  releasedAmount: 1000,
  currency: "USD",
  escrowStatus: "PARTIALLY_RELEASED",
  createdAt: "2026-11-01T15:00:00Z",
  milestones: SAMPLE_PROJECTS[0].milestones,
};
