"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { AppNotification, NotificationEvent, UserRole } from "@/types";

const LS_NOTIFICATIONS = "tp_demo_notifications";

const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: "notif-seed-1",
    userId: "client-fintech-corp",
    userRole: "CLIENT",
    event: "DELIVERABLE_SUBMITTED",
    title: "Deliverable Ready for Review",
    description: "Vachan submitted deliverable for Step 2: Smart Contract Core & Verification Engine.",
    linkHref: "/client/dashboard?tab=contracts",
    isRead: false,
    isDismissed: false,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    entityId: "contract-escrow-001",
  },
  {
    id: "notif-seed-2",
    userId: "freelancer-vachan",
    userRole: "FREELANCER",
    event: "MILESTONE_APPROVED",
    title: "Escrow Milestone Released ($1,200.00)",
    description: "FinTech Global approved Step 1: Architecture & API Specs. Funds released to your balance.",
    linkHref: "/freelancer/dashboard?tab=contracts",
    isRead: true,
    isDismissed: false,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    entityId: "contract-escrow-001",
  },
  {
    id: "notif-seed-3",
    userId: "client-fintech-corp",
    userRole: "CLIENT",
    event: "NEW_APPLICATION",
    title: "New Application Received",
    description: "Alex Rivera submitted a proposal for AI Agent Pipeline Architecture ($3,200.00).",
    linkHref: "/client/dashboard?tab=proposals",
    isRead: true,
    isDismissed: false,
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    entityId: "proj-1",
  },
];

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded fallback
  }
}

interface NotificationContextType {
  notifications: AppNotification[];
  isHydrated: boolean;
  unreadCount: number;
  addNotification: (
    data: Omit<AppNotification, "id" | "createdAt" | "isRead" | "isDismissed">
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (id: string) => void;
  clearDismissed: () => void;
  getNotificationsForUser: (userId: string, role: UserRole) => AppNotification[];
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(SEED_NOTIFICATIONS);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = readLS<AppNotification[] | null>(LS_NOTIFICATIONS, null);
      if (saved && Array.isArray(saved) && saved.length > 0) {
        setNotifications(saved);
      }
    } catch {
      // Safe fallback
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (isHydrated) {
      writeLS(LS_NOTIFICATIONS, notifications);
    }
  }, [notifications, isHydrated]);

  const addNotification = useCallback(
    (data: Omit<AppNotification, "id" | "createdAt" | "isRead" | "isDismissed">) => {
      const newNotif: AppNotification = {
        ...data,
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString(),
        isRead: false,
        isDismissed: false,
      };
      setNotifications((prev) => [newNotif, ...prev]);
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isDismissed: true } : n))
    );
  }, []);

  const clearDismissed = useCallback(() => {
    setNotifications((prev) => prev.filter((n) => !n.isDismissed));
  }, []);

  const getNotificationsForUser = useCallback(
    (userId: string, role: UserRole) => {
      return notifications.filter((n) => {
        if (n.isDismissed) return false;
        const matchesUser = n.userId === "ALL" || n.userId === userId;
        const matchesRole = n.userRole === "ALL" || n.userRole === role;
        return matchesUser && matchesRole;
      });
    },
    [notifications]
  );

  const unreadCount = notifications.filter((n) => !n.isRead && !n.isDismissed).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        isHydrated,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        dismissNotification,
        clearDismissed,
        getNotificationsForUser,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
