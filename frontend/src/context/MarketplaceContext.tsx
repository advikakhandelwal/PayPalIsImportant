"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  Project,
  EscrowContract,
  Application,
  DeliverableSubmission,
  Milestone,
  MilestoneStatus,
  EscrowStatus,
  RevisionRequest,
} from "@/types";
import { apiClient, getStoredToken } from "@/services/api";
import { useAuth } from "@/context/AuthContext";

const EMPTY_CONTRACT: EscrowContract = {
  id: "",
  projectId: "",
  projectTitle: "No Active Contract",
  clientId: "",
  clientName: "",
  freelancerId: "",
  freelancerName: "",
  totalBudget: 0,
  heldInEscrowAmount: 0,
  releasedAmount: 0,
  currency: "USD",
  escrowStatus: "HELD_IN_ESCROW" as EscrowStatus,
  milestones: [],
  createdAt: new Date().toISOString(),
};

interface MarketplaceContextType {
  projects: Project[];
  contracts: EscrowContract[];
  activeContract: EscrowContract;
  applications: Application[];
  createProject: (newProject: Omit<Project, "id" | "createdAt">) => Promise<void>;
  updateProject: (projectId: string, updatedData: Partial<Project>) => void;
  submitApplication: (application: Omit<Application, "id" | "createdAt">) => Promise<void>;
  acceptApplication: (applicationId: string, currentUserId?: string) => Promise<EscrowContract>;
  rejectApplication: (applicationId: string, currentUserId?: string) => Promise<void>;
  submitDeliverable: (
    contractId: string,
    milestoneId: string,
    submission: DeliverableSubmission
  ) => Promise<void>;
  approveMilestone: (contractId: string, milestoneId: string) => Promise<void>;
  requestMilestoneRevision: (
    contractId: string,
    milestoneId: string,
    revisionData:
      | {
          feedback: string;
          specificCorrections?: string;
          additionalInstructions?: string;
          requestedBy?: string;
        }
      | string
  ) => Promise<void>;
  updateSubtaskStatus: (
    contractId: string,
    milestoneId: string,
    subtaskId: string,
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED"
  ) => void;
  createPayPalEscrowOrder: (contractId: string) => Promise<{
    orderId: string;
    approvalUrl?: string | null;
    mode: string;
  }>;
  authorizePayPalEscrow: (contractId: string, orderId?: string, simulate?: boolean) => Promise<void>;
  releaseMilestoneOverride: (contractId: string, milestoneId: string, password: string, reason?: string) => Promise<void>;
  releaseContractUpfront: (contractId: string, password: string, reason?: string) => Promise<void>;
  refreshMarketplace: () => Promise<void>;
  isLoading: boolean;
}

const MarketplaceContext = createContext<MarketplaceContextType | undefined>(undefined);

export const MarketplaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [contracts, setContracts] = useState<EscrowContract[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch public project listings
      const projData = await apiClient.getProjects().catch(() => []);
      setProjects(projData || []);

      // 2. Fetch authenticated data only when JWT token exists
      const token = getStoredToken();
      if (token) {
        const [contractsData, appsData] = await Promise.all([
          apiClient.getContracts().catch(() => []),
          apiClient.getAllApplications().catch(() => []),
        ]);
        setContracts(contractsData || []);
        setApplications(appsData || []);
      } else {
        setContracts([]);
        setApplications([]);
      }
    } catch {
      // Fail safely
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Re-fetch immediately on mount AND whenever auth identity changes (login/logout)
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData, isAuthenticated, currentUser.id]);

  const activeContract: EscrowContract = contracts.length > 0 ? contracts[0] : EMPTY_CONTRACT;

  // ── Project Actions ───────────────────────────────────────────────────────
  const createProject = useCallback(
    async (newProjectData: Omit<Project, "id" | "createdAt">) => {
      const payload = {
        title: newProjectData.title,
        domain: newProjectData.domain,
        description: newProjectData.description,
        totalBudget: newProjectData.totalBudget,
        currency: newProjectData.currency || "USD",
        deadline: newProjectData.deadline,
        requiredSkills: newProjectData.requiredSkills || [],
        experienceLevel: newProjectData.experienceLevel || "Intermediate",
        additionalRequirements: newProjectData.additionalRequirements,
        milestones: (newProjectData.milestones || []).map((m, idx) => ({
          stepNumber: m.stepNumber || idx + 1,
          title: m.title,
          description: m.description,
          percentage: m.percentage,
          paymentAmount: m.paymentAmount,
          deadline: m.deadline,
          deliverableRequirements: m.deliverableRequirements || [],
        })),
      };

      const created = await apiClient.createProject(payload);
      setProjects((prev) => [created, ...prev]);
    },
    []
  );

  const updateProject = useCallback((projectId: string, updatedData: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, ...updatedData } : p))
    );
  }, []);

  // ── Application Actions ───────────────────────────────────────────────────
  const submitApplication = useCallback(
    async (appData: Omit<Application, "id" | "createdAt">) => {
      const created = await apiClient.submitApplication(appData.projectId, {
        coverLetter: appData.coverLetter,
        bidAmount: appData.bidAmount,
        currency: appData.currency || "USD",
      });
      setApplications((prev) => [created, ...prev]);
    },
    []
  );

  const acceptApplication = useCallback(
    async (applicationId: string, _currentUserId?: string) => {
      const targetApp = applications.find((a) => a.id === applicationId);
      const projectId = targetApp ? targetApp.projectId : "";

      if (!projectId) {
        throw new Error("Cannot accept application: Project ID not found.");
      }

      const newContract = await apiClient.acceptApplication(projectId, applicationId);
      if (newContract) {
        setContracts((prev) => [newContract, ...prev]);
      }

      // Update application statuses in state
      setApplications((prev) =>
        prev.map((a) => {
          if (a.id === applicationId) return { ...a, status: "ACCEPTED" as const };
          if (a.projectId === projectId && a.status === "PENDING") {
            return { ...a, status: "REJECTED" as const };
          }
          return a;
        })
      );

      // Refresh data from database
      await fetchAllData();
      return newContract;
    },
    [applications, fetchAllData]
  );

  const rejectApplication = useCallback(
    async (applicationId: string, _currentUserId?: string) => {
      const targetApp = applications.find((a) => a.id === applicationId);
      const projectId = targetApp ? targetApp.projectId : "";

      if (!projectId) {
        throw new Error("Cannot reject application: Project ID not found.");
      }

      await apiClient.rejectApplication(projectId, applicationId);
      setApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, status: "REJECTED" as const } : a))
      );
    },
    [applications]
  );

  // ── Milestone & Submission Actions ────────────────────────────────────────
  const submitDeliverable = useCallback(
    async (
      contractId: string,
      milestoneId: string,
      submission: DeliverableSubmission
    ) => {
      await apiClient.submitDeliverable(contractId, milestoneId, {
        submissionType: submission.submissionType || "URL",
        submissionUrl: submission.submissionUrl,
        fileName: submission.fileName,
        notes: submission.notes,
      });

      // Refetch live contract state
      const updatedContract = await apiClient.getContract(contractId).catch(() => null);
      if (updatedContract) {
        setContracts((prev) =>
          prev.map((c) => (c.id === contractId ? updatedContract : c))
        );
      }
    },
    []
  );

  const approveMilestone = useCallback(
    async (contractId: string, milestoneId: string) => {
      const updatedContract = await apiClient.approveMilestone(contractId, milestoneId);
      if (updatedContract) {
        setContracts((prev) =>
          prev.map((c) => (c.id === contractId ? updatedContract : c))
        );
      }
      await fetchAllData();
    },
    [fetchAllData]
  );

  const requestMilestoneRevision = useCallback(
    async (
      contractId: string,
      milestoneId: string,
      revisionData:
        | {
            feedback: string;
            specificCorrections?: string;
            additionalInstructions?: string;
            requestedBy?: string;
          }
        | string
    ) => {
      const payload =
        typeof revisionData === "string"
          ? { feedback: revisionData }
          : {
              feedback: revisionData.feedback,
              specificCorrections: revisionData.specificCorrections,
              additionalInstructions: revisionData.additionalInstructions,
            };

      await apiClient.requestRevision(contractId, milestoneId, payload);

      const updatedContract = await apiClient.getContract(contractId).catch(() => null);
      if (updatedContract) {
        setContracts((prev) =>
          prev.map((c) => (c.id === contractId ? updatedContract : c))
        );
      }
    },
    []
  );

  const updateSubtaskStatus = useCallback(
    (
      contractId: string,
      milestoneId: string,
      subtaskId: string,
      status: "PENDING" | "IN_PROGRESS" | "COMPLETED"
    ) => {
      setContracts((prev) =>
        prev.map((contract) => {
          if (contract.id !== contractId) return contract;
          return {
            ...contract,
            milestones: contract.milestones.map((ms) => {
              if (ms.id !== milestoneId || !ms.subtasks) return ms;
              return {
                ...ms,
                subtasks: ms.subtasks.map((st) =>
                  st.id === subtaskId ? { ...st, status } : st
                ),
              };
            }),
          };
        })
      );
    },
    []
  );

  const createPayPalEscrowOrder = useCallback(async (contractId: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const res = await apiClient.createPayPalEscrowOrder(contractId, {
      returnUrl: `${origin}/client/dashboard?tab=contracts&paypal=success&contractId=${contractId}`,
      cancelUrl: `${origin}/client/dashboard?tab=contracts&paypal=cancel&contractId=${contractId}`,
    });
    return {
      orderId: res.orderId,
      approvalUrl: res.approvalUrl,
      mode: res.mode,
    };
  }, []);

  const authorizePayPalEscrow = useCallback(
    async (contractId: string, orderId?: string, simulate?: boolean) => {
      await apiClient.authorizePayPalEscrow(contractId, { orderId, simulate });
      await fetchAllData();
    },
    [fetchAllData]
  );

  const releaseMilestoneOverride = useCallback(
    async (contractId: string, milestoneId: string, password: string, reason?: string) => {
      const updated = await apiClient.releaseMilestoneOverride(contractId, milestoneId, password, reason);
      if (updated) {
        setContracts((prev) => prev.map((c) => (c.id === contractId ? updated : c)));
      }
      await fetchAllData();
    },
    [fetchAllData]
  );

  const releaseContractUpfront = useCallback(
    async (contractId: string, password: string, reason?: string) => {
      const updated = await apiClient.releaseContractUpfront(contractId, password, reason);
      if (updated) {
        setContracts((prev) => prev.map((c) => (c.id === contractId ? updated : c)));
      }
      await fetchAllData();
    },
    [fetchAllData]
  );

  return (
    <MarketplaceContext.Provider
      value={{
        projects,
        contracts,
        activeContract,
        applications,
        createProject,
        updateProject,
        submitApplication,
        acceptApplication,
        rejectApplication,
        submitDeliverable,
        approveMilestone,
        requestMilestoneRevision,
        updateSubtaskStatus,
        createPayPalEscrowOrder,
        authorizePayPalEscrow,
        releaseMilestoneOverride,
        releaseContractUpfront,
        refreshMarketplace: fetchAllData,
        isLoading,
      }}
    >
      {children}
    </MarketplaceContext.Provider>
  );
};

export function useMarketplace() {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error("useMarketplace must be used within a MarketplaceProvider");
  }
  return context;
}
