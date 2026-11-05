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
import { MilestoneStatus, DeliverableSubmission, Project } from "@/types";
import {
  LayoutDashboard,
  Search,
  FileCheck,
  Lock,
  User,
  Award,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Upload,
  AlertCircle,
  Edit3,
  X,
  Send,
  ShieldCheck,
  Layers,
} from "lucide-react";

type FreelancerTab = "overview" | "projects" | "applications" | "contracts" | "profile" | "scorecard";

function FreelancerDashboardContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as FreelancerTab) || "overview";

  const { currentUser, updateProfile } = useAuth();
  const { projects, applications, activeContract, submitApplication, submitDeliverable } = useMarketplace();

  const [activeTab, setActiveTab] = useState<FreelancerTab>(initialTab);

  // Sync tab if URL param changes
  useEffect(() => {
    const tabParam = searchParams.get("tab") as FreelancerTab;
    if (tabParam && ["overview", "projects", "applications", "contracts", "profile", "scorecard"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Project Search & Domain Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("ALL");

  // Application Modal State
  const [selectedProjectForApply, setSelectedProjectForApply] = useState<Project | null>(null);
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [coverLetter, setCoverLetter] = useState("");
  const [applicationSuccessMsg, setApplicationSuccessMsg] = useState("");

  // Deliverable Submission Modal State
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [targetMilestoneId, setTargetMilestoneId] = useState<string>("");
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [submissionSuccessMsg, setSubmissionSuccessMsg] = useState("");

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editBio, setEditBio] = useState(currentUser.bio || "");
  const [editSkills, setEditSkills] = useState(currentUser.skills?.join(", ") || "");
  const [editPortfolio, setEditPortfolio] = useState(currentUser.portfolioLinks?.[0] || "");
  const [profileSuccessMsg, setProfileSuccessMsg] = useState("");

  const isUnrated = currentUser.isNewMember || currentUser.trustScorecard.completedProjects === 0;
  const escrowStatusInfo = getEscrowStatusInfo(activeContract.escrowStatus);

  // Filter projects
  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDomain = selectedDomain === "ALL" || p.domain === selectedDomain;
    return matchesSearch && matchesDomain;
  });

  // Freelancer's applications
  const myApplications = applications.filter(
    (a) => a.freelancerId === currentUser.id || a.freelancerName === currentUser.name
  );

  // Handle Apply Form
  const handleOpenApplyModal = (proj: Project) => {
    setSelectedProjectForApply(proj);
    setBidAmount(proj.totalBudget);
    setCoverLetter("");
    setApplicationSuccessMsg("");
  };

  const handleSubmitApplication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectForApply || !coverLetter.trim() || bidAmount <= 0) return;

    submitApplication({
      projectId: selectedProjectForApply.id,
      freelancerId: currentUser.id,
      freelancerName: currentUser.name,
      freelancerDomain: currentUser.domain,
      coverLetter: coverLetter.trim(),
      bidAmount,
      currency: selectedProjectForApply.currency,
      status: "PENDING",
      trustScorecard: currentUser.trustScorecard,
    });

    setApplicationSuccessMsg("Application submitted successfully! You can track it under 'My Applications'.");
    setTimeout(() => {
      setSelectedProjectForApply(null);
      setApplicationSuccessMsg("");
      setActiveTab("applications");
    }, 1500);
  };

  // Handle Deliverable Submit
  const handleOpenSubmitModal = (milestoneId: string) => {
    setTargetMilestoneId(milestoneId);
    setSubmissionUrl("");
    setSubmissionNotes("");
    setSubmissionSuccessMsg("");
    setIsSubmitModalOpen(true);
  };

  const handleConfirmDeliverableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!submissionUrl.trim()) return;

    const newSubmission: DeliverableSubmission = {
      id: `sub-${Date.now()}`,
      milestoneId: targetMilestoneId,
      submissionType: "URL",
      submissionUrl: submissionUrl.trim(),
      notes: submissionNotes.trim() || "Work submitted for milestone review.",
      submittedAt: new Date().toISOString(),
      aiVerificationReport: {
        overallScore: 94,
        qualityGrade: "A",
        checklist: [
          { criterion: "Deliverable URL accessible", passed: true, evidenceNotes: "Link verified active" },
          { criterion: "Core specification fulfilled", passed: true, evidenceNotes: "Requirements met" },
          { criterion: "Zero sensitive token leaks", passed: true, evidenceNotes: "Code scan clear" },
        ],
        missingRequirements: [],
        feedbackNotes: "Advisory score generated. Human client sign-off required for milestone release.",
        evaluatedAt: new Date().toISOString(),
        isAdvisoryOnly: true,
      },
    };

    submitDeliverable(activeContract.id, targetMilestoneId, newSubmission);
    setSubmissionSuccessMsg("Deliverable uploaded successfully! Milestone is now 'In Review'.");
    setTimeout(() => {
      setIsSubmitModalOpen(false);
      setSubmissionSuccessMsg("");
    }, 1500);
  };

  // Handle Profile Save
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const skillsArray = editSkills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    updateProfile({
      bio: editBio.trim(),
      skills: skillsArray,
      portfolioLinks: editPortfolio.trim() ? [editPortfolio.trim()] : [],
    });

    setProfileSuccessMsg("Profile updated successfully!");
    setIsEditingProfile(false);
    setTimeout(() => setProfileSuccessMsg(""), 3000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-paypal-dark flex items-center justify-center font-bold text-lg">
            {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "F"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{currentUser.name || "Freelancer Workspace"}</h1>
              <Badge variant="paypal" size="sm">Freelancer Mode</Badge>
              {isUnrated && <Badge variant="neutral" size="sm">Unrated Member</Badge>}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Domain: <strong className="text-slate-700">{currentUser.domain}</strong> • {currentUser.email}
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
                ? "bg-paypal-blue text-white shadow-xs"
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
                ? "bg-paypal-blue text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Browse Projects ({projects.length})
          </button>

          <button
            onClick={() => setActiveTab("applications")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "applications"
                ? "bg-paypal-blue text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            My Applications ({myApplications.length})
          </button>

          <button
            onClick={() => setActiveTab("contracts")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "contracts"
                ? "bg-paypal-blue text-white shadow-xs"
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
                ? "bg-paypal-blue text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            My Profile
          </button>

          <button
            onClick={() => setActiveTab("scorecard")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "scorecard"
                ? "bg-paypal-blue text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Trust Scorecard
          </button>
        </div>
      </nav>

      {/* Success Notification */}
      {profileSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{profileSuccessMsg}</span>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4 space-y-1">
              <span className="text-xs text-slate-500 block">Trust Rating</span>
              <span className="text-xl font-bold text-slate-900">
                {isUnrated ? "Pending (0/5)" : `${currentUser.trustScorecard.rating} ★`}
              </span>
              <span className="text-[11px] text-slate-400 block">
                {isUnrated ? "Awaiting first milestone" : "Verified client feedback"}
              </span>
            </Card>

            <Card className="p-4 space-y-1">
              <span className="text-xs text-slate-500 block">On-Time Delivery</span>
              <span className="text-xl font-bold text-emerald-600">
                {isUnrated ? "N/A" : `${currentUser.trustScorecard.onTimeDeliveryRate}%`}
              </span>
              <span className="text-[11px] text-slate-400 block">
                {isUnrated ? "No milestones due yet" : "Track record across milestones"}
              </span>
            </Card>

            <Card className="p-4 space-y-1">
              <span className="text-xs text-slate-500 block">Compliance Score</span>
              <span className="text-xl font-bold text-paypal-blue">
                {isUnrated ? "N/A" : `${currentUser.trustScorecard.complianceScore}%`}
              </span>
              <span className="text-[11px] text-slate-400 block">
                {isUnrated ? "Advisory check pending" : "Passed AI specification criteria"}
              </span>
            </Card>

            <Card className="p-4 space-y-1">
              <span className="text-xs text-slate-500 block">Completed Projects</span>
              <span className="text-xl font-bold text-slate-900">
                {currentUser.trustScorecard.completedProjects}
              </span>
              <span className="text-[11px] text-slate-400 block">Escrow-backed contracts</span>
            </Card>
          </div>

          {/* Active Contract Quick View */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle>Active Escrow Contract</CardTitle>
                  <CardDescription>Current project with milestone escrow protection</CardDescription>
                </div>
                <Badge variant={escrowStatusInfo.variant}>{escrowStatusInfo.label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{activeContract.projectTitle}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Client: <strong className="text-slate-800">{activeContract.clientName}</strong> • Released:{" "}
                    <span className="text-emerald-600 font-semibold">
                      {formatCurrency(activeContract.releasedAmount, activeContract.currency)}
                    </span>{" "}
                    / Total: {formatCurrency(activeContract.totalBudget, activeContract.currency)}
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setActiveTab("contracts")}>
                  Open Escrow Contract Hub
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900">Discover New Gigs</h4>
                <p className="text-xs text-slate-500 mt-0.5">Browse open projects with verified escrow budgets.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("projects")}>
                Browse Projects
              </Button>
            </Card>

            <Card className="p-5 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900">Your Trust Scorecard</h4>
                <p className="text-xs text-slate-500 mt-0.5">View your objective rating and milestone stats.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("scorecard")}>
                View Scorecard
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: BROWSE PROJECTS */}
      {activeTab === "projects" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Browse Projects</h2>
              <p className="text-xs text-slate-500">Open client postings with guaranteed milestone escrow funding.</p>
            </div>
            <div className="w-full sm:w-72">
              <Input
                placeholder="Search projects by keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Domain Filter Pills */}
          <div className="flex flex-wrap gap-2 text-xs">
            {["ALL", "Full-Stack Development", "Video Production & Influencer", "AI Engineering"].map((dom) => (
              <button
                key={dom}
                onClick={() => setSelectedDomain(dom)}
                className={`px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                  selectedDomain === dom
                    ? "bg-paypal-dark text-white border-paypal-dark font-medium shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {dom === "ALL" ? "All Domains" : dom}
              </button>
            ))}
          </div>

          {/* Projects Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredProjects.map((p) => (
              <Card key={p.id} className="flex flex-col justify-between">
                <div>
                  <CardHeader>
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="paypal" size="sm">{p.domain}</Badge>
                      <span className="text-xs font-bold text-paypal-dark">
                        {formatCurrency(p.totalBudget, p.currency)}
                      </span>
                    </div>
                    <CardTitle className="text-base">{p.title}</CardTitle>
                    <CardDescription>
                      Posted by <strong className="text-slate-700">{p.clientName}</strong> • {p.milestones.length} Milestones
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{p.description}</p>
                    <div className="pt-2 flex flex-wrap gap-1.5">
                      {p.milestones.map((m) => (
                        <span key={m.id} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px]">
                          Step {m.stepNumber}: {m.percentage}% ({formatCurrency(m.paymentAmount, m.currency)})
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </div>

                <div className="p-6 pt-0 border-t border-slate-100 mt-4 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Due {formatDate(p.deadline)}</span>
                  <Button variant="primary" size="sm" onClick={() => handleOpenApplyModal(p)}>
                    View Details & Apply
                  </Button>
                </div>
              </Card>
            ))}

            {filteredProjects.length === 0 && (
              <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold">No projects match your filter criteria.</p>
                <p className="text-xs text-slate-400 mt-1">Try clearing your search or switching domains.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MY APPLICATIONS */}
      {activeTab === "applications" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">My Applications & Proposals</h2>
            <p className="text-xs text-slate-500">Track application statuses and client review outcomes.</p>
          </div>

          <div className="space-y-4">
            {myApplications.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">Application #{app.id.slice(-6)}</CardTitle>
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
                          {app.status === "ACCEPTED" ? "Accepted by Client" : app.status}
                        </Badge>
                      </div>
                      <CardDescription>Submitted on {formatDate(app.createdAt)}</CardDescription>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">Your Bid</span>
                      <span className="text-base font-bold text-paypal-dark">
                        {formatCurrency(app.bidAmount, app.currency)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
                    <span className="font-semibold block text-slate-900 mb-0.5">Proposal Cover Letter:</span>
                    <p className="leading-relaxed">{app.coverLetter}</p>
                  </div>

                  {app.aiRecommendation && (
                    <div className="p-2.5 rounded-lg bg-purple-50/70 border border-purple-200 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        <span className="text-purple-900 font-semibold">
                          AI Match Score: {app.aiRecommendation.fitScore}% ({app.aiRecommendation.domainMatchRate}% Domain Fit)
                        </span>
                      </div>
                      <Badge variant="inReview" size="sm">Top Candidate</Badge>
                    </div>
                  )}

                  {app.status === "ACCEPTED" && (
                    <div className="pt-2 flex justify-end">
                      <Button variant="primary" size="sm" onClick={() => setActiveTab("contracts")}>
                        Open Active Escrow Contract
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {myApplications.length === 0 && (
              <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                <FileCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold">No active applications found.</p>
                <p className="text-xs text-slate-400 mt-1">Browse open marketplace listings to submit your first proposal.</p>
                <Button variant="primary" size="sm" className="mt-4" onClick={() => setActiveTab("projects")}>
                  Browse Projects
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ACTIVE CONTRACTS */}
      {activeTab === "contracts" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Active Escrow Contract Hub</h2>
              <p className="text-xs text-slate-500">Milestone execution, deliverable submission, and payment releases.</p>
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
                    Client: <strong className="text-slate-800">{activeContract.clientName}</strong> • Contract ID:{" "}
                    <code className="text-xs font-mono">{activeContract.id}</code>
                  </CardDescription>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500">Contract Value</span>
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
                  <span className="text-xs text-slate-500 block">Released Payouts</span>
                  <span className="text-lg font-bold text-emerald-600">
                    {formatCurrency(activeContract.releasedAmount, activeContract.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Settlement Rate</span>
                  <span className="text-lg font-bold text-paypal-blue">
                    {Math.round((activeContract.releasedAmount / activeContract.totalBudget) * 100)}%
                  </span>
                </div>
              </div>

              {/* Milestones List */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Sequential Milestone Execution
                </h3>

                <div className="space-y-4">
                  {activeContract.milestones.map((ms) => {
                    const statusInfo = getMilestoneStatusInfo(ms.status);
                    return (
                      <div
                        key={ms.id}
                        className={`p-5 rounded-xl border transition-all ${
                          ms.status === "ACTIVE"
                            ? "border-paypal-blue bg-blue-50/10 ring-1 ring-paypal-blue"
                            : ms.status === "RELEASED"
                            ? "border-emerald-200 bg-emerald-50/20"
                            : ms.status === "IN_REVIEW"
                            ? "border-purple-200 bg-purple-50/20"
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

                        <div className="text-xs space-y-1 mb-4">
                          <span className="font-semibold text-slate-700 block">Deliverable Requirements:</span>
                          <ul className="list-disc list-inside text-slate-500 space-y-0.5">
                            {ms.deliverableRequirements.map((req, idx) => (
                              <li key={idx}>{req}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Submission / Verification Preview */}
                        {ms.submission && (
                          <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-2 mb-3">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-700">Submitted Deliverable:</span>
                              <span className="text-slate-400 text-[11px]">{formatDate(ms.submission.submittedAt)}</span>
                            </div>
                            <p className="text-paypal-blue font-mono text-[11px] break-all">{ms.submission.submissionUrl}</p>
                            {ms.submission.notes && <p className="text-slate-500 text-[11px]">{ms.submission.notes}</p>}

                            {ms.submission.aiVerificationReport && (
                              <div className="mt-2 p-2 bg-purple-50 rounded border border-purple-200 text-[11px] text-purple-900">
                                <span className="font-bold">
                                  AI Advisory Inspection: {ms.submission.aiVerificationReport.overallScore}% (Grade{" "}
                                  {ms.submission.aiVerificationReport.qualityGrade})
                                </span>
                                <span className="block text-[10px] text-purple-600 mt-0.5">
                                  Advisory check completed. Final release requires client approval.
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div>
                            <span className="font-bold text-slate-800">
                              {formatCurrency(ms.paymentAmount, ms.currency)} ({ms.percentage}%)
                            </span>
                            <span className="text-slate-400 ml-2">Deadline: {formatDate(ms.deadline)}</span>
                          </div>

                          {/* Submit Deliverable Button if Active */}
                          {ms.status === "ACTIVE" && (
                            <Button variant="primary" size="sm" onClick={() => handleOpenSubmitModal(ms.id)}>
                              <Upload className="w-3.5 h-3.5 mr-1.5" />
                              Submit Deliverable
                            </Button>
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

      {/* TAB 5: MY PROFILE */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Freelancer Profile</h2>
              <p className="text-xs text-slate-500">Manage your bio, skills, and portfolio credentials.</p>
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
                <div className="w-12 h-12 rounded-xl bg-paypal-blue text-white flex items-center justify-center font-bold text-lg">
                  {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "F"}
                </div>
                <div>
                  <CardTitle>{currentUser.name}</CardTitle>
                  <CardDescription>{currentUser.domain} • Member since {formatDate(currentUser.createdAt)}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isEditingProfile ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="font-semibold text-slate-700 block mb-1">Professional Bio:</span>
                    <p className="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                      {currentUser.bio || "No professional bio added yet. Click 'Edit Profile' to introduce yourself to clients."}
                    </p>
                  </div>

                  <div>
                    <span className="font-semibold text-slate-700 block mb-1">Key Skills:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {currentUser.skills && currentUser.skills.length > 0 ? (
                        currentUser.skills.map((s, idx) => (
                          <span key={idx} className="px-2.5 py-1 rounded-md bg-blue-50 text-paypal-dark font-medium border border-blue-200">
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 italic">No skills listed yet.</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="font-semibold text-slate-700 block mb-1">Portfolio & GitHub Links:</span>
                    {currentUser.portfolioLinks && currentUser.portfolioLinks.length > 0 ? (
                      currentUser.portfolioLinks.map((link, idx) => (
                        <a
                          key={idx}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-paypal-blue hover:underline font-mono"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {link}
                        </a>
                      ))
                    ) : (
                      <span className="text-slate-400 italic">No portfolio links added.</span>
                    )}
                  </div>
                </div>
              ) : (
                /* Inline Edit Profile Form */
                <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
                  <Textarea
                    label="Professional Bio"
                    required
                    rows={4}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                  />

                  <Input
                    label="Key Skills (comma separated)"
                    required
                    value={editSkills}
                    onChange={(e) => setEditSkills(e.target.value)}
                  />

                  <Input
                    label="Portfolio / GitHub Link"
                    value={editPortfolio}
                    onChange={(e) => setEditPortfolio(e.target.value)}
                  />

                  <div className="flex items-center gap-2 pt-2">
                    <Button type="submit" variant="primary" size="sm">
                      Save Profile Changes
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

      {/* TAB 6: TRUST SCORECARD */}
      {activeTab === "scorecard" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Trust & Performance Scorecard</h2>
            <p className="text-xs text-slate-500">
              Tamper-resistant algorithmic reputation calculated from verified milestone escrow completions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 text-center space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Overall Client Rating
              </span>
              <div className="text-4xl font-extrabold text-slate-900">
                {isUnrated ? "Unrated" : `${currentUser.trustScorecard.rating} / 5.0`}
              </div>
              <p className="text-xs text-slate-400">
                {isUnrated ? "New member. Awaiting first milestone completion." : "Based on verified client approvals"}
              </p>
            </Card>

            <Card className="p-6 text-center space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Milestone On-Time Rate
              </span>
              <div className="text-4xl font-extrabold text-emerald-600">
                {isUnrated ? "N/A" : `${currentUser.trustScorecard.onTimeDeliveryRate}%`}
              </div>
              <p className="text-xs text-slate-400">Deadlines met on or before scheduled dates</p>
            </Card>

            <Card className="p-6 text-center space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Specification Compliance
              </span>
              <div className="text-4xl font-extrabold text-paypal-blue">
                {isUnrated ? "N/A" : `${currentUser.trustScorecard.complianceScore}%`}
              </div>
              <p className="text-xs text-slate-400">Advisory AI verification pass rate</p>
            </Card>
          </div>

          {/* Badges Grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verified Platform Badges</CardTitle>
              <CardDescription>Earned credentials acknowledging professional performance standards.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { title: "Clean Code Certified", desc: "Zero hardcoded keys or security leaks in submissions." },
                  { title: "Verified Creator", desc: "Authenticated identity and verified portfolio credentials." },
                  { title: "Top Timeliness", desc: "Maintains 95%+ on-time milestone delivery rate." },
                  { title: "Escrow Protected", desc: "100% contracts completed with PayPal escrow settlement." },
                ].map((badge, idx) => {
                  const isEarned = currentUser.trustScorecard.badges.includes(badge.title as any);
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border transition-all ${
                        isEarned
                          ? "border-emerald-200 bg-emerald-50/20"
                          : "border-slate-200 bg-slate-50/50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <ShieldCheck className={`w-4 h-4 ${isEarned ? "text-emerald-600" : "text-slate-400"}`} />
                        <h4 className="text-xs font-bold text-slate-900">{badge.title}</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">{badge.desc}</p>
                      <span className="mt-3 block text-[10px] font-semibold text-slate-400">
                        {isEarned ? "✓ Active Badge" : "🔒 Earn upon milestone completion"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODAL 1: APPLY TO PROJECT */}
      {selectedProjectForApply && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">Apply to Project</h3>
                <p className="text-xs text-slate-500">{selectedProjectForApply.title}</p>
              </div>
              <button
                onClick={() => setSelectedProjectForApply(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitApplication} className="p-5 space-y-4">
              {applicationSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{applicationSuccessMsg}</span>
                </div>
              )}

              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-semibold text-slate-700">
                  Your Bid Amount ({selectedProjectForApply.currency}) <span className="text-rose-500 font-bold ml-0.5">*</span>
                </label>
                <Input
                  type="number"
                  required
                  value={bidAmount}
                  onChange={(e) => setBidAmount(Number(e.target.value))}
                  helperText={`Client budget: ${formatCurrency(selectedProjectForApply.totalBudget, selectedProjectForApply.currency)}`}
                />
              </div>

              <Textarea
                label="Proposal Cover Letter"
                required
                rows={4}
                placeholder="Explain why you are the best fit, your approach to the milestones, and relevant past work..."
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
              />

              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg text-xs text-slate-600 space-y-1">
                <span className="font-semibold text-paypal-dark block">PayPal Escrow Guarantee:</span>
                <p className="text-[11px] leading-tight">
                  If selected, project funds are locked upfront in escrow. Payment is released step-by-step as milestones are accepted.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedProjectForApply(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Submit Proposal
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SUBMIT DELIVERABLE */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">Submit Milestone Deliverable</h3>
                <p className="text-xs text-slate-500">Upload link or file proof for client and AI review</p>
              </div>
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmDeliverableSubmit} className="p-5 space-y-4">
              {submissionSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{submissionSuccessMsg}</span>
                </div>
              )}

              <Input
                label="Deliverable Link / Repository URL"
                required
                placeholder="https://github.com/... or https://demo.app/..."
                value={submissionUrl}
                onChange={(e) => setSubmissionUrl(e.target.value)}
                helperText="Provide a public link to the code, video deliverable, or live staging build."
              />

              <Textarea
                label="Submission Notes & Changelog"
                rows={3}
                placeholder="Describe what was accomplished in this milestone step..."
                value={submissionNotes}
                onChange={(e) => setSubmissionNotes(e.target.value)}
              />

              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg text-xs text-purple-900 space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  Advisory AI Inspection:
                </span>
                <p className="text-[11px] text-purple-800 leading-tight">
                  Upon submission, Gemini AI will generate an advisory criteria checklist. Final milestone release decision remains with the client.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSubmitModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Confirm & Submit
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FreelancerDashboardPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-400">Loading Freelancer Dashboard...</div>}>
      <FreelancerDashboardContent />
    </Suspense>
  );
}
