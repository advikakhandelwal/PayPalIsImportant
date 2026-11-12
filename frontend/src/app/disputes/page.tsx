"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  Search,
  AlertTriangle,
  ArrowRight,
  Lock,
  Plus,
} from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useDisputes } from "@/context/DisputeContext";
import { useNotifications } from "@/context/NotificationContext";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { formatCurrency } from "@/lib/utils";
import { DisputeCategory, UserRole } from "@/types";

const CATEGORY_OPTIONS: { value: DisputeCategory; label: string }[] = [
  { value: "QUALITY_DEFICIENCY", label: "Work quality / missing specs" },
  { value: "MISSED_DEADLINE", label: "Missed deadline / delayed delivery" },
  { value: "SCOPE_CREEP", label: "Scope disagreement / scope creep" },
  { value: "SPECIFICATION_MISALIGNMENT", label: "Deliverable does not match requirements" },
  { value: "UNRESPONSIVE_COMMUNICATION", label: "Unresponsive / communication breakdown" },
  { value: "OTHER", label: "Other issue" },
];

function DisputesCenterContent() {
  const searchParams = useSearchParams();
  const initialContractId = searchParams.get("contractId") || "";

  const { currentUser } = useAuth();
  const { contracts } = useMarketplace();
  const {
    getDisputeByContractId,
    raiseDispute,
    approveAIRecommendation,
    submitFinalSettlement,
    acceptFinalSettlement,
    rejectFinalSettlement,
  } = useDisputes();
  const { addNotification } = useNotifications();

  const myContracts = useMemo(() => {
    return contracts.filter(
      (c) =>
        c.clientId === currentUser.id ||
        c.freelancerId === currentUser.id ||
        c.clientName === currentUser.name ||
        c.freelancerName === currentUser.name
    );
  }, [contracts, currentUser.id, currentUser.name]);

  // ONLY show contracts that actually have an active or resolved dispute
  const disputedContracts = useMemo(() => {
    return myContracts.filter((c) => Boolean(getDisputeByContractId(c.id)));
  }, [myContracts, getDisputeByContractId]);

  const undisputedContracts = useMemo(() => {
    return myContracts.filter((c) => !getDisputeByContractId(c.id));
  }, [myContracts, getDisputeByContractId]);

  const [selectedContractId, setSelectedContractId] = useState<string>(initialContractId);
  const [isRaisingNew, setIsRaisingNew] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Simple 3-step Raise Dispute Form
  const [category, setCategory] = useState<DisputeCategory>("QUALITY_DEFICIENCY");
  const [explanation, setExplanation] = useState("");
  const [requestedTalentPct, setRequestedTalentPct] = useState<number>(50);

  // Foolproof Split Counter-Proposal (auto-computes Client Refund = Total - Talent Share)
  const [proposedTalentAmt, setProposedTalentAmt] = useState<string>("");

  useEffect(() => {
    if (initialContractId) {
      setSelectedContractId(initialContractId);
      const existing = getDisputeByContractId(initialContractId);
      setIsRaisingNew(!existing);
      return;
    }
    if (!selectedContractId && disputedContracts.length > 0) {
      setSelectedContractId(disputedContracts[0].id);
      setIsRaisingNew(false);
    }
  }, [initialContractId, disputedContracts, selectedContractId, getDisputeByContractId]);

  const filteredDisputedContracts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return disputedContracts.filter(
      (c) =>
        !q ||
        c.projectTitle.toLowerCase().includes(q) ||
        c.clientName.toLowerCase().includes(q) ||
        c.freelancerName.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
  }, [disputedContracts, searchQuery]);

  const selectedContract = useMemo(() => {
    if (isRaisingNew) {
      return (
        undisputedContracts.find((c) => c.id === selectedContractId) ??
        undisputedContracts[0] ??
        null
      );
    }
    return (
      disputedContracts.find((c) => c.id === selectedContractId) ??
      filteredDisputedContracts[0] ??
      null
    );
  }, [isRaisingNew, undisputedContracts, disputedContracts, filteredDisputedContracts, selectedContractId]);

  const activeDispute = selectedContract ? getDisputeByContractId(selectedContract.id) : undefined;

  const contractRole: UserRole =
    selectedContract && selectedContract.clientId === currentUser.id
      ? "CLIENT"
      : selectedContract && selectedContract.freelancerId === currentUser.id
      ? "FREELANCER"
      : currentUser.role;

  const stakeAmount = selectedContract
    ? selectedContract.heldInEscrowAmount > 0
      ? selectedContract.heldInEscrowAmount
      : selectedContract.totalBudget
    : 0;

  useEffect(() => {
    if (selectedContract) {
      setProposedTalentAmt(String(Math.round((stakeAmount / 2) * 100) / 100));
      setErrorMsg("");
    }
  }, [selectedContract?.id, stakeAmount]);

  const handleOpenDispute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;
    if (!explanation.trim()) {
      setErrorMsg("Please briefly describe what went wrong.");
      return;
    }

    const talentAmt = Math.round(((stakeAmount * requestedTalentPct) / 100) * 100) / 100;
    const clientAmt = Math.round((stakeAmount - talentAmt) * 100) / 100;
    const categoryLabel =
      CATEGORY_OPTIONS.find((opt) => opt.value === category)?.label || "Contract Dispute";

    const created = raiseDispute({
      contractId: selectedContract.id,
      projectId: selectedContract.projectId,
      clientId: selectedContract.clientId,
      clientName: selectedContract.clientName,
      freelancerId: selectedContract.freelancerId,
      freelancerName: selectedContract.freelancerName,
      freelancerEmail: selectedContract.freelancerEmail,
      initiatorRole: contractRole,
      initiatorName: currentUser.name,
      reason: categoryLabel,
      category,
      explanation: explanation.trim(),
      expectedResolution: `Proposed split: ${formatCurrency(talentAmt, selectedContract.currency)} to Talent, ${formatCurrency(clientAmt, selectedContract.currency)} refund to Client.`,
      evidenceNotes: "Submitted via Disputes Center",
      totalBudget: stakeAmount,
      currency: selectedContract.currency,
    });

    addNotification({
      userId: contractRole === "CLIENT" ? selectedContract.freelancerId : selectedContract.clientId,
      userRole: contractRole === "CLIENT" ? "FREELANCER" : "CLIENT",
      event: "DISPUTE_RAISED",
      title: `Dispute Opened: ${selectedContract.projectTitle}`,
      description: `${currentUser.name} opened a dispute (${categoryLabel}). AI fair split ready for review.`,
      linkHref: `/disputes?contractId=${selectedContract.id}`,
    });

    setExplanation("");
    setErrorMsg("");
    setIsRaisingNew(false);
    setSelectedContractId(selectedContract.id);
    setStatusMsg(`Dispute #${created.id.slice(-6)} opened! AI Fair Split is ready below.`);
    setTimeout(() => setStatusMsg(""), 4000);
  };

  const handleApproveAI = () => {
    if (!activeDispute || !selectedContract) return;
    approveAIRecommendation(activeDispute.id, contractRole);
    setStatusMsg("You approved the AI fair split.");
    setTimeout(() => setStatusMsg(""), 3500);
  };

  const handleProposeSplit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDispute || !selectedContract) return;
    const parsedTalent = Number(proposedTalentAmt);
    if (Number.isNaN(parsedTalent) || parsedTalent < 0 || parsedTalent > stakeAmount) {
      setErrorMsg(`Talent amount must be between 0 and ${formatCurrency(stakeAmount, selectedContract.currency)}.`);
      return;
    }
    const talentRounded = Math.round(parsedTalent * 100) / 100;
    const clientRounded = Math.round((stakeAmount - talentRounded) * 100) / 100;

    submitFinalSettlement(activeDispute.id, {
      freelancerAmount: talentRounded,
      clientAmount: clientRounded,
      currency: selectedContract.currency,
      notes: `Proposed by ${currentUser.name} (${contractRole}): ${formatCurrency(talentRounded, selectedContract.currency)} to Talent & ${formatCurrency(clientRounded, selectedContract.currency)} refunded to Client.`,
      proposedBy: contractRole,
    });
    setErrorMsg("");
    setStatusMsg("Split proposal sent to the other party for 1-click acceptance.");
    setTimeout(() => setStatusMsg(""), 3500);
  };

  const dashboardHref =
    currentUser.role === "CLIENT"
      ? "/client/dashboard?tab=contracts"
      : "/freelancer/dashboard?tab=contracts";

  const parsedTalent = Math.min(Math.max(Number(proposedTalentAmt) || 0, 0), stakeAmount);
  const autoClientRefund = Math.max(0, Math.round((stakeAmount - parsedTalent) * 100) / 100);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-gray-100 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#003087]">Disputes &amp; Resolution Center</h1>
            <p className="text-xs text-gray-500">
              Only contracts with active or resolved disputes appear here — keeping your workspace clean.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {undisputedContracts.length > 0 && (
            <Button
              variant={isRaisingNew ? "outline" : "primary"}
              size="sm"
              onClick={() => {
                if (isRaisingNew) {
                  setIsRaisingNew(false);
                  if (disputedContracts.length > 0) setSelectedContractId(disputedContracts[0].id);
                } else {
                  setSelectedContractId(undisputedContracts[0].id);
                  setIsRaisingNew(true);
                }
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {isRaisingNew ? "Back to Disputes" : "Raise a Dispute"}
            </Button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* EMPTY STATE: No disputes exist and user is not opening a new one */}
      {!isRaisingNew && disputedContracts.length === 0 ? (
        <Card className="p-12 text-center rounded-3xl border border-gray-200 bg-white space-y-3">
          <ShieldCheck className="w-11 h-11 text-emerald-500 mx-auto" />
          <h2 className="text-lg font-extrabold text-gray-900">
            No Disputes — All Contracts Running Smoothly
          </h2>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            You don&apos;t have any open or past disputes. If an issue ever comes up on a contract, you can raise a dispute here in 3 simple steps.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={dashboardHref}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#0070E0] text-white text-xs font-bold hover:bg-[#005bb8]"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            {undisputedContracts.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedContractId(undisputedContracts[0].id);
                  setIsRaisingNew(true);
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Raise a Dispute
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Only Disputed Contracts (or Contract Picker when raising new) */}
          <div className="lg:col-span-4 space-y-3">
            <Card className="p-3.5 rounded-2xl border border-gray-200 bg-white space-y-2.5">
              <span className="text-xs font-extrabold text-[#003087] uppercase tracking-wider block">
                {isRaisingNew
                  ? `Select Contract (${undisputedContracts.length})`
                  : `Disputed Contracts (${filteredDisputedContracts.length})`}
              </span>
              {!isRaisingNew && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dispute or party..."
                    className="w-full h-9 pl-8 pr-3 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070E0]"
                  />
                </div>
              )}
            </Card>

            <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
              {(isRaisingNew ? undisputedContracts : filteredDisputedContracts).map((c) => {
                const d = getDisputeByContractId(c.id);
                const isSelected = selectedContract?.id === c.id;
                const counterparty = c.clientId === currentUser.id ? c.freelancerName : c.clientName;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedContractId(c.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-[#0070E0] bg-blue-50/50 ring-2 ring-[#0070E0]/20 shadow-xs"
                        : "border-gray-200 bg-white hover:border-blue-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-bold text-xs text-gray-900 line-clamp-1">{c.projectTitle}</h4>
                      <span className="text-xs font-extrabold text-[#003087] shrink-0">
                        {formatCurrency(c.totalBudget, c.currency)}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-2 truncate">
                      With <strong className="text-gray-700">{counterparty}</strong> • #{c.id}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      {d ? (
                        <Badge variant={d.status === "RESOLVED" ? "success" : "warning"} size="sm">
                          {d.status === "RESOLVED" ? "Resolved" : "Active Dispute"}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          Select to Dispute
                        </Badge>
                      )}
                      <span className="text-[10px] text-gray-400">
                        Held: {formatCurrency(c.heldInEscrowAmount, c.currency)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Foolproof 3-Step Dispute Panel */}
          <div className="lg:col-span-8">
            {selectedContract && (
              <Card className="p-6 rounded-3xl border border-gray-200 bg-white shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                  <div>
                    <h2 className="text-lg font-extrabold text-gray-900">
                      {selectedContract.projectTitle}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Client: <strong>{selectedContract.clientName}</strong> • Talent:{" "}
                      <strong>{selectedContract.freelancerName}</strong> • Amount in Scope:{" "}
                      <strong className="text-[#003087]">
                        {formatCurrency(stakeAmount, selectedContract.currency)}
                      </strong>
                    </p>
                  </div>

                  <Link
                    href={`/messages?contractId=${selectedContract.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-[#0070E0] border border-blue-200 shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Message Other Party
                  </Link>
                </div>

                {/* STATE A: RAISE NEW DISPUTE */}
                {!activeDispute && (
                  <form onSubmit={handleOpenDispute} className="space-y-4">
                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        Opening a dispute pauses milestone payouts on this contract and generates an{" "}
                        <strong>AI Fair Split Recommendation</strong> both parties can approve or adjust.
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-700">
                        1. What went wrong?
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as DisputeCategory)}
                        className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0070E0]"
                      >
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Textarea
                      label="2. Brief explanation"
                      required
                      rows={3}
                      placeholder="Explain clearly what happened and what deliverable/timeline was missed..."
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                    />

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-gray-700">
                        3. Your preferred starting split
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { pct: 0, label: "100% Refund to Client" },
                          { pct: 50, label: "50 / 50 Split" },
                          { pct: 100, label: "100% Payout to Talent" },
                        ].map((preset) => (
                          <button
                            key={preset.pct}
                            type="button"
                            onClick={() => setRequestedTalentPct(preset.pct)}
                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                              requestedTalentPct === preset.pct
                                ? "border-[#0070E0] bg-blue-50 text-[#003087]"
                                : "border-gray-200 bg-white text-gray-600 hover:border-blue-200"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button type="submit" variant="primary" size="md">
                        <ShieldAlert className="w-4 h-4 mr-1.5" />
                        Open Dispute
                      </Button>
                    </div>
                  </form>
                )}

                {/* STATE B: ACTIVE DISPUTE -> FOOLPROOF 2-OPTION RESOLUTION */}
                {activeDispute && activeDispute.status !== "RESOLVED" && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">{activeDispute.reason}</span>
                        <Badge variant="warning" size="sm">
                          {activeDispute.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-slate-600">{activeDispute.explanation}</p>
                    </div>

                    {activeDispute.aiRecommendation && (
                      <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-extrabold text-[#003087] uppercase tracking-wider">
                          <Sparkles className="w-4 h-4 text-[#0070E0]" />
                          <span>Option 1: AI Fair Split (1-Click Mutual Approval)</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="bg-white p-3 rounded-xl border border-blue-100">
                            <span className="text-gray-500 block">To Talent</span>
                            <strong className="text-base text-emerald-700">
                              {formatCurrency(
                                activeDispute.aiRecommendation.freelancerAmount,
                                selectedContract.currency
                              )}
                            </strong>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-blue-100">
                            <span className="text-gray-500 block">Refund to Client</span>
                            <strong className="text-base text-[#003087]">
                              {formatCurrency(
                                activeDispute.aiRecommendation.clientAmount,
                                selectedContract.currency
                              )}
                            </strong>
                          </div>
                        </div>

                        <p className="text-[11px] text-gray-600">
                          {activeDispute.aiRecommendation.explanation}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-3 text-[11px]">
                            <span
                              className={
                                activeDispute.clientApprovedAI
                                  ? "text-emerald-700 font-bold"
                                  : "text-gray-500"
                              }
                            >
                              Client: {activeDispute.clientApprovedAI ? "Approved ✓" : "Pending"}
                            </span>
                            <span
                              className={
                                activeDispute.freelancerApprovedAI
                                  ? "text-emerald-700 font-bold"
                                  : "text-gray-500"
                              }
                            >
                              Talent: {activeDispute.freelancerApprovedAI ? "Approved ✓" : "Pending"}
                            </span>
                          </div>

                          {((contractRole === "CLIENT" && !activeDispute.clientApprovedAI) ||
                            (contractRole === "FREELANCER" && !activeDispute.freelancerApprovedAI)) && (
                            <Button variant="primary" size="sm" onClick={handleApproveAI}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Approve AI Split
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="p-5 rounded-2xl bg-white border border-gray-200 space-y-4">
                      <h3 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider">
                        Option 2: Custom Split Agreement
                      </h3>

                      {activeDispute.finalSettlement &&
                      activeDispute.finalSettlement.status === "PROPOSED" ? (
                        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3 text-xs">
                          <p className="font-bold text-amber-950">
                            Pending Split Proposal (from {activeDispute.finalSettlement.proposedBy}):
                          </p>
                          <div className="flex flex-wrap gap-4">
                            <span>
                              To Talent:{" "}
                              <strong className="text-emerald-700">
                                {formatCurrency(
                                  activeDispute.finalSettlement.freelancerAmount,
                                  selectedContract.currency
                                )}
                              </strong>
                            </span>
                            <span>
                              Refund to Client:{" "}
                              <strong className="text-[#003087]">
                                {formatCurrency(
                                  activeDispute.finalSettlement.clientAmount,
                                  selectedContract.currency
                                )}
                              </strong>
                            </span>
                          </div>
                          {activeDispute.finalSettlement.proposedBy !== contractRole ? (
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => acceptFinalSettlement(activeDispute.id)}
                              >
                                Accept &amp; Resolve Dispute
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => rejectFinalSettlement(activeDispute.id)}
                              >
                                Decline &amp; Counter
                              </Button>
                            </div>
                          ) : (
                            <p className="text-[11px] text-amber-800">
                              Waiting for the other party to accept your split proposal.
                            </p>
                          )}
                        </div>
                      ) : (
                        <form onSubmit={handleProposeSplit} className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="space-y-1">
                              <label className="font-bold text-gray-700 block">
                                Talent Receives ({selectedContract.currency})
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={stakeAmount}
                                value={proposedTalentAmt}
                                onChange={(e) => setProposedTalentAmt(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0070E0]"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="font-bold text-gray-700 block">
                                Client Refund (Auto-Calculated)
                              </label>
                              <div className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-[#003087] flex items-center">
                                {formatCurrency(autoClientRefund, selectedContract.currency)}
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button type="submit" variant="outline" size="sm">
                              Send Split Proposal
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                )}

                {/* STATE C: RESOLVED */}
                {activeDispute && activeDispute.status === "RESOLVED" && activeDispute.resolution && (
                  <div className="p-6 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                      <div>
                        <h3 className="text-base font-extrabold text-emerald-950">Dispute Resolved</h3>
                        <p className="text-xs text-emerald-800">
                          Settled via {activeDispute.resolution.resolvedBy.replace(/_/g, " ")}.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-white p-3.5 rounded-xl border border-emerald-100">
                        <span className="text-gray-500 block">Paid to Talent</span>
                        <strong className="text-lg text-emerald-700">
                          {formatCurrency(
                            activeDispute.resolution.freelancerAmount,
                            activeDispute.resolution.currency
                          )}
                        </strong>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-emerald-100">
                        <span className="text-gray-500 block">Refunded to Client</span>
                        <strong className="text-lg text-[#003087]">
                          {formatCurrency(
                            activeDispute.resolution.clientAmount,
                            activeDispute.resolution.currency
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DisputesPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="p-12 text-center text-sm text-gray-500">Loading disputes...</div>}>
        <DisputesCenterContent />
      </Suspense>
    </RequireAuth>
  );
}
