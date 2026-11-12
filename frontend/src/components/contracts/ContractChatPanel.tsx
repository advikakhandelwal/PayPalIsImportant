"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Send, MessageSquare, RefreshCw, User, Building } from "lucide-react";
import { apiClient } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { ContractMessage } from "@/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface ContractChatPanelProps {
  contractId: string;
  counterpartyName: string;
  counterpartyRoleLabel: string;
}

export const ContractChatPanel: React.FC<ContractChatPanelProps> = ({
  contractId,
  counterpartyName,
  counterpartyRoleLabel,
}) => {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<ContractMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const loadMessages = useCallback(async () => {
    if (!contractId) return;
    setIsLoading(true);
    try {
      const data = await apiClient.getContractMessages(contractId);
      setMessages(data || []);
      setErrorMsg("");
    } catch {
      // ignore initial empty/network blip
    } finally {
      setIsLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !contractId) return;
    setIsSending(true);
    setErrorMsg("");
    try {
      const sent = await apiClient.sendContractMessage(contractId, trimmed);
      setMessages((prev) => [...prev, sent]);
      setDraft("");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="pt-4 border-t border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#0070E0]" />
          <h3 className="text-xs font-bold text-[#003087] uppercase tracking-wider">
            Direct Project Discussion with {counterpartyName} ({counterpartyRoleLabel})
          </h3>
        </div>
        <button
          type="button"
          onClick={loadMessages}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-[#0070E0] cursor-pointer"
          title="Refresh messages"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-3">
        <div className="max-h-56 overflow-y-auto space-y-2.5 pr-1">
          {messages.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">
              No messages yet. Start a conversation with {counterpartyName} about milestones, deadlines, or deliverables.
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser.id;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs ${
                      isMe
                        ? "bg-[#0070E0] text-white"
                        : "bg-white border border-gray-200 text-gray-800"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {msg.senderRole === "CLIENT" ? (
                        <Building className="w-3 h-3 opacity-80" />
                      ) : (
                        <User className="w-3 h-3 opacity-80" />
                      )}
                      <span className="font-bold text-[11px]">{msg.senderName}</span>
                      <Badge
                        variant={isMe ? "neutral" : "paypal"}
                        size="sm"
                      >
                        {msg.senderRole}
                      </Badge>
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                    <span
                      className={`block text-[10px] mt-1 ${
                        isMe ? "text-blue-100" : "text-gray-400"
                      }`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {errorMsg && (
          <p className="text-[11px] text-red-600">{errorMsg}</p>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2 pt-1 border-t border-gray-200">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${counterpartyName}...`}
            className="flex-1 h-9 px-3.5 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070E0]"
          />
          <Button type="submit" variant="primary" size="sm" disabled={isSending || !draft.trim()}>
            <Send className="w-3.5 h-3.5 mr-1" />
            {isSending ? "Sending..." : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
};
