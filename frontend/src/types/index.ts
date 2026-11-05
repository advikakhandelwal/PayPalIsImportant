/**
 * TrustPay AI - Core Domain Types
 * Modular, API-ready contracts for the Freelancing Escrow Marketplace.
 * Designed for future integration with FastAPI backend, Gemini AI service, and PayPal API.
 */

// ==========================================
// 1. User & Authentication Types
// ==========================================
export type UserRole = 'CLIENT' | 'FREELANCER';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  domain: string; // e.g. "Full-Stack Development", "AI Engineering", "Video Production"
  bio: string;
  avatarUrl?: string;
  portfolioLinks: string[];
  trustScorecard: TrustScorecardData;
  createdAt: string;
  skills?: string[];
  experienceYears?: number;
  companyName?: string;
  companyDescription?: string;
  isNewMember?: boolean;
}

// ==========================================
// 2. Trust & Performance Scorecard Types
// ==========================================
export interface TrustScorecardData {
  rating: number; // e.g., 4.9 out of 5.0
  onTimeDeliveryRate: number; // percentage 0 - 100
  complianceScore: number; // percentage 0 - 100
  completedProjects: number;
  totalEarningsOrSpent: number;
  currency: string; // e.g., 'USD', 'EUR', 'GBP'
  badges: Array<'Verified Creator' | 'Clean Code Certified' | 'Top Timeliness' | 'Escrow Protected'>;
}

// ==========================================
// 3. Milestone & Project Types (Configurable)
// ==========================================
export type MilestoneStatus =
  | 'LOCKED'
  | 'ACTIVE'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'REVISION_REQUESTED'
  | 'DISPUTED'
  | 'RELEASED';

export interface Milestone {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  deliverableRequirements: string[];
  paymentAmount: number; // configurable amount
  percentage: number; // configurable percentage of total project
  currency: string; // configurable currency
  deadline: string; // ISO date string
  status: MilestoneStatus;
  submission?: DeliverableSubmission;
}

export type ProjectStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Project {
  id: string;
  clientId: string;
  clientName: string;
  clientCompany?: string;
  title: string;
  domain: string;
  description: string;
  totalBudget: number;
  currency: string; // configurable currency
  deadline: string;
  milestones: Milestone[];
  status: ProjectStatus;
  createdAt: string;
  applicationsCount?: number;
}

// ==========================================
// 4. Application & Proposal Types
// ==========================================
export type ApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface Application {
  id: string;
  projectId: string;
  freelancerId: string;
  freelancerName: string;
  freelancerDomain: string;
  coverLetter: string;
  bidAmount: number;
  currency: string;
  status: ApplicationStatus;
  createdAt: string;
  trustScorecard: TrustScorecardData;
  // AI-assisted recommendation (Advisory only - Human makes the decision)
  aiRecommendation?: {
    fitScore: number; // 0 - 100
    domainMatchRate: number; // 0 - 100
    summaryExplanation: string;
    isTopPick: boolean;
  };
}

// ==========================================
// 5. Deliverable & Advisory AI Verification Types
// ==========================================
export interface DeliverableSubmission {
  id: string;
  milestoneId: string;
  submissionType: 'FILE' | 'URL';
  submissionUrl: string;
  fileName?: string;
  notes: string;
  submittedAt: string;
  // Advisory AI Verification (Human Client must approve/reject)
  aiVerificationReport?: AIVerificationReport;
}

export interface AIChecklistItem {
  criterion: string;
  passed: boolean;
  evidenceNotes: string;
}

export interface AIVerificationReport {
  overallScore: number; // 0 - 100
  qualityGrade: 'A' | 'B' | 'C' | 'FAIL';
  checklist: AIChecklistItem[];
  missingRequirements: string[];
  feedbackNotes: string;
  evaluatedAt: string;
  isAdvisoryOnly: true; // Explicit flag ensuring no automated irreversible action
}

// ==========================================
// 6. Escrow Contract & Dispute Types
// ==========================================
export type EscrowStatus =
  | 'AWAITING_AUTHORIZATION'
  | 'HELD_IN_ESCROW'
  | 'PARTIALLY_RELEASED'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'REFUNDED';

export interface EscrowContract {
  id: string;
  projectId: string;
  projectTitle: string;
  clientId: string;
  clientName: string;
  freelancerId: string;
  freelancerName: string;
  totalBudget: number;
  heldInEscrowAmount: number;
  releasedAmount: number;
  currency: string;
  escrowStatus: EscrowStatus;
  milestones: Milestone[];
  createdAt: string;
  dispute?: DisputeCase;
}

export interface DisputeCase {
  id: string;
  contractId: string;
  milestoneId: string;
  initiatorRole: UserRole;
  initiatorName: string;
  reason: string;
  evidenceNotes: string;
  status: 'OPEN' | 'IN_HUMAN_REVIEW' | 'RESOLVED';
  createdAt: string;
  // AI-assisted split suggestion (Advisory only - Final resolution requires human consensus)
  aiAdvisoryRecommendation?: {
    suggestedTalentPayoutPercentage: number;
    suggestedClientRefundPercentage: number;
    rationale: string;
    confidenceScore: number;
  };
  resolution?: {
    talentPayout: number;
    clientRefund: number;
    currency: string;
    resolvedAt: string;
    resolvedBy: 'MUTUAL_AGREEMENT' | 'HUMAN_ARBITRATOR';
  };
}
