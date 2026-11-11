"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ContractChatPanel } from "@/components/contracts/ContractChatPanel";
import { PayPalSmartButtons } from "@/components/paypal/PayPalSmartButtons";
import { apiClient } from "@/services/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatCurrency, formatDate, getMilestoneStatusInfo, getEscrowStatusInfo } from "@/lib/utils";
import { Milestone, Project, Application, MilestoneStatus, MilestoneSubtask, FreelancerCV } from "@/types";
import {
  LayoutDashboard,
  FolderKanban,
  PlusCircle,
  Users,
  Lock,
  Building,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Edit3,
  X,
  Send,
  Layers,
  Trash2,
  Eye,
  ArrowLeft,
  Briefcase,
  FileText,
  DollarSign,
  Calendar,
  Check,
  History,
  ChevronDown,
  MapPin,
  Download,
  FileCheck,
  Award,
} from "lucide-react";

type ClientTab = "overview" | "projects" | "post" | "proposals" | "contracts" | "profile" | "details";

interface MilestoneDraft {
  id?: string;
  title: string;
  description: string;
  percentage: number;
  paymentAmount: number;
  deadline: string;
  subtasks?: MilestoneSubtask[];
  subtasksApproved?: boolean;
  aiSubdivisionReasoning?: string;
}

const POPULAR_SKILLS = [
  "Next.js",
  "React",
  "TypeScript",
  "Tailwind CSS",
  "FastAPI",
  "Python",
  "Gemini AI",
  "Node.js",
  "UI/UX Design",
  "4K Video Editing",
  "PostgreSQL",
  "Smart Contracts",
];

function ClientDashboardContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as ClientTab) || "overview";
  const initialProjectId = searchParams.get("id") || "";

  const { currentUser, activeRole, setActiveRole, updateProfile, isHydrated } = useAuth();
  const {
    projects,
    applications,
    contracts,
    activeContract,
    createProject,
    updateProject,
    acceptApplication,
    rejectApplication,
    approveMilestone,
    requestMilestoneRevision,
    createPayPalEscrowOrder,
    authorizePayPalEscrow,
    releaseMilestoneOverride,
    releaseContractUpfront,
    refreshMarketplace,
  } = useMarketplace();

  // Frontend UI route guard: show access-denied state if wrong role.
  // NOTE: This is demo-only UI filtering. Real security lives in the backend.
  const isClientRole = activeRole === 'CLIENT' || currentUser.role === 'CLIENT';

  const [activeTab, setActiveTab] = useState<ClientTab>(initialTab);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId);

  // Sync tab if URL param changes
  useEffect(() => {
    const tabParam = searchParams.get("tab") as ClientTab;
    if (
      tabParam &&
      ["overview", "projects", "post", "proposals", "contracts", "profile", "details"].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }
    const idParam = searchParams.get("id");
    if (idParam) {
      setSelectedProjectId(idParam);
    }
  }, [searchParams]);

  // Project Creation Wizard State: 'form' | 'preview'
  const [wizardStep, setWizardStep] = useState<"form" | "preview">("form");
  const [isEditingExisting, setIsEditingExisting] = useState<boolean>(false);
  const [editingProjectId, setEditingProjectId] = useState<string>("");

  // Form Fields (USD-only settlement for PayPal Escrow compatibility)
  const [newTitle, setNewTitle] = useState("");
  const [newDomain, setNewDomain] = useState("Full-Stack Development");
  const [newTotalBudget, setNewTotalBudget] = useState<number>(2000);
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newDeadline, setNewDeadline] = useState("2026-12-15");
  const [newDescription, setNewDescription] = useState("");
  const [newSkills, setNewSkills] = useState<string[]>(["React", "TypeScript", "Tailwind CSS"]);
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [newExperienceLevel, setNewExperienceLevel] = useState<"Entry" | "Intermediate" | "Expert">("Intermediate");
  const [newAdditionalRequirements, setNewAdditionalRequirements] = useState("");

  // Milestone Builder State with AI-assisted subdivision
  const [newMilestones, setNewMilestones] = useState<MilestoneDraft[]>([
    {
      title: "Architecture & Foundation Setup",
      description: "Project scaffolding, core contracts, and responsive layout.",
      percentage: 25,
      paymentAmount: 500,
      deadline: "2026-11-20",
      subtasksApproved: true,
      aiSubdivisionReasoning: "AI Advisory: Milestone divided into 2 technical subtasks totaling 25% of parent budget.",
      subtasks: [
        {
          id: "st-draft-1",
          stepNumber: "1.1",
          title: "Technical Blueprint & Design Tokens",
          description: "Establish design tokens, App Router layout, and contracts.",
          percentageOfMilestone: 40,
          percentageOfTotal: 10,
          paymentAmount: 200,
          currency: "USD",
          status: "PENDING",
          aiReasoning: "Foundational setup requires 40% of parent milestone workload.",
        },
        {
          id: "st-draft-2",
          stepNumber: "1.2",
          title: "TypeScript Domain Contracts & State Structure",
          description: "Setup App Router structure and initial state models.",
          percentageOfMilestone: 60,
          percentageOfTotal: 15,
          paymentAmount: 300,
          currency: "USD",
          status: "PENDING",
          aiReasoning: "State logic and scaffolding comprises 60% of milestone scope.",
        },
      ],
    },
    {
      title: "Core Feature Implementation",
      description: "Main feature delivery, backend endpoint integration, and responsive verification.",
      percentage: 50,
      paymentAmount: 1000,
      deadline: "2026-12-05",
      subtasksApproved: true,
      aiSubdivisionReasoning: "AI Advisory: Milestone divided into 2 technical subtasks totaling 50% of parent budget.",
      subtasks: [
        {
          id: "st-draft-3",
          stepNumber: "2.1",
          title: "Core Workflow & Component Modules",
          description: "Implement interactive dashboard panels and business logic.",
          percentageOfMilestone: 60,
          percentageOfTotal: 30,
          paymentAmount: 600,
          currency: "USD",
          status: "PENDING",
          aiReasoning: "Core module development represents 60% of milestone effort.",
        },
        {
          id: "st-draft-4",
          stepNumber: "2.2",
          title: "Integration & Dropzone Handlers",
          description: "Form verification, submission endpoints, and error boundaries.",
          percentageOfMilestone: 40,
          percentageOfTotal: 20,
          paymentAmount: 400,
          currency: "USD",
          status: "PENDING",
          aiReasoning: "Integration and validation comprises 40% of milestone effort.",
        },
      ],
    },
    {
      title: "Testing, Audit & Final Handover",
      description: "Criteria verification checklist, zero-leak scan, and documentation handover.",
      percentage: 25,
      paymentAmount: 500,
      deadline: "2026-12-15",
      subtasksApproved: true,
      aiSubdivisionReasoning: "AI Advisory: Milestone divided into 2 technical subtasks totaling 25% of parent budget.",
      subtasks: [
        {
          id: "st-draft-5",
          stepNumber: "3.1",
          title: "Verification Testing & Vulnerability Scan",
          description: "Pass automated linters, accessibility audit, and build trace.",
          percentageOfMilestone: 50,
          percentageOfTotal: 12.5,
          paymentAmount: 250,
          currency: "USD",
          status: "PENDING",
          aiReasoning: "Security and testing audit takes 50% of milestone scope.",
        },
        {
          id: "st-draft-6",
          stepNumber: "3.2",
          title: "Final Packaging & Production Handover",
          description: "Clean artifacts, documentation handover, and deployment checklist.",
          percentageOfMilestone: 50,
          percentageOfTotal: 12.5,
          paymentAmount: 250,
          currency: "USD",
          status: "PENDING",
          aiReasoning: "Handover and release packaging constitutes remaining 50%.",
        },
      ],
    },
  ]);

  const [postError, setPostError] = useState("");
  const [postSuccess, setPostSuccess] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);


  // Proposals Filter State
  const [proposalFilter, setProposalFilter] = useState<"ALL" | "AI_SHORTLIST">("ALL");
  const [filterByProjectId, setFilterByProjectId] = useState<string>("ALL");

  // Ownership-filtered applications: only for this client's own projects
  const myProjectIds = projects
    .filter((p) => p.clientId === currentUser.id)
    .map((p) => p.id);
  const localApplications = applications.filter((a) => myProjectIds.includes(a.projectId));
  // Request Revision Modal State
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [revisionMilestoneId, setRevisionMilestoneId] = useState<string>("");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionErrorMsg, setRevisionErrorMsg] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState("");

  // Candidate Dossier Inspection Modal State
  const [selectedApplicantForReview, setSelectedApplicantForReview] = useState<Application | null>(null);
  const [showCVPreviewModal, setShowCVPreviewModal] = useState<boolean>(false);

  // Edit Company Profile State (with transparent location details)
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [companyName, setCompanyName] = useState(currentUser.companyName || "Acme Global Technologies India Pvt Ltd");
  const [contactName, setContactName] = useState(currentUser.name || "Client Representative");
  const [companyDescription, setCompanyDescription] = useState(currentUser.companyDescription || "Enterprise venture studio building autonomous commerce protocols.");
  const [industry, setIndustry] = useState(currentUser.domain || "Fintech & Autonomous Commerce");
  const [country, setCountry] = useState(currentUser.country || "India");
  const [stateName, setStateName] = useState(currentUser.state || "Karnataka");
  const [city, setCity] = useState(currentUser.city || "Bengaluru");
  const [address, setAddress] = useState(currentUser.address || "Block B, Tech Park, Outer Ring Road, Bellandur");
  const [postalCode, setPostalCode] = useState(currentUser.postalCode || "560103");
  const [profileSuccessMsg, setProfileSuccessMsg] = useState("");

  // AI-Assisted Milestone Subtask Generator
  const handleGenerateAISubtasks = (milestoneIndex: number) => {
    const m = newMilestones[milestoneIndex];
    const p1 = Math.round(m.percentage * 0.4);
    const p2 = m.percentage - p1;
    const a1 = Math.round((newTotalBudget * p1) / 100);
    const a2 = m.paymentAmount - a1;

    const sub1: MilestoneSubtask = {
      id: `st-${Date.now()}-1`,
      stepNumber: `${milestoneIndex + 1}.1`,
      title: `${m.title} - Setup & Specs`,
      description: "Initial design, specifications, and architecture models.",
      percentageOfMilestone: 40,
      percentageOfTotal: p1,
      paymentAmount: a1,
      currency: newCurrency,
      status: "PENDING",
      aiReasoning: "Foundational setup requires approx 40% of milestone workload.",
    };

    const sub2: MilestoneSubtask = {
      id: `st-${Date.now()}-2`,
      stepNumber: `${milestoneIndex + 1}.2`,
      title: `${m.title} - Implementation & Delivery`,
      description: "Core execution, unit verification, and deliverable packaging.",
      percentageOfMilestone: 60,
      percentageOfTotal: p2,
      paymentAmount: a2,
      currency: newCurrency,
      status: "PENDING",
      aiReasoning: "Execution, integration, and delivery comprise remaining 60%.",
    };

    const updated = [...newMilestones];
    updated[milestoneIndex] = {
      ...m,
      subtasks: [sub1, sub2],
      subtasksApproved: true,
      aiSubdivisionReasoning: `AI Advisory: Parent milestone (${m.percentage}%, ${formatCurrency(m.paymentAmount, newCurrency)}) divided into 2 subtasks adding up to exactly ${m.percentage}%.`,
    };
    setNewMilestones(updated);
  };

  // Contracts filtered for this client
  const myContracts = contracts.filter((c) => c.clientId === currentUser.id);
  // For the contracts tab: use a selected contract (default to first owned one)
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const selectedContractForTab =
    myContracts.find((c) => c.id === selectedContractId) ?? myContracts[0] ?? activeContract;
  const escrowStatusInfo = getEscrowStatusInfo(selectedContractForTab.escrowStatus);

  // PayPal Escrow Funding & Audit State
  const [isFundingEscrow, setIsFundingEscrow] = useState(false);
  const [acceptingAppId, setAcceptingAppId] = useState<string | null>(null);
  const [acceptErrorMsg, setAcceptErrorMsg] = useState("");
  const [paypalErrorMsg, setPaypalErrorMsg] = useState("");
  const [paypalTxs, setPaypalTxs] = useState<any[]>([]);
  const [contractSearch, setContractSearch] = useState("");
  const [contractFilter, setContractFilter] = useState<"ALL" | "AWAITING_AUTHORIZATION" | "ACTIVE" | "COMPLETED">("ALL");
  const [pendingEscrowCheckout, setPendingEscrowCheckout] = useState<{
    contractId: string;
    projectTitle: string;
    talentName: string;
    amount: number;
    currency: string;
    orderId: string;
    approvalUrl?: string | null;
    mode: string;
  } | null>(null);
  const [paypalReceipt, setPaypalReceipt] = useState<{
    contractId: string;
    orderId?: string | null;
    authorizationId: string;
    amount: number;
    currency: string;
  } | null>(null);

  // Step-Up Password Security for Escrow Funding & Upfront Overrides
  const [escrowSecurityPassword, setEscrowSecurityPassword] = useState("");
  const [payerPaypalEmail, setPayerPaypalEmail] = useState("");
  const [escrowSecurityVerified, setEscrowSecurityVerified] = useState(false);
  const [escrowSecurityError, setEscrowSecurityError] = useState("");
  const [isVerifyingEscrowPass, setIsVerifyingEscrowPass] = useState(false);

  const [overrideAuthModal, setOverrideAuthModal] = useState<{
    type: "MILESTONE" | "FULL_CONTRACT";
    contractId: string;
    milestoneId?: string;
    title: string;
    amount: number;
    currency: string;
    talentName: string;
  } | null>(null);
  const [overridePassword, setOverridePassword] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState("");
  const [isExecutingOverride, setIsExecutingOverride] = useState(false);

  const filteredContracts = myContracts.filter((c) => {
    const q = contractSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.projectTitle.toLowerCase().includes(q) ||
      c.freelancerName.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (contractFilter === "AWAITING_AUTHORIZATION") return c.escrowStatus === "AWAITING_AUTHORIZATION";
    if (contractFilter === "ACTIVE") return c.escrowStatus === "HELD_IN_ESCROW" || c.escrowStatus === "PARTIALLY_RELEASED";
    if (contractFilter === "COMPLETED") return c.escrowStatus === "COMPLETED";
    return true;
  });

  // Handle PayPal Sandbox checkout redirect return (?paypal=success&token=...&contractId=...)
  useEffect(() => {
    const ppStatus = searchParams.get("paypal");
    const ppToken = searchParams.get("token");
    const ppContractId = searchParams.get("contractId");
    if (!ppStatus) return;

    if (ppStatus === "success" && ppToken && ppContractId) {
      setActiveTab("contracts");
      setSelectedContractId(ppContractId);
      setIsFundingEscrow(true);
      setPaypalErrorMsg("");
      authorizePayPalEscrow(ppContractId, ppToken)
        .then(async () => {
          const updated = await apiClient.getContract(ppContractId).catch(() => null);
          const txs = await apiClient.getPayPalTransactions(ppContractId).catch(() => []);
          setPaypalTxs(txs || []);
          setPaypalReceipt({
            contractId: ppContractId,
            orderId: ppToken,
            authorizationId: updated?.paypalAuthId || ppToken,
            amount: updated?.totalBudget || 0,
            currency: updated?.currency || "USD",
          });
          setActionSuccessMsg("PayPal Escrow Debited & Locked! Funds held safely and Milestone Step 1 is now ACTIVE.");
          setTimeout(() => setActionSuccessMsg(""), 6000);
        })
        .catch((err: any) => {
          setPaypalErrorMsg(err?.message || "Failed to authorize PayPal escrow order.");
        })
        .finally(() => {
          setIsFundingEscrow(false);
          if (typeof window !== "undefined") {
            window.history.replaceState({}, "", "/client/dashboard?tab=contracts");
          }
        });
    } else if (ppStatus === "cancel") {
      setActiveTab("contracts");
      if (ppContractId) setSelectedContractId(ppContractId);
      setPaypalErrorMsg("PayPal escrow checkout was cancelled. Click 'Fund Escrow with PayPal' whenever ready.");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/client/dashboard?tab=contracts");
      }
    }
  }, [searchParams, authorizePayPalEscrow]);

  // Fetch PayPal audit transactions when viewing active contract
  useEffect(() => {
    if (activeTab === "contracts" && selectedContractForTab?.id) {
      apiClient
        .getPayPalTransactions(selectedContractForTab.id)
        .then((txs) => setPaypalTxs(txs || []))
        .catch(() => setPaypalTxs([]));
    }
  }, [activeTab, selectedContractForTab?.id, selectedContractForTab?.escrowStatus, selectedContractForTab?.releasedAmount]);

  const handleFundEscrowWithPayPal = async (contractId: string) => {
    setIsFundingEscrow(true);
    setPaypalErrorMsg("");
    try {
      const order = await createPayPalEscrowOrder(contractId);
      if (order.mode === "mock") {
        await authorizePayPalEscrow(contractId, order.orderId);
        setActionSuccessMsg("PayPal Escrow Authorized! Funds locked and Step 1 is now ACTIVE.");
        setTimeout(() => setActionSuccessMsg(""), 5000);
        const txs = await apiClient.getPayPalTransactions(contractId).catch(() => []);
        setPaypalTxs(txs);
        setIsFundingEscrow(false);
        return;
      }
      setPendingEscrowCheckout({
        contractId: selectedContractForTab.id,
        projectTitle: selectedContractForTab.projectTitle,
        talentName: selectedContractForTab.freelancerName,
        amount: selectedContractForTab.totalBudget,
        currency: selectedContractForTab.currency,
        orderId: order.orderId,
        approvalUrl: order.approvalUrl,
        mode: order.mode,
      });
      setEscrowSecurityVerified(false);
      setEscrowSecurityPassword("");
      setEscrowSecurityError("");
      setIsFundingEscrow(false);
    } catch (err: any) {
      setPaypalErrorMsg(err?.message || "Could not create PayPal escrow order.");
      setIsFundingEscrow(false);
    }
  };

  const handleSmartButtonsAuthorized = useCallback(
    async (res: { orderId?: string | null; authorizationId: string; amount: number; currency: string }) => {
      if (!pendingEscrowCheckout) return;
      const cid = pendingEscrowCheckout.contractId;
      setPendingEscrowCheckout(null);
      setPaypalReceipt({
        contractId: cid,
        orderId: res.orderId,
        authorizationId: res.authorizationId,
        amount: res.amount,
        currency: res.currency,
      });
      await refreshMarketplace();
      const txs = await apiClient.getPayPalTransactions(cid).catch(() => []);
      setPaypalTxs(txs || []);
      setActionSuccessMsg("PayPal Escrow Debited & Locked! Funds held safely and Milestone Step 1 is now ACTIVE.");
      setTimeout(() => setActionSuccessMsg(""), 6000);
    },
    [pendingEscrowCheckout, refreshMarketplace]
  );

  const handleSmartButtonsError = useCallback((msg: string) => {
    setPaypalErrorMsg(msg);
  }, []);

  // Metrics Calculations for Dashboard Overview
  const totalProjectsCount = projects.length;
  const openProjectsCount = projects.filter((p) => p.status === "OPEN").length;
  const inProgressProjectsCount = projects.filter((p) => p.status === "IN_PROGRESS").length;
  const completedProjectsCount = projects.filter((p) => p.status === "COMPLETED").length;

  // Milestone Calculations
  const totalPercentage = newMilestones.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0);
  const totalMilestoneAmounts = newMilestones.reduce((sum, m) => sum + (Number(m.paymentAmount) || 0), 0);

  // Keep milestone amounts synced whenever total budget or percentages change
  const recalculateAmounts = (budget: number, milestonesList: MilestoneDraft[]) => {
    return milestonesList.map((m) => ({
      ...m,
      paymentAmount: Math.round((budget * (Number(m.percentage) || 0)) / 100),
    }));
  };

  const handleBudgetChange = (budgetVal: number) => {
    setNewTotalBudget(budgetVal);
    setNewMilestones((prev) => recalculateAmounts(budgetVal, prev));
  };

  // Add Milestone to Builder
  const handleAddMilestone = () => {
    const nextStep = newMilestones.length + 1;
    const remainingPercentage = Math.max(0, 100 - totalPercentage);
    const newMs: MilestoneDraft = {
      title: `Milestone Step ${nextStep}`,
      description: "Specify deliverable requirements and criteria for this milestone...",
      percentage: remainingPercentage,
      paymentAmount: Math.round((newTotalBudget * remainingPercentage) / 100),
      deadline: newDeadline,
    };
    setNewMilestones((prev) => [...prev, newMs]);
  };

  // Remove Milestone
  const handleRemoveMilestone = (index: number) => {
    if (newMilestones.length <= 1) return;
    setNewMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  // Update Milestone Field
  const handleUpdateMilestone = (index: number, field: keyof MilestoneDraft, value: any) => {
    setNewMilestones((prev) => {
      const updated = prev.map((m, i) => {
        if (i !== index) return m;
        const newM = { ...m, [field]: value };
        if (field === "percentage") {
          const pct = Number(value) || 0;
          newM.paymentAmount = Math.round((newTotalBudget * pct) / 100);
        } else if (field === "paymentAmount") {
          const amt = Number(value) || 0;
          newM.percentage = newTotalBudget > 0 ? Math.round((amt / newTotalBudget) * 100) : 0;
        }
        return newM;
      });
      return updated;
    });
  };

  // Skills Handling
  const handleAddSkill = (skill: string) => {
    const trimmed = skill.trim();
    if (trimmed && !newSkills.includes(trimmed)) {
      setNewSkills((prev) => [...prev, trimmed]);
      setCustomSkillInput("");
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setNewSkills((prev) => prev.filter((s) => s !== skillToRemove));
  };

  // Pre-fill form for Editing
  const handleStartEditProject = (proj: Project) => {
    setIsEditingExisting(true);
    setEditingProjectId(proj.id);
    setNewTitle(proj.title);
    setNewDomain(proj.domain);
    setNewTotalBudget(proj.totalBudget);
    setNewCurrency("USD");
    setNewDeadline(proj.deadline ? proj.deadline.split("T")[0] : "2026-12-15");
    setNewDescription(proj.description);
    setNewSkills(proj.requiredSkills || ["Next.js", "TypeScript"]);
    setNewExperienceLevel((proj.experienceLevel as any) || "Intermediate");
    setNewAdditionalRequirements(proj.additionalRequirements || "");

    const mappedMilestones: MilestoneDraft[] = proj.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      percentage: m.percentage,
      paymentAmount: m.paymentAmount,
      deadline: m.deadline ? m.deadline.split("T")[0] : "2026-12-15",
    }));
    setNewMilestones(mappedMilestones);

    setWizardStep("form");
    setActiveTab("post");
  };

  // Reset Project Creation Form
  const handleResetForm = () => {
    setIsEditingExisting(false);
    setEditingProjectId("");
    setNewTitle("");
    setNewDomain("Full-Stack Development");
    setNewTotalBudget(3000);
    setNewCurrency("USD");
    setNewDeadline("2026-12-15");
    setNewDescription("");
    setNewSkills(["React", "TypeScript", "Tailwind CSS"]);
    setNewExperienceLevel("Intermediate");
    setNewAdditionalRequirements("");
    setNewMilestones([
      {
        title: "Architecture & Foundation Setup",
        description: "Project scaffolding, core contracts, and responsive layout.",
        percentage: 50,
        paymentAmount: 1500,
        deadline: "2026-11-20",
      },
      {
        title: "Testing, Audit & Final Handover",
        description: "Criteria verification checklist, zero-leak scan, and documentation handover.",
        percentage: 50,
        paymentAmount: 1500,
        deadline: "2026-12-15",
      },
    ]);
    setPostError("");
    setWizardStep("form");
  };

  // Validate and Proceed to Preview
  const handleProceedToPreview = (e: React.FormEvent) => {
    e.preventDefault();
    setPostError("");

    if (!newTitle.trim()) {
      setPostError("Project Title is required.");
      return;
    }
    if (!newDescription.trim()) {
      setPostError("Project Description & Scope is required.");
      return;
    }
    if (newTotalBudget <= 0) {
      setPostError("Total Project Budget must be greater than 0.");
      return;
    }
    if (totalPercentage !== 100) {
      setPostError(`Milestone percentages must total exactly 100% (currently ${totalPercentage}%).`);
      return;
    }
    for (let i = 0; i < newMilestones.length; i++) {
      if (!newMilestones[i].title.trim()) {
        setPostError(`Milestone ${i + 1} must have a title.`);
        return;
      }
    }

    setWizardStep("preview");
  };

  // Publish or Save Edited Project
  const handleConfirmPublish = () => {
    setIsPublishing(true);
    setPostError("");

    setTimeout(() => {
      const compiledMilestones: Milestone[] = newMilestones.map((m, idx) => ({
        id: m.id || `ms-${Date.now()}-${idx + 1}`,
        stepNumber: idx + 1,
        title: m.title.trim() || `Step ${idx + 1}`,
        description: m.description.trim() || "Milestone deliverable requirements.",
        deliverableRequirements: [m.description.trim() || "Milestone specification compliance"],
        percentage: Number(m.percentage) || 0,
        paymentAmount: Number(m.paymentAmount) || 0,
        currency: newCurrency,
        deadline: m.deadline,
        status: idx === 0 ? "ACTIVE" : ("LOCKED" as MilestoneStatus),
      }));

      if (isEditingExisting && editingProjectId) {
        updateProject(editingProjectId, {
          title: newTitle.trim(),
          domain: newDomain,
          description: newDescription.trim(),
          totalBudget: newTotalBudget,
          currency: newCurrency,
          deadline: newDeadline,
          requiredSkills: newSkills,
          experienceLevel: newExperienceLevel,
          additionalRequirements: newAdditionalRequirements.trim(),
          milestones: compiledMilestones,
        });
        setSelectedProjectId(editingProjectId);
        setPostSuccess("Project updated successfully!");
      } else {
        const newProjId = `proj-${Date.now()}`;
        createProject({
          clientId: currentUser.id,
          clientName: currentUser.name || "Client Enterprise",
          clientCompany: currentUser.companyName || "Client Org",
          title: newTitle.trim(),
          domain: newDomain,
          description: newDescription.trim(),
          totalBudget: newTotalBudget,
          currency: newCurrency,
          deadline: newDeadline,
          milestones: compiledMilestones,
          status: "OPEN",
          applicationsCount: 0,
          requiredSkills: newSkills,
          experienceLevel: newExperienceLevel,
          additionalRequirements: newAdditionalRequirements.trim(),
        });
        setSelectedProjectId(newProjId);
        setPostSuccess("Project published successfully! It is now live in the marketplace.");
      }

      setIsPublishing(false);
      handleResetForm();

      setTimeout(() => {
        setPostSuccess("");
        setActiveTab("projects");
      }, 1500);
    }, 600);
  };

  // View Details of any Project
  const handleViewProjectDetails = (projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveTab("details");
  };

  // View Applications for specific Project
  const handleViewProjectApplications = (projectId: string) => {
    setFilterByProjectId(projectId);
    setActiveTab("proposals");
  };

  // Candidate review handlers (wired to shared MarketplaceContext + Immediate PayPal Escrow Checkout)
  const handleAcceptCandidate = async (appId: string) => {
    if (acceptingAppId) return;
    setAcceptingAppId(appId);
    setAcceptErrorMsg("");
    setPaypalErrorMsg("");
    try {
      const createdContract = await acceptApplication(appId, currentUser.id);
      setSelectedContractId(createdContract.id);
      setActiveTab("contracts");
      setActionSuccessMsg(
        `Candidate accepted! Contract #${createdContract.id} created — please complete PayPal Escrow Authorization to lock funds.`
      );
      setTimeout(() => setActionSuccessMsg(""), 6000);

      // Immediately prepare PayPal Orders v2 AUTHORIZE checkout modal
      try {
        const order = await createPayPalEscrowOrder(createdContract.id);
        setEscrowSecurityVerified(false);
        setEscrowSecurityPassword("");
        setEscrowSecurityError("");
        setPendingEscrowCheckout({
          contractId: createdContract.id,
          projectTitle: createdContract.projectTitle,
          talentName: createdContract.freelancerName,
          amount: createdContract.totalBudget,
          currency: createdContract.currency,
          orderId: order.orderId,
          approvalUrl: order.approvalUrl,
          mode: order.mode,
        });
      } catch (ppErr: any) {
        setPaypalErrorMsg(
          ppErr?.message || "Contract created! Click 'Fund Escrow with PayPal' below to lock funds."
        );
      }
    } catch (err: any) {
      setAcceptErrorMsg(err?.message || "Failed to accept candidate. Please try again.");
    } finally {
      setAcceptingAppId(null);
    }
  };

  const handleDeclineCandidate = (appId: string) => {
    rejectApplication(appId, currentUser.id);
    setActionSuccessMsg("Candidate declined.");
    setTimeout(() => setActionSuccessMsg(""), 2500);
  };

  const handleApproveMilestone = async (milestoneId: string) => {
    setPaypalErrorMsg("");
    try {
      await approveMilestone(selectedContractForTab.id, milestoneId);
      setActionSuccessMsg("Milestone approved! Payout released from escrow to talent.");
      setTimeout(() => setActionSuccessMsg(""), 3500);
      const txs = await apiClient.getPayPalTransactions(selectedContractForTab.id).catch(() => []);
      setPaypalTxs(txs);
    } catch (err: any) {
      setPaypalErrorMsg(err?.message || "Failed to approve and capture milestone.");
    }
  };

  const handleOverrideMilestoneRelease = (milestoneId: string, title: string, amt: number, curr: string) => {
    setOverridePassword("");
    setOverrideReason("");
    setOverrideError("");
    setOverrideAuthModal({
      type: "MILESTONE",
      contractId: selectedContractForTab.id,
      milestoneId,
      title,
      amount: amt,
      currency: curr,
      talentName: selectedContractForTab.freelancerName,
    });
  };

  const handleReleaseAllUpfront = (contractId: string) => {
    setOverridePassword("");
    setOverrideReason("");
    setOverrideError("");
    setOverrideAuthModal({
      type: "FULL_CONTRACT",
      contractId,
      title: selectedContractForTab.projectTitle,
      amount: selectedContractForTab.heldInEscrowAmount,
      currency: selectedContractForTab.currency,
      talentName: selectedContractForTab.freelancerName,
    });
  };

  const handleConfirmOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideAuthModal) return;
    if (!overridePassword) {
      setOverrideError("Account password is required to authorize this transfer.");
      return;
    }
    setIsExecutingOverride(true);
    setOverrideError("");
    try {
      if (overrideAuthModal.type === "MILESTONE" && overrideAuthModal.milestoneId) {
        await releaseMilestoneOverride(
          overrideAuthModal.contractId,
          overrideAuthModal.milestoneId,
          overridePassword,
          overrideReason.trim() || "Client password-verified upfront milestone release"
        );
        setActionSuccessMsg(
          `Password verified! ${formatCurrency(overrideAuthModal.amount, overrideAuthModal.currency)} released upfront to ${overrideAuthModal.talentName}.`
        );
      } else {
        await releaseContractUpfront(
          overrideAuthModal.contractId,
          overridePassword,
          overrideReason.trim() || "Client password-verified full upfront release"
        );
        setActionSuccessMsg(
          `Password verified! Full balance (${formatCurrency(overrideAuthModal.amount, overrideAuthModal.currency)}) released to ${overrideAuthModal.talentName}.`
        );
      }
      const cid = overrideAuthModal.contractId;
      setOverrideAuthModal(null);
      setOverridePassword("");
      setTimeout(() => setActionSuccessMsg(""), 5000);
      const txs = await apiClient.getPayPalTransactions(cid).catch(() => []);
      setPaypalTxs(txs);
    } catch (err: any) {
      setOverrideError(err?.message || "Password verification failed or payment release declined.");
    } finally {
      setIsExecutingOverride(false);
    }
  };

  const handleVerifyEscrowPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setEscrowSecurityError("");
    if (!escrowSecurityPassword) {
      setEscrowSecurityError("Please enter your TrustPay account password.");
      return;
    }
    if (payerPaypalEmail && payerPaypalEmail.trim().toLowerCase().includes("@business.example.com")) {
      setEscrowSecurityError(
        "Do not use a @business.example.com seller email to pay! Use a US Personal buyer (@personal.example.com) or card."
      );
      return;
    }
    setIsVerifyingEscrowPass(true);
    try {
      await apiClient.verifyPassword(escrowSecurityPassword);
      setEscrowSecurityVerified(true);
    } catch (err: any) {
      setEscrowSecurityError(err?.message || "Incorrect password. Owner verification failed.");
    } finally {
      setIsVerifyingEscrowPass(false);
    }
  };

  const handleOpenRevisionModal = (milestoneId: string) => {
    setRevisionMilestoneId(milestoneId);
    setRevisionNotes("");
    setRevisionErrorMsg("");
    setIsRevisionModalOpen(true);
  };

  const handleConfirmRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionNotes.trim() || isSubmittingRevision) return;

    setIsSubmittingRevision(true);
    setRevisionErrorMsg("");
    try {
      await requestMilestoneRevision(selectedContractForTab.id, revisionMilestoneId, revisionNotes.trim());
      setIsRevisionModalOpen(false);
      setActionSuccessMsg("Revision request with feedback sent to talent.");
      setTimeout(() => setActionSuccessMsg(""), 3500);
    } catch (err: any) {
      setRevisionErrorMsg(err?.message || "Cannot request revision on this milestone.");
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      name: contactName.trim(),
      companyName: companyName.trim(),
      companyDescription: companyDescription.trim(),
      domain: industry.trim(),
    });
    setIsEditingProfile(false);
    setProfileSuccessMsg("Organization profile updated successfully!");
    setTimeout(() => setProfileSuccessMsg(""), 3000);
  };

  // Applications filtered for Inbox
  const displayedApplications = localApplications.filter((app) => {
    const matchesProject = filterByProjectId === "ALL" || app.projectId === filterByProjectId;
    const matchesFilter =
      proposalFilter === "ALL" ||
      (proposalFilter === "AI_SHORTLIST" && app.aiRecommendation && app.aiRecommendation.fitScore >= 90);
    return matchesProject && matchesFilter;
  });

  // Active Project for Details View
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  if (!isClientRole) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Card className="p-8 border-gray-200 bg-white shadow-sm rounded-3xl space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <Badge variant="warning" size="md">Client Workspace Restricted</Badge>
          <h2 className="text-xl font-bold text-gray-950">Active Role is Freelancer</h2>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            You are currently signed in with a Freelancer profile. To access client project creation, applicant inbox, and milestone escrow management, switch to Client mode or continue to the Freelancer Workspace.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/freelancer/dashboard">
              <Button variant="outline" size="sm">
                Go to Freelancer Workspace
              </Button>
            </Link>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveRole("CLIENT")}
            >
              Switch to Client Mode
            </Button>
          </div>
          <p className="text-[11px] text-gray-400 pt-2">
            Demo notice: Frontend role guard active. Real authorization is enforced by the authentication backend.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* ── Top Header Banner ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-gray-100 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#003087] flex items-center justify-center font-bold text-lg border border-blue-100/60 shadow-xs">
            {currentUser.companyName
              ? currentUser.companyName.charAt(0).toUpperCase()
              : currentUser.name
              ? currentUser.name.charAt(0).toUpperCase()
              : "C"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-[#003087] tracking-tight">
                {currentUser.companyName || currentUser.name || "Client Enterprise"}
              </h1>
              <Badge variant="paypal" size="sm">Client Mode</Badge>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Contact: <strong className="text-gray-700">{currentUser.name}</strong> • Industry:{" "}
              <strong className="text-gray-700">{currentUser.domain}</strong> • {currentUser.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="outline" size="sm" className="text-xs">
              Back to Marketplace
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Sticky Navigation Taskbar ── */}
      <nav className="sticky top-20 z-30 bg-white/95 backdrop-blur-md rounded-2xl border border-gray-200/80 p-1.5 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
              activeTab === "overview"
                ? "bg-[#003087] text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab("projects")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
              activeTab === "projects"
                ? "bg-[#003087] text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>My Projects ({projects.length})</span>
          </button>

          <button
            onClick={() => {
              if (activeTab !== "post") handleResetForm();
              setActiveTab("post");
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
              activeTab === "post"
                ? "bg-[#0070E0] text-white btn-shadow"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{isEditingExisting ? "Edit Project" : "Post a Project"}</span>
          </button>

          <button
            onClick={() => {
              setFilterByProjectId("ALL");
              setActiveTab("proposals");
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
              activeTab === "proposals"
                ? "bg-[#003087] text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Applications &amp; Proposals ({localApplications.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("contracts")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
              activeTab === "contracts"
                ? "bg-[#003087] text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Active Contracts</span>
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
              activeTab === "profile"
                ? "bg-[#003087] text-white shadow-xs"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Company Profile</span>
          </button>
        </div>
      </nav>

      {/* Global Notifications */}
      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-medium flex items-center gap-2.5 animate-slide-up shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {profileSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-medium flex items-center gap-2.5 animate-slide-up shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{profileSuccessMsg}</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          PAGE 1: CLIENT DASHBOARD OVERVIEW
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-8 animate-fade-in">
          {/* 4 Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-5 border-gray-100 card-hover bg-white">
              <span className="text-xs text-gray-500 font-medium block">Total Projects Posted</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-[#003087] mt-1 block">
                {totalProjectsCount}
              </span>
              <span className="text-[11px] text-gray-400 mt-1 block">All-time listings</span>
            </Card>

            <Card className="p-5 border-gray-100 card-hover bg-white">
              <span className="text-xs text-gray-500 font-medium block">Open Projects</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-[#0070E0] mt-1 block">
                {openProjectsCount}
              </span>
              <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">Accepting proposals</span>
            </Card>

            <Card className="p-5 border-gray-100 card-hover bg-white">
              <span className="text-xs text-gray-500 font-medium block">Projects In Progress</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-purple-600 mt-1 block">
                {inProgressProjectsCount}
              </span>
              <span className="text-[11px] text-purple-700 font-semibold mt-1 block">Active milestone delivery</span>
            </Card>

            <Card className="p-5 border-gray-100 card-hover bg-white">
              <span className="text-xs text-gray-500 font-medium block">Completed Projects</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 mt-1 block">
                {completedProjectsCount}
              </span>
              <span className="text-[11px] text-gray-400 mt-1 block">Settled via escrow</span>
            </Card>
          </div>

          {/* Quick Action Post Project Banner */}
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#0070E0] block mb-1">
                Milestone Escrow Architecture
              </span>
              <h3 className="text-xl font-bold text-[#003087]">Ready to commission new work?</h3>
              <p className="text-xs text-gray-600 max-w-xl mt-1">
                Define deliverables, configure milestone splits, and invite verified talent with upfront escrow security.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                handleResetForm();
                setActiveTab("post");
              }}
              className="w-full sm:w-auto shrink-0"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Post New Project
            </Button>
          </div>

          {/* Recent Projects & Recent Applications Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Projects Box */}
            <Card className="border-gray-100 bg-white">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">Recent Projects</CardTitle>
                  <CardDescription>Your latest posted listings</CardDescription>
                </div>
                <button
                  onClick={() => setActiveTab("projects")}
                  className="text-xs font-bold text-[#0070E0] hover:underline cursor-pointer"
                >
                  View All ({projects.length})
                </button>
              </CardHeader>
              <CardContent className="space-y-3 pt-3">
                {projects.slice(0, 3).map((proj) => (
                  <div
                    key={proj.id}
                    className="p-3.5 rounded-xl border border-gray-100 hover:border-blue-200 transition-colors bg-gray-50/50 flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-gray-900 truncate">{proj.title}</h4>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            proj.status === "OPEN"
                              ? "bg-blue-100 text-[#0070E0]"
                              : proj.status === "IN_PROGRESS"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {proj.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Budget: <strong>{formatCurrency(proj.totalBudget, proj.currency)}</strong> • {proj.milestones.length} Milestones • {proj.applicationsCount || 0} Bids
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewProjectDetails(proj.id)}
                      className="text-xs shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      View
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Recent Applications Box */}
            <Card className="border-gray-100 bg-white">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">Recent Applications</CardTitle>
                  <CardDescription>Incoming proposals from verified freelancers</CardDescription>
                </div>
                <button
                  onClick={() => setActiveTab("proposals")}
                  className="text-xs font-bold text-[#0070E0] hover:underline cursor-pointer"
                >
                  Applicant Inbox ({localApplications.length})
                </button>
              </CardHeader>
              <CardContent className="space-y-3 pt-3">
                {localApplications.slice(0, 3).map((app) => (
                  <div
                    key={app.id}
                    className="p-3.5 rounded-xl border border-gray-100 hover:border-purple-200 transition-colors bg-gray-50/50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900">{app.freelancerName}</span>
                        {app.aiRecommendation && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            {app.aiRecommendation.fitScore}% Fit
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                        Bid: <strong>{formatCurrency(app.bidAmount, app.currency)}</strong> • {app.coverLetter}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFilterByProjectId(app.projectId);
                        setActiveTab("proposals");
                      }}
                      className="text-xs shrink-0"
                    >
                      Review
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          PAGE 2: MY PROJECTS
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "projects" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-[#003087] tracking-tight">My Projects</h2>
              <p className="text-xs text-gray-500">
                Manage all project postings, view applications, and inspect milestone structures.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                handleResetForm();
                setActiveTab("post");
              }}
            >
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Post New Project
            </Button>
          </div>

          <div className="space-y-4">
            {projects.map((proj) => {
              const statusBadgeVariant =
                proj.status === "OPEN"
                  ? "paypal"
                  : proj.status === "IN_PROGRESS"
                  ? "inReview"
                  : proj.status === "COMPLETED"
                  ? "success"
                  : "neutral";

              return (
                <Card key={proj.id} className="border-gray-100 card-hover bg-white overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <CardTitle className="text-lg">{proj.title}</CardTitle>
                          <Badge variant={statusBadgeVariant} size="sm">
                            {proj.status}
                          </Badge>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {proj.domain}
                          </span>
                        </div>
                        <CardDescription>
                          Created {formatDate(proj.createdAt)} • Deadline: {formatDate(proj.deadline)}
                        </CardDescription>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider block">
                          Total Budget
                        </span>
                        <span className="text-xl font-extrabold text-[#003087]">
                          {formatCurrency(proj.totalBudget, proj.currency)}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-1">
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                      {proj.description}
                    </p>

                    {/* Required Skills Chips */}
                    {proj.requiredSkills && proj.requiredSkills.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-bold text-gray-500 mr-1">Skills:</span>
                        {proj.requiredSkills.map((skill, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#0070E0] border border-blue-100"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Milestone schedule snapshot */}
                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-700">
                          Milestones Breakdown ({proj.milestones.length} Steps)
                        </span>
                        <span className="text-[11px] text-gray-400 font-mono">
                          {proj.milestones.reduce((acc, m) => acc + m.percentage, 0)}% Allocated
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {proj.milestones.map((m) => (
                          <div
                            key={m.id}
                            className="p-3 rounded-xl bg-gray-50/70 border border-gray-200/70 text-xs space-y-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-gray-800 truncate">Step {m.stepNumber}: {m.title}</span>
                              <span className="font-bold text-[#0070E0]">{m.percentage}%</span>
                            </div>
                            <span className="text-gray-500 text-[11px] block">
                              {formatCurrency(m.paymentAmount, m.currency)} • Due {formatDate(m.deadline)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-gray-500 flex items-center gap-1.5 font-medium">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        <strong>{proj.applicationsCount || 0}</strong> freelancer application(s) received
                      </span>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewProjectDetails(proj.id)}
                          className="text-xs"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View Project
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStartEditProject(proj)}
                          className="text-xs"
                        >
                          <Edit3 className="w-3.5 h-3.5 mr-1" />
                          Edit Project
                        </Button>

                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleViewProjectApplications(proj.id)}
                          className="text-xs"
                        >
                          <Users className="w-3.5 h-3.5 mr-1" />
                          View Applications
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          PAGE 3 & 4: CREATE PROJECT FORM & DYNAMIC MILESTONE BUILDER
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "post" && wizardStep === "form" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold text-[#003087] tracking-tight">
                {isEditingExisting ? "Edit Project Brief" : "Create New Project"}
              </h2>
              <p className="text-xs text-gray-500">
                Specify scope, candidate criteria, and custom milestone splits to protect capital in escrow.
              </p>
            </div>
            {isEditingExisting && (
              <Button variant="ghost" size="sm" onClick={handleResetForm} className="text-xs text-gray-500">
                Cancel Edit
              </Button>
            )}
          </div>

          <Card className="border-gray-100 bg-white shadow-md">
            <form onSubmit={handleProceedToPreview}>
              <CardContent className="space-y-6 pt-6">
                {postError && (
                  <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-slide-up">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{postError}</span>
                  </div>
                )}

                {postSuccess && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-slide-up">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{postSuccess}</span>
                  </div>
                )}

                {/* Section A: Project Identity */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-[#003087] uppercase tracking-wider">
                    1. Project Specifications
                  </h3>

                  <Input
                    label="Project Title"
                    required
                    placeholder="e.g. Next.js Autonomous Milestone Escrow Marketplace"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Domain Category */}
                    <div className="space-y-1.5 text-left">
                      <label className="block text-xs font-bold text-gray-700">
                        Domain / Category <span className="text-rose-500 font-bold ml-1">*</span>
                      </label>
                      <select
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070E0]"
                      >
                        <option value="Full-Stack Development">Full-Stack Development</option>
                        <option value="Frontend Engineering">Frontend Engineering</option>
                        <option value="Backend & APIs">Backend &amp; APIs</option>
                        <option value="AI Engineering">AI Engineering</option>
                        <option value="UI/UX Design">UI/UX Design</option>
                        <option value="Video Production & Influencer">Video Production &amp; Influencer</option>
                      </select>
                    </div>

                    {/* Total Budget */}
                    <div className="space-y-1.5 text-left">
                      <label className="block text-xs font-bold text-gray-700">
                        Total Project Budget <span className="text-rose-500 font-bold ml-1">*</span>
                      </label>
                      <Input
                        type="number"
                        required
                        min={100}
                        value={newTotalBudget}
                        onChange={(e) => handleBudgetChange(Number(e.target.value))}
                      />
                    </div>

                    {/* Fixed USD Settlement */}
                    <div className="space-y-1.5 text-left">
                      <label className="block text-xs font-bold text-gray-700">
                        Settlement Currency
                      </label>
                      <div className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700 flex items-center justify-between">
                        <span>USD ($)</span>
                        <span className="text-[10px] font-bold uppercase text-[#0070E0] bg-blue-50 px-2 py-0.5 rounded-full">
                          PayPal Standard
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Target Completion Deadline"
                      type="date"
                      required
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                    />

                    {/* Experience Requirement */}
                    <div className="space-y-1.5 text-left">
                      <label className="block text-xs font-bold text-gray-700">Experience Requirement</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["Entry", "Intermediate", "Expert"] as const).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setNewExperienceLevel(lvl)}
                            className={`py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                              newExperienceLevel === lvl
                                ? "bg-blue-50 border-[#0070E0] text-[#0070E0] ring-1 ring-[#0070E0]"
                                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Textarea
                    label="Detailed Project Description & Scope"
                    required
                    rows={4}
                    placeholder="Provide architecture guidelines, technical specs, deliverables criteria, and acceptance standards..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>

                {/* Section B: Candidate Skills & Extra Requirements */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <h3 className="text-xs font-bold text-[#003087] uppercase tracking-wider">
                    2. Candidate Requirements &amp; Terms
                  </h3>

                  {/* Skills Tag Input */}
                  <div className="space-y-2 text-left">
                    <label className="block text-xs font-bold text-gray-700">Required Skills</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add skill tag (e.g. Next.js, Python, Figma) and press Enter"
                        value={customSkillInput}
                        onChange={(e) => setCustomSkillInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddSkill(customSkillInput);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={() => handleAddSkill(customSkillInput)}
                        className="text-xs shrink-0"
                      >
                        Add Skill
                      </Button>
                    </div>

                    {/* Selected Skills Chips */}
                    {newSkills.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {newSkills.map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#0070E0] border border-blue-200 text-xs font-semibold"
                          >
                            <span>{skill}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSkill(skill)}
                              className="hover:text-rose-600 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Suggestions */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-gray-400">
                      <span className="text-[11px] font-medium mr-1">Suggestions:</span>
                      {POPULAR_SKILLS.filter((s) => !newSkills.includes(s))
                        .slice(0, 6)
                        .map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleAddSkill(s)}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
                          >
                            + {s}
                          </button>
                        ))}
                    </div>
                  </div>

                  <Textarea
                    label="Additional Terms & Requirements (Optional)"
                    rows={2}
                    placeholder="NDA signing required, specific timezone overlap, intellectual property assignment, etc."
                    value={newAdditionalRequirements}
                    onChange={(e) => setNewAdditionalRequirements(e.target.value)}
                  />
                </div>

                {/* Section C: Dynamic Milestone Builder (PAGE 4) */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-[#003087] uppercase tracking-wider">
                        3. Dynamic Milestone Builder <span className="text-rose-500 font-bold ml-1">*</span>
                      </h3>
                      <p className="text-xs text-gray-500">
                        Add sequential milestones. Percentages must total 100% (Not restricted to fixed splits).
                      </p>
                    </div>

                    {/* Progress Badge */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[11px] text-gray-500 block">
                          Total Budget: {formatCurrency(totalMilestoneAmounts, newCurrency)} / {formatCurrency(newTotalBudget, newCurrency)}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${
                          totalPercentage === 100
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-200"
                            : "bg-amber-50 text-amber-800 border-amber-300"
                        }`}
                      >
                        {totalPercentage}% / 100%
                      </span>
                    </div>
                  </div>

                  {/* Percentage Progress Bar */}
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ease-out rounded-full ${
                        totalPercentage === 100
                          ? "bg-emerald-500"
                          : totalPercentage > 100
                          ? "bg-rose-500"
                          : "bg-[#0070E0]"
                      }`}
                      style={{ width: `${Math.min(100, totalPercentage)}%` }}
                    />
                  </div>

                  {/* Milestone Items List */}
                  <div className="space-y-3 pt-2">
                    {newMilestones.map((m, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl border border-gray-200 bg-gray-50/70 space-y-3 animate-slide-up shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-[#003087] bg-white px-3 py-1 rounded-full border border-gray-200">
                            Step {idx + 1}
                          </span>
                          {newMilestones.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMilestone(idx)}
                              className="text-gray-400 hover:text-rose-600 text-xs flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-6">
                            <Input
                              placeholder="Milestone title (e.g. Scaffolding & Core Architecture)"
                              value={m.title}
                              onChange={(e) => handleUpdateMilestone(idx, "title", e.target.value)}
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              placeholder="Percentage (%)"
                              value={m.percentage}
                              onChange={(e) => handleUpdateMilestone(idx, "percentage", Number(e.target.value))}
                              helperText={`${formatCurrency(m.paymentAmount, newCurrency)}`}
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <Input
                              type="date"
                              value={m.deadline}
                              onChange={(e) => handleUpdateMilestone(idx, "deadline", e.target.value)}
                            />
                          </div>
                        </div>

                        <Input
                          placeholder="Deliverable requirement checklist for this milestone..."
                          value={m.description}
                          onChange={(e) => handleUpdateMilestone(idx, "description", e.target.value)}
                        />

                        {/* AI-Assisted Subtask Division Controls */}
                        <div className="pt-2 border-t border-gray-200/80">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-[#003087] font-bold">
                              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                              <span>AI-Assisted Subtask Division</span>
                              {m.subtasksApproved && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Approved ({m.subtasks?.length} Subtasks)
                                </span>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-[11px] h-7 px-2.5 bg-white text-[#0070E0] border-blue-200 hover:bg-blue-50"
                              onClick={() => handleGenerateAISubtasks(idx)}
                            >
                              <Sparkles className="w-3 h-3 mr-1 text-purple-600" />
                              {m.subtasks ? "Regenerate AI Subtasks" : "Generate AI Subtasks"}
                            </Button>
                          </div>

                          {m.aiSubdivisionReasoning && (
                            <p className="text-[11px] text-gray-500 mt-1 italic">
                              {m.aiSubdivisionReasoning}
                            </p>
                          )}

                          {/* Subtasks breakdown */}
                          {m.subtasks && m.subtasks.length > 0 && (
                            <div className="mt-2.5 space-y-2 bg-white p-3 rounded-xl border border-gray-200">
                              <span className="text-[11px] font-bold text-gray-700 block uppercase tracking-wider">
                                Recommended Internal Tasks (Reconciles to {m.percentage}% Parent Total):
                              </span>
                              <div className="space-y-1.5">
                                {m.subtasks.map((st, sIdx) => (
                                  <div
                                    key={st.id || sIdx}
                                    className="p-2 rounded-lg bg-gray-50 border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-[#003087] bg-white px-1.5 py-0.5 rounded text-[10px] border border-gray-200">
                                        {st.stepNumber}
                                      </span>
                                      <span className="font-medium text-gray-800">{st.title}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                      <span>{st.percentageOfTotal}% of project</span>
                                      <span className="font-bold text-[#003087]">
                                        {formatCurrency(st.paymentAmount, newCurrency)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddMilestone}
                    className="text-xs mt-2"
                  >
                    + Add Another Milestone Step
                  </Button>
                </div>

                {/* Form Navigation Action */}
                <div className="pt-6 border-t border-gray-100 flex items-center justify-end gap-3">
                  <Button type="submit" variant="primary" size="md">
                    <span>Review &amp; Preview Project</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          PAGE 5: PROJECT PREVIEW
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "post" && wizardStep === "preview" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-[#0070E0] uppercase tracking-wider block mb-1">
                Step 2 of 2: Final Verification
              </span>
              <h2 className="text-2xl font-extrabold text-[#003087] tracking-tight">Project Preview</h2>
              <p className="text-xs text-gray-500">
                Inspect all project specifications and milestone splits before publishing to the marketplace.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWizardStep("form")}
              className="text-xs self-start sm:self-auto"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to Edit Form
            </Button>
          </div>

          <Card className="border-gray-200/90 bg-white shadow-xl overflow-hidden rounded-3xl">
            {/* Header info */}
            <div className="p-6 sm:p-8 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-[#0070E0]">
                    {newDomain}
                  </span>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">
                    Ready to Publish
                  </span>
                </div>
                <h3 className="text-2xl font-extrabold text-[#003087] mt-1">{newTitle}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Client: <strong className="text-gray-800">{currentUser.companyName || currentUser.name}</strong> • Target Deadline:{" "}
                  <strong className="text-gray-800">{formatDate(newDeadline)}</strong>
                </p>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-xs text-gray-500 font-bold uppercase tracking-wider block">Total Project Value</span>
                <span className="text-3xl font-extrabold text-[#003087]">
                  {formatCurrency(newTotalBudget, newCurrency)}
                </span>
              </div>
            </div>

            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Detailed Description */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Project Description &amp; Scope
                </h4>
                <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  {newDescription}
                </p>
              </div>

              {/* Skills & Experience requirements */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                  <span className="text-xs font-bold text-gray-500 block mb-2">Required Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {newSkills.map((s) => (
                      <span
                        key={s}
                        className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white text-[#0070E0] border border-blue-200"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                  <span className="text-xs font-bold text-gray-500 block mb-1">Experience Requirement</span>
                  <span className="text-sm font-bold text-[#003087]">{newExperienceLevel} Level</span>
                  {newAdditionalRequirements && (
                    <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-200">
                      <strong>Additional terms:</strong> {newAdditionalRequirements}
                    </p>
                  )}
                </div>
              </div>

              {/* Milestone breakdown table */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Milestone Schedule ({newMilestones.length} Steps • 100% Total)
                  </h4>
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Vault Fully Allocated
                  </span>
                </div>

                <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100">
                  {newMilestones.map((m, idx) => (
                    <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-blue-50 text-[#0070E0]">
                            Step {idx + 1}
                          </span>
                          <span className="text-sm font-bold text-gray-900">{m.title}</span>
                        </div>
                        <p className="text-xs text-gray-500">{m.description}</p>
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        <span className="text-sm font-extrabold text-[#003087] block">
                          {formatCurrency(m.paymentAmount, newCurrency)} ({m.percentage}%)
                        </span>
                        <span className="text-xs text-gray-400">Due {formatDate(m.deadline)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setWizardStep("form")}
                  className="w-full sm:w-auto"
                >
                  <Edit3 className="w-4 h-4 mr-1.5" />
                  Edit Project Brief
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  isLoading={isPublishing}
                  onClick={handleConfirmPublish}
                  className="w-full sm:w-auto"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {isEditingExisting ? "Save & Update Project" : "Publish Project to Marketplace"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          PAGE 6: PROJECT DETAILS VIEW
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "details" && selectedProject && (
        <div className="space-y-6 animate-fade-in">
          {/* Breadcrumb / Top Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              onClick={() => setActiveTab("projects")}
              className="text-xs font-bold text-[#0070E0] hover:underline flex items-center gap-1.5 cursor-pointer self-start"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to My Projects
            </button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStartEditProject(selectedProject)}
                className="text-xs"
              >
                <Edit3 className="w-3.5 h-3.5 mr-1" />
                Edit Brief
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleViewProjectApplications(selectedProject.id)}
                className="text-xs"
              >
                <Users className="w-3.5 h-3.5 mr-1" />
                View Received Proposals ({selectedProject.applicationsCount || 0})
              </Button>
            </div>
          </div>

          <Card className="border-gray-100 bg-white shadow-lg overflow-hidden rounded-3xl">
            {/* Header info */}
            <div className="p-6 sm:p-8 bg-gradient-to-r from-blue-50/60 to-indigo-50/60 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-[#0070E0]">
                    {selectedProject.domain}
                  </span>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full ${
                      selectedProject.status === "OPEN"
                        ? "bg-blue-100 text-[#0070E0]"
                        : selectedProject.status === "IN_PROGRESS"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {selectedProject.status}
                  </span>
                  <span className="text-xs text-gray-500 font-mono">ID: {selectedProject.id}</span>
                </div>
                <h2 className="text-2xl font-extrabold text-[#003087]">{selectedProject.title}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Posted {formatDate(selectedProject.createdAt)} • Target Completion: {formatDate(selectedProject.deadline)}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Total Project Value</span>
                <span className="text-3xl font-extrabold text-[#003087]">
                  {formatCurrency(selectedProject.totalBudget, selectedProject.currency)}
                </span>
              </div>
            </div>

            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Description */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Project Description &amp; Deliverables Scope
                </h4>
                <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  {selectedProject.description}
                </p>
              </div>

              {/* Skills & Experience */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                  <span className="text-xs font-bold text-gray-500 block mb-2">Required Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProject.requiredSkills?.map((s) => (
                      <span
                        key={s}
                        className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white text-[#0070E0] border border-blue-200"
                      >
                        {s}
                      </span>
                    )) || <span className="text-xs text-gray-400">Standard domain stack</span>}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                  <span className="text-xs font-bold text-gray-500 block mb-1">Experience Level</span>
                  <span className="text-sm font-bold text-[#003087]">
                    {selectedProject.experienceLevel || "Intermediate"}
                  </span>
                  {selectedProject.additionalRequirements && (
                    <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-200">
                      <strong>Additional terms:</strong> {selectedProject.additionalRequirements}
                    </p>
                  )}
                </div>
              </div>

              {/* Milestone execution timeline */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Milestone Schedule ({selectedProject.milestones.length} Steps)
                  </h4>
                  <span className="text-xs text-gray-500 font-mono">
                    Escrow Ready • Step-by-Step Payouts
                  </span>
                </div>

                <div className="space-y-3">
                  {selectedProject.milestones.map((ms) => {
                    const statusInfo = getMilestoneStatusInfo(ms.status);
                    return (
                      <div
                        key={ms.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          ms.status === "ACTIVE"
                            ? "border-[#0070E0] bg-blue-50/20 ring-1 ring-[#0070E0]"
                            : ms.status === "RELEASED"
                            ? "border-emerald-200 bg-emerald-50/20"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-md bg-blue-50 text-[#0070E0]">
                              Step {ms.stepNumber}
                            </span>
                            <h5 className="text-sm font-bold text-gray-900">{ms.title}</h5>
                          </div>
                          <Badge variant={statusInfo.variant} size="sm">
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">{ms.description}</p>
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                          <span className="font-extrabold text-[#003087]">
                            {formatCurrency(ms.paymentAmount, ms.currency)} ({ms.percentage}%)
                          </span>
                          <span className="text-gray-400 font-medium">Due {formatDate(ms.deadline)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 4: APPLICATIONS & PROPOSALS (APPLICANT INBOX)
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "proposals" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-[#003087] tracking-tight">Applicant Inbox</h2>
              <p className="text-xs text-gray-500">
                Review proposals with the choice of manual candidate review or AI-assisted shortlisting.
              </p>
            </div>

            {/* Filter Toggle: All vs AI Shortlist */}
            <div className="flex items-center gap-1.5 p-1 bg-gray-50 rounded-full border border-gray-200">
              <button
                onClick={() => setProposalFilter("ALL")}
                className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
                  proposalFilter === "ALL"
                    ? "bg-white text-[#003087] shadow-sm ring-1 ring-gray-200"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                All Applicants ({localApplications.length})
              </button>
              <button
                onClick={() => setProposalFilter("AI_SHORTLIST")}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
                  proposalFilter === "AI_SHORTLIST"
                    ? "bg-white text-purple-900 shadow-sm ring-1 ring-gray-200"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                AI Shortlist
              </button>
            </div>
          </div>

          {acceptErrorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between">
              <span>{acceptErrorMsg}</span>
              <button onClick={() => setAcceptErrorMsg("")} className="text-rose-500 hover:text-rose-800 ml-3">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Project Specific Filter Pills if set */}
          {filterByProjectId !== "ALL" && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 text-[#0070E0] rounded-2xl text-xs font-semibold">
              <span>Filtering applications for Project ID: <strong>{filterByProjectId}</strong></span>
              <button
                onClick={() => setFilterByProjectId("ALL")}
                className="ml-auto underline cursor-pointer text-xs font-bold"
              >
                Show All Projects
              </button>
            </div>
          )}

          <div className="space-y-4">
            {displayedApplications.map((app) => (
              <Card key={app.id} className="border-gray-100 card-hover bg-white">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{app.freelancerName}</CardTitle>
                        <Badge variant="paypal" size="sm">{app.freelancerDomain}</Badge>
                        <Badge
                          variant={
                            app.status === "ACCEPTED"
                              ? "success"
                              : app.status === "PENDING"
                              ? "warning"
                              : "neutral"
                          }
                          size="sm"
                        >
                          {app.status === "ACCEPTED" ? "Selected & Contract Active" : app.status}
                        </Badge>
                      </div>
                      <CardDescription>Submitted {formatDate(app.createdAt)}</CardDescription>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-xs text-gray-500 block">Proposed Bid</span>
                      <span className="text-base font-bold text-[#003087]">
                        {formatCurrency(app.bidAmount, app.currency)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-1">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-700">
                    <span className="font-semibold block text-gray-900 mb-0.5">Cover Letter:</span>
                    <p className="leading-relaxed">{app.coverLetter}</p>
                  </div>

                  {/* AI Recommendation Banner */}
                  {app.aiRecommendation && (
                    <div className="p-3 rounded-xl bg-purple-50/80 border border-purple-200 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-purple-900">
                          <Sparkles className="w-4 h-4 text-purple-600" />
                          <span>Gemini Candidate Evaluation: {app.aiRecommendation.fitScore}% Fit</span>
                        </div>
                        <Badge variant="inReview" size="sm">
                          {app.aiRecommendation.domainMatchRate}% Domain Relevance
                        </Badge>
                      </div>
                      <p className="text-purple-800 text-[11px] leading-relaxed">
                        {app.aiRecommendation.summaryExplanation}
                      </p>
                    </div>
                  )}

                  {/* Trust Scorecard Summary */}
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-gray-50 border border-gray-100 text-[11px]">
                    <div>
                      <span className="text-gray-400 block">Rating:</span>
                      <span className="font-bold text-gray-800">{app.trustScorecard.rating} ★</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">On-Time Rate:</span>
                      <span className="font-bold text-emerald-600">{app.trustScorecard.onTimeDeliveryRate}%</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Compliance:</span>
                      <span className="font-bold text-[#0070E0]">{app.trustScorecard.complianceScore}%</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs text-[#0070E0] border-blue-200 hover:bg-blue-50"
                      onClick={() => setSelectedApplicantForReview(app)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1 text-[#0070E0]" />
                      Inspect Candidate Profile &amp; CV
                    </Button>
                    <div className="flex items-center gap-2">
                    {app.status === "PENDING" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDeclineCandidate(app.id)}
                        >
                          Decline
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          className="text-xs"
                          disabled={acceptingAppId === app.id}
                          onClick={() => handleAcceptCandidate(app.id)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          {acceptingAppId === app.id ? "Creating Escrow..." : "Accept & Fund Escrow"}
                        </Button>
                      </>
                    )}
                    {app.status === "ACCEPTED" && (
                      <Button variant="outline" size="sm" onClick={() => setActiveTab("contracts")}>
                        View Active Escrow Hub
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {displayedApplications.length === 0 && (
              <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold">No applications found under this filter.</p>
                <p className="text-xs text-gray-400 mt-1">Try switching to &apos;All Applicants&apos;.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 5: ACTIVE CONTRACTS
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "contracts" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-2xl font-extrabold text-[#003087] tracking-tight">Active Escrow &amp; Milestone Hub</h2>
              <p className="text-xs text-gray-500">
                Approve milestone deliverables or request revisions before releasing escrow funds.
              </p>
            </div>
            <Badge variant={escrowStatusInfo.variant} size="md">
              <Lock className="w-3.5 h-3.5 mr-1" />
              {escrowStatusInfo.label}
            </Badge>
          </div>

          {myContracts.length === 0 && (
            <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
              <Lock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-semibold">No active contracts yet.</p>
              <p className="text-xs text-gray-400 mt-1">Accept a candidate proposal to create an escrow contract and fund it via PayPal.</p>
            </div>
          )}

          {myContracts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar: Visual Contract Cards List + Search/Filter */}
            <div className="lg:col-span-4 space-y-3">
              <Card className="border-gray-100 bg-white p-3.5 rounded-2xl space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#003087] uppercase tracking-wider">
                    Your Contracts ({filteredContracts.length}/{myContracts.length})
                  </span>
                </div>
                <input
                  type="text"
                  value={contractSearch}
                  onChange={(e) => setContractSearch(e.target.value)}
                  placeholder="Search project, talent, or ID..."
                  className="w-full h-9 px-3 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070E0]"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "ALL", label: "All" },
                    { id: "AWAITING_AUTHORIZATION", label: "Needs Funding" },
                    { id: "ACTIVE", label: "Active" },
                    { id: "COMPLETED", label: "Completed" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setContractFilter(f.id as any)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                        contractFilter === f.id
                          ? "bg-[#003087] text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </Card>

              <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
                {filteredContracts.map((c) => {
                  const isSelected = c.id === selectedContractForTab.id;
                  const cInfo = getEscrowStatusInfo(c.escrowStatus);
                  const hasReviewPending = c.milestones.some((m) => m.status === "IN_REVIEW" || m.status === "SUBMITTED");
                  const pct = c.totalBudget > 0 ? Math.round((c.releasedAmount / c.totalBudget) * 100) : 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedContractId(c.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? "border-[#0070E0] bg-blue-50/40 ring-2 ring-[#0070E0]/20 shadow-sm"
                          : "border-gray-200 bg-white hover:border-blue-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className="font-bold text-xs text-gray-900 line-clamp-1">{c.projectTitle}</h4>
                        <span className="font-extrabold text-xs text-[#003087] shrink-0">
                          {formatCurrency(c.totalBudget, c.currency)}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mb-2 truncate">
                        Talent: <strong className="text-gray-700">{c.freelancerName}</strong> • #{c.id}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <Badge variant={cInfo.variant} size="sm">{cInfo.label}</Badge>
                        {hasReviewPending && (
                          <Badge variant="inReview" size="sm">Submission Ready</Badge>
                        )}
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#0070E0] rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
                {filteredContracts.length === 0 && (
                  <div className="p-6 text-center text-xs text-gray-400 bg-white rounded-2xl border border-gray-100">
                    No contracts match your search/filter.
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: Selected Contract Full Escrow Workspace */}
            <div className="lg:col-span-8">
          <Card className="border-gray-100 bg-white shadow-lg rounded-3xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">{selectedContractForTab.projectTitle}</CardTitle>
                  <CardDescription>
                    Talent: <strong className="text-gray-800">{selectedContractForTab.freelancerName}</strong> • Contract:{" "}
                    <code className="text-xs font-mono">{selectedContractForTab.id}</code>
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="text-left sm:text-right">
                    <span className="text-xs text-gray-500">Escrow Value</span>
                    <p className="text-2xl font-extrabold text-[#003087]">
                      {formatCurrency(selectedContractForTab.totalBudget, selectedContractForTab.currency)}
                    </p>
                  </div>
                  {(selectedContractForTab.escrowStatus === "HELD_IN_ESCROW" ||
                    selectedContractForTab.escrowStatus === "PARTIALLY_RELEASED") &&
                    selectedContractForTab.heldInEscrowAmount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReleaseAllUpfront(selectedContractForTab.id)}
                        className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold"
                      >
                        <DollarSign className="w-3.5 h-3.5 mr-1" />
                        Override &amp; Pay Full Upfront
                      </Button>
                    )}
                  <Link
                    href={`/client/disputes/${selectedContractForTab.id}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors shadow-2xs"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    <span>Dispute Resolution Hub</span>
                  </Link>
                </div>
              {/* Financial Balances */}
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* PayPal Escrow Payment Receipt / Live Funded Status Banner */}
              {(paypalReceipt?.contractId === selectedContractForTab.id ||
                selectedContractForTab.escrowStatus === "HELD_IN_ESCROW" ||
                selectedContractForTab.escrowStatus === "PARTIALLY_RELEASED" ||
                selectedContractForTab.escrowStatus === "COMPLETED") && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-0.5">
                      <p className="font-extrabold text-emerald-900">
                        Escrow Funded &amp; Debited via PayPal:{" "}
                        {formatCurrency(selectedContractForTab.totalBudget, selectedContractForTab.currency)}
                      </p>
                      <p className="text-emerald-800">
                        {selectedContractForTab.paypalAuthId
                          ? `PayPal Authorization ID: ${selectedContractForTab.paypalAuthId}`
                          : "Escrow Hold Active"}
                        {selectedContractForTab.paypalCaptureId
                          ? ` • Latest Capture ID: ${selectedContractForTab.paypalCaptureId}`
                          : " • Funds held securely until you approve deliverables"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success" size="sm">Escrow Locked</Badge>
                </div>
              )}

              {/* PayPal Escrow Funding Callout when AWAITING_AUTHORIZATION */}
              {selectedContractForTab.escrowStatus === "AWAITING_AUTHORIZATION" && (
                <div className="p-5 rounded-2xl bg-gradient-to-r from-[#003087]/5 via-[#0070E0]/10 to-indigo-50 border border-[#0070E0]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-[#0070E0]" />
                      <h4 className="text-sm font-extrabold text-[#003087]">
                        Fund Escrow via PayPal Sandbox (Orders v2 Authorize)
                      </h4>
                    </div>
                    <p className="text-xs text-gray-600">
                      Lock <strong>{formatCurrency(selectedContractForTab.totalBudget, selectedContractForTab.currency)}</strong> into PayPal escrow to unlock Milestone Step 1. Funds are only captured partwise as you approve deliverables.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    disabled={isFundingEscrow}
                    onClick={() => handleFundEscrowWithPayPal(selectedContractForTab.id)}
                    className="shrink-0 bg-[#0070E0] hover:bg-[#003087] text-white font-bold shadow-md"
                  >
                    <Lock className="w-4 h-4 mr-1.5" />
                    {isFundingEscrow ? "Connecting to PayPal..." : "Fund Escrow with PayPal"}
                  </Button>
                </div>
              )}

              {paypalErrorMsg && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
                  <span>{paypalErrorMsg}</span>
                  <button onClick={() => setPaypalErrorMsg("")} className="text-red-500 hover:text-red-800 ml-3">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                <div>
                  <span className="text-xs text-gray-500 block">Funds Held in Escrow</span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatCurrency(selectedContractForTab.heldInEscrowAmount, selectedContractForTab.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">Released to Talent</span>
                  <span className="text-lg font-bold text-emerald-600">
                    {formatCurrency(selectedContractForTab.releasedAmount, selectedContractForTab.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">Settlement Progress</span>
                  <span className="text-lg font-bold text-[#0070E0]">
                    {selectedContractForTab.totalBudget > 0
                      ? Math.round((selectedContractForTab.releasedAmount / selectedContractForTab.totalBudget) * 100)
                      : 0}
                    %
                  </span>
                </div>
              </div>

              {/* Assigned Talent & Project Brief Overview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-blue-50/40 border border-blue-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#003087]">
                      Assigned Talent Working on Project
                    </span>
                    {selectedContractForTab.freelancerRating ? (
                      <Badge variant="success" size="sm">★ {selectedContractForTab.freelancerRating.toFixed(1)}</Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0070E0] text-white flex items-center justify-center font-bold text-sm shrink-0">
                      {selectedContractForTab.freelancerName?.charAt(0).toUpperCase() || "T"}
                    </div>
                    <div className="min-w-0 text-xs">
                      <p className="font-bold text-gray-900 truncate">{selectedContractForTab.freelancerName}</p>
                      <p className="text-gray-500 truncate">
                        {selectedContractForTab.freelancerDomain || "Freelancer"}
                        {selectedContractForTab.freelancerEmail ? ` • ${selectedContractForTab.freelancerEmail}` : ""}
                      </p>
                      {(selectedContractForTab.freelancerPayoutEmail || selectedContractForTab.freelancerEmail) && (
                        <p className="text-[11px] text-[#003087] font-medium truncate mt-0.5">
                          PayPal Payout Email:{" "}
                          <span className="font-mono">
                            {selectedContractForTab.freelancerPayoutEmail || selectedContractForTab.freelancerEmail}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                  {selectedContractForTab.freelancerBadges && selectedContractForTab.freelancerBadges.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {selectedContractForTab.freelancerBadges.map((b) => (
                        <Badge key={b} variant="paypal" size="sm">{b}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                      Project Brief &amp; Deadline
                    </span>
                    <span className="text-[11px] font-semibold text-[#003087]">
                      Due: {selectedContractForTab.projectDeadline ? formatDate(selectedContractForTab.projectDeadline) : "Flexible"}
                    </span>
                  </div>
                  <p className="text-gray-600 line-clamp-3 leading-relaxed">
                    {selectedContractForTab.projectDescription || "Escrow milestone contract active."}
                  </p>
                  <div className="pt-1">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                      <span>Milestone Progress</span>
                      <span className="font-bold text-[#003087]">
                        {selectedContractForTab.milestones.filter((m) => m.status === "RELEASED").length} /{" "}
                        {selectedContractForTab.milestones.length} Completed
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0070E0] rounded-full transition-all"
                        style={{
                          width: `${
                            selectedContractForTab.milestones.length > 0
                              ? Math.round(
                                  (selectedContractForTab.milestones.filter((m) => m.status === "RELEASED").length /
                                    selectedContractForTab.milestones.length) *
                                    100
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Milestones list with client review controls */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Milestone Review &amp; Release Schedule
                </h3>

                <div className="space-y-4">
                  {selectedContractForTab.milestones.map((ms) => {
                    const statusInfo = getMilestoneStatusInfo(ms.status);
                    return (
                      <div
                        key={ms.id}
                        className={`p-5 rounded-2xl border transition-all ${
                          ms.status === "IN_REVIEW"
                            ? "border-purple-300 bg-purple-50/20 ring-1 ring-purple-300"
                            : ms.status === "ACTIVE"
                            ? "border-blue-200 bg-blue-50/10"
                            : ms.status === "RELEASED"
                            ? "border-emerald-200 bg-emerald-50/20"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-md bg-gray-100 text-gray-700">
                              Step {ms.stepNumber}
                            </span>
                            <h4 className="text-sm font-bold text-gray-900">{ms.title}</h4>
                          </div>
                          <Badge variant={statusInfo.variant} size="sm">{statusInfo.label}</Badge>
                        </div>

                        <p className="text-xs text-gray-600 mb-3">{ms.description}</p>

                        {/* Internal Subtasks Progress Tracker */}
                        {ms.subtasks && ms.subtasks.length > 0 && (
                          <div className="mb-3.5 p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-2.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-[#003087] flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                                Internal Subtask Division ({ms.subtasks.filter(s => s.status === 'COMPLETED').length}/{ms.subtasks.length} Completed)
                              </span>
                              <span className="text-gray-500 font-semibold">
                                {Math.round((ms.subtasks.filter(s => s.status === 'COMPLETED').length / ms.subtasks.length) * 100)}% Milestone Progress
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {ms.subtasks.map((st) => (
                                <div
                                  key={st.id}
                                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                                    st.status === 'COMPLETED'
                                      ? 'bg-emerald-50/50 border-emerald-200'
                                      : st.status === 'IN_PROGRESS'
                                      ? 'bg-blue-50/50 border-blue-200'
                                      : 'bg-white border-gray-200'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-extrabold text-[#003087] text-[10px]">{st.stepNumber}</span>
                                      <span className="font-semibold text-gray-800 truncate">{st.title}</span>
                                    </div>
                                    <span className="text-[10px] text-gray-500 block mt-0.5">
                                      {st.percentageOfTotal}% total ({formatCurrency(st.paymentAmount, ms.currency)})
                                    </span>
                                  </div>
                                  <Badge
                                    variant={
                                      st.status === 'COMPLETED'
                                        ? 'success'
                                        : st.status === 'IN_PROGRESS'
                                        ? 'inReview'
                                        : 'neutral'
                                    }
                                    size="sm"
                                  >
                                    {st.status.replace('_', ' ')}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Deliverable details if submitted */}
                        {ms.submission && (
                          <div className="p-3.5 bg-white rounded-xl border border-gray-200 text-xs space-y-2 mb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-700">Submitted Work Proof:</span>
                                <Badge
                                  variant={
                                    ms.revisionCount && ms.revisionCount >= 3
                                      ? "danger"
                                      : ms.revisionCount && ms.revisionCount > 0
                                      ? "warning"
                                      : "neutral"
                                  }
                                  size="sm"
                                >
                                  {!ms.revisionCount || ms.revisionCount === 0
                                    ? "Initial Submission"
                                    : ms.revisionCount === 1
                                    ? "Revision 1 of 3"
                                    : ms.revisionCount === 2
                                    ? "Revision 2 of 3"
                                    : "Revision 3 of 3 (Final Submission)"}
                                </Badge>
                              </div>
                              <span className="text-gray-400 text-[11px]">{formatDate(ms.submission.submittedAt)}</span>
                            </div>
                            <a
                              href={ms.submission.submissionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#0070E0] font-mono text-[11px] break-all inline-flex items-center gap-1 hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {ms.submission.submissionUrl}
                            </a>
                            {ms.submission.notes && (
                              <p className="text-gray-600 text-[11px] bg-gray-50 p-2 rounded">
                                Notes: {ms.submission.notes}
                              </p>
                            )}

                            {/* Advisory AI Report */}
                            {ms.submission.aiVerificationReport && (
                              <div className="mt-2 p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs space-y-1">
                                <div className="flex items-center justify-between font-bold text-purple-900">
                                  <span className="flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                                    Advisory Score: {ms.submission.aiVerificationReport.overallScore}% (Grade{" "}
                                    {ms.submission.aiVerificationReport.qualityGrade})
                                  </span>
                                  <span className="text-[10px] text-purple-600 font-normal">Advisory Only</span>
                                </div>
                                <ul className="text-[11px] text-purple-800 space-y-0.5 pt-1">
                                  {ms.submission.aiVerificationReport.checklist.map((item, idx) => (
                                    <li key={idx} className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>{item.criterion}: {item.evidenceNotes}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div>
                            <span className="font-bold text-gray-800">
                              Disbursement: {formatCurrency(ms.paymentAmount, ms.currency)} ({ms.percentage}%)
                            </span>
                            <span className="text-gray-400 ml-2">
                              Due {ms.deadline || selectedContractForTab.projectDeadline ? formatDate(ms.deadline || selectedContractForTab.projectDeadline!) : "No deadline set"}
                            </span>
                          </div>

                          {/* Client Approval & Override Controls */}
                          <div className="flex flex-wrap items-center gap-2">
                            {ms.status === "ACTIVE" && !ms.submission && (
                              <span className="text-[11px] text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full font-medium">
                                Awaiting talent submission
                              </span>
                            )}
                            {ms.status === "ACTIVE" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleOverrideMilestoneRelease(ms.id, ms.title, ms.paymentAmount, ms.currency)}
                              >
                                <DollarSign className="w-3.5 h-3.5 mr-1" />
                                Release Upfront (Override)
                              </Button>
                            )}
                            {(ms.status === "IN_REVIEW" || ms.status === "SUBMITTED" || ms.status === "REVISION_REQUESTED") && (
                              <>
                                {ms.status !== "REVISION_REQUESTED" &&
                                  Boolean(ms.submission || (ms.submissionHistory && ms.submissionHistory.length > 0)) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs text-amber-700 hover:bg-amber-50"
                                    onClick={() => handleOpenRevisionModal(ms.id)}
                                  >
                                    Request Changes
                                  </Button>
                                )}
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="text-xs"
                                  onClick={() => handleApproveMilestone(ms.id)}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                  Approve &amp; Release Payment
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PayPal Escrow Audit Ledger */}
              {paypalTxs.length > 0 && (
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[#003087] uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#0070E0]" />
                      PayPal Escrow Audit Ledger ({paypalTxs.length})
                    </h3>
                    <Badge variant="paypal" size="sm">PayPal {paypalTxs[0]?.mode?.toUpperCase() || "SANDBOX"}</Badge>
                  </div>
                  <div className="space-y-2">
                    {paypalTxs.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800">{tx.operation}</span>
                            <Badge variant={tx.status === "COMPLETED" ? "success" : "warning"} size="sm">
                              {tx.status}
                            </Badge>
                          </div>
                          <div className="text-[11px] font-mono text-gray-500 flex flex-wrap gap-x-3">
                            {tx.paypalOrderId && <span>Order: {tx.paypalOrderId}</span>}
                            {tx.paypalAuthId && <span>Auth: {tx.paypalAuthId}</span>}
                            {tx.paypalCaptureId && <span>Capture: {tx.paypalCaptureId}</span>}
                            {tx.paypalPayoutBatchId && <span>Payout: {tx.paypalPayoutBatchId}</span>}
                            {tx.paypalRefundId && <span>Refund: {tx.paypalRefundId}</span>}
                          </div>
                        </div>
                        <span className="font-bold text-[#003087] shrink-0">
                          {formatCurrency(tx.amount, tx.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct Project Discussion with Assigned Talent */}
              <ContractChatPanel
                contractId={selectedContractForTab.id}
                counterpartyName={selectedContractForTab.freelancerName}
                counterpartyRoleLabel="Talent"
              />
            </CardContent>
          </Card>
            </div>
          </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 6: COMPANY PROFILE
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "profile" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-[#003087] tracking-tight">Client Organization Profile</h2>
              <p className="text-xs text-gray-500">Manage hiring organization details and escrow preferences.</p>
            </div>
            {!isEditingProfile && (
              <Button variant="outline" size="sm" onClick={() => setIsEditingProfile(true)}>
                <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                Edit Profile
              </Button>
            )}
          </div>

          <Card className="border-gray-100 bg-white shadow-md rounded-3xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#003087] text-white flex items-center justify-center font-bold text-lg shadow-xs">
                  {currentUser.companyName
                    ? currentUser.companyName.charAt(0).toUpperCase()
                    : currentUser.name
                    ? currentUser.name.charAt(0).toUpperCase()
                    : "C"}
                </div>
                <div>
                  <CardTitle>{currentUser.companyName || currentUser.name}</CardTitle>
                  <CardDescription>{currentUser.domain} • Verified Client Member</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {!isEditingProfile ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="font-semibold text-gray-700 block mb-1">Company Description:</span>
                    <p className="text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      {currentUser.companyDescription || "Enterprise venture studio building autonomous commerce protocols."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="font-semibold text-gray-700 block mb-1">Primary Contact:</span>
                      <span className="text-gray-800 font-bold">{contactName}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700 block mb-1">Business Email:</span>
                      <span className="text-gray-800 font-bold">{currentUser.email}</span>
                    </div>
                  </div>

                  {/* Client Location & Registered Business Address */}
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#003087]">
                        <MapPin className="w-4 h-4 text-[#0070E0]" />
                        <span>Registered Business Location</span>
                      </div>
                      <Badge variant="warning" size="sm">
                        Address Provided (Pending Independent Verification)
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-gray-400 block font-medium">City:</span>
                        <strong className="text-gray-800">{city}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block font-medium">State / Province:</span>
                        <strong className="text-gray-800">{stateName}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block font-medium">Country:</span>
                        <strong className="text-gray-800">{country}</strong>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-200 text-xs">
                      <span className="text-gray-400 block font-medium">Complete Business Address:</span>
                      <p className="text-gray-700 mt-0.5 font-medium">
                        {address} {postalCode ? "(" + postalCode + ")" : ""}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1 italic">
                        Transparently shared with evaluating freelancers. Not publicly indexed to unauthenticated web visitors.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span><strong>Verified Escrow Client:</strong> Milestone disbursements verified through PayPal sandbox API.</span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
                  <Input
                    label="Company / Brand Name"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />

                  <Input
                    label="Contact Name"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />

                  <Input
                    label="Industry / Domain"
                    required
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  />

                  <Textarea
                    label="Company Description"
                    required
                    rows={3}
                    value={companyDescription}
                    onChange={(e) => setCompanyDescription(e.target.value)}
                  />

                  {/* Location & Address Inputs */}
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#0070E0]" />
                      <span className="text-xs font-bold text-gray-900">Organization Location &amp; Address</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Input
                        label="Country"
                        required
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                      />
                      <Input
                        label="State / Province"
                        required
                        value={stateName}
                        onChange={(e) => setStateName(e.target.value)}
                      />
                      <Input
                        label="City"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <Input
                          label="Complete Business / Company Address"
                          required
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                        />
                      </div>
                      <Input
                        label="Postal / PIN Code (Optional)"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button type="submit" variant="primary" size="sm">
                      Save Organization Details
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingProfile(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── MODAL: COMPREHENSIVE CANDIDATE DOSSIER & CV EVALUATION ── */}
      {selectedApplicantForReview && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden my-8 animate-slide-up">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#003087] text-white flex items-center justify-center font-bold text-lg shadow-xs">
                  {selectedApplicantForReview.freelancerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-[#003087]">
                      {selectedApplicantForReview.freelancerName}
                    </h3>
                    <Badge variant="paypal" size="sm">
                      {selectedApplicantForReview.freelancerDomain}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    Application Dossier &amp; Verified Professional Credentials
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedApplicantForReview(null)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Proposal & Bid Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 text-xs">
                <div>
                  <span className="text-gray-400 block font-medium">Proposed Bid:</span>
                  <span className="text-base font-extrabold text-[#003087]">
                    {formatCurrency(selectedApplicantForReview.bidAmount, selectedApplicantForReview.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Estimated Delivery:</span>
                  <span className="text-base font-bold text-emerald-600">
                    {selectedApplicantForReview.estimatedDeliveryDays || 14} Days
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block font-medium">Trust Score:</span>
                  <span className="text-base font-bold text-gray-900">
                    {selectedApplicantForReview.trustScorecard.rating} ★ ({selectedApplicantForReview.trustScorecard.onTimeDeliveryRate}% on-time)
                  </span>
                </div>
              </div>

              {/* Cover Letter */}
              <div>
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                  Application Cover Letter
                </h4>
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-xs text-gray-700 leading-relaxed">
                  {selectedApplicantForReview.coverLetter}
                </div>
              </div>

              {/* Technical Skills & Expertise */}
              <div>
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                  Technical Expertise &amp; Verified Skills
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedApplicantForReview.freelancerProfile?.skills || [
                    "React", "Next.js", "TypeScript", "Tailwind CSS", "FastAPI", "PostgreSQL"
                  ]).map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-[#003087] border border-blue-200"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Work Experience & Education */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                  <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-[#0070E0]" />
                    Work Experience ({selectedApplicantForReview.freelancerProfile?.experienceYears || 6} Years)
                  </h5>
                  <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside">
                    {(selectedApplicantForReview.freelancerProfile?.experience || [
                      "Lead Frontend Engineer at Web3 FinTech (2023 - Present)",
                      "Senior Software Developer at CloudScale Systems (2021 - 2023)"
                    ]).map((exp, idx) => (
                      <li key={idx}>{exp}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                  <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-[#0070E0]" />
                    Education &amp; Credentials
                  </h5>
                  <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside">
                    {(selectedApplicantForReview.freelancerProfile?.education || [
                      "B.Tech in Computer Science, IIT Bombay (2018-2022)"
                    ]).map((edu, idx) => (
                      <li key={idx}>{edu}</li>
                    ))}
                    {(selectedApplicantForReview.freelancerProfile?.certifications || [
                      "Certified Fintech Security Practitioner (2024)"
                    ]).map((cert, idx) => (
                      <li key={idx} className="text-emerald-700 font-medium">
                        Cert: {cert}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Uploaded CV & Document View */}
              <div className="p-4 rounded-2xl bg-blue-50/40 border border-blue-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-[#0070E0]" />
                    <span className="text-xs font-bold text-[#003087]">Uploaded CV / Resume Document</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    CV Attached &amp; Validated
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 rounded-xl border border-blue-100 text-xs">
                  <div>
                    <span className="font-bold text-gray-800 block">
                      {selectedApplicantForReview.freelancerProfile?.cvFile?.name || "Vachan_Singh_Senior_FullStack_CV.pdf"}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Uploaded {formatDate(selectedApplicantForReview.freelancerProfile?.cvFile?.uploadedAt || selectedApplicantForReview.createdAt)} • 148 KB
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 bg-blue-50 text-[#0070E0] border-blue-200 hover:bg-blue-100"
                    onClick={() => setShowCVPreviewModal(true)}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    View / Inspect CV
                  </Button>
                </div>

                {/* CV Extracted Summary */}
                {selectedApplicantForReview.freelancerProfile?.cvFile?.extractedInfo?.summary && (
                  <p className="text-xs text-gray-600 bg-white p-3 rounded-xl border border-gray-100 leading-relaxed">
                    <strong>CV Executive Summary:</strong> {selectedApplicantForReview.freelancerProfile.cvFile.extractedInfo.summary}
                  </p>
                )}
              </div>

              {/* AI-Assisted Candidate Analysis (Demo Advisory) */}
              <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-purple-900">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>AI-Assisted Candidate Analysis</span>
                  </div>
                  <Badge variant="inReview" size="sm">
                    DEMO ADVISORY
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[11px]">
                  <div className="bg-white p-2.5 rounded-xl border border-purple-100">
                    <span className="font-bold text-emerald-700 block mb-1">Skills Matching Project:</span>
                    <p className="text-gray-600">
                      Next.js 14, TypeScript, Tailwind CSS, Escrow architecture, and responsive UI engineering match 98% of project requirements.
                    </p>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-purple-100">
                    <span className="font-bold text-amber-700 block mb-1">Identified Focus Areas:</span>
                    <p className="text-gray-600">
                      No critical skill gaps identified. Candidate exhibits top on-time delivery (98%) and clean code certifications.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedApplicantForReview(null)}
              >
                Close Dossier
              </Button>

              {selectedApplicantForReview.status === "PENDING" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-600 hover:bg-rose-50"
                    onClick={() => {
                      handleDeclineCandidate(selectedApplicantForReview.id);
                      setSelectedApplicantForReview(null);
                    }}
                  >
                    Decline
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      handleAcceptCandidate(selectedApplicantForReview.id);
                      setSelectedApplicantForReview(null);
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Accept Candidate &amp; Lock Escrow
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CV DOCUMENT VIEWER ── */}
      {showCVPreviewModal && selectedApplicantForReview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden space-y-4 p-6 animate-slide-up">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-[#0070E0]" />
                <h3 className="font-bold text-base text-gray-900">
                  CV Document: {selectedApplicantForReview.freelancerProfile?.cvFile?.name || "Vachan_Singh_Senior_FullStack_CV.pdf"}
                </h3>
              </div>
              <button
                onClick={() => setShowCVPreviewModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-4 text-xs font-mono">
              <div className="border-b border-gray-200 pb-3">
                <h2 className="text-base font-bold text-gray-900 font-sans">
                  {selectedApplicantForReview.freelancerName}
                </h2>
                <p className="text-gray-500 font-sans">
                  {selectedApplicantForReview.freelancerDomain} • 6 Years Professional Experience
                </p>
              </div>

              <div>
                <span className="font-bold text-[#003087] block mb-1">CORE TECHNICAL COMPETENCIES:</span>
                <p className="text-gray-700">
                  Next.js, React, TypeScript, Tailwind CSS, FastAPI, Python, PostgreSQL, Smart Contracts, Autonomous Escrow Architecture
                </p>
              </div>

              <div>
                <span className="font-bold text-[#003087] block mb-1">CAREER MILESTONES:</span>
                <p className="text-gray-700">
                  • Lead Frontend Engineer (Web3 FinTech) - Multi-party milestone escrow contracts &amp; responsive fintech dashboards<br />
                  • Senior Software Developer (CloudScale) - Micro-frontends &amp; high-assurance API integration
                </p>
              </div>

              <div>
                <span className="font-bold text-[#003087] block mb-1">EDUCATION &amp; CERTIFICATIONS:</span>
                <p className="text-gray-700">
                  • Bachelor of Technology in Computer Science - IIT Bombay (CGPA 8.9/10)<br />
                  • Certified Fintech Security Practitioner (FSI-2024)<br />
                  • AWS Certified Solutions Architect - Associate
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowCVPreviewModal(false)}>
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REQUEST REVISION ── */}
      {isRevisionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-gray-900">Request Milestone Revisions</h3>
                <p className="text-xs text-gray-500">Provide actionable punch-list feedback to the freelancer</p>
              </div>
              <button
                onClick={() => setIsRevisionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRevision} className="p-6 space-y-4">
              {revisionErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {revisionErrorMsg}
                </div>
              )}
              <Textarea
                label="Punch-list & Feedback Notes"
                required
                rows={4}
                placeholder="List the specific changes required before payment release..."
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsRevisionModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={isSubmittingRevision}>
                  {isSubmittingRevision ? "Sending..." : "Send Revision Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── PayPal Immediate Escrow Checkout Modal (Triggered on Candidate Accept) ── */}
      {pendingEscrowCheckout && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden p-6 space-y-5 animate-slide-up">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#0070E0] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#003087]">Lock Escrow via PayPal</h3>
                  <p className="text-xs text-gray-500">Contract #{pendingEscrowCheckout.contractId} Created</p>
                </div>
              </div>
              <button
                onClick={() => setPendingEscrowCheckout(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Project:</span>
                <strong className="text-gray-900 text-right">{pendingEscrowCheckout.projectTitle}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Assigned Talent:</span>
                <strong className="text-gray-900">{pendingEscrowCheckout.talentName}</strong>
              </div>
              <div className="flex justify-between pt-2 border-t border-blue-100">
                <span className="text-gray-600 font-semibold">Escrow Amount to Hold:</span>
                <strong className="text-base font-extrabold text-[#003087]">
                  {formatCurrency(pendingEscrowCheckout.amount, pendingEscrowCheckout.currency)}
                </strong>
              </div>
              <div className="text-[11px] font-mono text-gray-500 pt-1">
                PayPal Order ID: {pendingEscrowCheckout.orderId}
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Your funds will be authorized and debited into PayPal Escrow so{" "}
              <strong>{pendingEscrowCheckout.talentName}</strong> can begin Milestone Step 1.
            </p>

            {/* Step 1: Owner Password & Payer Verification Gate */}
            {!escrowSecurityVerified ? (
              <form onSubmit={handleVerifyEscrowPassword} className="space-y-3 p-4 rounded-2xl bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-2 text-xs font-bold text-[#003087]">
                  <Lock className="w-4 h-4 text-[#0070E0]" />
                  <span>Security Check: Verify Owner Credentials Before PayPal Checkout</span>
                </div>
                {escrowSecurityError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                    {escrowSecurityError}
                  </p>
                )}
                <Input
                  label="Payer PayPal Buyer Email (Optional confirmation)"
                  type="email"
                  placeholder="e.g. sb-buyer@personal.example.com"
                  value={payerPaypalEmail}
                  onChange={(e) => setPayerPaypalEmail(e.target.value)}
                />
                <Input
                  label="Your TrustPay Account Password"
                  type="password"
                  required
                  placeholder="Enter your password to unlock PayPal checkout"
                  value={escrowSecurityPassword}
                  onChange={(e) => setEscrowSecurityPassword(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isVerifyingEscrowPass}
                  className="w-full"
                >
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                  {isVerifyingEscrowPass ? "Verifying Owner..." : "Verify Owner & Unlock PayPal Payment"}
                </Button>
              </form>
            ) : (
            <div className="flex flex-col gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Owner verified! Complete your PayPal Buyer login or use Simulated PayPal Escrow below.</span>
              </div>

              {paypalErrorMsg && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                  {paypalErrorMsg}
                </p>
              )}

              {pendingEscrowCheckout.mode !== "mock" ? (
                <>
                  <PayPalSmartButtons
                    contractId={pendingEscrowCheckout.contractId}
                    currency={pendingEscrowCheckout.currency}
                    onAuthorized={handleSmartButtonsAuthorized}
                    onError={handleSmartButtonsError}
                  />
                  {pendingEscrowCheckout.approvalUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = pendingEscrowCheckout.approvalUrl!;
                      }}
                      className="text-center text-[11px] font-semibold text-[#0070E0] hover:underline cursor-pointer"
                    >
                      Or open PayPal Sandbox Checkout in full window →
                    </button>
                  )}
                </>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  disabled={isFundingEscrow}
                  onClick={async () => {
                    setIsFundingEscrow(true);
                    setPaypalErrorMsg("");
                    try {
                      await authorizePayPalEscrow(pendingEscrowCheckout.contractId, pendingEscrowCheckout.orderId, true);
                      setPendingEscrowCheckout(null);
                      setActionSuccessMsg("PayPal Escrow Authorized! Funds locked and Step 1 is now ACTIVE.");
                    } catch (err: any) {
                      setPaypalErrorMsg(err?.message || "Failed to lock escrow.");
                    } finally {
                      setIsFundingEscrow(false);
                    }
                  }}
                  className="w-full bg-[#003087] hover:bg-[#001f5c] text-white font-bold"
                >
                  <Lock className="w-4 h-4 mr-1.5" />
                  {isFundingEscrow
                    ? "Authorizing Escrow..."
                    : `Authorize & Lock ${formatCurrency(pendingEscrowCheckout.amount, pendingEscrowCheckout.currency)}`}
                </Button>
              )}
            </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPendingEscrowCheckout(null)}
              className="w-full text-xs text-gray-500"
            >
              I&apos;ll Fund Later from Active Contracts
            </Button>
          </div>
        </div>
      )}

      {/* ── Password-Authenticated Upfront / Override Transfer Modal ── */}
      {overrideAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden p-6 space-y-4 animate-slide-up">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900">
                    {overrideAuthModal.type === "MILESTONE"
                      ? "Password-Protected Upfront Override"
                      : "Full Upfront Escrow Release"}
                  </h3>
                  <p className="text-xs text-gray-500">Owner verification required to transfer funds</p>
                </div>
              </div>
              <button
                onClick={() => setOverrideAuthModal(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs space-y-1.5">
              <p className="text-amber-900">
                You are overriding standard verification gates to immediately transfer{" "}
                <strong>{formatCurrency(overrideAuthModal.amount, overrideAuthModal.currency)}</strong> to{" "}
                <strong>{overrideAuthModal.talentName}</strong> ({overrideAuthModal.title}).
              </p>
            </div>

            {overrideError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {overrideError}
              </div>
            )}

            <form onSubmit={handleConfirmOverrideSubmit} className="space-y-3">
              <Input
                label="Confirm Account Password"
                type="password"
                required
                placeholder="Enter your TrustPay account password"
                value={overridePassword}
                onChange={(e) => setOverridePassword(e.target.value)}
              />
              <Input
                label="Override Reason (Optional audit note)"
                placeholder="e.g. Approved early milestone release"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOverrideAuthModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isExecutingOverride}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  {isExecutingOverride
                    ? "Verifying & Transferring..."
                    : `Confirm & Transfer ${formatCurrency(overrideAuthModal.amount, overrideAuthModal.currency)}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientDashboardPage() {
  return (
    <RequireAuth requiredRole="CLIENT">
      <Suspense fallback={<div className="p-12 text-center text-xs text-gray-400">Loading Client Dashboard...</div>}>
        <ClientDashboardContent />
      </Suspense>
    </RequireAuth>
  );
}
