"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  MessageSquare,
  Search,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Building,
  User,
  Clock,
} from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ContractChatPanel } from "@/components/contracts/ContractChatPanel";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { apiClient } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { MessageThreadSummary } from "@/types";
import { formatCurrency, getEscrowStatusInfo } from "@/lib/utils";

function MessagesInboxContent() {
  const searchParams = useSearchParams();
  const initialContractId = searchParams.get("contractId") || "";
  const { currentUser } = useAuth();

  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>(initialContractId);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const loadInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getMessageInbox();
      setThreads(Array.isArray(data) ? data : []);
      setErrorMsg("");
      if (!selectedContractId && Array.isArray(data) && data.length > 0) {
        setSelectedContractId(data[0].contractId);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to load message inbox.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedContractId]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (initialContractId) {
      setSelectedContractId(initialContractId);
    }
  }, [initialContractId]);

  const filteredThreads = threads.filter((t) => {
    const q = searchQuery.trim().toLowerCase();
    return (
      !q ||
      t.projectTitle.toLowerCase().includes(q) ||
      t.counterpartyName.toLowerCase().includes(q) ||
      t.contractId.toLowerCase().includes(q) ||
      (t.lastMessage || "").toLowerCase().includes(q)
    );
  });

  const activeThread =
    threads.find((t) => t.contractId === selectedContractId) ??
    filteredThreads[0] ??
    null;

  const dashboardHref =
    currentUser.role === "CLIENT"
      ? "/client/dashboard?tab=contracts"
      : "/freelancer/dashboard?tab=contracts";

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-gray-100 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#51E2F5] text-[#1E1820] flex items-center justify-center shadow-xs">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#1E1820]">Unified Messages Inbox</h1>
            <p className="text-xs text-gray-500">
              All client &amp; freelancer conversations across every contract in one place.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadInbox}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-[#EDF7F6] text-[#0EA5B7] hover:bg-blue-100 border border-[#9DF9EF] cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh Inbox
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {errorMsg}
        </div>
      )}

      {!isLoading && threads.length === 0 ? (
        <Card className="p-12 text-center rounded-3xl border border-gray-200 bg-white space-y-3">
          <MessageSquare className="w-10 h-10 text-gray-300 mx-auto" />
          <h2 className="text-base font-bold text-gray-900">No Contract Conversations Yet</h2>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            As soon as a bid is accepted and an escrow contract is created, your project chat thread appears here automatically.
          </p>
          <div className="pt-2">
            <Link
              href={dashboardHref}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#51E2F5] text-[#1E1820] text-xs font-bold hover:bg-[#005bb8]"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Thread List */}
          <div className="lg:col-span-4 space-y-3">
            <Card className="p-3.5 rounded-2xl border border-gray-200 bg-white space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#1E1820] uppercase tracking-wider">
                  Conversations ({filteredThreads.length}/{threads.length})
                </span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search project, person, or message..."
                  className="w-full h-9 pl-8 pr-3 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#51E2F5]"
                />
              </div>
            </Card>

            <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
              {filteredThreads.map((t) => {
                const isSelected = activeThread?.contractId === t.contractId;
                const statusInfo = getEscrowStatusInfo(t.escrowStatus);
                return (
                  <button
                    key={t.contractId}
                    type="button"
                    onClick={() => setSelectedContractId(t.contractId)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-[#51E2F5] bg-[#EDF7F6] ring-2 ring-[#51E2F5]/20 shadow-xs"
                        : "border-gray-200 bg-white hover:border-[#9DF9EF]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {t.counterpartyRole === "CLIENT" ? (
                          <Building className="w-3.5 h-3.5 text-[#1E1820] shrink-0" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-[#0EA5B7] shrink-0" />
                        )}
                        <span className="font-bold text-xs text-gray-900 truncate">
                          {t.counterpartyName}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                        {t.messageCount} msg{t.messageCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-[#1E1820] line-clamp-1 mb-1">
                      {t.projectTitle}
                    </p>

                    <p className="text-[11px] text-gray-500 line-clamp-1 mb-2">
                      {t.lastMessage
                        ? `${t.lastMessageSender}: ${t.lastMessage}`
                        : "No messages yet — start the conversation"}
                    </p>

                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <Badge variant={statusInfo.variant} size="sm">
                        {statusInfo.label}
                      </Badge>
                      <span className="font-bold text-gray-600">
                        {formatCurrency(t.totalBudget, t.currency)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Active Chat Workspace */}
          <div className="lg:col-span-8">
            {activeThread ? (
              <Card className="p-6 rounded-3xl border border-gray-200 bg-white shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-extrabold text-gray-900">
                        {activeThread.projectTitle}
                      </h2>
                      <Badge variant={getEscrowStatusInfo(activeThread.escrowStatus).variant} size="sm">
                        {getEscrowStatusInfo(activeThread.escrowStatus).label}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      With <strong className="text-gray-800">{activeThread.counterpartyName}</strong> (
                      {activeThread.counterpartyRole})
                      {activeThread.counterpartyEmail ? ` • ${activeThread.counterpartyEmail}` : ""} • Contract #
                      <span className="font-mono">{activeThread.contractId}</span> •{" "}
                      <strong>{formatCurrency(activeThread.totalBudget, activeThread.currency)}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/disputes?contractId=${activeThread.contractId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                      Disputes
                    </Link>
                    <Link
                      href={dashboardHref}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#EDF7F6] hover:bg-blue-100 text-[#0EA5B7] border border-[#9DF9EF]"
                    >
                      <span>Open Contract</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>

                {activeThread.lastMessageAt && (
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Last activity: {new Date(activeThread.lastMessageAt).toLocaleString()}</span>
                  </div>
                )}

                <ContractChatPanel
                  contractId={activeThread.contractId}
                  counterpartyName={activeThread.counterpartyName}
                  counterpartyRoleLabel={
                    activeThread.counterpartyRole === "CLIENT" ? "Client" : "Freelancer"
                  }
                />
              </Card>
            ) : (
              <Card className="p-10 text-center rounded-3xl border border-gray-200 bg-white text-xs text-gray-500">
                Select a conversation on the left to view and send messages.
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="p-12 text-center text-sm text-gray-500">Loading messages...</div>}>
        <MessagesInboxContent />
      </Suspense>
    </RequireAuth>
  );
}
