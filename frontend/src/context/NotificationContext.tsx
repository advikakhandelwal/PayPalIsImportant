"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { AppNotification, UserRole } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/services/api";

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
  const { currentUser, isAuthenticated } = useAuth();
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>([]);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || !currentUser.id) {
      setAllNotifications([]);
      setIsHydrated(true);
      return;
    }
    try {
      const rows = await apiClient.getNotifications();
      if (Array.isArray(rows)) {
        setAllNotifications(rows);
      }
    } catch {
      // keep existing state on transient error
    } finally {
      setIsHydrated(true);
    }
  }, [isAuthenticated, currentUser.id]);

  useEffect(() => {
    fetchNotifications();
    if (!isAuthenticated || !currentUser.id) return;

    const timer = setInterval(fetchNotifications, 5000);
    const onFocus = () => fetchNotifications();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchNotifications, isAuthenticated, currentUser.id]);

  const addNotification = useCallback(
    (data: Omit<AppNotification, "id" | "createdAt" | "isRead" | "isDismissed">) => {
      if (!data.userId || data.userId === "ALL") return;

      // Optimistic local update if targeting current user
      if (data.userId === currentUser.id) {
        setAllNotifications((prev) => {
          if (data.entityId && prev.some((n) => n.entityId === data.entityId && n.userId === data.userId)) {
            return prev;
          }
          const newNotif: AppNotification = {
            ...data,
            id: `temp-${Date.now()}`,
            createdAt: new Date().toISOString(),
            isRead: false,
            isDismissed: false,
          };
          return [newNotif, ...prev];
        });
      }

      // Persist to backend SQLite so counterparty on another browser/device receives it
      apiClient
        .createNotification({
          userId: data.userId,
          userRole: data.userRole,
          event: data.event,
          title: data.title,
          description: data.description,
          linkHref: data.linkHref || "/",
          entityId: data.entityId,
        })
        .then((created) => {
          if (created && created.userId === currentUser.id) {
            fetchNotifications();
          }
        })
        .catch(() => {
          // non-blocking
        });
    },
    [currentUser.id, fetchNotifications]
  );

  const markAsRead = useCallback((id: string) => {
    setAllNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    if (!id.startsWith("temp-")) {
      apiClient.markNotificationRead(id).catch(() => {});
    }
  }, []);

  const markAllAsRead = useCallback(() => {
    setAllNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    apiClient.markAllNotificationsRead().catch(() => {});
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setAllNotifications((prev) => prev.filter((n) => n.id !== id));
    if (!id.startsWith("temp-")) {
      apiClient.dismissNotification(id).catch(() => {});
    }
  }, []);

  const clearDismissed = useCallback(() => {
    setAllNotifications((prev) => prev.filter((n) => !n.isDismissed));
  }, []);

  const getNotificationsForUser = useCallback(
    (userId: string, role: UserRole) => {
      if (!userId) return [];
      return allNotifications.filter((n) => {
        if (n.isDismissed) return false;
        return n.userId === userId && (n.userRole === "ALL" || n.userRole === role);
      });
    },
    [allNotifications]
  );

  const notifications = useMemo(() => {
    if (!isAuthenticated || !currentUser.id) return [];
    return getNotificationsForUser(currentUser.id, currentUser.role);
  }, [isAuthenticated, currentUser.id, currentUser.role, getNotificationsForUser]);

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
