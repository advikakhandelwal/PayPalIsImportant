"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
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
  Filter,
  DollarSign,
  Calendar,
  Briefcase,
  Users,
  Eye,
  SlidersHorizontal,
  RotateCcw,
  Check,
  Building,
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

  // Marketplace Browse Projects Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("ALL");
  const [selectedSkill, setSelectedSkill] = useState<string>("ALL");
  const [selectedExperience, setSelectedExperience] = useState<string>("ALL");
  const [minBudget, setMinBudget] = useState<string>("");
  const [maxBudget, setMaxBudget] = useState<string>("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "budget_low" | "budget_high">("newest");
  const [selectedProjectForDetails, setSelectedProjectForDetails] = useState<Project | null>(null);

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

  // Filter only OPEN marketplace projects (excluding any project created by the current user)
  const openMarketplaceProjects = useMemo(() => {
    return projects.filter(
      (p) => p.status === "OPEN" && p.clientId !== currentUser.id
    );
  }, [projects, currentUser.id]);

  // Dynamically extract all unique domains and skills from available projects
  const availableDomains = useMemo(() => {
    const set = new Set<string>();
    openMarketplaceProjects.forEach((p) => {
      if (p.domain) set.add(p.domain);
    });
    return Array.from(set).sort();
  }, [openMarketplaceProjects]);

  const availableSkills = useMemo(() => {
    const set = new Set<string>();
    openMarketplaceProjects.forEach((p) => {
      p.requiredSkills?.forEach((skill) => set.add(skill));
    });
    return Array.from(set).sort();
  }, [openMarketplaceProjects]);

  // Filtered and sorted projects
  const filteredAndSortedProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const min = minBudget !== "" ? parseFloat(minBudget) : null;
    const max = maxBudget !== "" ? parseFloat(maxBudget) : null;

    const filtered = openMarketplaceProjects.filter((p) => {
      // Search matching title, description, domain, or requiredSkills
      if (query) {
        const titleMatch = p.title.toLowerCase().includes(query);
        const descMatch = p.description.toLowerCase().includes(query);
        const domainMatch = p.domain.toLowerCase().includes(query);
        const skillMatch = p.requiredSkills?.some((s) => s.toLowerCase().includes(query));
        if (!titleMatch && !descMatch && !domainMatch && !skillMatch) {
          return false;
        }
      }

      // Domain filter
      if (selectedDomain !== "ALL" && p.domain !== selectedDomain) {
        return false;
      }

      // Skill filter
      if (selectedSkill !== "ALL" && !p.requiredSkills?.includes(selectedSkill)) {
        return false;
      }

      // Experience filter
      if (selectedExperience !== "ALL" && p.experienceLevel !== selectedExperience) {
        return false;
      }

      // Min budget filter
      if (min !== null && !isNaN(min) && p.totalBudget < min) {
        return false;
      }

      // Max budget filter
      if (max !== null && !isNaN(max) && p.totalBudget > max) {
        return false;
      }

      return true;
    });

    // Sorting
    return filtered.sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === "budget_low") {
        return a.totalBudget - b.totalBudget;
      }
      if (sortBy === "budget_high") {
        return b.totalBudget - a.totalBudget;
      }
      return 0;
    });
  }, [openMarketplaceProjects, searchQuery, selectedDomain, selectedSkill, selectedExperience, minBudget, maxBudget, sortBy]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedDomain !== "ALL" ||
    selectedSkill !== "ALL" ||
    selectedExperience !== "ALL" ||
    minBudget !== "" ||
    maxBudget !== "" ||
    sortBy !== "newest";

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedDomain("ALL");
    setSelectedSkill("ALL");
    setSelectedExperience("ALL");
    setMinBudget("");
    setMaxBudget("");
    setSortBy("newest");
  };

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
        <div className="space-y-6 animate-fade-in">
          {/* Header & Subtitle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900">Browse Projects</h2>
                <Badge variant="paypal" size="sm">
                  {filteredAndSortedProjects.length} Available
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Explore open client postings backed by guaranteed PayPal milestone escrow funding.
              </p>
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="text-xs text-paypal-blue hover:text-paypal-dark self-start sm:self-auto rounded-full"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Reset All Filters
              </Button>
            )}
          </div>

          {/* Search Bar & Sort Dropdown */}
          <Card className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by project title, description, domain, or skills (e.g. Next.js, Video, Python)..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-full border border-slate-200 bg-slate-50/50 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-paypal-blue/30 focus:border-paypal-blue transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-2 self-end md:self-auto">
                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-full px-3 py-2 text-slate-700 focus:outline-none focus:border-paypal-blue cursor-pointer shadow-xs"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="budget_high">Budget: High to Low</option>
                  <option value="budget_low">Budget: Low to High</option>
                </select>
              </div>
            </div>

            {/* Filter Controls Row */}
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Category / Domain Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">
                  Category / Domain
                </label>
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-paypal-blue cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  {availableDomains.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Required Skill Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">
                  Required Skill
                </label>
                <select
                  value={selectedSkill}
                  onChange={(e) => setSelectedSkill(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-paypal-blue cursor-pointer"
                >
                  <option value="ALL">All Skills</option>
                  {availableSkills.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Experience Level Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">
                  Experience Level
                </label>
                <select
                  value={selectedExperience}
                  onChange={(e) => setSelectedExperience(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-paypal-blue cursor-pointer"
                >
                  <option value="ALL">All Experience Levels</option>
                  <option value="Entry Level">Entry Level</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>

              {/* Budget Range Inputs */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">
                  Budget Range ($)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Min"
                    value={minBudget}
                    onChange={(e) => setMinBudget(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:border-paypal-blue"
                  />
                  <span className="text-slate-400 text-xs">-</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Max"
                    value={maxBudget}
                    onChange={(e) => setMaxBudget(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:border-paypal-blue"
                  />
                </div>
              </div>
            </div>

            {/* Quick Domain Pills */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-400 mr-1">Quick Filter:</span>
              <button
                onClick={() => setSelectedDomain("ALL")}
                className={`px-3 py-1 rounded-full text-xs transition-all cursor-pointer font-medium ${
                  selectedDomain === "ALL"
                    ? "bg-paypal-dark text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Domains
              </button>
              {availableDomains.map((dom) => (
                <button
                  key={dom}
                  onClick={() => setSelectedDomain(dom)}
                  className={`px-3 py-1 rounded-full text-xs transition-all cursor-pointer font-medium ${
                    selectedDomain === dom
                      ? "bg-paypal-dark text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {dom}
                </button>
              ))}
            </div>
          </Card>

          {/* Active Filter Indicators */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-500">Active filters:</span>
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-paypal-blue font-medium border border-blue-200">
                  Search: &ldquo;{searchQuery}&rdquo;
                  <button onClick={() => setSearchQuery("")} className="hover:text-blue-800">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedDomain !== "ALL" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-paypal-blue font-medium border border-blue-200">
                  Domain: {selectedDomain}
                  <button onClick={() => setSelectedDomain("ALL")} className="hover:text-blue-800">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedSkill !== "ALL" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-paypal-blue font-medium border border-blue-200">
                  Skill: {selectedSkill}
                  <button onClick={() => setSelectedSkill("ALL")} className="hover:text-blue-800">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedExperience !== "ALL" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-paypal-blue font-medium border border-blue-200">
                  Level: {selectedExperience}
                  <button onClick={() => setSelectedExperience("ALL")} className="hover:text-blue-800">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {(minBudget || maxBudget) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-paypal-blue font-medium border border-blue-200">
                  Budget: ${minBudget || "0"} - ${maxBudget || "∞"}
                  <button
                    onClick={() => {
                      setMinBudget("");
                      setMaxBudget("");
                    }}
                    className="hover:text-blue-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                onClick={handleResetFilters}
                className="text-xs text-rose-600 hover:underline font-semibold ml-1 cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Projects Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filteredAndSortedProjects.map((p) => (
              <Card
                key={p.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 hover:border-paypal-blue/40 hover:shadow-md transition-all duration-200 card-hover bg-white"
              >
                <div className="p-6">
                  {/* Top Badges & Budget */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="paypal" size="sm">
                        {p.domain}
                      </Badge>
                      <Badge variant="success" size="sm" className="gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                        OPEN
                      </Badge>
                      {p.experienceLevel && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium border border-slate-200">
                          {p.experienceLevel}
                        </span>
                      )}
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <span className="text-base font-extrabold text-paypal-dark block leading-none">
                        {formatCurrency(p.totalBudget, p.currency)}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
                        Escrow Funded
                      </span>
                    </div>
                  </div>

                  {/* Project Title */}
                  <h3
                    onClick={() => setSelectedProjectForDetails(p)}
                    className="font-bold text-base text-slate-900 hover:text-paypal-blue cursor-pointer transition-colors line-clamp-1"
                  >
                    {p.title}
                  </h3>

                  {/* Client Info & Date Posted */}
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    <span>
                      Posted by <strong className="text-slate-700">{p.clientCompany || p.clientName}</strong>
                    </span>
                    <span>•</span>
                    <span>{formatDate(p.createdAt)}</span>
                  </p>

                  {/* Description */}
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mt-3">
                    {p.description}
                  </p>

                  {/* Required Skills Chips */}
                  {p.requiredSkills && p.requiredSkills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.requiredSkills.map((skill) => (
                        <span
                          key={skill}
                          className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Key Metadata Stats */}
                  <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Due {formatDate(p.deadline)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{p.applicationsCount || 0} applications</span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {p.milestones.length} Milestones (
                        {p.milestones.map((m) => `${m.percentage}%`).join(" / ")})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="px-6 py-3.5 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Verified Escrow
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedProjectForDetails(p)}
                      className="rounded-full text-xs font-semibold"
                    >
                      View Details
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenApplyModal(p)}
                      className="rounded-full text-xs font-semibold"
                    >
                      Apply Now
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}

            {/* Empty State: No projects matching filters */}
            {filteredAndSortedProjects.length === 0 && openMarketplaceProjects.length > 0 && (
              <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-800">No projects match your filter criteria</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Try adjusting your search query, switching categories, or clearing budget constraints.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleResetFilters}
                  className="mt-4 rounded-full"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Clear All Filters
                </Button>
              </div>
            )}

            {/* Empty State: No open projects in marketplace at all */}
            {openMarketplaceProjects.length === 0 && (
              <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-800">No Open Projects Available</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  There are currently no active project listings open for proposals. When clients publish projects, they will appear here automatically.
                </p>
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

      {/* MODAL 3: VIEW PROJECT DETAILS */}
      {selectedProjectForDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/50">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="paypal" size="sm">
                    {selectedProjectForDetails.domain}
                  </Badge>
                  <Badge variant="success" size="sm" className="gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                    OPEN FOR PROPOSALS
                  </Badge>
                  {selectedProjectForDetails.experienceLevel && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                      {selectedProjectForDetails.experienceLevel}
                    </span>
                  )}
                </div>
                <h3 className="font-extrabold text-lg text-slate-900">
                  {selectedProjectForDetails.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Posted by <strong className="text-slate-800">{selectedProjectForDetails.clientCompany || selectedProjectForDetails.clientName}</strong> • {formatDate(selectedProjectForDetails.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setSelectedProjectForDetails(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Highlight Metrics Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-blue-50/50 border border-blue-100">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Total Escrow Budget
                  </span>
                  <span className="text-xl font-extrabold text-paypal-dark block mt-0.5">
                    {formatCurrency(selectedProjectForDetails.totalBudget, selectedProjectForDetails.currency)}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                    <ShieldCheck className="w-3 h-3" /> PayPal Protected
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Submission Deadline
                  </span>
                  <span className="text-sm font-bold text-slate-800 block mt-1">
                    {formatDate(selectedProjectForDetails.deadline)}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Final milestone delivery
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Competition
                  </span>
                  <span className="text-sm font-bold text-slate-800 block mt-1">
                    {selectedProjectForDetails.applicationsCount || 0} Proposals
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Actively reviewing
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Project Description
                </h4>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {selectedProjectForDetails.description}
                </p>
              </div>

              {/* Required Skills */}
              {selectedProjectForDetails.requiredSkills && selectedProjectForDetails.requiredSkills.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Required Skills & Technologies
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProjectForDetails.requiredSkills.map((skill) => (
                      <span
                        key={skill}
                        className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Requirements */}
              {selectedProjectForDetails.additionalRequirements && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Special Requirements & Guidelines
                  </h4>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed">
                    {selectedProjectForDetails.additionalRequirements}
                  </div>
                </div>
              )}

              {/* Milestone Schedule */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Milestone Breakdown Schedule ({selectedProjectForDetails.milestones.length} Milestones)
                  </h4>
                  <span className="text-[11px] text-slate-400">Total: 100% Escrow Funded</span>
                </div>

                <div className="space-y-2.5">
                  {selectedProjectForDetails.milestones.map((ms) => (
                    <div
                      key={ms.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-paypal-dark text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {ms.stepNumber}
                          </span>
                          <span className="font-bold text-xs sm:text-sm text-slate-900">
                            {ms.title}
                          </span>
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <span className="font-extrabold text-xs sm:text-sm text-paypal-dark">
                            {formatCurrency(ms.paymentAmount, ms.currency)}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {ms.percentage}% of total
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 pl-8 leading-relaxed">
                        {ms.description}
                      </p>

                      {ms.deliverableRequirements && ms.deliverableRequirements.length > 0 && (
                        <div className="pl-8 pt-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            Deliverable Requirements:
                          </span>
                          <ul className="space-y-1">
                            {ms.deliverableRequirements.map((req, idx) => (
                              <li key={idx} className="text-xs text-slate-600 flex items-start gap-1.5">
                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                <span>{req}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 px-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedProjectForDetails(null)}
                className="rounded-full"
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const proj = selectedProjectForDetails;
                  setSelectedProjectForDetails(null);
                  handleOpenApplyModal(proj);
                }}
                className="rounded-full font-semibold"
              >
                Apply to This Project
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
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
