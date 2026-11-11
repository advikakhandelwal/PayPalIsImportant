"use client";

import { formatCurrency } from "@/lib/utils";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  DisputeCase,
  DisputeStatus,
  DisputeCategory,
  DisputeSettlementCase,
  UserRole,
  AIDisputeRecommendation,
  NegotiationEntry,
  FinalSettlement,
} from "@/types";

const LS_DISPUTES = "tp_demo_disputes";

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
    // quota exceeded fallback
  }
}

interface RaiseDisputeInput {
  contractId: string;
  projectId: string;
  clientId: string;
  clientName: string;
  freelancerId: string;
  freelancerName: string;
  freelancerEmail?: string;
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
  totalBudget: number;
  currency: string;
}

interface DisputeContextType {
  disputes: DisputeCase[];
  isHydrated: boolean;
  getDisputeByContractId: (contractId: string) => DisputeCase | undefined;
  raiseDispute: (input: RaiseDisputeInput) => DisputeCase;
  generateAIRecommendation: (disputeId: string, totalBudget: number, currency: string) => void;
  approveAIRecommendation: (disputeId: string, role: UserRole) => void;
  proposeCounteroffer: (
    disputeId: string,
    offeredBy: UserRole,
    offeredByName: string,
    amount: number,
    currency: string,
    reason: string
  ) => boolean;
  acceptNegotiationOffer: (disputeId: string, offerId: string) => void;
  rejectNegotiation: (disputeId: string) => void;
  submitFinalSettlement: (
    disputeId: string,
    data: {
      freelancerAmount: number;
      clientAmount: number;
      currency: string;
      notes: string;
      proposedBy: UserRole;
    }
  ) => void;
  acceptFinalSettlement: (disputeId: string) => void;
  rejectFinalSettlement: (disputeId: string) => void;
}

const DisputeContext = createContext<DisputeContextType | undefined>(undefined);

export const DisputeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [disputes, setDisputes] = useState<DisputeCase[]>([]);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = readLS<DisputeCase[] | null>(LS_DISPUTES, null);
      if (saved && Array.isArray(saved) && saved.length > 0) {
        setDisputes(saved);
      }
    } catch {
      // Safe fallback
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (isHydrated) {
      writeLS(LS_DISPUTES, disputes);
    }
  }, [disputes, isHydrated]);

  const getDisputeByContractId = useCallback(
    (contractId: string) => {
      return disputes.find((d) => d.contractId === contractId);
    },
    [disputes]
  );

  const raiseDispute = useCallback((input: RaiseDisputeInput): DisputeCase => {
    const existing = disputes.find((d) => d.contractId === input.contractId);
    if (existing) return existing;

    // Build intelligent advisory AI recommendation upfront
    const halfBudget = Math.round(input.totalBudget * 0.6);
    const clientHalf = input.totalBudget - halfBudget;

    const initialAiRecommendation: AIDisputeRecommendation = {
      freelancerAmount: halfBudget,
      clientAmount: clientHalf,
      currency: input.currency,
      confidenceScore: 89,
      isAdvisoryOnly: true,
      generatedAt: new Date().toISOString(),
      explanation: `Advisory analysis indicates the foundational contract deliverables and architecture specifications meet requirements (approx. 60% completion). Subsequent deliverable milestones exhibit discrepancies in test coverage and performance benchmarks. Recommended equitable settlement: disburse 60% to Talent and refund 40% to Client.`,
      evidence: [
        "Repository commit cadence and code architecture verified",
        "Milestone 1 delivered on schedule with passing unit tests",
        "Milestone 2 deliverable lacks end-to-end integration test documentation",
        "Client submitted detailed revision notes highlighting missing latency metrics",
      ],
      completedWorkBreakdown: `Architecture diagrams, database schemas, and primary CRUD endpoints verified against initial specifications (${formatCurrency(halfBudget, input.currency)} value).`,
      disputedWorkBreakdown: `Load testing reports and third-party API webhook error handling omitted from final package (${formatCurrency(clientHalf, input.currency)} value).`,
    };

    const newDispute: DisputeCase = {
      id: `disp-${Date.now()}`,
      contractId: input.contractId,
      projectId: input.projectId,
      clientId: input.clientId,
      clientName: input.clientName,
      freelancerId: input.freelancerId,
      freelancerName: input.freelancerName,
      freelancerEmail: input.freelancerEmail,
      initiatorRole: input.initiatorRole,
      initiatorName: input.initiatorName,
      reason: input.reason,
      category: input.category,
      explanation: input.explanation,
      expectedResolution: input.expectedResolution,
      evidenceNotes: input.evidenceNotes,
      evidenceLinks: input.evidenceLinks || [],
      milestoneId: input.milestoneId,
      milestoneTitle: input.milestoneTitle,
      status: "AI_RECOMMENDATION_READY",
      activeCase: "CASE_1_MUTUAL_AI_APPROVAL",
      clientApprovedAI: false,
      freelancerApprovedAI: false,
      negotiationHistory: [],
      freelancerCounteroffersUsed: 0,
      clientCounteroffersUsed: 0,
      aiRecommendation: initialAiRecommendation,
      aiAdvisoryRecommendation: {
        suggestedTalentPayoutPercentage: 60,
        suggestedClientRefundPercentage: 40,
        rationale: initialAiRecommendation.explanation,
        confidenceScore: 89,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDisputes((prev) => [newDispute, ...prev]);
    return newDispute;
  }, [disputes]);

  const generateAIRecommendation = useCallback(
    (disputeId: string, totalBudget: number, currency: string) => {
      setDisputes((prev) =>
        prev.map((d) => {
          if (d.id !== disputeId) return d;
          const freelancerAmount = Math.round(totalBudget * 0.65);
          const clientAmount = totalBudget - freelancerAmount;

          const rec: AIDisputeRecommendation = {
            freelancerAmount,
            clientAmount,
            currency,
            confidenceScore: 92,
            isAdvisoryOnly: true,
            generatedAt: new Date().toISOString(),
            explanation: `Advisory analysis of submitted deliverables and project documentation suggests 65% of required specifications have been successfully implemented. A split of ${formatCurrency(freelancerAmount, currency)} to talent and ${formatCurrency(clientAmount, currency)} refund to client provides an equitable resolution.`,
            evidence: [
              "Core repository commits verified",
              "Deliverable checklist comparison: 6 of 8 criteria fulfilled",
              "Partial revision requests addressed in latest submission",
            ],
            completedWorkBreakdown: `Primary backend endpoints and schema migrations verified (${formatCurrency(freelancerAmount, currency)} value).`,
            disputedWorkBreakdown: `High-concurrency stress testing and user guide remain pending (${formatCurrency(clientAmount, currency)} value).`,
          };

          return {
            ...d,
            aiRecommendation: rec,
            status: "AI_RECOMMENDATION_READY",
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    []
  );

  const approveAIRecommendation = useCallback((disputeId: string, role: UserRole) => {
    setDisputes((prev) =>
      prev.map((d) => {
        if (d.id !== disputeId) return d;

        const clientApproved = role === "CLIENT" ? true : d.clientApprovedAI;
        const freelancerApproved = role === "FREELANCER" ? true : d.freelancerApprovedAI;

        // If both approved -> RESOLVED with Case 1
        if (clientApproved && freelancerApproved) {
          const flAmount = d.aiRecommendation?.freelancerAmount ?? 0;
          const clAmount = d.aiRecommendation?.clientAmount ?? 0;
          const curr = d.aiRecommendation?.currency ?? "USD";

          return {
            ...d,
            clientApprovedAI: true,
            freelancerApprovedAI: true,
            status: "RESOLVED" as DisputeStatus,
            activeCase: "CASE_1_MUTUAL_AI_APPROVAL" as DisputeSettlementCase,
            resolution: {
              freelancerAmount: flAmount,
              clientAmount: clAmount,
              currency: curr,
              resolvedAt: new Date().toISOString(),
              resolvedBy: "MUTUAL_AI_APPROVAL",
              notes: `Both parties accepted the AI Advisory Recommendation. Payout: ${formatCurrency(flAmount, curr)} to Talent, ${formatCurrency(clAmount, curr)} refund to Client.`,
              talentPayout: flAmount,
              clientRefund: clAmount,
            },
            updatedAt: new Date().toISOString(),
          };
        }

        // Otherwise update the respective approval flag and set awaiting status
        const nextStatus: DisputeStatus =
          role === "CLIENT"
            ? "AWAITING_FREELANCER_APPROVAL"
            : "AWAITING_CLIENT_APPROVAL";

        return {
          ...d,
          clientApprovedAI: clientApproved,
          freelancerApprovedAI: freelancerApproved,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, []);

  const proposeCounteroffer = useCallback(
    (
      disputeId: string,
      offeredBy: UserRole,
      offeredByName: string,
      amount: number,
      currency: string,
      reason: string
    ): boolean => {
      let allowed = false;

      setDisputes((prev) =>
        prev.map((d) => {
          if (d.id !== disputeId) return d;

          const isClient = offeredBy === "CLIENT";
          const currentCount = isClient
            ? d.clientCounteroffersUsed
            : d.freelancerCounteroffersUsed;

          if (currentCount >= 2) {
            allowed = false;
            return d;
          }

          allowed = true;

          const newEntry: NegotiationEntry = {
            id: `neg-${Date.now()}`,
            offeredBy,
            offeredByName,
            amount,
            currency,
            reason,
            timestamp: new Date().toISOString(),
            status: "PENDING",
          };

          const newClientCount = isClient ? d.clientCounteroffersUsed + 1 : d.clientCounteroffersUsed;
          const newFreelancerCount = !isClient ? d.freelancerCounteroffersUsed + 1 : d.freelancerCounteroffersUsed;

          // Determine case
          const activeCase: DisputeSettlementCase = isClient
            ? "CASE_2_CLIENT_LOWER_OFFER"
            : "CASE_3_FREELANCER_RAISE_OFFER";

          // Mark previous pending offers as COUNTERED
          const updatedHistory = d.negotiationHistory.map((h) =>
            h.status === "PENDING" ? { ...h, status: "COUNTERED" as const } : h
          );

          return {
            ...d,
            negotiationHistory: [...updatedHistory, newEntry],
            clientCounteroffersUsed: newClientCount,
            freelancerCounteroffersUsed: newFreelancerCount,
            status: "NEGOTIATION_ACTIVE" as DisputeStatus,
            activeCase,
            updatedAt: new Date().toISOString(),
          };
        })
      );

      return allowed;
    },
    []
  );

  const acceptNegotiationOffer = useCallback((disputeId: string, offerId: string) => {
    setDisputes((prev) =>
      prev.map((d) => {
        if (d.id !== disputeId) return d;

        const targetOffer = d.negotiationHistory.find((n) => n.id === offerId);
        if (!targetOffer) return d;

        const updatedHistory = d.negotiationHistory.map((h) =>
          h.id === offerId ? { ...h, status: "ACCEPTED" as const } : h
        );

        // Budget allocation
        const total = (d.aiRecommendation?.freelancerAmount ?? 0) + (d.aiRecommendation?.clientAmount ?? 0) || targetOffer.amount;
        const flAmount = targetOffer.amount;
        const clAmount = Math.max(0, total - flAmount);

        return {
          ...d,
          negotiationHistory: updatedHistory,
          status: "RESOLVED" as DisputeStatus,
          resolution: {
            freelancerAmount: flAmount,
            clientAmount: clAmount,
            currency: targetOffer.currency,
            resolvedAt: new Date().toISOString(),
            resolvedBy: "NEGOTIATION",
            notes: `Counteroffer accepted by mutual agreement. Talent receives ${formatCurrency(flAmount, targetOffer.currency)}, Client receives ${formatCurrency(clAmount, targetOffer.currency)}.`,
            talentPayout: flAmount,
            clientRefund: clAmount,
          },
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, []);

  const rejectNegotiation = useCallback((disputeId: string) => {
    setDisputes((prev) =>
      prev.map((d) => {
        if (d.id !== disputeId) return d;
        const updatedHistory = d.negotiationHistory.map((h) =>
          h.status === "PENDING" ? { ...h, status: "REJECTED" as const } : h
        );
        return {
          ...d,
          negotiationHistory: updatedHistory,
          status: "NEGOTIATION_FAILED" as DisputeStatus,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, []);

  const submitFinalSettlement = useCallback(
    (
      disputeId: string,
      data: {
        freelancerAmount: number;
        clientAmount: number;
        currency: string;
        notes: string;
        proposedBy: UserRole;
      }
    ) => {
      setDisputes((prev) =>
        prev.map((d) => {
          if (d.id !== disputeId) return d;

          const settlement: FinalSettlement = {
            freelancerAmount: data.freelancerAmount,
            clientAmount: data.clientAmount,
            currency: data.currency,
            notes: data.notes,
            proposedBy: data.proposedBy,
            proposedAt: new Date().toISOString(),
            status: "PROPOSED",
          };

          return {
            ...d,
            finalSettlement: settlement,
            status: "AWAITING_FREELANCER_ACCEPTANCE" as DisputeStatus,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    []
  );

  const acceptFinalSettlement = useCallback((disputeId: string) => {
    setDisputes((prev) =>
      prev.map((d) => {
        if (d.id !== disputeId || !d.finalSettlement) return d;

        const updatedSettlement: FinalSettlement = {
          ...d.finalSettlement,
          acceptedByFreelancer: true,
          acceptedAt: new Date().toISOString(),
          status: "ACCEPTED",
        };

        return {
          ...d,
          finalSettlement: updatedSettlement,
          status: "RESOLVED" as DisputeStatus,
          resolution: {
            freelancerAmount: d.finalSettlement.freelancerAmount,
            clientAmount: d.finalSettlement.clientAmount,
            currency: d.finalSettlement.currency,
            resolvedAt: new Date().toISOString(),
            resolvedBy: "FINAL_SETTLEMENT",
            notes: d.finalSettlement.notes || "Final settlement agreed by both parties.",
            talentPayout: d.finalSettlement.freelancerAmount,
            clientRefund: d.finalSettlement.clientAmount,
          },
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, []);

  const rejectFinalSettlement = useCallback((disputeId: string) => {
    setDisputes((prev) =>
      prev.map((d) => {
        if (d.id !== disputeId || !d.finalSettlement) return d;

        const updatedSettlement: FinalSettlement = {
          ...d.finalSettlement,
          acceptedByFreelancer: false,
          status: "REJECTED",
        };

        return {
          ...d,
          finalSettlement: updatedSettlement,
          status: "NEGOTIATION_FAILED" as DisputeStatus,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, []);

  return (
    <DisputeContext.Provider
      value={{
        disputes,
        isHydrated,
        getDisputeByContractId,
        raiseDispute,
        generateAIRecommendation,
        approveAIRecommendation,
        proposeCounteroffer,
        acceptNegotiationOffer,
        rejectNegotiation,
        submitFinalSettlement,
        acceptFinalSettlement,
        rejectFinalSettlement,
      }}
    >
      {children}
    </DisputeContext.Provider>
  );
};

export function useDisputes() {
  const context = useContext(DisputeContext);
  if (!context) {
    throw new Error("useDisputes must be used within a DisputeProvider");
  }
  return context;
}
