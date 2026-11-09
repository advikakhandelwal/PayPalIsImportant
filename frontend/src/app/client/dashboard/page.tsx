"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatCurrency, formatDate, getMilestoneStatusInfo, getEscrowStatusInfo } from "@/lib/utils";
import { Milestone, Project, Application, MilestoneStatus } from "@/types";
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
} from "lucide-react";

type ClientTab = "overview" | "projects" | "post" | "proposals" | "contracts" | "profile" | "details";

interface MilestoneDraft {
  id?: string;
  title: string;
  description: string;
  percentage: number;
  paymentAmount: number;
  deadline: string;
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

  const { currentUser, updateProfile } = useAuth();
  const {
    projects,
    applications,
    activeContract,
    createProject,
    updateProject,
    approveMilestone,
    requestMilestoneRevision,
  } = useMarketplace();

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

  // Form Fields
  const [newTitle, setNewTitle] = useState("");
  const [newDomain, setNewDomain] = useState("Full-Stack Development");
  const [newTotalBudget, setNewTotalBudget] = useState<number>(3000);
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newDeadline, setNewDeadline] = useState("2026-12-15");
  const [newDescription, setNewDescription] = useState("");
  const [newSkills, setNewSkills] = useState<string[]>(["React", "TypeScript", "Tailwind CSS"]);
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [newExperienceLevel, setNewExperienceLevel] = useState<"Entry" | "Intermediate" | "Expert">("Intermediate");
  const [newAdditionalRequirements, setNewAdditionalRequirements] = useState("");

  // Milestone Builder State (Configurable, NOT hardcoded 30/40/30)
  const [newMilestones, setNewMilestones] = useState<MilestoneDraft[]>([
    {
      title: "Architecture & Foundation Setup",
      description: "Project scaffolding, core contracts, and responsive layout.",
      percentage: 25,
      paymentAmount: 750,
      deadline: "2026-11-20",
    },
    {
      title: "Core Feature Implementation",
      description: "Main feature delivery, backend endpoint integration, and responsive verification.",
      percentage: 50,
      paymentAmount: 1500,
      deadline: "2026-12-05",
    },
    {
      title: "Testing, Audit & Final Handover",
      description: "Criteria verification checklist, zero-leak scan, and documentation handover.",
      percentage: 25,
      paymentAmount: 750,
      deadline: "2026-12-15",
    },
  ]);

  const [postError, setPostError] = useState("");
  const [postSuccess, setPostSuccess] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  // Proposals Filter State
  const [proposalFilter, setProposalFilter] = useState<"ALL" | "AI_SHORTLIST">("ALL");
  const [localApplications, setLocalApplications] = useState<Application[]>(applications);
  const [filterByProjectId, setFilterByProjectId] = useState<string>("ALL");

  useEffect(() => {
    setLocalApplications(applications);
  }, [applications]);

  // Request Revision Modal State
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [revisionMilestoneId, setRevisionMilestoneId] = useState<string>("");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [actionSuccessMsg, setActionSuccessMsg] = useState("");

  // Edit Company Profile State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [companyName, setCompanyName] = useState(currentUser.companyName || "");
  const [contactName, setContactName] = useState(currentUser.name || "");
  const [companyDescription, setCompanyDescription] = useState(currentUser.companyDescription || "");
  const [industry, setIndustry] = useState(currentUser.domain || "Fintech & Autonomous Commerce");
  const [profileSuccessMsg, setProfileSuccessMsg] = useState("");

  const escrowStatusInfo = getEscrowStatusInfo(activeContract.escrowStatus);

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
    setNewCurrency(proj.currency || "USD");
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

  // Candidate review handlers
  const handleAcceptCandidate = (appId: string) => {
    setLocalApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: "ACCEPTED" } : a))
    );
    setActionSuccessMsg("Candidate accepted! Milestone escrow contract agreement activated.");
    setTimeout(() => setActionSuccessMsg(""), 3500);
  };

  const handleDeclineCandidate = (appId: string) => {
    setLocalApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: "REJECTED" } : a))
    );
  };

  const handleApproveMilestone = (milestoneId: string) => {
    approveMilestone(activeContract.id, milestoneId);
    setActionSuccessMsg("Milestone approved! Payout released from escrow to talent.");
    setTimeout(() => setActionSuccessMsg(""), 3500);
  };

  const handleOpenRevisionModal = (milestoneId: string) => {
    setRevisionMilestoneId(milestoneId);
    setRevisionNotes("");
    setIsRevisionModalOpen(true);
  };

  const handleConfirmRevision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionNotes.trim()) return;

    requestMilestoneRevision(activeContract.id, revisionMilestoneId, revisionNotes.trim());
    setIsRevisionModalOpen(false);
    setActionSuccessMsg("Revision request with feedback sent to talent.");
    setTimeout(() => setActionSuccessMsg(""), 3500);
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

                    {/* Currency */}
                    <div className="space-y-1.5 text-left">
                      <label className="block text-xs font-bold text-gray-700">
                        Currency <span className="text-rose-500 font-bold ml-1">*</span>
                      </label>
                      <select
                        value={newCurrency}
                        onChange={(e) => setNewCurrency(e.target.value)}
                        className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070E0]"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="CAD">CAD ($)</option>
                        <option value="AUD">AUD ($)</option>
                      </select>
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
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-2">
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
                          onClick={() => handleAcceptCandidate(app.id)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          Accept Candidate &amp; Lock Escrow
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

          <Card className="border-gray-100 bg-white shadow-lg rounded-3xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">{activeContract.projectTitle}</CardTitle>
                  <CardDescription>
                    Talent: <strong className="text-gray-800">{activeContract.freelancerName}</strong> • Contract:{" "}
                    <code className="text-xs font-mono">{activeContract.id}</code>
                  </CardDescription>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-xs text-gray-500">Escrow Value</span>
                  <p className="text-2xl font-extrabold text-[#003087]">
                    {formatCurrency(activeContract.totalBudget, activeContract.currency)}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Financial Balances */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                <div>
                  <span className="text-xs text-gray-500 block">Funds Held in Escrow</span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatCurrency(activeContract.heldInEscrowAmount, activeContract.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">Released to Talent</span>
                  <span className="text-lg font-bold text-emerald-600">
                    {formatCurrency(activeContract.releasedAmount, activeContract.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">Settlement Progress</span>
                  <span className="text-lg font-bold text-[#0070E0]">
                    {Math.round((activeContract.releasedAmount / activeContract.totalBudget) * 100)}%
                  </span>
                </div>
              </div>

              {/* Milestones list with client review controls */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Milestone Review &amp; Release Schedule
                </h3>

                <div className="space-y-4">
                  {activeContract.milestones.map((ms) => {
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

                        {/* Deliverable details if submitted */}
                        {ms.submission && (
                          <div className="p-3.5 bg-white rounded-xl border border-gray-200 text-xs space-y-2 mb-3">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-gray-700">Submitted Work Proof:</span>
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
                            <span className="text-gray-400 ml-2">Due {formatDate(ms.deadline)}</span>
                          </div>

                          {/* Client Approval Controls */}
                          {(ms.status === "IN_REVIEW" || ms.status === "SUBMITTED") && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs text-amber-700 hover:bg-amber-50"
                                onClick={() => handleOpenRevisionModal(ms.id)}
                              >
                                Request Changes
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                className="text-xs"
                                onClick={() => handleApproveMilestone(ms.id)}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Approve &amp; Release Payment
                              </Button>
                            </div>
                          )}
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
                      <span className="text-gray-800 font-bold">{currentUser.name}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700 block mb-1">Business Email:</span>
                      <span className="text-gray-800 font-bold">{currentUser.email}</span>
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
                    rows={4}
                    value={companyDescription}
                    onChange={(e) => setCompanyDescription(e.target.value)}
                  />

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
                <Button type="submit" variant="primary" size="sm">
                  Send Revision Request
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
    <Suspense fallback={<div className="p-12 text-center text-xs text-gray-400">Loading Client Dashboard...</div>}>
      <ClientDashboardContent />
    </Suspense>
  );
}
