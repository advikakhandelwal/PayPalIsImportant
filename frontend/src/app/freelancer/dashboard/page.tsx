"use client";

import React, { useState, useEffect, useRef, Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useNotifications } from "@/context/NotificationContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ContractChatPanel } from "@/components/contracts/ContractChatPanel";
import { apiClient } from "@/services/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatCurrency, formatDate, getMilestoneStatusInfo, getEscrowStatusInfo } from "@/lib/utils";
import { MilestoneStatus, DeliverableSubmission, Project, MilestoneSubtask, FreelancerCV } from "@/types";
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
  ShieldAlert,
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
  History,
  ChevronDown,
  MapPin,
  Download,
  UploadCloud,
  MessageSquare,
} from "lucide-react";

type FreelancerTab = "overview" | "projects" | "applications" | "contracts" | "profile" | "scorecard";

function FreelancerDashboardContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as FreelancerTab) || "overview";

  const { currentUser, activeRole, setActiveRole, updateProfile, refreshUser, isHydrated } = useAuth();
  const { notifications, addNotification } = useNotifications();
  const {
    projects,
    applications,
    contracts,
    activeContract,
    submitApplication,
    submitDeliverable,
    updateSubtaskStatus,
    withdrawApplication,
    settleContractEarly,
  } = useMarketplace();

  const [withdrawingAppId, setWithdrawingAppId] = useState<string>("");
  const [earlySettleModalOpen, setEarlySettleModalOpen] = useState(false);
  const [earlyTalentShare, setEarlyTalentShare] = useState<string>("0");
  const [earlyReason, setEarlyReason] = useState("");
  const [earlyError, setEarlyError] = useState("");
  const [isSettlingEarly, setIsSettlingEarly] = useState(false);

  // Frontend UI route guard: show access-denied state if wrong role
  const isFreelancerRole = activeRole === "FREELANCER" || currentUser.role === "FREELANCER";

  // Multi-contract representation for freelancer (exclude completed/refunded from Active by default)
  const myContracts = contracts.filter(
    (c) => c.freelancerId === currentUser.id || c.freelancerName === currentUser.name
  );
  const activeOnlyContracts = myContracts.filter(
    (c) => c.escrowStatus !== "COMPLETED" && c.escrowStatus !== "REFUNDED"
  );
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [contractSearch, setContractSearch] = useState<string>("");
  const [contractFilter, setContractFilter] = useState<"ACTIVE" | "COMPLETED" | "ALL">("ACTIVE");
  const filteredMyContracts = myContracts.filter((c) => {
    const isDone = c.escrowStatus === "COMPLETED" || c.escrowStatus === "REFUNDED";
    if (contractFilter === "ACTIVE" && isDone) return false;
    if (contractFilter === "COMPLETED" && !isDone) return false;
    const q = contractSearch.trim().toLowerCase();
    return (
      !q ||
      c.projectTitle.toLowerCase().includes(q) ||
      c.clientName.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  });
  const selectedContractForTab =
    filteredMyContracts.find((c) => c.id === selectedContractId) ??
    filteredMyContracts[0] ??
    activeOnlyContracts[0] ??
    activeContract;
  const [activeTab, setActiveTab] = useState<FreelancerTab>(initialTab);

  // Sync tab if URL param changes
  useEffect(() => {
    const tabParam = searchParams.get("tab") as FreelancerTab;
    if (tabParam && ["overview", "projects", "applications", "contracts", "profile", "scorecard"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Persist activeTab in URL query params so reload keeps the user on their current tab
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTab);
    window.history.replaceState(null, "", url.toString());
  }, [activeTab]);

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
  const [isResubmission, setIsResubmission] = useState<boolean>(false);
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [submissionSuccessMsg, setSubmissionSuccessMsg] = useState("");
  const [expandedHistoryMilestoneIds, setExpandedHistoryMilestoneIds] = useState<string[]>([]);

  const toggleHistory = (msId: string) => {
    setExpandedHistoryMilestoneIds((prev) =>
      prev.includes(msId) ? prev.filter((id) => id !== msId) : [...prev, msId]
    );
  };
  const isHistoryExpanded = (msId: string) => expandedHistoryMilestoneIds.includes(msId);

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editBio, setEditBio] = useState(currentUser.bio || "");
  const [editSkills, setEditSkills] = useState(currentUser.skills?.join(", ") || "");
  const [editEducation, setEditEducation] = useState(currentUser.education?.join("\n") || "");
  const [editExperienceYears, setEditExperienceYears] = useState(
    currentUser.experienceYears != null ? String(currentUser.experienceYears) : ""
  );
  const [editPortfolio, setEditPortfolio] = useState(currentUser.portfolioLinks?.[0] || "");
  const [profileSuccessMsg, setProfileSuccessMsg] = useState("");

  useEffect(() => {
    setEditBio(currentUser.bio || "");
    setEditSkills(currentUser.skills?.join(", ") || "");
    setEditEducation(currentUser.education?.join("\n") || "");
    setEditExperienceYears(
      currentUser.experienceYears != null ? String(currentUser.experienceYears) : ""
    );
    setEditPortfolio(currentUser.portfolioLinks?.[0] || "");
  }, [currentUser.id, currentUser.bio, currentUser.skills, currentUser.education, currentUser.experienceYears, currentUser.portfolioLinks]);

  // PayPal Payout Email & Live Payout Ledger State
  const [paypalPayoutInput, setPaypalPayoutInput] = useState(
    currentUser.paypalPayoutEmail || currentUser.email || ""
  );
  const [isSavingPayoutEmail, setIsSavingPayoutEmail] = useState(false);
  const [payoutEmailMsg, setPayoutEmailMsg] = useState("");
  const [payoutEmailErr, setPayoutEmailErr] = useState("");
  const [freelancerPaypalTxs, setFreelancerPaypalTxs] = useState<any[]>([]);

  useEffect(() => {
    setPaypalPayoutInput(currentUser.paypalPayoutEmail || currentUser.email || "");
  }, [currentUser.paypalPayoutEmail, currentUser.email]);

  // Cross-browser live payout notification sync from backend-confirmed released milestones
  useEffect(() => {
    if (!currentUser.id || myContracts.length === 0) return;
    myContracts.forEach((c) => {
      if (c.releasedAmount > 0) {
        const releasedCount = c.milestones.filter((m) => m.status === "RELEASED").length;
        const entityKey = `paypal-released-${c.id}-${releasedCount}-${c.releasedAmount}`;
        const alreadyNotified = notifications.some((n) => n.entityId === entityKey);
        if (!alreadyNotified) {
          addNotification({
            userId: currentUser.id,
            userRole: "FREELANCER",
            event: "MILESTONE_APPROVED",
            title: `PayPal Payout Received (${formatCurrency(c.releasedAmount, c.currency)})`,
            description: `${c.clientName} released ${releasedCount}/${c.milestones.length} milestone(s) on "${c.projectTitle}" to ${c.freelancerPayoutEmail || currentUser.paypalPayoutEmail || currentUser.email}.`,
            linkHref: "/freelancer/dashboard?tab=scorecard",
            entityId: entityKey,
          });
        }
      }
    });
  }, [myContracts, currentUser.id, currentUser.paypalPayoutEmail, currentUser.email, notifications, addNotification]);

  useEffect(() => {
    const cid = selectedContractForTab?.id;
    if (!cid || activeTab !== "contracts") {
      setFreelancerPaypalTxs([]);
      return;
    }
    apiClient
      .getPayPalTransactions(cid)
      .then((txs) => setFreelancerPaypalTxs(Array.isArray(txs) ? txs : []))
      .catch(() => setFreelancerPaypalTxs([]));
  }, [selectedContractForTab?.id, selectedContractForTab?.releasedAmount, activeTab]);

  const handleSavePayoutEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPayoutEmail) return;
    setIsSavingPayoutEmail(true);
    setPayoutEmailErr("");
    setPayoutEmailMsg("");
    try {
      await apiClient.updateProfile({ paypalPayoutEmail: paypalPayoutInput.trim() });
      await refreshUser();
      setPayoutEmailMsg("PayPal payout email saved! Future milestone releases will go here.");
      setTimeout(() => setPayoutEmailMsg(""), 4000);
    } catch (err: any) {
      setPayoutEmailErr(err?.message || "Please enter a valid email address.");
    } finally {
      setIsSavingPayoutEmail(false);
    }
  };

  const isUnrated = currentUser.isNewMember || currentUser.trustScorecard.completedProjects === 0;
  const escrowStatusInfo = getEscrowStatusInfo(selectedContractForTab.escrowStatus);

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

  // Freelancer's applications (all vs active/ongoing, with status, search & project filter)
  const [appStatusFilter, setAppStatusFilter] = useState<"ONGOING" | "COMPLETED" | "REJECTED" | "ALL">("ONGOING");
  const [appSearchQuery, setAppSearchQuery] = useState<string>("");
  const [filterAppProjectId, setFilterAppProjectId] = useState<string>("ALL");
  const completedProjectIds = new Set([
    ...projects.filter((p) => p.status === "COMPLETED").map((p) => p.id),
    ...contracts
      .filter((c) => c.escrowStatus === "COMPLETED" || c.escrowStatus === "REFUNDED")
      .map((c) => c.projectId),
  ]);
  const inProgressProjectIds = new Set([
    ...projects.filter((p) => p.status === "IN_PROGRESS").map((p) => p.id),
    ...contracts.map((c) => c.projectId),
  ]);
  const allMyApplications = applications.filter(
    (a) => a.freelancerId === currentUser.id || a.freelancerName === currentUser.name
  );
  const myApplications = allMyApplications.filter(
    (a) => !completedProjectIds.has(a.projectId) && !inProgressProjectIds.has(a.projectId)
  );
  const filteredMyApplications = allMyApplications.filter((a) => {
    if (filterAppProjectId !== "ALL" && a.projectId !== filterAppProjectId) return false;
    const projDone = completedProjectIds.has(a.projectId);
    const projInProgress = inProgressProjectIds.has(a.projectId);
    if (appStatusFilter === "ONGOING" && (a.status === "REJECTED" || projDone || projInProgress)) return false;
    if (appStatusFilter === "COMPLETED" && !projDone) return false;
    if (appStatusFilter === "REJECTED" && a.status !== "REJECTED") return false;
    const q = appSearchQuery.trim().toLowerCase();
    if (q) {
      const targetProj = projects.find((p) => p.id === a.projectId);
      const hay = `${targetProj?.title || ""} ${targetProj?.domain || ""} ${a.coverLetter} ${a.status}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const groupedMyApplications = Array.from(
    filteredMyApplications.reduce((map, app) => {
      const list = map.get(app.projectId) || [];
      list.push(app);
      map.set(app.projectId, list);
      return map;
    }, new Map<string, typeof allMyApplications>())
  );

  // CV Upload Enforcement States
  const [showCVPromptModal, setShowCVPromptModal] = useState<boolean>(false);
  const [pendingApplyProject, setPendingApplyProject] = useState<Project | null>(null);
  const [cvSuccessMsg, setCvSuccessMsg] = useState<string>("");
  const [applyCvSource, setApplyCvSource] = useState<"profile" | "new">("profile");
  const [applyErrorMsg, setApplyErrorMsg] = useState<string>("");
  const profileCvInputRef = useRef<HTMLInputElement>(null);
  const applyCvInputRef = useRef<HTMLInputElement>(null);

  // Process a real selected CV file (.pdf / .doc / .docx / .txt)
  const handleUploadCVFile = (file: File) => {
    const saveCvWithUrl = (fileUrl: string) => {
      const newCV: FreelancerCV = {
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        url: fileUrl,
        extractedInfo: {
          skills: currentUser.skills && currentUser.skills.length > 0 ? currentUser.skills : [],
          education: currentUser.education || [],
          experience:
            currentUser.experienceYears != null
              ? [`${currentUser.experienceYears} Year${currentUser.experienceYears === 1 ? "" : "s"} of Domain Experience`]
              : [],
          previousProjects: [],
          certifications: currentUser.certifications || [],
          summary: currentUser.bio?.trim()
            ? currentUser.bio.trim()
            : `${currentUser.name || "Freelancer"} — ${currentUser.domain || "General"}.`,
        },
      };

      updateProfile({ cvFile: newCV });
      setApplyCvSource("profile");
      setApplyErrorMsg("");
      setCvSuccessMsg(`CV "${file.name}" uploaded and saved to your profile.`);
      setTimeout(() => setCvSuccessMsg(""), 3500);

      if (pendingApplyProject) {
        const proj = pendingApplyProject;
        setPendingApplyProject(null);
        setShowCVPromptModal(false);
        setSelectedProjectForApply(proj);
        setBidAmount(proj.totalBudget);
        setCoverLetter("");
        setApplicationSuccessMsg("");
      }
    };

    // Persist portable data URL for files <= 2 MB so clients on any device can view/download the real CV
    if (file.size <= 2 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : URL.createObjectURL(file);
        saveCvWithUrl(result);
      };
      reader.onerror = () => {
        saveCvWithUrl(URL.createObjectURL(file));
      };
      reader.readAsDataURL(file);
    } else {
      saveCvWithUrl(URL.createObjectURL(file));
    }
  };

  // Always open Apply Modal directly so user can pick Profile CV or upload a new CV
  const handleOpenApplyModal = (proj: Project) => {
    setSelectedProjectForApply(proj);
    setBidAmount(proj.totalBudget);
    setCoverLetter("");
    setApplicationSuccessMsg("");
    setApplyErrorMsg("");
    setApplyCvSource(currentUser.cvFile ? "profile" : "new");
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectForApply) return;
    if (!currentUser.cvFile) {
      setApplyErrorMsg("Please upload your CV / Resume before submitting your proposal.");
      return;
    }
    if (!coverLetter.trim() || bidAmount <= 0) {
      setApplyErrorMsg("Please enter a valid bid amount and cover letter.");
      return;
    }
    setApplyErrorMsg("");

    try {
      await submitApplication({
        projectId: selectedProjectForApply.id,
        freelancerId: currentUser.id,
        freelancerName: currentUser.name,
        freelancerDomain: currentUser.domain,
        coverLetter: coverLetter.trim(),
        bidAmount,
        currency: selectedProjectForApply.currency,
        status: "PENDING",
        trustScorecard: currentUser.trustScorecard,
        freelancerProfile: {
          name: currentUser.name,
          avatarUrl: currentUser.avatarUrl,
          skills: currentUser.skills,
          experienceYears: currentUser.experienceYears,
          education: currentUser.education || [],
          experience: currentUser.cvFile.extractedInfo?.experience || [],
          portfolioLinks: currentUser.portfolioLinks,
          certifications: currentUser.certifications || [],
          cvFile: currentUser.cvFile,
        },
        estimatedDeliveryDays: 14,
      });

      setApplicationSuccessMsg("Application submitted! Track it under 'My Applications'.");
      setTimeout(() => {
        setSelectedProjectForApply(null);
        setApplicationSuccessMsg("");
        setActiveTab("applications");
      }, 1200);
    } catch (err: any) {
      setApplyErrorMsg(err?.message || "Failed to submit application.");
    }
  };

  // Handle Deliverable Submit & Resubmit
  const handleOpenSubmitModal = (milestoneId: string, isResubmit = false) => {
    setTargetMilestoneId(milestoneId);
    setIsResubmission(isResubmit);
    setSubmissionUrl("");
    setSubmissionNotes("");
    setSubmissionError("");
    setSubmissionSuccessMsg("");
    setIsSubmitModalOpen(true);
  };

  const handleConfirmDeliverableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError("");
    if (!submissionUrl.trim()) {
      setSubmissionError("Deliverable URL or repository link is required.");
      return;
    }
    if (!submissionNotes.trim()) {
      setSubmissionError(isResubmission ? "Please provide notes detailing what corrections were made." : "Submission notes are required.");
      return;
    }

    const targetMs = selectedContractForTab.milestones.find((m) => m.id === targetMilestoneId);
    const existingHistory = targetMs?.submissionHistory || (targetMs?.submission ? [targetMs.submission] : []);
    const nextRevisionNum = isResubmission ? existingHistory.length + 1 : 1;

    const newSubmission: DeliverableSubmission = {
      id: "sub-" + Date.now(),
      milestoneId: targetMilestoneId,
      submissionType: "URL",
      submissionUrl: submissionUrl.trim(),
      notes: submissionNotes.trim(),
      submittedAt: new Date().toISOString(),
      revisionNumber: nextRevisionNum,
      reviewStatus: "IN_REVIEW",
      aiVerificationReport: {
        overallScore: isResubmission ? 96 : 94,
        qualityGrade: "A",
        checklist: [
          { criterion: "Deliverable URL accessible", passed: true, evidenceNotes: "Link verified active" },
          { criterion: "Core requirements addressed", passed: true, evidenceNotes: isResubmission ? "Client punch-list items fulfilled" : "Requirements met" },
          { criterion: "Zero sensitive token leaks", passed: true, evidenceNotes: "Code scan clear" },
        ],
        missingRequirements: [],
        feedbackNotes: isResubmission ? "Resubmission advisory check completed. Client review required." : "Advisory score generated. Human client sign-off required for milestone release.",
        evaluatedAt: new Date().toISOString(),
        isAdvisoryOnly: true,
      },
    };

    submitDeliverable(selectedContractForTab.id, targetMilestoneId, newSubmission);
    setSubmissionSuccessMsg(
      isResubmission
        ? "Revision #" + nextRevisionNum + " resubmitted successfully! Milestone is now In Review."
        : "Deliverable uploaded successfully! Milestone is now In Review."
    );
    setTimeout(() => {
      setIsSubmitModalOpen(false);
      setSubmissionSuccessMsg("");
    }, 1500);
  };

  // Handle Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const skillsArray = editSkills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const educationArray = editEducation
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    await updateProfile({
      bio: editBio.trim(),
      skills: skillsArray,
      education: educationArray,
      experienceYears: editExperienceYears ? parseInt(editExperienceYears, 10) || 0 : undefined,
      portfolioLinks: editPortfolio.trim() ? [editPortfolio.trim()] : [],
    });

    setProfileSuccessMsg("Profile updated successfully!");
    setIsEditingProfile(false);
    setTimeout(() => setProfileSuccessMsg(""), 3000);
  };

  if (!isFreelancerRole) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Card className="p-8 border-slate-200 bg-white shadow-sm rounded-2xl space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <Badge variant="warning" size="md">Freelancer Workspace Restricted</Badge>
          <h2 className="text-xl font-bold text-slate-900">Active Role is Client</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            You are currently signed in with a Client profile. To browse open projects, submit proposals, and deliver milestones as a freelancer, switch to Freelancer mode or continue to the Client Dashboard.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/client/dashboard">
              <Button variant="outline" size="sm">
                Go to Client Dashboard
              </Button>
            </Link>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveRole("FREELANCER")}
            >
              Switch to Freelancer Mode
            </Button>
          </div>
          <p className="text-[11px] text-slate-400 pt-2">
            Demo notice: Frontend role guard active. Real authorization is enforced by the authentication backend.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#EDF7F6] text-paypal-dark flex items-center justify-center font-bold text-lg">
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
          {/* Quick PayPal Payout Setup & Recent Transfer Alert */}
          {!currentUser.paypalPayoutEmail && (
            <Card className="border-[#9DF9EF] bg-[#EDF7F6]">
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-0.5 text-xs">
                  <p className="font-bold text-[#1E1820]">
                    Set Your PayPal Payout Email (No Bank Details Needed)
                  </p>
                  <p className="text-slate-600">
                    PayPal sends milestone payments straight to this email — PayPal handles withdrawing funds to your linked bank account.
                  </p>
                  {payoutEmailMsg && <p className="text-emerald-700 font-semibold pt-1">{payoutEmailMsg}</p>}
                  {payoutEmailErr && <p className="text-rose-700 font-semibold pt-1">{payoutEmailErr}</p>}
                </div>
                <form onSubmit={handleSavePayoutEmail} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  <input
                    type="email"
                    required
                    value={paypalPayoutInput}
                    onChange={(e) => setPaypalPayoutInput(e.target.value)}
                    placeholder="your-paypal@example.com"
                    className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 min-w-[230px] focus:outline-none focus:ring-2 focus:ring-[#51E2F5]"
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={isSavingPayoutEmail}>
                    {isSavingPayoutEmail ? "Saving..." : "Save PayPal Email"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {myContracts.some((c) => c.releasedAmount > 0) && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <strong className="text-emerald-950 block">
                    PayPal Payouts Transferred:{" "}
                    {formatCurrency(
                      myContracts.reduce((acc, c) => acc + c.releasedAmount, 0),
                      myContracts[0]?.currency || "USD"
                    )}
                  </strong>
                  <span className="text-emerald-800">
                    Sent to your PayPal payout email:{" "}
                    <strong className="font-mono">{currentUser.paypalPayoutEmail || currentUser.email}</strong>
                  </span>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("scorecard")}>
                View Earnings &amp; Worktime Report
              </Button>
            </div>
          )}

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
                  <h4 className="font-bold text-sm text-slate-900">{selectedContractForTab.projectTitle}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Client: <strong className="text-slate-800">{selectedContractForTab.clientName}</strong> • Released:{" "}
                    <span className="text-emerald-600 font-semibold">
                      {formatCurrency(selectedContractForTab.releasedAmount, selectedContractForTab.currency)}
                    </span>{" "}
                    / Total: {formatCurrency(selectedContractForTab.totalBudget, selectedContractForTab.currency)}
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
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EDF7F6] text-paypal-blue font-medium border border-[#9DF9EF]">
                  Search: &ldquo;{searchQuery}&rdquo;
                  <button onClick={() => setSearchQuery("")} className="hover:text-blue-800">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedDomain !== "ALL" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EDF7F6] text-paypal-blue font-medium border border-[#9DF9EF]">
                  Domain: {selectedDomain}
                  <button onClick={() => setSelectedDomain("ALL")} className="hover:text-blue-800">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedSkill !== "ALL" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EDF7F6] text-paypal-blue font-medium border border-[#9DF9EF]">
                  Skill: {selectedSkill}
                  <button onClick={() => setSelectedSkill("ALL")} className="hover:text-blue-800">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedExperience !== "ALL" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EDF7F6] text-paypal-blue font-medium border border-[#9DF9EF]">
                  Level: {selectedExperience}
                  <button onClick={() => setSelectedExperience("ALL")} className="hover:text-blue-800">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {(minBudget || maxBudget) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EDF7F6] text-paypal-blue font-medium border border-[#9DF9EF]">
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
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                    <span>
                      Posted by <strong className="text-slate-700">{p.clientCompany || p.clientName}</strong>
                    </span>
                    <span>•</span>
                    {p.clientLocation?.city ? (
                      <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-paypal-blue" />
                        {p.clientLocation.city}, {p.clientLocation.state}, {p.clientLocation.country}
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          {p.clientLocation.isAddressVerified ? "Verified Address" : "Address Provided"}
                        </span>
                      </span>
                    ) : (
                      <span>{formatDate(p.createdAt)}</span>
                    )}
                  </div>

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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">My Applications &amp; Proposals</h2>
              <p className="text-xs text-slate-500">Grouped by project — track ongoing, completed, and rejected proposals.</p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-full border border-slate-200 self-start">
              {(
                [
                  { id: "ONGOING", label: "Ongoing" },
                  { id: "COMPLETED", label: "Completed" },
                  { id: "REJECTED", label: "Rejected" },
                  { id: "ALL", label: "All" },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  onClick={() => setAppStatusFilter(st.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
                    appStatusFilter === st.id
                      ? "bg-white text-paypal-dark shadow-xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search & Project Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search your applications by project title, domain, or cover letter..."
                value={appSearchQuery}
                onChange={(e) => setAppSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-paypal-blue/30"
              />
            </div>
            <select
              value={filterAppProjectId}
              onChange={(e) => setFilterAppProjectId(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
            >
              <option value="ALL">All Projects</option>
              {Array.from(new Set(allMyApplications.map((a) => a.projectId))).map((pid) => {
                const proj = projects.find((p) => p.id === pid);
                return (
                  <option key={pid} value={pid}>
                    {proj?.title || `Project #${pid}`}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-5">
            {groupedMyApplications.map(([projId, projApps]) => {
              const targetProj = projects.find((p) => p.id === projId);
              const linkedContract = myContracts.find((c) => c.projectId === projId);
              return (
                <div key={projId} className="space-y-3 p-4 rounded-2xl bg-slate-50/80 border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-paypal-blue" />
                      <h3 className="text-sm font-bold text-slate-900">
                        {targetProj?.title || linkedContract?.projectTitle || `Project #${projId}`}
                      </h3>
                      {(targetProj?.domain || linkedContract?.projectDomain) && (
                        <Badge variant="paypal" size="sm">
                          {targetProj?.domain || linkedContract?.projectDomain}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {projApps.length} Application{projApps.length === 1 ? "" : "s"}
                      {targetProj ? ` • Budget: ${formatCurrency(targetProj.totalBudget, targetProj.currency)}` : ""}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {projApps.map((app, idx) => {
                      const myAppNumber = projApps.length - idx;
                      return (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">
                          {targetProj
                            ? `${targetProj.title} — Application #${myAppNumber}`
                            : `Application #${myAppNumber}`}
                        </CardTitle>
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
                    <div className="p-2.5 rounded-lg bg-[#FFA8B6]/20 border border-[#FFA8B6]/60 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#A28089]" />
                        <span className="text-[#1E1820] font-semibold">
                          AI Match Score: {app.aiRecommendation.fitScore}% ({app.aiRecommendation.domainMatchRate}% Domain Fit)
                        </span>
                      </div>
                      <Badge variant="inReview" size="sm">Top Candidate</Badge>
                    </div>
                  )}

                  {(app.status === "PENDING" || app.status === "REJECTED") && (
                    <div className="pt-2 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-rose-600 border-rose-200 hover:bg-rose-50"
                        disabled={withdrawingAppId === app.id}
                        onClick={async () => {
                          setWithdrawingAppId(app.id);
                          try {
                            await withdrawApplication(app.id);
                          } finally {
                            setWithdrawingAppId("");
                          }
                        }}
                      >
                        {withdrawingAppId === app.id
                          ? "Removing..."
                          : app.status === "REJECTED"
                          ? "Remove"
                          : "Withdraw Application"}
                      </Button>
                    </div>
                  )}

                  {app.status === "ACCEPTED" && (
                    <div className="pt-2 flex justify-end">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          const matching = myContracts.find((c) => c.projectId === app.projectId);
                          if (matching) setSelectedContractId(matching.id);
                          setActiveTab("contracts");
                        }}
                      >
                        Open Active Escrow Contract
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {filteredMyApplications.length === 0 && (
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[#1E1820]">Active Escrow Contract Hub</h2>
              <p className="text-xs text-[#5C4B51]">Milestone execution, deliverable submission, and payment releases.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-white rounded-full border border-[#A28089]/25">
                {(
                  [
                    { id: "ACTIVE", label: "Active" },
                    { id: "COMPLETED", label: "Completed" },
                    { id: "ALL", label: "All" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setContractFilter(tab.id)}
                    className={`px-3 py-1 text-xs font-bold rounded-full transition-all cursor-pointer ${
                      contractFilter === tab.id
                        ? "bg-[#1E1820] text-[#EDF7F6]"
                        : "text-[#5C4B51] hover:text-[#1E1820]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <Badge variant={escrowStatusInfo.variant} size="md">
                <Lock className="w-3.5 h-3.5 mr-1" />
                {escrowStatusInfo.label}
              </Badge>
            </div>
          </div>

          {/* Simple 1-Step PayPal Payout Setup (No Bank Details Needed) */}
          <Card className="border-[#9DF9EF] bg-[#EDF7F6]">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-0.5 text-xs">
                <p className="font-bold text-[#1E1820] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0EA5B7]" />
                  PayPal Payout Email (No Bank Details Needed)
                </p>
                <p className="text-slate-600">
                  Approved milestone payments are sent via PayPal to this email — PayPal handles withdrawing funds to your linked bank account.
                </p>
                {payoutEmailMsg && <p className="text-emerald-700 font-semibold pt-1">{payoutEmailMsg}</p>}
                {payoutEmailErr && <p className="text-rose-700 font-semibold pt-1">{payoutEmailErr}</p>}
              </div>
              <form onSubmit={handleSavePayoutEmail} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                <input
                  type="email"
                  required
                  value={paypalPayoutInput}
                  onChange={(e) => setPaypalPayoutInput(e.target.value)}
                  placeholder="your-paypal@example.com"
                  className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 min-w-[240px] focus:outline-none focus:ring-2 focus:ring-[#51E2F5]"
                />
                <Button type="submit" variant="primary" size="sm" disabled={isSavingPayoutEmail}>
                  {isSavingPayoutEmail ? "Saving..." : "Save PayPal Email"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {myContracts.length === 0 && (
            <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
              <Lock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold">No active contracts found.</p>
              <p className="text-xs text-slate-400 mt-1">
                When a client accepts your application, an active milestone escrow contract will appear here automatically.
              </p>
              <Button variant="primary" size="sm" className="mt-4" onClick={() => setActiveTab("projects")}>
                Browse Marketplace Projects
              </Button>
            </div>
          )}

          {myContracts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar: Clickable Contract Cards */}
            <div className="lg:col-span-4 space-y-3">
              <Card className="border-slate-200 bg-white p-3.5 rounded-2xl space-y-2.5 shadow-xs">
                <span className="text-xs font-extrabold text-[#1E1820] uppercase tracking-wider block">
                  Your Contracts ({filteredMyContracts.length}/{myContracts.length})
                </span>
                <input
                  type="text"
                  value={contractSearch}
                  onChange={(e) => setContractSearch(e.target.value)}
                  placeholder="Search project, client, or ID..."
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-paypal-blue"
                />
              </Card>

              <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
                {filteredMyContracts.map((c) => {
                  const isSelected = c.id === selectedContractForTab.id;
                  const cInfo = getEscrowStatusInfo(c.escrowStatus);
                  const pct = c.totalBudget > 0 ? Math.round((c.releasedAmount / c.totalBudget) * 100) : 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedContractId(c.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? "border-paypal-blue bg-[#EDF7F6] ring-2 ring-paypal-blue/20 shadow-sm"
                          : "border-slate-200 bg-white hover:border-[#9DF9EF]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{c.projectTitle}</h4>
                        <span className="font-extrabold text-xs text-paypal-dark shrink-0">
                          {formatCurrency(c.totalBudget, c.currency)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2 truncate">
                        Client: <strong className="text-slate-700">{c.clientName}</strong> • #{c.id}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <Badge variant={cInfo.variant} size="sm">{cInfo.label}</Badge>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-paypal-blue rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Panel: Selected Contract Workspace */}
            <div className="lg:col-span-8">
          <Card className="border-gray-100 bg-white shadow-lg rounded-3xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#9DF9EF]/30 to-[#FFA8B6]/20 border-b border-gray-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">{selectedContractForTab.projectTitle}</CardTitle>
                  <CardDescription>
                    Client: <strong className="text-slate-800">{selectedContractForTab.clientName}</strong> • Contract ID:{" "}
                    <code className="text-xs font-mono">{selectedContractForTab.id}</code>
                  </CardDescription>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <span className="text-xs text-slate-500">Contract Value</span>
                  <p className="text-2xl font-extrabold text-[#1E1820]">
                    {formatCurrency(selectedContractForTab.totalBudget, selectedContractForTab.currency)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Link
                    href={`/messages?contractId=${selectedContractForTab.id}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-[#EDF7F6] hover:bg-[#9DF9EF]/50 text-[#0EA5B7] border border-[#9DF9EF] transition-colors shadow-2xs whitespace-nowrap shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#0EA5B7] shrink-0" />
                    <span>Messages</span>
                  </Link>
                  <Link
                    href={`/disputes?contractId=${selectedContractForTab.id}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors shadow-2xs whitespace-nowrap shrink-0"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Disputes</span>
                  </Link>
                  {selectedContractForTab.escrowStatus !== "COMPLETED" &&
                    selectedContractForTab.escrowStatus !== "REFUNDED" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50 whitespace-nowrap shrink-0"
                        onClick={() => {
                          const held = selectedContractForTab.heldInEscrowAmount || 0;
                          setEarlyTalentShare(String(Math.round(held * 0.5)));
                          setEarlyReason("");
                          setEarlyError("");
                          setEarlySettleModalOpen(true);
                        }}
                      >
                        End Early / Settle
                      </Button>
                    )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {selectedContractForTab.escrowStatus === "AWAITING_AUTHORIZATION" && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Awaiting Client PayPal Escrow Funding:</strong> Once {selectedContractForTab.clientName} authorizes the escrow amount via PayPal, Milestone Step 1 will unlock for submission.
                  </span>
                </div>
              )}

              {/* Financial Balances */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs text-slate-500 block">Funds Held in Escrow</span>
                  <span className="text-lg font-bold text-slate-900">
                    {formatCurrency(selectedContractForTab.heldInEscrowAmount, selectedContractForTab.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Released Payouts</span>
                  <span className="text-lg font-bold text-emerald-600">
                    {formatCurrency(selectedContractForTab.releasedAmount, selectedContractForTab.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Settlement Rate</span>
                  <span className="text-lg font-bold text-paypal-blue">
                    {selectedContractForTab.totalBudget > 0
                      ? Math.round((selectedContractForTab.releasedAmount / selectedContractForTab.totalBudget) * 100)
                      : 0}
                    %
                  </span>
                </div>
              </div>

              {/* Complete Project Brief, Client Info & Deadlines */}
              <div className="p-4 rounded-xl bg-[#EDF7F6] border border-[#9DF9EF] space-y-3 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#1E1820] uppercase tracking-wider text-[11px]">
                      Complete Project Brief &amp; Deadlines
                    </span>
                    {selectedContractForTab.projectDomain && (
                      <Badge variant="paypal" size="sm">{selectedContractForTab.projectDomain}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="font-semibold text-slate-700 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#0EA5B7]" />
                      Project Deadline:{" "}
                      <strong>
                        {selectedContractForTab.projectDeadline
                          ? formatDate(selectedContractForTab.projectDeadline)
                          : "Flexible"}
                      </strong>
                    </span>
                  </div>
                </div>

                <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                  {selectedContractForTab.projectDescription || "No extended project description provided."}
                </p>

                {selectedContractForTab.requiredSkills && selectedContractForTab.requiredSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedContractForTab.requiredSkills.map((skill) => (
                      <span
                        key={skill}
                        className="px-2.5 py-0.5 rounded-full bg-white border border-[#9DF9EF] text-slate-700 text-[11px] font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-[#9DF9EF] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span>
                    Client Contact: <strong className="text-slate-900">{selectedContractForTab.clientName}</strong>
                    {selectedContractForTab.clientEmail ? ` (${selectedContractForTab.clientEmail})` : ""}
                  </span>
                  <span>
                    PayPal Payout To:{" "}
                    <strong className="font-mono text-[#1E1820]">
                      {selectedContractForTab.freelancerPayoutEmail || currentUser.paypalPayoutEmail || currentUser.email}
                    </strong>
                  </span>
                  <span className="font-semibold text-[#1E1820]">
                    Progress: {selectedContractForTab.milestones.filter((m) => m.status === "RELEASED").length} /{" "}
                    {selectedContractForTab.milestones.length} Milestones Completed
                  </span>
                </div>
              </div>

              {/* Milestones List */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Sequential Milestone Execution
                </h3>

                <div className="space-y-4">
                  {selectedContractForTab.milestones.map((ms) => {
                    const statusInfo = getMilestoneStatusInfo(ms.status);
                    const completedSubtasksCount = ms.subtasks ? ms.subtasks.filter(s => s.status === 'COMPLETED').length : 0;
                    const totalSubtasksCount = ms.subtasks ? ms.subtasks.length : 0;
                    return (
                      <div
                        key={ms.id}
                        className={`p-5 rounded-xl border transition-all ${
                          ms.status === "ACTIVE"
                            ? "border-paypal-blue bg-[#EDF7F6]/10 ring-1 ring-paypal-blue"
                            : ms.status === "RELEASED"
                            ? "border-emerald-200 bg-emerald-50/20"
                            : ms.status === "IN_REVIEW"
                            ? "border-[#FFA8B6]/60 bg-[#FFA8B6]/20/20"
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

                        {/* Internal Subtasks Progress Tracker (AI-Assisted) */}
                        {ms.subtasks && ms.subtasks.length > 0 && (
                          <div className="mb-3.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-paypal-dark flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-[#A28089]" />
                                Internal Subtask Division ({completedSubtasksCount}/{totalSubtasksCount} Completed)
                              </span>
                              <span className="text-slate-500 font-semibold">
                                {totalSubtasksCount > 0 ? Math.round((completedSubtasksCount / totalSubtasksCount) * 100) : 0}% Progress
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {ms.subtasks.map((st) => (
                                <div
                                  key={st.id}
                                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                                    st.status === 'COMPLETED'
                                      ? 'bg-emerald-50/60 border-emerald-200'
                                      : st.status === 'IN_PROGRESS'
                                      ? 'bg-[#EDF7F6] border-[#9DF9EF]'
                                      : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-extrabold text-paypal-dark text-[10px]">{st.stepNumber}</span>
                                      <span className="font-medium text-slate-800 truncate">{st.title}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 block mt-0.5">
                                      {st.percentageOfTotal}% total ({formatCurrency(st.paymentAmount, ms.currency)})
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = st.status === 'PENDING' ? 'IN_PROGRESS' : st.status === 'IN_PROGRESS' ? 'COMPLETED' : 'PENDING';
                                      updateSubtaskStatus(selectedContractForTab.id, ms.id, st.id, next);
                                    }}
                                    className="cursor-pointer shrink-0"
                                    title="Click to toggle status (PENDING -> IN PROGRESS -> COMPLETED)"
                                  >
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
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Client Revision Request Alert if revisions were requested */}
                        {ms.status === "REVISION_REQUESTED" && ms.latestRevisionRequest && (
                          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs space-y-2 mb-3">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-900 flex items-center gap-1.5">
                                <AlertCircle className="w-4 h-4 text-amber-600" />
                                Revision Request ({ms.revisionCount || 1} of 3)
                              </span>
                              <span className="text-[11px] text-amber-700">
                                Requested {formatDate(ms.latestRevisionRequest.requestedAt)}
                              </span>
                            </div>
                            <p className="text-amber-800 leading-relaxed bg-white/80 p-2.5 rounded-lg border border-amber-200">
                              <strong>Client Feedback:</strong> {ms.latestRevisionRequest.feedback}
                            </p>
                          </div>
                        )}

                        {/* Submission / Verification Preview */}
                        {ms.submission && (
                          <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs space-y-2 mb-3">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-700">
                                Latest Submitted Deliverable (Attempt #{ms.submission.revisionNumber || 1}):
                              </span>
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

                            {ms.submission.aiVerificationReport && (
                              <div className="mt-2 p-2.5 bg-[#FFA8B6]/20 rounded-lg border border-[#FFA8B6]/60 text-[11px] text-[#1E1820] space-y-1">
                                <div className="flex items-center justify-between font-bold">
                                  <span>
                                    AI Advisory Inspection: {ms.submission.aiVerificationReport.overallScore}% (Grade{" "}
                                    {ms.submission.aiVerificationReport.qualityGrade})
                                  </span>
                                  <span className="text-[10px] text-[#A28089] font-normal">Advisory Only</span>
                                </div>
                                {ms.submission.aiVerificationReport.feedbackNotes && (
                                  <p className="text-[11px] text-[#1E1820]">{ms.submission.aiVerificationReport.feedbackNotes}</p>
                                )}
                              </div>
                            )}

                            {ms.submissionHistory && ms.submissionHistory.length > 1 && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => toggleHistory(ms.id)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-paypal-blue cursor-pointer"
                                >
                                  <History className="w-3 h-3" />
                                  {isHistoryExpanded(ms.id)
                                    ? "Hide previous submissions"
                                    : `View submission history (${ms.submissionHistory.length})`}
                                </button>
                                {isHistoryExpanded(ms.id) && (
                                  <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-slate-200">
                                    {ms.submissionHistory.map((h) => (
                                      <div key={h.id} className="text-[11px] text-slate-600">
                                        <span className="font-semibold">#{h.revisionNumber || 1}</span> ({formatDate(h.submittedAt)}):{" "}
                                        <span className="font-mono break-all">{h.submissionUrl}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div>
                            <span className="font-bold text-slate-800">
                              {formatCurrency(ms.paymentAmount, ms.currency)} ({ms.percentage}%)
                            </span>
                            <span className="text-slate-500 ml-2">
                              Deadline:{" "}
                              <strong>
                                {ms.deadline || selectedContractForTab.projectDeadline
                                  ? formatDate(ms.deadline || selectedContractForTab.projectDeadline!)
                                  : "Flexible"}
                              </strong>
                            </span>
                          </div>

                          {/* Submit Deliverable Button if Active or Revision Requested */}
                          {ms.status === "ACTIVE" && (
                            <Button variant="primary" size="sm" onClick={() => handleOpenSubmitModal(ms.id)}>
                              <Upload className="w-3.5 h-3.5 mr-1.5" />
                              Submit Deliverable
                            </Button>
                          )}
                          {ms.status === "REVISION_REQUESTED" && (
                            <Button
                              variant="primary"
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700 text-white"
                              onClick={() => handleOpenSubmitModal(ms.id, true)}
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                              Submit Revised Deliverable (Revision {ms.revisionCount || 1}/3)
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live PayPal Payout Receipts */}
              {freelancerPaypalTxs.some((tx) => tx.operation === "PAYOUT" || tx.operation === "CAPTURE_MILESTONE") && (
                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                    PayPal Payout Receipts
                  </h4>
                  <div className="space-y-1.5">
                    {freelancerPaypalTxs
                      .filter((tx) => tx.operation === "PAYOUT" || tx.operation === "CAPTURE_MILESTONE")
                      .map((tx) => (
                        <div
                          key={tx.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-white px-3 py-2 rounded-lg border border-emerald-100"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                                tx.status === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {tx.status}
                            </span>
                            <span className="font-mono text-slate-700">
                              {tx.paypalPayoutBatchId || tx.paypalCaptureId || tx.operation}
                            </span>
                            {tx.errorMessage && (
                              <span className="text-amber-700">({tx.errorMessage})</span>
                            )}
                          </div>
                          <strong className="text-emerald-700">
                            {formatCurrency(tx.amount, tx.currency)}
                          </strong>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Direct Project Discussion with Client */}
              <ContractChatPanel
                contractId={selectedContractForTab.id}
                counterpartyName={selectedContractForTab.clientName}
                counterpartyRoleLabel="Client"
              />
            </CardContent>
          </Card>
            </div>
          </div>
          )}
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
                          <span key={idx} className="px-2.5 py-1 rounded-md bg-[#EDF7F6] text-paypal-dark font-medium border border-[#9DF9EF]">
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 italic">No skills listed yet.</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="font-semibold text-slate-700 block mb-1">Education &amp; Credentials:</span>
                    {currentUser.education && currentUser.education.length > 0 ? (
                      <ul className="list-disc list-inside text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        {currentUser.education.map((edu, idx) => (
                          <li key={idx}>{edu}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-400 italic">No education credentials added yet. Click &apos;Edit Profile&apos; to add your degree or certifications.</span>
                    )}
                  </div>

                  <div>
                    <span className="font-semibold text-slate-700 block mb-1">Experience:</span>
                    <span className="text-slate-700 font-medium">
                      {currentUser.experienceYears != null
                        ? `${currentUser.experienceYears} Year${currentUser.experienceYears === 1 ? "" : "s"}`
                        : "Not specified"}
                    </span>
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

                  <Textarea
                    label="Education & Credentials (one per line or comma separated)"
                    rows={2}
                    placeholder="e.g. B.Tech in Computer Science (2024)"
                    value={editEducation}
                    onChange={(e) => setEditEducation(e.target.value)}
                  />

                  <Input
                    label="Years of Experience"
                    type="number"
                    min="0"
                    max="60"
                    placeholder="e.g. 2"
                    value={editExperienceYears}
                    onChange={(e) => setEditExperienceYears(e.target.value)}
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
          {/* CV & Verified Resume Section */}
          <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden mt-6">
            <CardHeader className="bg-slate-50 border-b border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#EDF7F6] text-paypal-blue flex items-center justify-center font-bold">
                    <FileCheck className="w-5 h-5 text-paypal-blue" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-slate-900">CV &amp; Verified Professional Resume</CardTitle>
                    <CardDescription className="text-xs">
                      Required before starting your first project. Used by hiring clients to evaluate technical fit.
                    </CardDescription>
                  </div>
                </div>

                <Badge variant={currentUser.cvFile ? "success" : "warning"} size="sm">
                  {currentUser.cvFile ? "CV Uploaded & Active" : "No CV Uploaded"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {cvSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{cvSuccessMsg}</span>
                </div>
              )}

              {currentUser.cvFile ? (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-paypal-blue">
                        <FileCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block text-sm">{currentUser.cvFile.name}</span>
                        <span className="text-[11px] text-slate-500">
                          Uploaded {formatDate(currentUser.cvFile.uploadedAt)} • {(currentUser.cvFile.size ? Math.round(currentUser.cvFile.size / 1024) : 148)} KB
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        ref={profileCvInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadCVFile(file);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => profileCvInputRef.current?.click()}
                        className="text-xs"
                      >
                        <UploadCloud className="w-3.5 h-3.5 mr-1 text-paypal-blue" />
                        Replace / Update CV
                      </Button>
                    </div>
                  </div>

                  {currentUser.cvFile.extractedInfo && (
                    <div className="p-4 rounded-xl bg-[#FFA8B6]/15 border border-[#FFA8B6]/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#1E1820] flex items-center gap-1.5 text-xs">
                          <Sparkles className="w-3.5 h-3.5 text-[#A28089]" />
                          Parsed Resume Credentials (AI Advisory Summary)
                        </span>
                        <span className="text-[10px] text-[#5C4B51] bg-purple-100 px-2 py-0.5 rounded-full font-semibold">
                          DEMO ADVISORY
                        </span>
                      </div>

                      <p className="text-slate-700 text-xs leading-relaxed">
                        {currentUser.cvFile.extractedInfo.summary}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[11px]">
                        <div>
                          <strong className="text-slate-800 block mb-1">Extracted Technical Skills:</strong>
                          <div className="flex flex-wrap gap-1">
                            {currentUser.cvFile.extractedInfo.skills.map((sk, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded bg-white border border-[#FFA8B6]/60 text-[#1E1820] font-medium">
                                {sk}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <strong className="text-slate-800 block mb-1">Verified Experience &amp; Degrees:</strong>
                          <ul className="text-slate-600 space-y-0.5 list-disc list-inside">
                            {currentUser.cvFile.extractedInfo.education.map((ed, idx) => (
                              <li key={idx}>{ed}</li>
                            ))}
                            {currentUser.cvFile.extractedInfo.certifications.map((ct, idx) => (
                              <li key={idx} className="text-emerald-700">{ct}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50 space-y-3">
                  <UploadCloud className="w-10 h-10 text-slate-400 mx-auto" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">No CV / Resume on File</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Uploading your CV allows clients to inspect your qualifications and is required before submitting project proposals.
                    </p>
                  </div>
                  <input
                    ref={profileCvInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadCVFile(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => profileCvInputRef.current?.click()}
                  >
                    <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                    Upload CV Document (.pdf / .docx)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 6: TRUST SCORECARD & EARNINGS / WORKTIME REPORT */}
      {activeTab === "scorecard" && (() => {
        const totalEarned = myContracts.reduce((sum, c) => sum + (c.releasedAmount || 0), 0);
        const totalEscrowPending = myContracts.reduce((sum, c) => sum + (c.heldInEscrowAmount || 0), 0);
        const allMs = myContracts.flatMap((c) => c.milestones);
        const releasedMs = allMs.filter((m) => m.status === "RELEASED").length;
        const nowMs = Date.now();
        const contractWorkDays = myContracts.map((c) => {
          const start = new Date(c.createdAt || nowMs).getTime();
          const days = Math.max(1, Math.round((nowMs - start) / (1000 * 60 * 60 * 24)));
          return { contract: c, days };
        });
        const totalWorkDays = contractWorkDays.reduce((acc, item) => acc + item.days, 0);
        const avgDaysPerMilestone = releasedMs > 0 ? (totalWorkDays / releasedMs).toFixed(1) : "—";
        const reportCurrency = myContracts[0]?.currency || "USD";

        const handleDownloadReportCsv = () => {
          const header = ["Contract ID", "Project Title", "Client", "Worktime (Days)", "Milestones Done", "Total Milestones", "Earned (USD)", "Held in Escrow (USD)", "PayPal Payout Email"];
          const rows = contractWorkDays.map(({ contract: c, days }) => {
            const done = c.milestones.filter((m) => m.status === "RELEASED").length;
            return [
              c.id,
              `"${(c.projectTitle || "").replace(/"/g, '""')}"`,
              `"${(c.clientName || "").replace(/"/g, '""')}"`,
              days,
              done,
              c.milestones.length,
              c.releasedAmount,
              c.heldInEscrowAmount,
              c.freelancerPayoutEmail || currentUser.paypalPayoutEmail || currentUser.email,
            ].join(",");
          });
          const csv = [header.join(","), ...rows].join("\n");
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "trustpay-freelancer-earnings-worktime-report.csv";
          a.click();
          URL.revokeObjectURL(url);
        };

        return (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Earnings, Worktime &amp; Performance Report</h2>
              <p className="text-xs text-slate-500">
                Complete breakdown of your PayPal payouts, active escrow, milestone worktime, and verified trust metrics.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadReportCsv}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download Report (CSV)
            </Button>
          </div>

          {/* Earnings & Worktime Analytics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 space-y-1 border-emerald-200 bg-emerald-50/30">
              <span className="text-xs font-semibold text-emerald-800 block">Total Earned (PayPal)</span>
              <div className="text-2xl font-extrabold text-emerald-700">
                {formatCurrency(totalEarned, reportCurrency)}
              </div>
              <p className="text-[11px] text-emerald-700/80">
                Sent to {currentUser.paypalPayoutEmail || currentUser.email}
              </p>
            </Card>
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold text-slate-500 block">Pending in Escrow</span>
              <div className="text-2xl font-extrabold text-[#1E1820]">
                {formatCurrency(totalEscrowPending, reportCurrency)}
              </div>
              <p className="text-[11px] text-slate-400">Locked for upcoming milestones</p>
            </Card>
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold text-slate-500 block">Active Worktime</span>
              <div className="text-2xl font-extrabold text-slate-900">{totalWorkDays} days</div>
              <p className="text-[11px] text-slate-400">
                Avg {avgDaysPerMilestone} days / released milestone
              </p>
            </Card>
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold text-slate-500 block">Milestones Paid</span>
              <div className="text-2xl font-extrabold text-paypal-blue">
                {releasedMs} / {allMs.length}
              </div>
              <p className="text-[11px] text-slate-400">
                {allMs.length > 0 ? `${Math.round((releasedMs / allMs.length) * 100)}% completion rate` : "No milestones yet"}
              </p>
            </Card>
          </div>

          {/* Per-Contract Earnings & Worktime Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contract-by-Contract Earnings &amp; Worktime Analysis</CardTitle>
              <CardDescription>
                Live financial &amp; delivery breakdown across all {myContracts.length} contract(s).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contractWorkDays.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No contracts yet. Accepted proposals will appear in your earnings &amp; worktime report here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 pr-4">Project</th>
                        <th className="py-2.5 pr-4">Client</th>
                        <th className="py-2.5 pr-4">Worktime</th>
                        <th className="py-2.5 pr-4">Milestones</th>
                        <th className="py-2.5 pr-4">Paid via PayPal</th>
                        <th className="py-2.5 pr-4">In Escrow</th>
                        <th className="py-2.5">Payout Destination</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contractWorkDays.map(({ contract: c, days }) => {
                        const done = c.milestones.filter((m) => m.status === "RELEASED").length;
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/70">
                            <td className="py-3 pr-4 font-bold text-slate-900">{c.projectTitle}</td>
                            <td className="py-3 pr-4 text-slate-600">{c.clientName}</td>
                            <td className="py-3 pr-4 text-slate-700 font-medium">{days} day(s)</td>
                            <td className="py-3 pr-4 text-slate-700">
                              {done} / {c.milestones.length}
                            </td>
                            <td className="py-3 pr-4 font-bold text-emerald-700">
                              {formatCurrency(c.releasedAmount, c.currency)}
                            </td>
                            <td className="py-3 pr-4 font-semibold text-[#1E1820]">
                              {formatCurrency(c.heldInEscrowAmount, c.currency)}
                            </td>
                            <td className="py-3 font-mono text-[11px] text-slate-600">
                              {c.freelancerPayoutEmail || currentUser.paypalPayoutEmail || currentUser.email}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

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
        );
      })()}

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
              {applyErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                  {applyErrorMsg}
                </div>
              )}

              {/* CV / Resume Selection: Use Profile CV or Upload New */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                <span className="font-bold text-slate-800 block">
                  CV / Resume for this Application <span className="text-rose-500">*</span>
                </span>
                <input
                  ref={applyCvInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadCVFile(file);
                    e.target.value = "";
                  }}
                />
                {currentUser.cvFile ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-[#9DF9EF] cursor-pointer">
                      <input
                        type="radio"
                        name="applyCvChoice"
                        checked={applyCvSource === "profile"}
                        onChange={() => setApplyCvSource("profile")}
                      />
                      <FileCheck className="w-4 h-4 text-[#0EA5B7] shrink-0" />
                      <span className="flex-1 truncate font-semibold text-slate-900">
                        Use Profile CV: {currentUser.cvFile.name}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {currentUser.cvFile.size ? `${Math.max(1, Math.round(currentUser.cvFile.size / 1024))} KB` : ""}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => applyCvInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-slate-300 bg-white hover:border-[#51E2F5] text-slate-700 font-semibold cursor-pointer"
                    >
                      <UploadCloud className="w-3.5 h-3.5 text-[#0EA5B7]" />
                      Or Upload a Different CV (.pdf, .doc, .docx)
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => applyCvInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-[#51E2F5] bg-white hover:bg-[#EDF7F6] text-[#1E1820] font-bold cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4 text-[#0EA5B7]" />
                    Upload CV / Resume (.pdf, .doc, .docx)
                  </button>
                )}
              </div>

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

              <div className="p-3 bg-[#EDF7F6] border border-[#9DF9EF] rounded-lg text-xs text-slate-600 space-y-1">
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

              <div className="p-3 bg-[#FFA8B6]/20 border border-[#FFA8B6]/60 rounded-lg text-xs text-[#1E1820] space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#A28089]" />
                  Advisory AI Inspection:
                </span>
                <p className="text-[11px] text-[#1E1820] leading-tight">
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

      {/* CV REQUIRED PROMPT MODAL (Blocks applying/starting before CV upload) */}
      {showCVPromptModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6 animate-slide-up text-center">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mx-auto">
              <UploadCloud className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-slate-900">CV / Resume Required</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Platform escrow governance requires verified freelancers to have an uploaded CV/Resume before starting or applying to their first project.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-left space-y-2">
              <span className="font-bold text-slate-800 block">Why is this required?</span>
              <ul className="text-slate-600 space-y-1 list-disc list-inside text-[11px]">
                <li>Verifies technical credentials for escrow milestone allocation</li>
                <li>Allows hiring clients to review code, architecture &amp; certifications</li>
                <li>Upload once — credentials persist across all future projects</li>
              </ul>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => profileCvInputRef.current?.click()}
                className="w-full justify-center"
              >
                <UploadCloud className="w-4 h-4 mr-1.5" />
                Choose CV File &amp; Continue
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCVPromptModal(false);
                  setPendingApplyProject(null);
                }}
                className="text-xs text-slate-500"
              >
                Cancel
              </Button>
            </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[#EDF7F6] border border-[#9DF9EF]">
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
                            {ms.percentage}% • Due {ms.deadline || selectedProjectForDetails.deadline ? formatDate(ms.deadline || selectedProjectForDetails.deadline) : "Flexible"}
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

      {/* ── MODAL: EARLY CONTRACT SETTLEMENT ── */}
      {earlySettleModalOpen && selectedContractForTab && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">End Contract Early with Settlement</h3>
                <p className="text-xs text-slate-500">
                  Remaining Held Escrow: {formatCurrency(selectedContractForTab.heldInEscrowAmount, selectedContractForTab.currency)}
                </p>
              </div>
              <button onClick={() => setEarlySettleModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {earlyError && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-lg">{earlyError}</p>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const held = selectedContractForTab.heldInEscrowAmount || 0;
                const talentAmt = Math.max(0, Number(earlyTalentShare) || 0);
                if (talentAmt > held) {
                  setEarlyError(`Talent share cannot exceed ${formatCurrency(held, selectedContractForTab.currency)}.`);
                  return;
                }
                const refundAmt = Math.max(0, Number((held - talentAmt).toFixed(2)));
                setIsSettlingEarly(true);
                setEarlyError("");
                try {
                  await settleContractEarly(
                    selectedContractForTab.id,
                    talentAmt,
                    refundAmt,
                    earlyReason.trim() || "Early contract termination with mutual settlement"
                  );
                  setEarlySettleModalOpen(false);
                } catch (err: any) {
                  setEarlyError(err?.message || "Failed to settle contract early.");
                } finally {
                  setIsSettlingEarly(false);
                }
              }}
              className="space-y-3"
            >
              <Input
                label={`Your Payout Share (${selectedContractForTab.currency})`}
                type="number"
                min="0"
                max={selectedContractForTab.heldInEscrowAmount || 0}
                step="0.01"
                value={earlyTalentShare}
                onChange={(e) => setEarlyTalentShare(e.target.value)}
              />
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex justify-between">
                <span>Client Refund Amount:</span>
                <strong>
                  {formatCurrency(
                    Math.max(0, (selectedContractForTab.heldInEscrowAmount || 0) - (Number(earlyTalentShare) || 0)),
                    selectedContractForTab.currency
                  )}
                </strong>
              </div>
              <Textarea
                label="Settlement Reason"
                required
                rows={2}
                placeholder="Explain why the contract is ending early..."
                value={earlyReason}
                onChange={(e) => setEarlyReason(e.target.value)}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEarlySettleModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={isSettlingEarly}>
                  Confirm Early Settlement
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
    <RequireAuth requiredRole="FREELANCER">
      <Suspense fallback={<div className="p-12 text-center text-xs text-slate-400">Loading Freelancer Dashboard...</div>}>
        <FreelancerDashboardContent />
      </Suspense>
    </RequireAuth>
  );
}
