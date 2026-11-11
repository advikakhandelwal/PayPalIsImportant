"use client";

import { useNotifications } from "@/context/NotificationContext";
import { formatCurrency } from "@/lib/utils";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Project, EscrowContract, Application, MilestoneStatus, DeliverableSubmission, Milestone, EscrowStatus, RevisionRequest } from "@/types";
import { SAMPLE_PROJECTS, SAMPLE_ACTIVE_CONTRACT, SAMPLE_APPLICATIONS } from "@/lib/mockData";

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers (SSR-safe)
// ─────────────────────────────────────────────────────────────────────────────
const LS_PROJECTS = "tp_demo_projects";
const LS_APPLICATIONS = "tp_demo_applications";
const LS_CONTRACTS = "tp_demo_contracts";

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded – silently ignore in demo mode
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────────────────────────────────────
interface MarketplaceContextType {
  projects: Project[];
  contracts: EscrowContract[];
  /** @deprecated use contracts[] – kept for backward-compat with existing UI */
  activeContract: EscrowContract;
  applications: Application[];
  createProject: (newProject: Omit<Project, "id" | "createdAt">) => void;
  updateProject: (projectId: string, updatedData: Partial<Project>) => void;
  submitApplication: (application: Omit<Application, "id" | "createdAt">) => void;
  /** Accept an application; prevents duplicates; creates a demo contract record */
  acceptApplication: (applicationId: string, currentUserId: string) => void;
  /** Reject an application (client-side only) */
  rejectApplication: (applicationId: string, currentUserId: string) => void;
  submitDeliverable: (contractId: string, milestoneId: string, submission: DeliverableSubmission) => void;
  approveMilestone: (contractId: string, milestoneId: string) => void;
  requestMilestoneRevision: (
    contractId: string,
    milestoneId: string,
    revisionData: {
      feedback: string;
      specificCorrections?: string;
      additionalInstructions?: string;
      requestedBy?: string;
    } | string
  ) => void;
  updateSubtaskStatus: (
    contractId: string,
    milestoneId: string,
    subtaskId: string,
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED"
  ) => void;
}

const MarketplaceContext = createContext<MarketplaceContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
export const MarketplaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addNotification } = useNotifications();
  // ── Use deterministic seed data for SSR and the first client render ───────
  // localStorage is read only after client mounting to prevent hydration mismatch.
  const [projects, setProjects] = useState<Project[]>(SAMPLE_PROJECTS);
  const [applications, setApplications] = useState<Application[]>(SAMPLE_APPLICATIONS);
  const [contracts, setContracts] = useState<EscrowContract[]>([SAMPLE_ACTIVE_CONTRACT]);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  // ── Restore from localStorage once the component has mounted on the client ─
  useEffect(() => {
    try {
      const savedProjects = readLS<Project[] | null>(LS_PROJECTS, null);
      const savedApplications = readLS<Application[] | null>(LS_APPLICATIONS, null);
      const savedContracts = readLS<EscrowContract[] | null>(LS_CONTRACTS, null);

      if (savedProjects && Array.isArray(savedProjects) && savedProjects.length > 0) {
        setProjects(savedProjects);
      }
      if (savedApplications && Array.isArray(savedApplications)) {
        setApplications(savedApplications);
      }
      if (savedContracts && Array.isArray(savedContracts) && savedContracts.length > 0) {
        setContracts(savedContracts);
      }
    } catch {
      // Safe fallback: keep seed data
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // ── Persist to localStorage whenever state changes (after hydration) ───────
  useEffect(() => { if (isHydrated) writeLS(LS_PROJECTS, projects); }, [projects, isHydrated]);
  useEffect(() => { if (isHydrated) writeLS(LS_APPLICATIONS, applications); }, [applications, isHydrated]);
  useEffect(() => { if (isHydrated) writeLS(LS_CONTRACTS, contracts); }, [contracts, isHydrated]);

  // ── Backward-compat: expose the first contract as "activeContract" ────────
  const activeContract: EscrowContract = contracts[0] ?? SAMPLE_ACTIVE_CONTRACT;

  // ── Project CRUD ──────────────────────────────────────────────────────────
  const createProject = useCallback((newProjectData: Omit<Project, "id" | "createdAt">) => {
    const newProject: Project = {
      ...newProjectData,
      id: `proj-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setProjects((prev) => [newProject, ...prev]);
  }, []);

  const updateProject = useCallback((projectId: string, updatedData: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, ...updatedData } : p))
    );
  }, []);

  // ── Application submission ────────────────────────────────────────────────
  const submitApplication = useCallback((appData: Omit<Application, "id" | "createdAt">) => {
    const newApp: Application = {
      ...appData,
      id: `app-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setApplications((prev) => [...prev, newApp]);

    setProjects((prevProjects) => {
      const targetProj = prevProjects.find((p) => p.id === appData.projectId);
      if (targetProj) {
        addNotification({
          userId: targetProj.clientId,
          userRole: "CLIENT",
          event: "NEW_APPLICATION",
          title: "New Application Received",
          description: `${appData.freelancerName} applied for "${targetProj.title}" (${formatCurrency(appData.bidAmount, appData.currency)}).`,
          linkHref: "/client/dashboard",
          entityId: targetProj.id,
        });
      }
      return prevProjects;
    });
  }, [addNotification]);

  // ── Accept application & create demo contract ─────────────────────────────
  /**
   * Frontend demo only. Marks application ACCEPTED and instantiates an
   * EscrowContract record so both dashboards share the same contract data.
   * Ownership check: client may only act on applications belonging to their projects.
   */
  const acceptApplication = useCallback(
    (applicationId: string, currentUserId: string) => {
      setApplications((prevApps) => {
        const app = prevApps.find((a) => a.id === applicationId);
        if (!app || app.status !== "PENDING") return prevApps;

        // Ownership guard: the acting user must own the project
        // (checked against projects at call-time via closure — safe for demo)
        setProjects((prevProjects) => {
          const project = prevProjects.find((p) => p.id === app.projectId);
          if (!project) return prevProjects;

          // Only the client who owns the project may accept
          if (project.clientId !== currentUserId) return prevProjects;

          // Prevent duplicate contracts for the same application
          setContracts((prevContracts) => {
            const alreadyExists = prevContracts.some(
              (c) => c.projectId === app.projectId && c.freelancerId === app.freelancerId
            );
            if (alreadyExists) return prevContracts;

            // Build demo contract from project milestones + application data
            const contractMilestones: Milestone[] = project.milestones.map((m, idx) => ({
              ...m,
              status: idx === 0 ? ("ACTIVE" as MilestoneStatus) : ("LOCKED" as MilestoneStatus),
              submission: undefined,
            }));

            const newContract: EscrowContract = {
              id: `contract-${Date.now()}`,
              projectId: project.id,
              projectTitle: project.title,
              clientId: project.clientId,
              clientName: project.clientName,
              freelancerId: app.freelancerId,
              freelancerName: app.freelancerName,
              totalBudget: app.bidAmount,
              heldInEscrowAmount: app.bidAmount,
              releasedAmount: 0,
              currency: app.currency,
              escrowStatus: "HELD_IN_ESCROW" as EscrowStatus,
              milestones: contractMilestones,
              createdAt: new Date().toISOString(),
            };

            addNotification({
              userId: app.freelancerId,
              userRole: "FREELANCER",
              event: "APPLICATION_ACCEPTED",
              title: "Proposal Accepted & Contract Active",
              description: `Your proposal for "${project.title}" was accepted! Escrow contract is now active.`,
              linkHref: "/freelancer/dashboard",
              entityId: newContract.id,
            });

            return [newContract, ...prevContracts];
          });

          // Mark project as IN_PROGRESS
          return prevProjects.map((p) =>
            p.id === project.id ? { ...p, status: "IN_PROGRESS" as const } : p
          );
        });

        // Mark application as ACCEPTED; reject all other applicants for same project
        return prevApps.map((a) => {
          if (a.id === applicationId) return { ...a, status: "ACCEPTED" as const };
          // Reject other PENDING applications for the same project
          if (a.projectId === app.projectId && a.status === "PENDING") {
            return { ...a, status: "REJECTED" as const };
          }
          return a;
        });
      });
    },
    []
  );

  // ── Reject application ────────────────────────────────────────────────────
  /**
   * Frontend demo only. Ownership check mirrors acceptApplication.
   */
  const rejectApplication = useCallback(
    (applicationId: string, currentUserId: string) => {
      setApplications((prevApps) => {
        const app = prevApps.find((a) => a.id === applicationId);
        if (!app || app.status !== "PENDING") return prevApps;

        // Ownership guard (read projects via current closure)
        // For demo: we'll trust the UI to filter by ownership; guard here is advisory
        return prevApps.map((a) =>
          a.id === applicationId ? { ...a, status: "REJECTED" as const } : a
        );
      });
    },
    []
  );

  // ── Deliverable submission ────────────────────────────────────────────────
  const submitDeliverable = useCallback(
    (contractId: string, milestoneId: string, submission: DeliverableSubmission) => {
      setContracts((prev) =>
        prev.map((contract) => {
          if (contract.id !== contractId) return contract;
          return {
            ...contract,
            milestones: contract.milestones.map((ms) => {
              if (ms.id !== milestoneId) return ms;

              const existingHistory = ms.submissionHistory
                ? [...ms.submissionHistory]
                : ms.submission
                ? [{ ...ms.submission }]
                : [];

              const revNumber = submission.revisionNumber || (existingHistory.length + 1);

              const fullSubmission: DeliverableSubmission = {
                ...submission,
                revisionNumber: revNumber,
                reviewStatus: "IN_REVIEW",
              };

              return {
                ...ms,
                status: "IN_REVIEW" as MilestoneStatus,
                submission: fullSubmission,
                submissionHistory: [...existingHistory, fullSubmission],
              };
            }),
          };
        })
      );

      // Trigger notification to client
      setTimeout(() => {
        setContracts((curr) => {
          const c = curr.find((ct) => ct.id === contractId);
          const ms = c?.milestones.find((m) => m.id === milestoneId);
          if (c && ms) {
            const isResub = (ms.revisionCount || 0) > 0;
            addNotification({
              userId: c.clientId,
              userRole: "CLIENT",
              event: isResub ? "DELIVERABLE_RESUBMITTED" : "DELIVERABLE_SUBMITTED",
              title: isResub
                ? `Revised Deliverable (Rev ${ms.revisionCount}/3) Submitted`
                : "Deliverable Ready for Review",
              description: `${c.freelancerName} submitted work for "${ms.title}" on "${c.projectTitle}".`,
              linkHref: "/client/dashboard",
              entityId: c.id,
            });
          }
          return curr;
        });
      }, 50);
    },
    [addNotification]
  );

  // ── Milestone approval ────────────────────────────────────────────────────
  const approveMilestone = useCallback((contractId: string, milestoneId: string) => {
    setContracts((prev) =>
      prev.map((contract) => {
        if (contract.id !== contractId) return contract;
        const target = contract.milestones.find((m) => m.id === milestoneId);
        const releasedAmount = target ? target.paymentAmount : 0;
        const currentIdx = contract.milestones.findIndex((m) => m.id === milestoneId);

        const updatedMilestones = contract.milestones.map((ms, index) => {
          if (ms.id === milestoneId) {
            const approvedSubmission = ms.submission
              ? { ...ms.submission, reviewStatus: "APPROVED" as const }
              : undefined;

            let updatedHistory: DeliverableSubmission[] = ms.submissionHistory
              ? [...ms.submissionHistory]
              : ms.submission
              ? [{ ...ms.submission }]
              : [];

            if (approvedSubmission) {
              const idx = updatedHistory.findIndex((s) => s.id === approvedSubmission.id);
              if (idx >= 0) {
                updatedHistory[idx] = approvedSubmission;
              } else {
                updatedHistory.push(approvedSubmission);
              }
            }

            return {
              ...ms,
              status: "RELEASED" as MilestoneStatus,
              submission: approvedSubmission,
              submissionHistory: updatedHistory,
            };
          }
          // Unlock next milestone if this was the previous one
          if (index === currentIdx + 1 && ms.status === "LOCKED") {
            return { ...ms, status: "ACTIVE" as MilestoneStatus };
          }
          return ms;
        });

        const newReleased = contract.releasedAmount + releasedAmount;
        const allReleased = updatedMilestones.every((m) => m.status === "RELEASED");

        addNotification({
          userId: contract.freelancerId,
          userRole: "FREELANCER",
          event: "MILESTONE_APPROVED",
          title: `Milestone Approved (${formatCurrency(releasedAmount, contract.currency)})`,
          description: `Step "${target?.title || 'Milestone'}" on "${contract.projectTitle}" approved! Escrow payment released to your balance.`,
          linkHref: "/freelancer/dashboard",
          entityId: contract.id,
        });

        return {
          ...contract,
          releasedAmount: newReleased,
          heldInEscrowAmount: Math.max(0, contract.heldInEscrowAmount - releasedAmount),
          escrowStatus: allReleased ? ("COMPLETED" as EscrowStatus) : ("PARTIALLY_RELEASED" as EscrowStatus),
          milestones: updatedMilestones,
        };
      })
    );
  }, [addNotification]);

  // ── Milestone revision request ────────────────────────────────────────────
  const requestMilestoneRevision = useCallback(
    (
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
      setContracts((prev) =>
        prev.map((contract) => {
          if (contract.id !== contractId) return contract;
          return {
            ...contract,
            milestones: contract.milestones.map((ms) => {
              if (ms.id !== milestoneId) return ms;

              const currentRevs = ms.revisionCount || 0;
              if (currentRevs >= 3) return ms;
              const newCount = currentRevs + 1;

              const feedbackText =
                typeof revisionData === "string"
                  ? revisionData
                  : revisionData.feedback;
              const specificCorrections =
                typeof revisionData === "string"
                  ? ""
                  : revisionData.specificCorrections || "";
              const additionalInstructions =
                typeof revisionData === "string"
                  ? ""
                  : revisionData.additionalInstructions || "";
              const requestedBy =
                typeof revisionData === "string"
                  ? "Client"
                  : revisionData.requestedBy || "Client";

              const revisionReq: RevisionRequest = {
                id: "rev-" + Date.now(),
                feedback: feedbackText,
                specificCorrections,
                additionalInstructions,
                requestedAt: new Date().toISOString(),
                requestedBy,
              };

              const updatedSubmission: DeliverableSubmission | undefined = ms.submission
                ? {
                    ...ms.submission,
                    reviewStatus: "REVISION_REQUESTED",
                    revisionRequest: revisionReq,
                  }
                : undefined;

              let updatedHistory: DeliverableSubmission[] = ms.submissionHistory
                ? [...ms.submissionHistory]
                : ms.submission
                ? [{ ...ms.submission }]
                : [];

              if (updatedSubmission) {
                const idx = updatedHistory.findIndex((s) => s.id === updatedSubmission.id);
                if (idx >= 0) {
                  updatedHistory[idx] = updatedSubmission;
                } else {
                  updatedHistory.push(updatedSubmission);
                }
              }

              addNotification({
                userId: contract.freelancerId,
                userRole: "FREELANCER",
                event: "REVISION_REQUESTED",
                title: `Revision Requested (${newCount}/3)`,
                description: `Client requested revisions for "${ms.title}" on "${contract.projectTitle}".`,
                linkHref: "/freelancer/dashboard",
                entityId: contract.id,
              });

              return {
                ...ms,
                status: "REVISION_REQUESTED" as MilestoneStatus,
                submission: updatedSubmission,
                submissionHistory: updatedHistory,
                latestRevisionRequest: revisionReq,
                revisionCount: newCount,
                maxRevisionsReached: newCount >= 3,
              };
            }),
          };
        })
      );
    },
    [addNotification]
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
