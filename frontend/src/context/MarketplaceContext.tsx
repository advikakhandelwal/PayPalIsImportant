"use client";

import React, { createContext, useContext, useState } from "react";
import { Project, EscrowContract, Application, MilestoneStatus, DeliverableSubmission } from "@/types";
import { SAMPLE_PROJECTS, SAMPLE_ACTIVE_CONTRACT, SAMPLE_APPLICATIONS } from "@/lib/mockData";

interface MarketplaceContextType {
  projects: Project[];
  activeContract: EscrowContract;
  applications: Application[];
  createProject: (newProject: Omit<Project, "id" | "createdAt">) => void;
  updateProject: (projectId: string, updatedData: Partial<Project>) => void;
  submitApplication: (application: Omit<Application, "id" | "createdAt">) => void;
  submitDeliverable: (contractId: string, milestoneId: string, submission: DeliverableSubmission) => void;
  approveMilestone: (contractId: string, milestoneId: string) => void;
  requestMilestoneRevision: (contractId: string, milestoneId: string, notes: string) => void;
}

const MarketplaceContext = createContext<MarketplaceContextType | undefined>(undefined);

export const MarketplaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>(SAMPLE_PROJECTS);
  const [activeContract, setActiveContract] = useState<EscrowContract>(SAMPLE_ACTIVE_CONTRACT);
  const [applications, setApplications] = useState<Application[]>(SAMPLE_APPLICATIONS);

  // Client creates project with configurable milestones and currency
  const createProject = (newProjectData: Omit<Project, "id" | "createdAt">) => {
    const newProject: Project = {
      ...newProjectData,
      id: `proj-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setProjects((prev) => [newProject, ...prev]);
  };

  // Client updates project
  const updateProject = (projectId: string, updatedData: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, ...updatedData } : p))
    );
  };

  // Freelancer submits application
  const submitApplication = (appData: Omit<Application, "id" | "createdAt">) => {
    const newApp: Application = {
      ...appData,
      id: `app-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setApplications((prev) => [...prev, newApp]);
  };

  // Freelancer submits deliverable
  const submitDeliverable = (contractId: string, milestoneId: string, submission: DeliverableSubmission) => {
    setActiveContract((prev) => {
      if (prev.id !== contractId) return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((ms) =>
          ms.id === milestoneId
            ? { ...ms, status: "IN_REVIEW" as MilestoneStatus, submission }
            : ms
        ),
      };
    });
  };

  // Client approves milestone and releases payout
  const approveMilestone = (contractId: string, milestoneId: string) => {
    setActiveContract((prev) => {
      if (prev.id !== contractId) return prev;
      const targetMilestone = prev.milestones.find((m) => m.id === milestoneId);
      const releasedAmount = targetMilestone ? targetMilestone.paymentAmount : 0;

      return {
        ...prev,
        releasedAmount: prev.releasedAmount + releasedAmount,
        heldInEscrowAmount: Math.max(0, prev.heldInEscrowAmount - releasedAmount),
        milestones: prev.milestones.map((ms, index) => {
          if (ms.id === milestoneId) {
            return { ...ms, status: "RELEASED" as MilestoneStatus };
          }
          // Unlock next milestone if this was the previous one
          const currentIdx = prev.milestones.findIndex((m) => m.id === milestoneId);
          if (index === currentIdx + 1 && ms.status === "LOCKED") {
            return { ...ms, status: "ACTIVE" as MilestoneStatus };
          }
          return ms;
        }),
      };
    });
  };

  // Client requests revision with feedback
  const requestMilestoneRevision = (contractId: string, milestoneId: string, notes: string) => {
    setActiveContract((prev) => {
      if (prev.id !== contractId) return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((ms) => {
          if (ms.id === milestoneId) {
            return {
              ...ms,
              status: "REVISION_REQUESTED" as MilestoneStatus,
              submission: ms.submission
                ? { ...ms.submission, notes: `${ms.submission.notes} | Client Revision Request: ${notes}` }
                : undefined,
            };
          }
          return ms;
        }),
      };
    });
  };

  return (
    <MarketplaceContext.Provider
      value={{
        projects,
        activeContract,
        applications,
        createProject,
        updateProject,
        submitApplication,
        submitDeliverable,
        approveMilestone,
        requestMilestoneRevision,
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
