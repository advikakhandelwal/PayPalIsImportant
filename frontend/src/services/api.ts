/**
 * TrustPay AI - Centralized Backend API Client
 * Connects directly to the FastAPI backend (default: http://localhost:8000/api).
 * Genuine cryptographic JWT Bearer authentication with zero mock fallbacks.
 */

import {
  Project,
  EscrowContract,
  Application,
  DeliverableSubmission,
  UserProfile,
  UserRole,
  TrustScorecardData,
  ContractMessage,
  MessageThreadSummary,
} from "@/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000/api`
    : "http://localhost:8000/api");
const TOKEN_KEY = "tp_access_token";

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  domain?: string;
  bio?: string;
  companyName?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  user: UserProfile;
}

export interface ProjectCreatePayload {
  title: string;
  domain: string;
  description: string;
  totalBudget: number;
  currency?: string;
  deadline?: string;
  requiredSkills?: string[];
  experienceLevel?: string;
  additionalRequirements?: string;
  milestones: Array<{
    stepNumber: number;
    title: string;
    description: string;
    percentage: number;
    paymentAmount?: number;
    deadline?: string;
    deliverableRequirements?: string[];
  }>;
}

export interface ApplicationSubmitPayload {
  coverLetter: string;
  bidAmount: number;
  currency?: string;
  freelancerProfile?: Record<string, any>;
}

export interface DeliverableSubmitPayload {
  submissionType: "URL" | "FILE";
  submissionUrl: string;
  fileName?: string;
  notes: string;
}

export interface RevisionRequestPayload {
  feedback: string;
  specificCorrections?: string;
  additionalInstructions?: string;
}

export interface ReviewSubmitPayload {
  rating: number;
  review?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Helpers (SSR-Safe)
// ─────────────────────────────────────────────────────────────────────────────
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function getHeaders(customHeaders: Record<string, string> = {}): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...customHeaders,
  };
  const token = getStoredToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `Request failed with status ${res.status}`;
    try {
      const errData = await res.json();
      if (errData.detail) {
        errorMessage =
          typeof errData.detail === "string"
            ? errData.detail
            : Array.isArray(errData.detail)
            ? errData.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ")
            : JSON.stringify(errData.detail);
      } else if (errData.message) {
        errorMessage = errData.message;
      }
    } catch {
      // not JSON
    }
    const error = new Error(errorMessage);
    (error as any).status = res.status;
    throw error;
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  // ── Authentication Endpoints ──────────────────────────────────────────────
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<AuthResponse>(res);
    if (data.accessToken) {
      setStoredToken(data.accessToken);
    }
    return data;
  },

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<AuthResponse>(res);
    if (data.accessToken) {
      setStoredToken(data.accessToken);
    }
    return data;
  },

  async getMe(): Promise<UserProfile> {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<UserProfile>(res);
  },

  async updateProfile(profileData: Partial<UserProfile>): Promise<UserProfile> {
    const res = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(profileData),
    });
    return handleResponse<UserProfile>(res);
  },

  async verifyPassword(password: string): Promise<{ verified: boolean; userId: string }> {
    const res = await fetch(`${API_BASE_URL}/auth/verify-password`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ password }),
    });
    return handleResponse<{ verified: boolean; userId: string }>(res);
  },

  async forgotPassword(email: string): Promise<{
    message: string;
    resetToken?: string | null;
    expiresInMinutes: number;
  }> {
    const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return handleResponse<{
      message: string;
      resetToken?: string | null;
      expiresInMinutes: number;
    }>(res);
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    return handleResponse<{ message: string }>(res);
  },

  // ── Project Marketplace Endpoints ─────────────────────────────────────────
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE_URL}/projects`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<Project[]>(res);
  },

  async createProject(project: ProjectCreatePayload): Promise<Project> {
    const res = await fetch(`${API_BASE_URL}/projects`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(project),
    });
    return handleResponse<Project>(res);
  },

  // ── Application Endpoints ─────────────────────────────────────────────────
  async getApplications(projectId: string): Promise<Application[]> {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/applications`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<Application[]>(res);
  },

  async getAllApplications(): Promise<Application[]> {
    const res = await fetch(`${API_BASE_URL}/projects/all/applications`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<Application[]>(res);
  },

  async submitApplication(projectId: string, payload: ApplicationSubmitPayload): Promise<Application> {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/applications`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<Application>(res);
  },

  async acceptApplication(projectId: string, applicationId: string): Promise<EscrowContract> {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/applications/${applicationId}/accept`, {
      method: "POST",
      headers: getHeaders(),
    });
    return handleResponse<EscrowContract>(res);
  },

  async rejectApplication(projectId: string, applicationId: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/applications/${applicationId}/reject`, {
      method: "POST",
      headers: getHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },

  // ── Contract & Escrow Endpoints ───────────────────────────────────────────
  async getContracts(): Promise<EscrowContract[]> {
    const res = await fetch(`${API_BASE_URL}/contracts`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<EscrowContract[]>(res);
  },

  async getContract(id: string): Promise<EscrowContract> {
    const res = await fetch(`${API_BASE_URL}/contracts/${id}`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<EscrowContract>(res);
  },

  async submitDeliverable(
    contractId: string,
    milestoneId: string,
    submission: DeliverableSubmitPayload
  ): Promise<DeliverableSubmission> {
    const res = await fetch(`${API_BASE_URL}/contracts/${contractId}/milestones/${milestoneId}/submit`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(submission),
    });
    return handleResponse<DeliverableSubmission>(res);
  },

  async approveMilestone(contractId: string, milestoneId: string): Promise<EscrowContract> {
    const res = await fetch(`${API_BASE_URL}/contracts/${contractId}/milestones/${milestoneId}/approve`, {
      method: "POST",
      headers: getHeaders(),
    });
    return handleResponse<EscrowContract>(res);
  },

  async requestRevision(
    contractId: string,
    milestoneId: string,
    revisionData: RevisionRequestPayload
  ): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/contracts/${contractId}/milestones/${milestoneId}/request-revision`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(revisionData),
    });
    return handleResponse<any>(res);
  },

  async submitReview(contractId: string, reviewData: ReviewSubmitPayload): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/contracts/${contractId}/review`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(reviewData),
    });
    return handleResponse<any>(res);
  },

  // ── Reputation & Scorecard Endpoints ──────────────────────────────────────
  async getUserScorecard(userId: string): Promise<TrustScorecardData> {
    const res = await fetch(`${API_BASE_URL}/users/${userId}/scorecard`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<TrustScorecardData>(res);
  },

  // ── AI Verifier & Decomposition Endpoints ─────────────────────────────────
  async decomposeSpec(payload: {
    prompt: string;
    total_budget: number;
    currency?: string;
    target_role?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/ai/decompose-spec`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async mediateDispute(payload: {
    milestone_spec: string;
    deliverable_summary: string;
    company_complaint: string;
    freelancer_statement: string;
    step_amount: number;
    provider?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/ai/dispute/mediate`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  // ── PayPal Escrow & Payout Endpoints ──────────────────────────────────────
  async getPayPalConfig(): Promise<{
    mode: string;
    intent?: string;
    configured: boolean;
    hasLiveCredentials: boolean;
    clientId?: string | null;
  }> {
    const res = await fetch(`${API_BASE_URL}/paypal/config`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse(res);
  },

  async createPayPalEscrowOrder(
    contractId: string,
    payload: { returnUrl?: string; cancelUrl?: string; idempotencyKey?: string } = {}
  ): Promise<{
    contractId: string;
    orderId: string;
    status: string;
    approvalUrl?: string | null;
    amount: number;
    currency: string;
    idempotencyKey: string;
    mode: string;
  }> {
    const res = await fetch(`${API_BASE_URL}/paypal/contracts/${contractId}/create-order`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async authorizePayPalEscrow(
    contractId: string,
    payload: { orderId?: string; authorizationId?: string; idempotencyKey?: string; simulate?: boolean }
  ): Promise<{
    contractId: string;
    orderId?: string | null;
    authorizationId: string;
    status: string;
    escrowStatus: string;
    heldInEscrowAmount: number;
    currency: string;
    activeMilestoneId?: string | null;
    idempotencyKey: string;
    mode: string;
  }> {
    const res = await fetch(`${API_BASE_URL}/paypal/contracts/${contractId}/authorize`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async capturePayPalMilestone(
    contractId: string,
    milestoneId: string,
    payload: { noteToPayer?: string; idempotencyKey?: string } = {}
  ): Promise<any> {
    const res = await fetch(
      `${API_BASE_URL}/paypal/contracts/${contractId}/milestones/${milestoneId}/capture`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      }
    );
    return handleResponse(res);
  },

  async payoutPayPalMilestone(
    contractId: string,
    milestoneId: string,
    payload: { recipientEmail?: string; note?: string; idempotencyKey?: string } = {}
  ): Promise<any> {
    const res = await fetch(
      `${API_BASE_URL}/paypal/contracts/${contractId}/milestones/${milestoneId}/payout`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      }
    );
    return handleResponse(res);
  },

  async refundPayPalEscrow(
    contractId: string,
    payload: { captureId?: string; amount?: number; reason?: string; voidRemainingAuthorization?: boolean } = {}
  ): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/paypal/contracts/${contractId}/refund`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async getPayPalTransactions(contractId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/paypal/contracts/${contractId}/transactions`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse(res);
  },

  // ── Upfront / Override Release & Direct Contract Chat ─────────────────────
  async releaseMilestoneOverride(
    contractId: string,
    milestoneId: string,
    password: string,
    reason?: string
  ): Promise<EscrowContract> {
    const res = await fetch(
      `${API_BASE_URL}/contracts/${contractId}/milestones/${milestoneId}/release-override`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ password, reason }),
      }
    );
    return handleResponse<EscrowContract>(res);
  },

  async releaseContractUpfront(
    contractId: string,
    password: string,
    reason?: string
  ): Promise<EscrowContract> {
    const res = await fetch(`${API_BASE_URL}/contracts/${contractId}/release-upfront`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ password, reason }),
    });
    return handleResponse<EscrowContract>(res);
  },

  async getMessageInbox(): Promise<MessageThreadSummary[]> {
    const res = await fetch(`${API_BASE_URL}/contracts/messages/inbox`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<MessageThreadSummary[]>(res);
  },

  async getContractMessages(contractId: string): Promise<ContractMessage[]> {
    const res = await fetch(`${API_BASE_URL}/contracts/${contractId}/messages`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<ContractMessage[]>(res);
  },

  async sendContractMessage(contractId: string, message: string): Promise<ContractMessage> {
    const res = await fetch(`${API_BASE_URL}/contracts/${contractId}/messages`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ message }),
    });
    return handleResponse<ContractMessage>(res);
  },

  // ── Ledger & Sponsor Integrations (AG Grid, Zapier, Postman) ──────────────
  async getGlobalPayPalLedger(): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/paypal/ledger`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<any[]>(res);
  },

  async getZapierStatus(): Promise<{ configured: boolean; webhookUrl: string; deliveries: any[] }> {
    const res = await fetch(`${API_BASE_URL}/integrations/zapier`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse(res);
  },

  async updateZapierWebhook(
    webhookUrl: string,
    sendTest = false
  ): Promise<{ configured: boolean; webhookUrl: string; testDelivery?: any; deliveries: any[] }> {
    const res = await fetch(`${API_BASE_URL}/integrations/zapier`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ webhook_url: webhookUrl, send_test: sendTest }),
    });
    return handleResponse(res);
  },

  getPostmanCollectionUrl(): string {
    return `${API_BASE_URL}/integrations/postman-collection`;
  },

  // ── Shared Disputes & Notifications Endpoints ─────────────────────────────
  async getDisputes(): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/disputes`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<any[]>(res);
  },

  async createDispute(dispute: any): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/disputes`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        id: dispute.id,
        contractId: dispute.contractId,
        status: dispute.status || "OPEN",
        data: dispute,
      }),
    });
    return handleResponse<any>(res);
  },

  async updateDispute(dispute: any): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/disputes/${encodeURIComponent(dispute.id)}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({
        id: dispute.id,
        contractId: dispute.contractId,
        status: dispute.status || "OPEN",
        data: dispute,
      }),
    });
    return handleResponse<any>(res);
  },

  async getNotifications(): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/notifications`, {
      headers: getHeaders(),
      cache: "no-store",
    });
    return handleResponse<any[]>(res);
  },

  async createNotification(payload: {
    userId: string;
    userRole: string;
    event: string;
    title: string;
    description: string;
    linkHref: string;
    entityId?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/notifications`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async markNotificationRead(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
      headers: getHeaders(),
    });
    await handleResponse(res);
  },

  async markAllNotificationsRead(): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/notifications/read-all`, {
      method: "POST",
      headers: getHeaders(),
    });
    await handleResponse(res);
  },

  async dismissNotification(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/notifications/${encodeURIComponent(id)}/dismiss`, {
      method: "PATCH",
      headers: getHeaders(),
    });
    await handleResponse(res);
  },

  async withdrawApplication(applicationId: string): Promise<{ withdrawn: boolean; applicationId: string }> {
    const res = await fetch(`${API_BASE_URL}/applications/${encodeURIComponent(applicationId)}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async withdrawProject(projectId: string): Promise<{ withdrawn: boolean; projectId: string }> {
    const res = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async settleContractEarly(
    contractId: string,
    payload: { freelancerAmount: number; clientRefundAmount: number; reason?: string }
  ): Promise<EscrowContract> {
    const res = await fetch(`${API_BASE_URL}/contracts/${encodeURIComponent(contractId)}/settle-early`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<EscrowContract>(res);
  },
};
