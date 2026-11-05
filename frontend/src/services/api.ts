/**
 * TrustPay AI - API Integration Adapter
 * Ready to connect directly to the FastAPI backend (http://localhost:8000/api).
 * Currently wired with mock fallbacks for independent frontend development and testing.
 */

import { Project, EscrowContract, Application, DeliverableSubmission } from "@/types";
import { SAMPLE_PROJECTS, SAMPLE_ACTIVE_CONTRACT, SAMPLE_APPLICATIONS } from "@/lib/mockData";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const apiClient = {
  /**
   * Fetch all open marketplace listings
   */
  async getProjects(): Promise<Project[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/projects`, { cache: "no-store" });
      if (!res.ok) throw new Error("Backend not available");
      return await res.json();
    } catch {
      // Fallback to sample data for frontend testing
      return SAMPLE_PROJECTS;
    }
  },

  /**
   * Post a new project (Client action)
   */
  async createProject(project: Omit<Project, "id" | "createdAt">): Promise<Project> {
    try {
      const res = await fetch(`${API_BASE_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (!res.ok) throw new Error("Backend not available");
      return await res.json();
    } catch {
      return {
        ...project,
        id: `proj-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
    }
  },

  /**
   * Fetch active escrow contract by ID
   */
  async getContract(id: string): Promise<EscrowContract> {
    try {
      const res = await fetch(`${API_BASE_URL}/contracts/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Backend not available");
      return await res.json();
    } catch {
      return SAMPLE_ACTIVE_CONTRACT;
    }
  },

  /**
   * Submit deliverable for a milestone (Freelancer action)
   */
  async submitDeliverable(
    contractId: string,
    milestoneId: string,
    submission: DeliverableSubmission
  ): Promise<DeliverableSubmission> {
    try {
      const res = await fetch(`${API_BASE_URL}/contracts/${contractId}/milestones/${milestoneId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      if (!res.ok) throw new Error("Backend not available");
      return await res.json();
    } catch {
      return submission;
    }
  },

  /**
   * Fetch applications for a project (Client inbox)
   */
  async getApplications(projectId: string): Promise<Application[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/applications`, { cache: "no-store" });
      if (!res.ok) throw new Error("Backend not available");
      return await res.json();
    } catch {
      return SAMPLE_APPLICATIONS.filter((a) => a.projectId === projectId || projectId === "all");
    }
  },
};
