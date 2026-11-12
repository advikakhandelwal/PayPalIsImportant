/**
 * TrustPay AI - Core Domain Types
 * Modular, API-ready contracts for the Freelancing Escrow Marketplace.
 * Designed for future integration with FastAPI backend, Gemini AI service, and PayPal API.
 */

// ==========================================
// 1. User & Authentication Types
// ==========================================
export type UserRole = 'CLIENT' | 'FREELANCER';

export interface FreelancerCV {
  name: string;
  size?: number;
  uploadedAt: string;
  url?: string;
  extractedInfo?: {
    skills: string[];
    education: string[];
    experience: string[];
    previousProjects: string[];
    certifications: string[];
    summary: string;
  };
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  paypalPayoutEmail?: string | null;
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
  // Client location and address fields:
  country?: string;
  state?: string;
  city?: string;
  address?: string; // complete business/company address
  postalCode?: string;
  isAddressVerified?: boolean;
  // Freelancer profile extensions:
  education?: string[];
  certifications?: string[];
  cvFile?: FreelancerCV;
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
  currency: string; // e.g., 'INR', 'USD', 'EUR'
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

export interface MilestoneSubtask {
  id: string;
  stepNumber: string; // e.g. "1.1", "1.2"
  title: string;
  description: string;
  percentageOfMilestone: number; // proportional % of parent milestone
  percentageOfTotal: number; // share of total project value
  paymentAmount: number; // calculated currency value
  currency: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  aiReasoning?: string;
}

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
  submissionHistory?: DeliverableSubmission[];
  latestRevisionRequest?: RevisionRequest;
  // AI-assisted internal subtasks:
  subtasks?: MilestoneSubtask[];
  subtasksApproved?: boolean;
  aiSubdivisionReasoning?: string;
  // Milestone revision limit tracking (max 3):
  revisionCount?: number;
  maxRevisionsReached?: boolean;
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
  requiredSkills?: string[];
  experienceLevel?: string;
  additionalRequirements?: string;
  clientLocation?: {
    city?: string;
    state?: string;
    country?: string;
    isAddressVerified?: boolean;
  };
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
  // Complete Freelancer dossier for client review before selection:
  freelancerProfile?: {
    name?: string;
    avatarUrl?: string;
    skills?: string[];
    experienceYears?: number;
    education?: string[];
    experience?: string[];
    portfolioLinks?: string[];
    certifications?: string[];
    cvFile?: FreelancerCV;
  };
  estimatedDeliveryDays?: number;
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
export interface RevisionRequest {
  id: string;
  feedback: string;
  specificCorrections?: string;
  additionalInstructions?: string;
  requestedAt: string;
  requestedBy: string;
}

export interface DeliverableSubmission {
  id: string;
  milestoneId: string;
  submissionType: 'FILE' | 'URL';
  submissionUrl: string;
  fileName?: string;
  notes: string;
  submittedAt: string;
  revisionNumber?: number;
  reviewStatus?: 'IN_REVIEW' | 'APPROVED' | 'REVISION_REQUESTED';
  revisionRequest?: RevisionRequest;
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
  projectDescription?: string;
  projectDomain?: string;
  projectDeadline?: string;
  requiredSkills?: string[];
  clientId: string;
  clientName: string;
  clientEmail?: string;
  freelancerId: string;
  freelancerName: string;
  freelancerEmail?: string;
  freelancerPayoutEmail?: string | null;
  freelancerDomain?: string;
  freelancerRating?: number;
  freelancerBadges?: string[];
  clientRating?: number;
  clientReview?: string;
  reviewedAt?: string;
  totalBudget: number;
  heldInEscrowAmount: number;
  releasedAmount: number;
  currency: string;
  escrowStatus: EscrowStatus;
  paypalAuthId?: string;
  paypalCaptureId?: string;
  milestones: Milestone[];
  createdAt: string;
  dispute?: DisputeCase;
}

export interface ContractMessage {
  id: string;
  contractId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

export interface MessageThreadSummary {
  contractId: string;
  projectTitle: string;
  counterpartyName: string;
  counterpartyRole: string;
  counterpartyEmail?: string | null;
  escrowStatus: EscrowStatus;
  totalBudget: number;
  currency: string;
  messageCount: number;
  lastMessage?: string | null;
  lastMessageSender?: string | null;
  lastMessageAt?: string | null;
}

export type DisputeStatus =
  | 'UNDER_REVIEW'
  | 'AI_RECOMMENDATION_READY'
  | 'AWAITING_CLIENT_APPROVAL'
  | 'AWAITING_FREELANCER_APPROVAL'
  | 'NEGOTIATION_ACTIVE'
  | 'NEGOTIATION_FAILED'
  | 'AWAITING_FINAL_SETTLEMENT'
  | 'AWAITING_FREELANCER_ACCEPTANCE'
  | 'RESOLVED';

export type DisputeSettlementCase =
  | 'CASE_1_MUTUAL_AI_APPROVAL'
  | 'CASE_2_CLIENT_LOWER_OFFER'
  | 'CASE_3_FREELANCER_RAISE_OFFER';

export interface NegotiationEntry {
  id: string;
  offeredBy: UserRole;
  offeredByName: string;
  amount: number;
  currency: string;
  reason: string;
  timestamp: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED';
}

export interface AIDisputeRecommendation {
  clientAmount: number;
  freelancerAmount: number;
  currency: string;
  explanation: string;
  evidence: string[];
  completedWorkBreakdown: string;
  disputedWorkBreakdown: string;
  confidenceScore: number;
  generatedAt: string;
  isAdvisoryOnly: true;
}

export interface FinalSettlement {
  freelancerAmount: number;
  clientAmount: number;
  currency: string;
  notes: string;
  proposedBy: UserRole;
  proposedAt: string;
  acceptedByFreelancer?: boolean;
  acceptedAt?: string;
  status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED';
}

export type DisputeCategory =
  | 'QUALITY_DEFICIENCY'
  | 'MISSED_DEADLINE'
  | 'SCOPE_CREEP'
  | 'UNRESPONSIVE_COMMUNICATION'
  | 'SPECIFICATION_MISALIGNMENT'
  | 'OTHER';

export interface DisputeCase {
  id: string;
  contractId: string;
  projectId: string;
  clientId: string;
  clientName: string;
  freelancerId: string;
  freelancerName: string;
  freelancerEmail?: string;
  freelancerPayoutEmail?: string | null;
  initiatorRole: UserRole;
  initiatorName: string;
  reason: string;
  category: DisputeCategory;
  explanation: string;
  expectedResolution: string;
  evidenceNotes: string;
  evidenceLinks?: string[];
  milestoneId?: string;
  milestoneTitle?: string;
  status: DisputeStatus;
  activeCase?: DisputeSettlementCase;
  clientApprovedAI?: boolean;
  freelancerApprovedAI?: boolean;
  negotiationHistory: NegotiationEntry[];
  freelancerCounteroffersUsed: number;
  clientCounteroffersUsed: number;
  aiRecommendation?: AIDisputeRecommendation;
  finalSettlement?: FinalSettlement;
  resolution?: {
    freelancerAmount: number;
    clientAmount: number;
    currency: string;
    resolvedAt: string;
    resolvedBy: 'MUTUAL_AI_APPROVAL' | 'NEGOTIATION' | 'MUTUAL_AGREEMENT' | 'FINAL_SETTLEMENT' | 'OFFLINE_SETTLEMENT';
    notes?: string;
    talentPayout?: number;
    clientRefund?: number;
  };
  createdAt: string;
  updatedAt: string;
  aiAdvisoryRecommendation?: {
    suggestedTalentPayoutPercentage: number;
    suggestedClientRefundPercentage: number;
    rationale: string;
    confidenceScore: number;
  };
}

// ==========================================
// 7. Global Notification Types
// ==========================================
export type NotificationEvent =
  | 'NEW_APPLICATION'
  | 'DELIVERABLE_SUBMITTED'
  | 'DELIVERABLE_RESUBMITTED'
  | 'REVISION_REQUESTED'
  | 'MILESTONE_APPROVED'
  | 'APPLICATION_ACCEPTED'
  | 'APPLICATION_REJECTED'
  | 'CONTRACT_ACTIVATED'
  | 'DISPUTE_RAISED'
  | 'AI_RECOMMENDATION_READY'
  | 'SETTLEMENT_PROPOSED'
  | 'COUNTEROFFER_RECEIVED'
  | 'NEGOTIATION_FAILED'
  | 'FINAL_SETTLEMENT_SUBMITTED'
  | 'SETTLEMENT_ACCEPTED'
  | 'DISPUTE_RESOLVED'
  | 'GENERAL';

export interface AppNotification {
  id: string;
  userId: string;
  userRole: UserRole | 'ALL';
  event: NotificationEvent;
  title: string;
  description: string;
  linkHref?: string;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
  entityId?: string;
}
