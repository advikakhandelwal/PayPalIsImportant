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
  MessageSquare,
} from "lucide-react";

type ClientTab = "overview" | "projects" | "post" | "proposals" | "contracts" | "profile";

function ClientDashboardContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as ClientTab) || "overview";

  const { currentUser, updateProfile } = useAuth();
  const {
    projects,
    applications,
    activeContract,
    createProject,
    approveMilestone,
    requestMilestoneRevision,
  } = useMarketplace();

  const [activeTab, setActiveTab] = useState<ClientTab>(initialTab);

  // Sync tab if URL param changes
  useEffect(() => {
    const tabParam = searchParams.get("tab") as ClientTab;
    if (tabParam && ["overview", "projects", "post", "proposals", "contracts", "profile"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Post Project State
  const [newTitle, setNewTitle] = useState("");
  const [newDomain, setNewDomain] = useState("Full-Stack Development");
  const [newTotalBudget, setNewTotalBudget] = useState<number>(3000);
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newDeadline, setNewDeadline] = useState("2026-12-15");
  const [newDescription, setNewDescription] = useState("");
  const [newMilestones, setNewMilestones] = useState<Array<{ title: string; description: string; percentage: number; deadline: string }>>([
    { title: "Architecture & Setup", description: "Project scaffolding and core requirements", percentage: 30, deadline: "2026-11-20" },
    { title: "Core Implementation", description: "Main feature delivery and integration", percentage: 40, deadline: "2026-12-05" },
    { title: "Testing & Handover", description: "Verification, documentation and final delivery", percentage: 30, deadline: "2026-12-15" },
  ]);
  const [postError, setPostError] = useState("");
  const [postSuccess, setPostSuccess] = useState("");

  // Proposals Filter State
  const [proposalFilter, setProposalFilter] = useState<"ALL" | "AI_SHORTLIST">("ALL");
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [localApplications, setLocalApplications] = useState<Application[]>(applications);

  // Keep local applications synced
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

  // Total Percentage Calculator
  const totalPercentage = newMilestones.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0);

  // Add Milestone to Builder
  const handleAddMilestone = () => {
    setNewMilestones((prev) => [
      ...prev,
      {
        title: `Milestone ${prev.length + 1}`,
        description: "Specify deliverable requirements",
        percentage: 0,
        deadline: newDeadline,
      },
    ]);
  };

  // Remove Milestone from Builder
  const handleRemoveMilestone = (index: number) => {
    if (newMilestones.length <= 1) return;
    setNewMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  // Update Milestone Field
  const handleUpdateMilestone = (index: number, field: string, value: any) => {
    setNewMilestones((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

  // Publish Project
  const handlePublishProject = (e: React.FormEvent) => {
    e.preventDefault();
    setPostError("");
    setPostSuccess("");

    if (!newTitle.trim() || !newDescription.trim() || newTotalBudget <= 0) {
      setPostError("Please fill out all compulsory project fields.");
      return;
    }

    if (totalPercentage !== 100) {
      setPostError(`Milestone percentages must total exactly 100% (currently ${totalPercentage}%).`);
      return;
    }

    const compiledMilestones: Milestone[] = newMilestones.map((m, idx) => {
      const percentage = Number(m.percentage) || 0;
      const paymentAmount = Math.round((newTotalBudget * percentage) / 100);
      return {
        id: `ms-new-${Date.now()}-${idx + 1}`,
        stepNumber: idx + 1,
        title: m.title.trim() || `Step ${idx + 1}`,
        description: m.description.trim() || "Requirements as specified in brief.",
        deliverableRequirements: [m.description.trim() || "Milestone deliverable"],
        percentage,
        paymentAmount,
        currency: newCurrency,
        deadline: m.deadline,
        status: idx === 0 ? "ACTIVE" : ("LOCKED" as MilestoneStatus),
      };
    });

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
    });

    setPostSuccess("Project published successfully! It is now live in the marketplace.");
    setNewTitle("");
    setNewDescription("");
    setTimeout(() => {
      setPostSuccess("");
      setActiveTab("projects");
    }, 1500);
  };

  // Accept Candidate
  const handleAcceptCandidate = (appId: string) => {
    setLocalApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: "ACCEPTED" } : a))
    );
    setActionSuccessMsg("Candidate accepted! Milestone escrow contract agreement activated.");
    setTimeout(() => setActionSuccessMsg(""), 3500);
  };

  // Decline Candidate
  const handleDeclineCandidate = (appId: string) => {
    setLocalApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: "REJECTED" } : a))
    );
  };

  // Approve Milestone & Release Payment
  const handleApproveMilestone = (milestoneId: string) => {
    approveMilestone(activeContract.id, milestoneId);
    setActionSuccessMsg("Milestone approved! Payout released from escrow to talent.");
    setTimeout(() => setActionSuccessMsg(""), 3500);
  };

  // Request Revision
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

  // Save Company Profile
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

  // Filtered Applications for Inbox
  const displayedApplications = localApplications.filter((app) => {
    if (proposalFilter === "AI_SHORTLIST") {
      return app.aiRecommendation && app.aiRecommendation.fitScore >= 90;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-paypal-dark flex items-center justify-center font-bold text-lg">
            {currentUser.companyName
              ? currentUser.companyName.charAt(0).toUpperCase()
              : currentUser.name
              ? currentUser.name.charAt(0).toUpperCase()
              : "C"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                {currentUser.companyName || currentUser.name || "Client Organization"}
              </h1>
              <Badge variant="paypal" size="sm">Client Mode</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Contact: <strong className="text-slate-700">{currentUser.name}</strong> • Industry:{" "}
              <strong className="text-slate-700">{currentUser.domain}</strong> • {currentUser.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="outline" size="sm">Back to Marketplace</Button>
          </Link>
        </div>
      </div>

      {/* Sticky Navigation Taskbar */}
      <nav className="sticky top-16 z-30 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 p-1.5 shadow-xs overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "overview"
                ? "bg-paypal-dark text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Overview
          </button>

          <button
            onClick={() => setActiveTab("projects")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "projects"
                ? "bg-paypal-dark text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            My Projects ({projects.length})
          </button>

          <button
            onClick={() => setActiveTab("post")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "post"
                ? "bg-paypal-dark text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Post a Project
          </button>

          <button
            onClick={() => setActiveTab("proposals")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "proposals"
                ? "bg-paypal-dark text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Applications & Proposals ({localApplications.length})
          </button>

          <button
            onClick={() => setActiveTab("contracts")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "contracts"
                ? "bg-paypal-dark text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Active Contracts
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "profile"
                ? "bg-paypal-dark text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            Company Profile
          </button>
        </div>
      </nav>

      {/* Global Action Success Notification */}
      {actionSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {profileSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{profileSuccessMsg}</span>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4 space-y-1">
              <span className="text-xs text-slate-500 block">Active Escrows</span>
              <span className="text-xl font-bold text-slate-900">1</span>
              <span className="text-[11px] text-slate-400 block">PayPal escrow secured</span>
            </Card>

            <Card className="p-4 space-y-1">
              <span className="text-xs text-slate-500 block">Committed Budget</span>
              <span className="text-xl font-bold text-paypal-dark">
                {formatCurrency(activeContract.totalBudget, activeContract.currency)}
              </span>
              <span className="text-[11px] text-slate-400 block">Milestone contract value</span>
            </Card>

            <Card className="p-4 space-y-1">
              <span className="text-xs text-slate-500 block">Received Proposals</span>
              <span className="text-xl font-bold text-paypal-blue">{localApplications.length}</span>
              <span className="text-[11px] text-slate-400 block">AI shortlist + direct bids</span>
            </Card>

            <Card className="p-4 space-y-1">
              <span className="text-xs text-slate-500 block">Escrow Reliability</span>
              <span className="text-xl font-bold text-emerald-600">100%</span>
              <span className="text-[11px] text-slate-400 block">Upfront fund authorization</span>
            </Card>
          </div>

          {/* Active Contract Quick View */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle>Current Escrow Milestone Hub</CardTitle>
                  <CardDescription>Review progress and approve sequential milestone disbursements</CardDescription>
                </div>
                <Badge variant={escrowStatusInfo.variant}>{escrowStatusInfo.label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{activeContract.projectTitle}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assigned Talent: <strong className="text-slate-800">{activeContract.freelancerName}</strong> • Escrow Balance:{" "}
                    <span className="text-slate-900 font-semibold">
                      {formatCurrency(activeContract.heldInEscrowAmount, activeContract.currency)}
                    </span>
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setActiveTab("contracts")}>
                  Manage Escrow Milestones
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900">Post New Project Brief</h4>
                <p className="text-xs text-slate-500 mt-0.5">Define custom milestones and invite verified talent.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("post")}>
                Post a Project
              </Button>
            </Card>

            <Card className="p-5 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900">Applicant Inbox</h4>
                <p className="text-xs text-slate-500 mt-0.5">Review freelancer proposals and AI recommendations.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("proposals")}>
                Review Proposals
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: MY PROJECTS */}
      {activeTab === "projects" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">My Posted Projects</h2>
              <p className="text-xs text-slate-500">Manage listings, view milestone structures, and inspect applications.</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setActiveTab("post")}>
              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
              Post New Project
            </Button>
          </div>

          <div className="space-y-4">
            {projects.map((proj) => (
              <Card key={proj.id}>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{proj.title}</CardTitle>
                        <Badge variant="paypal" size="sm">{proj.domain}</Badge>
                        <Badge variant="neutral" size="sm">{proj.status}</Badge>
                      </div>
                      <CardDescription>Created {formatDate(proj.createdAt)} • Deadline: {formatDate(proj.deadline)}</CardDescription>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">Total Budget</span>
                      <span className="text-base font-bold text-paypal-dark">
                        {formatCurrency(proj.totalBudget, proj.currency)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">{proj.description}</p>

                  {/* Milestone splits */}
                  <div className="pt-2">
                    <span className="text-xs font-semibold text-slate-700 block mb-1.5">Milestone Schedule:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {proj.milestones.map((m) => (
                        <div key={m.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                          <span className="font-bold text-slate-800 block">Step {m.stepNumber}: {m.title}</span>
                          <span className="text-slate-500 text-[11px] block mt-0.5">
                            {m.percentage}% ({formatCurrency(m.paymentAmount, m.currency)})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      {proj.applicationsCount || 0} Freelancer applications received
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setActiveTab("proposals")}>
                        Review Applications
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setActiveTab("contracts")}>
                        Milestone Schedule
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: POST A PROJECT */}
      {activeTab === "post" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Post a New Project</h2>
            <p className="text-xs text-slate-500">
              Define scope, configurable milestones, and currency budget to secure upfront escrow funding.
            </p>
          </div>

          <Card>
            <form onSubmit={handlePublishProject}>
              <CardContent className="space-y-5 pt-6">
                {postError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{postError}</span>
                  </div>
                )}

                {postSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{postSuccess}</span>
                  </div>
                )}

                <Input
                  label="Project Title"
                  required
                  placeholder="e.g. Next.js Autonomous Escrow Dashboard with Tailwind"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5 text-left">
                    <label className="block text-xs font-semibold text-slate-700">
                      Domain / Category <span className="text-rose-500 font-bold ml-0.5">*</span>
                    </label>
                    <select
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paypal-blue"
                    >
                      <option value="Full-Stack Development">Full-Stack Development</option>
                      <option value="Frontend Engineering">Frontend Engineering</option>
                      <option value="Backend & APIs">Backend & APIs</option>
                      <option value="Video Production & Influencer">Video Production & Influencer</option>
                      <option value="AI Engineering">AI Engineering</option>
                      <option value="UI/UX Design">UI/UX Design</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label className="block text-xs font-semibold text-slate-700">
                      Total Project Budget <span className="text-rose-500 font-bold ml-0.5">*</span>
                    </label>
                    <Input
                      type="number"
                      required
                      min={100}
                      value={newTotalBudget}
                      onChange={(e) => setNewTotalBudget(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label className="block text-xs font-semibold text-slate-700">
                      Currency <span className="text-rose-500 font-bold ml-0.5">*</span>
                    </label>
                    <select
                      value={newCurrency}
                      onChange={(e) => setNewCurrency(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paypal-blue"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
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
                </div>

                <Textarea
                  label="Project Description & Deliverable Scope"
                  required
                  rows={4}
                  placeholder="Detail the technical requirements, design criteria, and testing guidelines..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />

                {/* Configurable Milestone Builder */}
                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Configurable Milestone Splits <span className="text-rose-500 font-bold ml-0.5">*</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Customize sequential steps and percentages (Must total 100%).
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
                        totalPercentage === 100
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}
                    >
                      Total: {totalPercentage}% / 100%
                    </span>
                  </div>

                  <div className="space-y-3">
                    {newMilestones.map((m, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700">Step {idx + 1}</span>
                          {newMilestones.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMilestone(idx)}
                              className="text-slate-400 hover:text-rose-600 text-xs flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-6">
                            <Input
                              placeholder="Milestone title"
                              value={m.title}
                              onChange={(e) => handleUpdateMilestone(idx, "title", e.target.value)}
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <Input
                              type="number"
                              min={5}
                              max={100}
                              placeholder="Percentage (%)"
                              value={m.percentage}
                              onChange={(e) => handleUpdateMilestone(idx, "percentage", Number(e.target.value))}
                              helperText={
                                newTotalBudget > 0
                                  ? formatCurrency(Math.round((newTotalBudget * (m.percentage || 0)) / 100), newCurrency)
                                  : undefined
                              }
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
                          placeholder="Deliverable requirement checklist for this step..."
                          value={m.description}
                          onChange={(e) => handleUpdateMilestone(idx, "description", e.target.value)}
                        />
                      </div>
                    ))}
                  </div>

                  <Button type="button" variant="outline" size="sm" onClick={handleAddMilestone} className="text-xs">
                    + Add Another Milestone Step
                  </Button>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <Button type="submit" variant="primary">
                    <Send className="w-4 h-4 mr-1.5" />
                    Publish Project & Prepare Escrow
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      )}

      {/* TAB 4: APPLICATIONS & PROPOSALS (APPLICANT INBOX) */}
      {activeTab === "proposals" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Applicant Inbox</h2>
              <p className="text-xs text-slate-500">
                Review proposals with the choice of manual candidate review or AI-assisted shortlisting.
              </p>
            </div>

            {/* Filter Toggle: All vs AI Shortlist */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                onClick={() => setProposalFilter("ALL")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  proposalFilter === "ALL" ? "bg-white text-paypal-dark shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Applicants ({localApplications.length})
              </button>
              <button
                onClick={() => setProposalFilter("AI_SHORTLIST")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  proposalFilter === "AI_SHORTLIST"
                    ? "bg-white text-purple-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                AI-Recommended Shortlist
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {displayedApplications.map((app) => (
              <Card key={app.id}>
                <CardHeader>
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

                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">Proposed Bid</span>
                      <span className="text-base font-bold text-paypal-dark">
                        {formatCurrency(app.bidAmount, app.currency)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
                    <span className="font-semibold block text-slate-900 mb-0.5">Cover Letter:</span>
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
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Rating:</span>
                      <span className="font-bold text-slate-800">{app.trustScorecard.rating} ★</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">On-Time Rate:</span>
                      <span className="font-bold text-emerald-600">{app.trustScorecard.onTimeDeliveryRate}%</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Compliance:</span>
                      <span className="font-bold text-paypal-blue">{app.trustScorecard.complianceScore}%</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
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
                          Accept Candidate & Lock Escrow
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
              <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold">No applications found under this filter.</p>
                <p className="text-xs text-slate-400 mt-1">Try switching to &apos;All Applicants&apos;.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: ACTIVE CONTRACTS */}
      {activeTab === "contracts" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Active Escrow & Milestone Hub</h2>
              <p className="text-xs text-slate-500">
                Approve milestone deliverables or request revisions before releasing escrow funds.
              </p>
            </div>
            <Badge variant={escrowStatusInfo.variant} size="md">
              <Lock className="w-3.5 h-3.5 mr-1" />
              {escrowStatusInfo.label}
            </Badge>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>{activeContract.projectTitle}</CardTitle>
                  <CardDescription>
                    Talent: <strong className="text-slate-800">{activeContract.freelancerName}</strong> • Contract:{" "}
                    <code className="text-xs font-mono">{activeContract.id}</code>
                  </CardDescription>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500">Escrow Value</span>
                  <p className="text-xl font-bold text-paypal-dark">
                    {formatCurrency(activeContract.totalBudget, activeContract.currency)}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Financial Balances */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs text-slate-500 block">Funds Held in Escrow</span>
                  <span className="text-lg font-bold text-slate-900">
                    {formatCurrency(activeContract.heldInEscrowAmount, activeContract.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Released to Talent</span>
                  <span className="text-lg font-bold text-emerald-600">
                    {formatCurrency(activeContract.releasedAmount, activeContract.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Settlement Progress</span>
                  <span className="text-lg font-bold text-paypal-blue">
                    {Math.round((activeContract.releasedAmount / activeContract.totalBudget) * 100)}%
                  </span>
                </div>
              </div>

              {/* Milestones list with client review controls */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Milestone Review & Release Schedule
                </h3>

                <div className="space-y-4">
                  {activeContract.milestones.map((ms) => {
                    const statusInfo = getMilestoneStatusInfo(ms.status);
                    return (
                      <div
                        key={ms.id}
                        className={`p-5 rounded-xl border transition-all ${
                          ms.status === "IN_REVIEW"
                            ? "border-purple-300 bg-purple-50/20 ring-1 ring-purple-300"
                            : ms.status === "ACTIVE"
                            ? "border-blue-200 bg-blue-50/10"
                            : ms.status === "RELEASED"
                            ? "border-emerald-200 bg-emerald-50/20"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              Step {ms.stepNumber}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900">{ms.title}</h4>
                          </div>
                          <Badge variant={statusInfo.variant} size="sm">{statusInfo.label}</Badge>
                        </div>

                        <p className="text-xs text-slate-600 mb-3">{ms.description}</p>

                        {/* Deliverable details if submitted */}
                        {ms.submission && (
                          <div className="p-3.5 bg-white rounded-lg border border-slate-200 text-xs space-y-2 mb-3">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-700">Submitted Work Proof:</span>
                              <span className="text-slate-400 text-[11px]">{formatDate(ms.submission.submittedAt)}</span>
                            </div>
                            <a
                              href={ms.submission.submissionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-paypal-blue font-mono text-[11px] break-all inline-flex items-center gap-1 hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {ms.submission.submissionUrl}
                            </a>
                            {ms.submission.notes && (
                              <p className="text-slate-600 text-[11px] bg-slate-50 p-2 rounded">
                                Notes: {ms.submission.notes}
                              </p>
                            )}

                            {/* Advisory AI Report */}
                            {ms.submission.aiVerificationReport && (
                              <div className="mt-2 p-2.5 bg-purple-50 rounded-lg border border-purple-200 text-xs space-y-1">
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

                        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div>
                            <span className="font-bold text-slate-800">
                              Disbursement: {formatCurrency(ms.paymentAmount, ms.currency)} ({ms.percentage}%)
                            </span>
                            <span className="text-slate-400 ml-2">Due {formatDate(ms.deadline)}</span>
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
                                Approve & Release Payment
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

      {/* TAB 6: COMPANY PROFILE */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Client Organization Profile</h2>
              <p className="text-xs text-slate-500">Manage hiring organization details and escrow preferences.</p>
            </div>
            {!isEditingProfile && (
              <Button variant="outline" size="sm" onClick={() => setIsEditingProfile(true)}>
                <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                Edit Profile
              </Button>
            )}
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-paypal-dark text-white flex items-center justify-center font-bold text-lg">
                  {currentUser.companyName
                    ? currentUser.companyName.charAt(0).toUpperCase()
                    : currentUser.name
                    ? currentUser.name.charAt(0).toUpperCase()
                    : "C"}
                </div>
                <div>
                  <CardTitle>{currentUser.companyName || currentUser.name}</CardTitle>
                  <CardDescription>{currentUser.domain} • Client Member</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isEditingProfile ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="font-semibold text-slate-700 block mb-1">Company Description:</span>
                    <p className="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                      {currentUser.companyDescription || "Enterprise venture studio building autonomous commerce protocols."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="font-semibold text-slate-700 block mb-1">Primary Contact:</span>
                      <span className="text-slate-800">{currentUser.name}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 block mb-1">Business Email:</span>
                      <span className="text-slate-800">{currentUser.email}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span><strong>Verified Escrow Client:</strong> All project authorizations processed through PayPal escrow.</span>
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

      {/* MODAL: REQUEST REVISION */}
      {isRevisionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">Request Milestone Revisions</h3>
                <p className="text-xs text-slate-500">Provide actionable feedback to the freelancer</p>
              </div>
              <button
                onClick={() => setIsRevisionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRevision} className="p-5 space-y-4">
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
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-400">Loading Client Dashboard...</div>}>
      <ClientDashboardContent />
    </Suspense>
  );
}
