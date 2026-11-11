"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Bell,
  CheckCircle2,
  Clock,
  Search,
  CheckCheck,
  Trash2,
  ExternalLink,
  ShieldAlert,
  FileText,
  DollarSign,
  Users,
  AlertCircle,
  ArrowLeft,
  X,
  Filter,
} from "lucide-react";
import { NotificationEvent } from "@/types";

type FilterTab = "ALL" | "UNREAD" | "READ" | "DISPUTE" | "MILESTONE" | "APPLICATION";

function getEventIcon(event: NotificationEvent) {
  switch (event) {
    case "DISPUTE_RAISED":
    case "AI_RECOMMENDATION_READY":
    case "SETTLEMENT_PROPOSED":
    case "COUNTEROFFER_RECEIVED":
    case "NEGOTIATION_FAILED":
    case "FINAL_SETTLEMENT_SUBMITTED":
      return <ShieldAlert className="w-5 h-5 text-amber-500" />;
    case "SETTLEMENT_ACCEPTED":
    case "DISPUTE_RESOLVED":
    case "MILESTONE_APPROVED":
    case "APPLICATION_ACCEPTED":
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case "DELIVERABLE_SUBMITTED":
    case "DELIVERABLE_RESUBMITTED":
    case "REVISION_REQUESTED":
      return <FileText className="w-5 h-5 text-[#087EAA]" />;
    case "NEW_APPLICATION":
      return <Users className="w-5 h-5 text-purple-500" />;
    default:
      return <Bell className="w-5 h-5 text-blue-500" />;
  }
}

function getEventBadge(event: NotificationEvent) {
  if (event.startsWith("DISPUTE") || event.includes("SETTLEMENT") || event.includes("COUNTEROFFER") || event.includes("NEGOTIATION")) {
    return <Badge variant="warning" size="sm">Dispute &amp; Settlement</Badge>;
  }
  if (event.includes("MILESTONE") || event.includes("DELIVERABLE") || event.includes("REVISION")) {
    return <Badge variant="inReview" size="sm">Milestone</Badge>;
  }
  if (event.includes("APPLICATION")) {
    return <Badge variant="paypal" size="sm">Application</Badge>;
  }
  return <Badge variant="neutral" size="sm">System</Badge>;
}

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(isoString).toLocaleDateString();
  } catch {
    return "Recently";
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const { currentUser, activeRole, isHydrated } = useAuth();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    clearDismissed,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const userNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (n.isDismissed) return false;
      const matchesUser = n.userId === "ALL" || n.userId === currentUser.id;
      const matchesRole = n.userRole === "ALL" || n.userRole === activeRole;
      return matchesUser && matchesRole;
    });
  }, [notifications, currentUser.id, activeRole]);

  const filteredNotifications = useMemo(() => {
    return userNotifications.filter((n) => {
      // Tab filter
      if (activeTab === "UNREAD" && n.isRead) return false;
      if (activeTab === "READ" && !n.isRead) return false;
      if (activeTab === "DISPUTE") {
        const isDispute =
          n.event.startsWith("DISPUTE") ||
          n.event.includes("SETTLEMENT") ||
          n.event.includes("COUNTEROFFER") ||
          n.event.includes("NEGOTIATION") ||
          n.event.includes("AI_RECOMMENDATION");
        if (!isDispute) return false;
      }
      if (activeTab === "MILESTONE") {
        const isMilestone =
          n.event.includes("MILESTONE") ||
          n.event.includes("DELIVERABLE") ||
          n.event.includes("REVISION");
        if (!isMilestone) return false;
      }
      if (activeTab === "APPLICATION") {
        if (!n.event.includes("APPLICATION")) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = n.title.toLowerCase().includes(query);
        const matchesDesc = n.description.toLowerCase().includes(query);
        return matchesTitle || matchesDesc;
      }

      return true;
    });
  }, [userNotifications, activeTab, searchQuery]);

  const unreadCount = userNotifications.filter((n) => !n.isRead).length;

  const dashboardHref =
    activeRole === "FREELANCER" ? "/freelancer/dashboard" : "/client/dashboard";

  return (
    <div className="min-h-screen bg-gray-50/50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href={dashboardHref}
            className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#087EAA] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <span className="text-xs text-gray-400">
            Role: <strong className="text-gray-700">{activeRole}</strong>
          </span>
        </div>

        {/* Header Banner */}
        <div className="bg-white border border-[#E5ECF6] rounded-3xl p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#087EAA] flex items-center justify-center shrink-0 shadow-xs">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-extrabold text-[#073B68] tracking-tight">
                    Notification Centre
                  </h1>
                  {unreadCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  Real-time alerts for deliverables, escrow releases, AI verifications, and dispute settlements.
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={markAllAsRead}>
                  <CheckCheck className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                  Mark all as read
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={clearDismissed}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                Clear dismissed
              </Button>
            </div>
          </div>
        </div>

        {/* Filter Controls & Search */}
        <div className="bg-white border border-[#E5ECF6] rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "ALL", label: "All Alerts" },
                { id: "UNREAD", label: `Unread (${unreadCount})` },
                { id: "DISPUTE", label: "Disputes & Settlements" },
                { id: "MILESTONE", label: "Milestones" },
                { id: "APPLICATION", label: "Proposals" },
                { id: "READ", label: "Archived" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as FilterTab)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-[#073B68] text-white shadow-[0_2px_8px_rgba(7,59,104,0.3)]"
                      : "bg-[#F0F5FA] text-[#4A5D73] hover:bg-[#E2EDF7] hover:text-[#073B68]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Notification List */}
        <div className="space-y-3 animate-fade-in">
          {filteredNotifications.length === 0 ? (
            <Card className="border-[#E5ECF6] bg-white p-12 text-center rounded-3xl shadow-xs">
              <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300 mx-auto mb-3">
                <Bell className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-gray-700">No notifications found</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                {searchQuery
                  ? "No notifications matching your search query. Try clearing your search term."
                  : "You're all caught up! New milestone submissions, dispute updates, and escrow transactions will appear here."}
              </p>
            </Card>
          ) : (
            filteredNotifications.map((notif) => {
              const icon = getEventIcon(notif.event);
              const badge = getEventBadge(notif.event);
              const relativeTime = formatRelativeTime(notif.createdAt);

              return (
                <div
                  key={notif.id}
                  className={`bg-white border rounded-2xl p-4 sm:p-5 transition-all shadow-xs relative flex items-start gap-4 ${
                    !notif.isRead
                      ? "border-[#CDE1F4] bg-[#F8FBFE] ring-1 ring-[#DCEBF7]"
                      : "border-[#E5ECF6] hover:border-gray-200"
                  }`}
                >
                  {/* Left Icon */}
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-[#E5ECF6] flex items-center justify-center shrink-0">
                    {icon}
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 min-w-0 pr-8">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {badge}
                      <span className="text-[11px] text-gray-400 font-medium">
                        {relativeTime} • {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {!notif.isRead && (
                        <span className="w-2 h-2 rounded-full bg-[#087EAA]" title="Unread" />
                      )}
                    </div>

                    <h4 className={`text-sm font-bold ${!notif.isRead ? "text-[#073B68]" : "text-gray-800"}`}>
                      {notif.title}
                    </h4>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      {notif.description}
                    </p>

                    {/* Action button if link exists */}
                    {notif.linkHref && (
                      <div className="mt-3 flex items-center gap-3">
                        <Link
                          href={notif.linkHref}
                          onClick={() => markAsRead(notif.id)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#087EAA] hover:text-[#073B68] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-all"
                        >
                          <span>View Details</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                        {!notif.isRead && (
                          <button
                            onClick={() => markAsRead(notif.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Dismiss Button */}
                  <button
                    onClick={() => dismissNotification(notif.id)}
                    aria-label="Dismiss notification"
                    className="absolute top-4 right-4 text-gray-300 hover:text-gray-600 p-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
