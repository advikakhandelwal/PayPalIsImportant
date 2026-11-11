"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useDisputes } from "@/context/DisputeContext";
import { useNotifications } from "@/context/NotificationContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DisputeCategory, UserRole } from "@/types";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Clock,
  DollarSign,
  User,
  Building,
  HelpCircle,
  Send,
  MessageSquare,
  FileText,
  Lock,
  ArrowRight,
  ExternalLink,
  Mail,
  AlertCircle,
  XCircle,
} from "lucide-react";

export default function DisputeWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const contractId = params?.contractId as string;

  const { currentUser, activeRole, isHydrated } = useAuth();
  const { contracts } = useMarketplace();
  const {
    getDisputeByContractId,
    raiseDispute,
    approveAIRecommendation,
    proposeCounteroffer,
    acceptNegotiationOffer,
    rejectNegotiation,
    submitFinalSettlement,
    acceptFinalSettlement,
    rejectFinalSettlement,
  } = useDisputes();
  const { addNotification } = useNotifications();

  // Find target contract
  const contract = useMemo(() => {
    return contracts.find((c) => c.id === contractId);
  }, [contracts, contractId]);

  // Find existing dispute
  const dispute = getDisputeByContractId(contractId);

  // Form states for raising dispute
  const [category, setCategory] = useState<DisputeCategory>("QUALITY_DEFICIENCY");
  const [reason, setReason] = useState("");
  const [explanation, setExplanation] = useState("");
  const [expectedResolution, setExpectedResolution] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Counteroffer form state
  const [counterAmount, setCounterAmount] = useState<string>("");
  const [counterReason, setCounterReason] = useState("");

  // Final settlement form state
  const [finalTalentAmount, setFinalTalentAmount] = useState<string>("");
  const [finalNotes, setFinalNotes] = useState("");

  const isClient = activeRole === "CLIENT" || currentUser.role === "CLIENT";
  const dashboardHref = isClient ? "/client/dashboard?tab=contracts" : "/freelancer/dashboard?tab=contracts";

  if (!contract) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center bg-white rounded-3xl border-[#E5ECF6] shadow-md">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Contract Not Found</h2>
          <p className="text-xs text-gray-500 mt-2 mb-6">
            The escrow contract ID &quot;{contractId}&quot; does not exist or has expired in demo state.
          </p>
          <Link href="/client/dashboard" className="inline-flex items-center gap-2 text-xs font-bold text-[#087EAA]">
            <ArrowLeft className="w-4 h-4" /> Return to Dashboard
          </Link>
        </Card>
      </div>
    );
  }

  const isContractCompleted =
    contract.escrowStatus === "COMPLETED" ||
    (contract.milestones.length > 0 &&
      contract.milestones.every(
        (m) => m.status === "RELEASED" || m.submission !== undefined || m.status === "IN_REVIEW" || m.status === "REVISION_REQUESTED"
      ));

  // Handlers
  const handleInitiateDispute = () => {
    if (!reason.trim() || !explanation.trim()) return;

    const newDispute = raiseDispute({
      contractId: contract.id,
      projectId: contract.projectId,
      clientId: contract.clientId,
      clientName: contract.clientName,
      freelancerId: contract.freelancerId,
      freelancerName: contract.freelancerName,
      initiatorRole: isClient ? "CLIENT" : "FREELANCER",
      initiatorName: currentUser.name || "Client",
      reason,
      category,
      explanation,
      expectedResolution,
      evidenceNotes,
      milestoneId: selectedMilestoneId || undefined,
      totalBudget: contract.totalBudget,
      currency: contract.currency,
    });

    // Notify opposing party
    addNotification({
      userId: isClient ? contract.freelancerId : contract.clientId,
      userRole: isClient ? "FREELANCER" : "CLIENT",
      event: "DISPUTE_RAISED",
      title: "Escrow Dispute Raised",
      description: `${currentUser.name} raised a dispute for "${contract.projectTitle}". AI advisory report is available.`,
      linkHref: `/client/disputes/${contract.id}`,
      entityId: contract.id,
    });

    setShowConfirmModal(false);
  };

  const handleApproveAI = () => {
    if (!dispute) return;
    approveAIRecommendation(dispute.id, isClient ? "CLIENT" : "FREELANCER");

    addNotification({
      userId: isClient ? dispute.freelancerId : dispute.clientId,
      userRole: isClient ? "FREELANCER" : "CLIENT",
      event: "AI_RECOMMENDATION_READY",
      title: `${isClient ? "Client" : "Freelancer"} Approved AI Advisory Split`,
      description: `${currentUser.name} agreed to the AI recommendation for "${contract.projectTitle}".`,
      linkHref: `/client/disputes/${contract.id}`,
      entityId: contract.id,
    });
  };

  const handleSendCounteroffer = () => {
    if (!dispute) return;
    const num = parseFloat(counterAmount);
    if (isNaN(num) || num < 0 || num > contract.totalBudget) return;
    if (!counterReason.trim()) return;

    const success = proposeCounteroffer(
      dispute.id,
      isClient ? "CLIENT" : "FREELANCER",
      currentUser.name || (isClient ? "Client" : "Freelancer"),
      num,
      contract.currency,
      counterReason
    );

    if (success) {
      setCounterAmount("");
      setCounterReason("");

      addNotification({
        userId: isClient ? dispute.freelancerId : dispute.clientId,
        userRole: isClient ? "FREELANCER" : "CLIENT",
        event: "COUNTEROFFER_RECEIVED",
        title: "New Counteroffer Received",
        description: `${currentUser.name} proposed a revised payout of ${formatCurrency(num, contract.currency)}.`,
        linkHref: `/client/disputes/${contract.id}`,
        entityId: contract.id,
      });
    }
  };

  const handleAcceptOffer = (offerId: string) => {
    if (!dispute) return;
    acceptNegotiationOffer(dispute.id, offerId);

    addNotification({
      userId: isClient ? dispute.freelancerId : dispute.clientId,
      userRole: isClient ? "FREELANCER" : "CLIENT",
      event: "SETTLEMENT_ACCEPTED",
      title: "Dispute Settled & Agreed",
      description: `${currentUser.name} accepted the settlement terms for "${contract.projectTitle}".`,
      linkHref: `/client/disputes/${contract.id}`,
      entityId: contract.id,
    });
  };

  const handleProposeFinalSettlement = () => {
    if (!dispute) return;
    const num = parseFloat(finalTalentAmount);
    if (isNaN(num) || num < 0 || num > contract.totalBudget) return;

    const refund = contract.totalBudget - num;

    submitFinalSettlement(dispute.id, {
      freelancerAmount: num,
      clientAmount: refund,
      currency: contract.currency,
      notes: finalNotes,
      proposedBy: isClient ? "CLIENT" : "FREELANCER",
    });

    setFinalTalentAmount("");
    setFinalNotes("");

    addNotification({
      userId: dispute.freelancerId,
      userRole: "FREELANCER",
      event: "FINAL_SETTLEMENT_SUBMITTED",
      title: "Final Settlement Offer Received",
      description: `Client submitted a formal settlement proposal of ${formatCurrency(num, contract.currency)} for your review.`,
      linkHref: `/client/disputes/${contract.id}`,
      entityId: contract.id,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50/50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href={dashboardHref}
            className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#087EAA] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Viewing as:</span>
            <strong className="text-gray-800">{activeRole}</strong>
          </div>
        </div>

        {/* Contract Header Card */}
        <Card className="border-[#E5ECF6] bg-white rounded-3xl p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Autonomous Resolution Hub
                </span>
                <span className="text-xs text-gray-400 font-mono">#{contract.id}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#073B68] tracking-tight">
                {contract.projectTitle}
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                Client: <strong className="text-gray-800">{contract.clientName}</strong> • Freelancer:{" "}
                <strong className="text-gray-800">{contract.freelancerName}</strong>
              </p>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <span className="text-xs text-gray-400 block font-medium">Total Escrow Value</span>
              <span className="text-2xl font-extrabold text-[#073B68] tabular-nums">
                {formatCurrency(contract.totalBudget, contract.currency)}
              </span>
            </div>
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            CASE A: NO DISPUTE YET -> INITIATION FORM OR STATUS NOTICE
        ═══════════════════════════════════════════════════════════════════ */}
        {!dispute && !isClient && (
          <Card className="border-[#E5ECF6] bg-white rounded-3xl p-8 text-center shadow-xs space-y-4 animate-fade-in">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#087EAA] flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">No Active Dispute on This Contract</h2>
            <p className="text-xs text-gray-500 max-w-lg mx-auto">
              Under TrustPay protocol, escrow disputes can be initiated by the hiring client upon project completion if deliverables do not meet agreed specifications. Once initiated, you will be notified to review the AI advisory recommendation and submit counteroffers here.
            </p>
            <div>
              <Link href="/freelancer/dashboard?tab=contracts" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#087EAA] hover:underline">
                <ArrowLeft className="w-4 h-4" /> Return to Contract Workspace
              </Link>
            </div>
          </Card>
        )}

        {!dispute && isClient && !isContractCompleted && (
          <Card className="border-[#FCDDB5] bg-[#FEF6ED]/40 rounded-3xl p-8 text-center shadow-xs space-y-4 animate-fade-in">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Dispute Ineligible: Project Still In Progress</h2>
            <p className="text-xs text-gray-600 max-w-lg mx-auto">
              In accordance with TrustPay AI Escrow Protocol, disputes may only be raised after the entire project has been completed and final deliverables submitted. Active milestones should be reviewed using the Milestone Revision Request workflow (up to 3 revisions per milestone) or allowed to proceed to completion.
            </p>
            <div>
              <Link href="/client/dashboard?tab=contracts" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#087EAA] hover:underline">
                <ArrowLeft className="w-4 h-4" /> Back to Milestone Review
              </Link>
            </div>
          </Card>
        )}

        {!dispute && isClient && isContractCompleted && (
          <div className="space-y-6 animate-fade-in">
            <Card className="border-[#E5ECF6] bg-white rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="border-b border-[#E5ECF6] pb-4">
                <div className="flex items-center gap-2 text-amber-600 mb-1">
                  <ShieldAlert className="w-5 h-5" />
                  <h2 className="text-lg font-bold text-gray-900">Initiate Escrow Dispute &amp; AI Analysis</h2>
                </div>
                <p className="text-xs text-gray-500">
                  If project deliverables fail to meet agreed technical specifications or deadlines, raise an escrow inquiry.
                  Our AI Advisory system evaluates evidence, repository commits, and milestone checklists to propose an equitable settlement.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Dispute Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as DisputeCategory)}
                    className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#087EAA]"
                  >
                    <option value="QUALITY_DEFICIENCY">Quality Deficiency &amp; Bug Density</option>
                    <option value="MISSED_DEADLINE">Missed Milestone Deadline</option>
                    <option value="SCOPE_CREEP">Scope Misalignment &amp; Incomplete Specs</option>
                    <option value="UNRESPONSIVE_COMMUNICATION">Unresponsive Communication</option>
                    <option value="SPECIFICATION_MISALIGNMENT">Architecture / Tech Stack Deviation</option>
                    <option value="OTHER">Other Contract Dispute</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Impacted Milestone (Optional)</label>
                  <select
                    value={selectedMilestoneId}
                    onChange={(e) => setSelectedMilestoneId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#087EAA]"
                  >
                    <option value="">Entire Project / Multiple Milestones</option>
                    {contract.milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        Step {m.stepNumber}: {m.title} ({formatCurrency(m.paymentAmount, m.currency)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Dispute Headline / Primary Issue</label>
                <Input
                  placeholder="e.g. Incomplete API test coverage and persistent authentication latency"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Detailed Explanation &amp; Context</label>
                <Textarea
                  placeholder="Provide comprehensive context on requirements, what was submitted, and why the deliverable does not satisfy the agreement..."
                  rows={4}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Expected Financial Resolution</label>
                  <Input
                    placeholder="e.g. 50% refund to client, 50% release to talent"
                    value={expectedResolution}
                    onChange={(e) => setExpectedResolution(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Evidence Reference (URLs, PRs, Notes)</label>
                  <Input
                    placeholder="e.g. GitHub PR #42, Jira-104 revision logs"
                    value={evidenceNotes}
                    onChange={(e) => setEvidenceNotes(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 leading-relaxed">
                  <strong>Notice on Escrow Protection:</strong> Submitting a dispute freezes the unreleased escrow balance.
                  The AI verification engine will generate an objective advisory evaluation. Both parties will be given an opportunity
                  to accept the AI split or negotiate up to 2 counteroffers.
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!reason.trim() || !explanation.trim()}
                  onClick={() => setShowConfirmModal(true)}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Initiate AI Dispute Analysis
                </Button>
              </div>
            </Card>

            {/* Confirmation Modal */}
            {showConfirmModal && (
              <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#E5ECF6] space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Confirm Dispute Submission</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    You are initiating an autonomous dispute investigation for <strong>{contract.projectTitle}</strong>.
                    Escrow funds will remain safely locked while AI advisory analysis is generated.
                  </p>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => setShowConfirmModal(false)}>
                      Go Back
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleInitiateDispute}>
                      Confirm &amp; Generate Advisory
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            CASE B: DISPUTE ACTIVE -> WORKSPACE LIFECYCLE
        ═══════════════════════════════════════════════════════════════════ */}
        {dispute && (
          <div className="space-y-6 animate-fade-in">
            {/* Status Stepper Banner */}
            <div className="bg-white border border-[#E5ECF6] rounded-3xl p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5ECF6]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#087EAA] flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Resolution Status</span>
                    <h2 className="text-base font-bold text-gray-900">
                      {dispute.status.replace(/_/g, " ")}
                    </h2>
                  </div>
                </div>

                <Badge
                  variant={
                    dispute.status === "RESOLVED"
                      ? "success"
                      : dispute.status === "NEGOTIATION_FAILED"
                      ? "danger"
                      : "warning"
                  }
                  size="md"
                >
                  {dispute.status === "RESOLVED"
                    ? "Dispute Settled & Closed"
                    : dispute.status === "NEGOTIATION_FAILED"
                    ? "Awaiting Offline Settlement"
                    : "In Active Review"}
                </Badge>
              </div>

              {/* Progress Steps */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 text-xs font-semibold">
                <div className="p-2.5 rounded-xl bg-blue-50 text-[#087EAA] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>1. Dispute Lodged</span>
                </div>
                <div className={`p-2.5 rounded-xl flex items-center gap-2 ${
                  dispute.aiRecommendation ? "bg-blue-50 text-[#087EAA]" : "bg-gray-50 text-gray-400"
                }`}>
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${dispute.aiRecommendation ? "text-emerald-500" : "text-gray-300"}`} />
                  <span>2. AI Advisory Report</span>
                </div>
                <div className={`p-2.5 rounded-xl flex items-center gap-2 ${
                  dispute.negotiationHistory.length > 0 || dispute.status === "RESOLVED" ? "bg-blue-50 text-[#087EAA]" : "bg-gray-50 text-gray-400"
                }`}>
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${dispute.negotiationHistory.length > 0 || dispute.status === "RESOLVED" ? "text-emerald-500" : "text-gray-300"}`} />
                  <span>3. Mutual Consensus</span>
                </div>
                <div className={`p-2.5 rounded-xl flex items-center gap-2 ${
                  dispute.status === "RESOLVED" ? "bg-emerald-50 text-emerald-700 font-bold" : "bg-gray-50 text-gray-400"
                }`}>
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${dispute.status === "RESOLVED" ? "text-emerald-600" : "text-gray-300"}`} />
                  <span>4. Escrow Released</span>
                </div>
              </div>
            </div>

            {/* SECTION 1: AI INVESTIGATION REPORT & ADVISORY RECOMMENDATION */}
            {dispute.aiRecommendation && (
              <Card className="border-blue-100 bg-white rounded-3xl overflow-hidden shadow-xs">
                <CardHeader className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border-b border-blue-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#087EAA] text-white flex items-center justify-center shadow-xs">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg text-[#073B68]">AI Advisory Resolution Report</CardTitle>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-[#087EAA]">
                            DEMO ADVISORY
                          </span>
                        </div>
                        <CardDescription className="text-xs">
                          Algorithmic forensic analysis of milestone deliverables, code repositories, and requirement checklists.
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium">Confidence Score:</span>
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
                        {dispute.aiRecommendation.confidenceScore}%
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6 pt-6">
                  {/* Two Financial Recommendation Panels */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-emerald-50/40 border border-emerald-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-emerald-800">Talent Payout (Deliverable Value)</span>
                        <User className="w-4 h-4 text-emerald-600" />
                      </div>
                      <span className="text-3xl font-extrabold text-emerald-700">
                        {formatCurrency(dispute.aiRecommendation.freelancerAmount, dispute.aiRecommendation.currency)}
                      </span>
                      <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                        {dispute.aiRecommendation.completedWorkBreakdown}
                      </p>
                    </div>

                    <div className="p-5 rounded-2xl bg-blue-50/40 border border-blue-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[#073B68]">Client Refund (Incomplete Scope)</span>
                        <Building className="w-4 h-4 text-[#087EAA]" />
                      </div>
                      <span className="text-3xl font-extrabold text-[#073B68]">
                        {formatCurrency(dispute.aiRecommendation.clientAmount, dispute.aiRecommendation.currency)}
                      </span>
                      <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                        {dispute.aiRecommendation.disputedWorkBreakdown}
                      </p>
                    </div>
                  </div>

                  {/* Advisory Rationale */}
                  <div className="p-4 rounded-2xl bg-gray-50 border border-[#E5ECF6] space-y-2">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                      Forensic Rationale
                    </span>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {dispute.aiRecommendation.explanation}
                    </p>
                    <div className="pt-2">
                      <span className="text-xs font-bold text-gray-700 block mb-1">Evidence Considered:</span>
                      <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                        {dispute.aiRecommendation.evidence.map((ev, idx) => (
                          <li key={idx}>{ev}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Advisory Disclaimer */}
                  <div className="text-[11px] text-gray-400 italic bg-gray-50 p-3 rounded-xl border border-[#E5ECF6]">
                    <strong>Disclaimer:</strong> This recommendation is generated for demonstration purposes.
                    Actual AI investigation will be performed by the backend service when connected. Decisions remain subject to mutual human approval.
                  </div>

                  {/* CASE 1: MUTUAL AI APPROVAL ACTIONS */}
                  {dispute.status !== "RESOLVED" && (
                    <div className="pt-2 border-t border-[#E5ECF6] flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-xs text-gray-500 flex items-center gap-3">
                        <span className="flex items-center gap-1.5">
                          Client:{" "}
                          {dispute.clientApprovedAI ? (
                            <strong className="text-emerald-600 flex items-center gap-0.5">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                            </strong>
                          ) : (
                            <span className="text-gray-400">Pending</span>
                          )}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          Freelancer:{" "}
                          {dispute.freelancerApprovedAI ? (
                            <strong className="text-emerald-600 flex items-center gap-0.5">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                            </strong>
                          ) : (
                            <span className="text-gray-400">Pending</span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isClient && !dispute.clientApprovedAI && (
                          <Button variant="primary" size="sm" onClick={handleApproveAI}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Approve AI Recommendation
                          </Button>
                        )}
                        {!isClient && !dispute.freelancerApprovedAI && (
                          <Button variant="primary" size="sm" onClick={handleApproveAI}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Approve AI Recommendation
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* SECTION 2: NEGOTIATION HUB (CASE 2 & CASE 3) */}
            {dispute.status !== "RESOLVED" && (
              <Card className="border-[#E5ECF6] bg-white rounded-3xl p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5ECF6] pb-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Direct Mutual Negotiation Hub</h3>
                    <p className="text-xs text-gray-500">
                      Parties can counteroffer up to 2 times to find mutual agreement without third-party arbitration.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">
                      Client counters: <strong>{dispute.clientCounteroffersUsed}/2</strong>
                    </span>
                    <span className="text-gray-500">
                      Freelancer counters: <strong>{dispute.freelancerCounteroffersUsed}/2</strong>
                    </span>
                  </div>
                </div>

                {/* Counteroffer History Timeline */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                    Offer &amp; Counteroffer History
                  </span>

                  {dispute.negotiationHistory.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400 bg-gray-50 rounded-2xl border border-[#E5ECF6]">
                      No counteroffers submitted yet. Parties may accept the AI Advisory Recommendation above or propose custom settlement terms below.
                    </div>
                  ) : (
                    dispute.negotiationHistory.map((item) => {
                      const isMyOffer = item.offeredBy === activeRole;
                      return (
                        <div
                          key={item.id}
                          className={`p-4 rounded-2xl border-r border-t border-b border-l-4 transition-all ${
                            item.status === "ACCEPTED"
                              ? "border-l-emerald-500 border-emerald-200 bg-emerald-50/20"
                              : item.status === "PENDING" && item.offeredBy === "CLIENT"
                              ? "border-l-[#073B68] border-blue-200 bg-blue-50/20"
                              : item.status === "PENDING"
                              ? "border-l-[#16A6A1] border-blue-200 bg-blue-50/20"
                              : item.offeredBy === "CLIENT"
                              ? "border-l-[#073B68] border-[#E5ECF6] bg-gray-50/50"
                              : "border-l-[#16A6A1] border-[#E5ECF6] bg-gray-50/50"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[#073B68]">
                                {item.offeredByName} ({item.offeredBy})
                              </span>
                              <Badge
                                variant={
                                  item.status === "ACCEPTED"
                                    ? "success"
                                    : item.status === "PENDING"
                                    ? "warning"
                                    : "neutral"
                                }
                                size="sm"
                              >
                                {item.status}
                              </Badge>
                            </div>
                            <div className="text-xs font-extrabold text-gray-900">
                              Proposed Talent Payout: {formatCurrency(item.amount, item.currency)}
                            </div>
                          </div>

                          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                            {item.reason}
                          </p>

                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#E5ECF6]">
                            <span className="text-[11px] text-gray-400">
                              {new Date(item.timestamp).toLocaleString()}
                            </span>

                            {/* Opposing party can accept pending offer */}
                            {item.status === "PENDING" && !isMyOffer && (
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleAcceptOffer(item.id)}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                  Accept Offer ({formatCurrency(item.amount, item.currency)})
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Propose Counteroffer Form */}
                {((isClient && dispute.clientCounteroffersUsed < 2) ||
                  (!isClient && dispute.freelancerCounteroffersUsed < 2)) && (
                  <div className="p-4 rounded-2xl bg-gray-50 border border-[#E5ECF6] space-y-3">
                    <span className="text-xs font-bold text-gray-800 block">
                      Propose a Counteroffer ({isClient ? `Client: ${2 - dispute.clientCounteroffersUsed} remaining` : `Freelancer: ${2 - dispute.freelancerCounteroffersUsed} remaining`})
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-gray-500 block mb-1">
                          Proposed Talent Disbursement ({contract.currency})
                        </label>
                        <Input
                          type="number"
                          placeholder="e.g. 1800"
                          value={counterAmount}
                          onChange={(e) => setCounterAmount(e.target.value)}
                          className="text-xs"
                          max={contract.totalBudget}
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-gray-500 block mb-1">
                          Remaining Client Refund
                        </label>
                        <div className="h-10 px-3 rounded-xl border border-gray-200 bg-white flex items-center text-xs text-gray-500 font-bold">
                          {counterAmount && !isNaN(parseFloat(counterAmount))
                            ? formatCurrency(Math.max(0, contract.totalBudget - parseFloat(counterAmount)), contract.currency)
                            : "Enter amount"}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-gray-500 block mb-1">Rationale for Counteroffer</label>
                      <Input
                        placeholder="Explain adjustments based on deliverables verified or extra work performed..."
                        value={counterReason}
                        onChange={(e) => setCounterReason(e.target.value)}
                        className="text-xs"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!counterAmount || !counterReason.trim()}
                        onClick={handleSendCounteroffer}
                      >
                        <Send className="w-3.5 h-3.5 mr-1.5" />
                        Submit Counteroffer
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* SECTION 3: OFFLINE SETTLEMENT & FINAL SETTLEMENT FALLBACK */}
            {(dispute.status === "NEGOTIATION_FAILED" ||
              dispute.status === "AWAITING_FINAL_SETTLEMENT" ||
              dispute.status === "AWAITING_FREELANCER_ACCEPTANCE" ||
              (dispute.clientCounteroffersUsed >= 2 && dispute.freelancerCounteroffersUsed >= 2 && dispute.status !== "RESOLVED")) && (
              <Card className="border-amber-200 bg-amber-50/20 rounded-3xl p-6 shadow-xs space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Direct Mutual Offline Settlement</h3>
                    <p className="text-xs text-gray-500">
                      Standard automated rounds have concluded. Direct communication contact info is exchanged below for mutual resolution.
                    </p>
                  </div>
                </div>

                {/* Exchanged Contact Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-amber-100">
                  <div>
                    <span className="text-[11px] text-gray-400 block font-medium">Hiring Client Contact</span>
                    <strong className="text-xs text-gray-800 block">{contract.clientName}</strong>
                    <span className="text-xs text-[#087EAA] font-mono">contact@{contract.clientName.toLowerCase().replace(/\s+/g, "")}.com</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-gray-400 block font-medium">Freelance Talent Contact</span>
                    <strong className="text-xs text-gray-800 block">{contract.freelancerName}</strong>
                    <span className="text-xs text-[#087EAA] font-mono">vachan@trustpay.dev</span>
                  </div>
                </div>

                {/* Final Settlement Proposal Card */}
                {dispute.finalSettlement ? (
                  <div className="bg-white p-5 rounded-2xl border border-[#E5ECF6] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#073B68]">Pending Final Settlement Terms</span>
                      <Badge variant="warning" size="sm">Awaiting Talent Consent</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-400 block">Talent Payout:</span>
                        <strong className="text-sm text-emerald-600">
                          {formatCurrency(dispute.finalSettlement.freelancerAmount, dispute.finalSettlement.currency)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Client Refund:</span>
                        <strong className="text-sm text-[#087EAA]">
                          {formatCurrency(dispute.finalSettlement.clientAmount, dispute.finalSettlement.currency)}
                        </strong>
                      </div>
                    </div>
                    {dispute.finalSettlement.notes && (
                      <p className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-[#E5ECF6]">
                        {dispute.finalSettlement.notes}
                      </p>
                    )}

                    {/* Freelancer must explicitly accept */}
                    {!isClient && (
                      <div className="flex items-center gap-2 pt-2">
                        <Button variant="primary" size="sm" onClick={() => acceptFinalSettlement(dispute.id)}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Accept &amp; Close Dispute
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => rejectFinalSettlement(dispute.id)}>
                          <XCircle className="w-3.5 h-3.5 mr-1 text-rose-500" />
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  isClient && (
                    <div className="bg-white p-4 rounded-2xl border border-[#E5ECF6] space-y-3">
                      <span className="text-xs font-bold text-gray-800 block">Submit Formal Final Settlement</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-gray-500 block mb-1">Agreed Talent Payout Amount</label>
                          <Input
                            type="number"
                            placeholder="e.g. 1500"
                            value={finalTalentAmount}
                            onChange={(e) => setFinalTalentAmount(e.target.value)}
                            className="text-xs"
                            max={contract.totalBudget}
                            min={0}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500 block mb-1">Settlement Memo / Terms</label>
                          <Input
                            placeholder="e.g. Agreed via phone call on partial API completion"
                            value={finalNotes}
                            onChange={(e) => setFinalNotes(e.target.value)}
                            className="text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!finalTalentAmount}
                          onClick={handleProposeFinalSettlement}
                        >
                          Submit For Talent Approval
                        </Button>
                      </div>
                    </div>
                  )
                )}
              </Card>
            )}

            {/* SECTION 4: RESOLVED DISPUTE SUMMARY */}
            {dispute.status === "RESOLVED" && dispute.resolution && (
              <Card className="border-emerald-200 bg-emerald-50/30 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-emerald-950">Escrow Dispute Formally Resolved</h3>
                      <p className="text-xs text-emerald-800">
                        Mutual agreement reached via {dispute.resolution.resolvedBy.replace(/_/g, " ")}. Funds have been allocated.
                      </p>
                    </div>
                  </div>

                  <Badge variant="success" size="md">
                    DEMO SETTLEMENT RECORD
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-2xs">
                    <span className="text-xs text-gray-400 block font-medium">Disbursed to Talent</span>
                    <span className="text-2xl font-extrabold text-emerald-600">
                      {formatCurrency(dispute.resolution.freelancerAmount, dispute.resolution.currency)}
                    </span>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-2xs">
                    <span className="text-xs text-gray-400 block font-medium">Refunded to Client</span>
                    <span className="text-2xl font-extrabold text-[#073B68]">
                      {formatCurrency(dispute.resolution.clientAmount, dispute.resolution.currency)}
                    </span>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-2xs">
                    <span className="text-xs text-gray-400 block font-medium">Resolution Date</span>
                    <span className="text-sm font-bold text-gray-800 block mt-1">
                      {new Date(dispute.resolution.resolvedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {dispute.resolution.notes && (
                  <p className="text-xs text-gray-600 bg-white p-4 rounded-2xl border border-emerald-100 leading-relaxed">
                    <strong>Settlement Record:</strong> {dispute.resolution.notes}
                  </p>
                )}

                <div className="flex justify-end pt-2">
                  <Link href={dashboardHref}>
                    <Button variant="primary" size="sm">
                      Return to Dashboard
                    </Button>
                  </Link>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
