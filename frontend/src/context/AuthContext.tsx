"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { UserProfile, UserRole, TrustScorecardData } from "@/types";
import {
  apiClient,
  getStoredToken,
  clearStoredToken,
} from "@/services/api";

const EMPTY_SCORECARD: TrustScorecardData = {
  rating: 0,
  onTimeDeliveryRate: 100,
  complianceScore: 100,
  completedProjects: 0,
  totalEarningsOrSpent: 0,
  currency: "USD",
  badges: [],
};

export const EMPTY_USER: UserProfile = {
  id: "",
  name: "",
  email: "",
  role: "FREELANCER",
  domain: "General",
  bio: "",
  portfolioLinks: [],
  createdAt: new Date().toISOString(),
  trustScorecard: EMPTY_SCORECARD,
};

function normalizeUserProfile(raw: any): UserProfile {
  if (!raw) return EMPTY_USER;

  const rawScorecard = raw.trustScorecard || raw.trust_scorecard;
  const scorecard: TrustScorecardData = {
    rating: typeof rawScorecard?.rating === "number" ? rawScorecard.rating : (raw.rating || 0),
    onTimeDeliveryRate:
      typeof rawScorecard?.onTimeDeliveryRate === "number"
        ? rawScorecard.onTimeDeliveryRate
        : typeof rawScorecard?.on_time_delivery_rate === "number"
        ? rawScorecard.on_time_delivery_rate
        : (raw.on_time_rate ?? 100),
    complianceScore:
      typeof rawScorecard?.complianceScore === "number"
        ? rawScorecard.complianceScore
        : typeof rawScorecard?.compliance_score === "number"
        ? rawScorecard.compliance_score
        : (raw.compliance_score ?? 100),
    completedProjects:
      typeof rawScorecard?.completedProjects === "number"
        ? rawScorecard.completedProjects
        : typeof rawScorecard?.completed_projects === "number"
        ? rawScorecard.completed_projects
        : (raw.completed_projects ?? 0),
    totalEarningsOrSpent:
      typeof rawScorecard?.totalEarningsOrSpent === "number"
        ? rawScorecard.totalEarningsOrSpent
        : typeof rawScorecard?.total_earnings_or_spent === "number"
        ? rawScorecard.total_earnings_or_spent
        : (raw.total_earnings_or_spent ?? 0),
    currency: rawScorecard?.currency || "USD",
    badges: rawScorecard?.badges || raw.badges || [],
  };

  return {
    id: String(raw.id || ""),
    name: raw.name || "",
    email: raw.email || "",
    paypalPayoutEmail: raw.paypalPayoutEmail || raw.paypal_payout_email || "",
    role: (raw.role === "CLIENT" ? "CLIENT" : "FREELANCER") as UserRole,
    domain: raw.domain || "General",
    bio: raw.bio || "",
    companyName: raw.companyName || raw.company_name || "",
    portfolioLinks: raw.portfolioLinks || raw.portfolio_links || [],
    skills: raw.skills || [],
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    trustScorecard: scorecard,
  };
}

interface AuthContextType {
  currentUser: UserProfile;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  toggleRole: () => void;
  isAuthenticated: boolean;
  login: (email: string, password?: string, role?: UserRole) => Promise<UserProfile>;
  signup: (name: string, email: string, password?: string, role?: UserRole) => Promise<UserProfile>;
  updateProfile: (profileData: Partial<UserProfile>) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isHydrated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(EMPTY_USER);
  const [activeRole, setActiveRoleState] = useState<UserRole>("FREELANCER");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  // 1. Restore authenticated session on mount using verified JWT
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      const token = getStoredToken();
      if (!token) {
        if (isMounted) {
          setIsHydrated(true);
        }
        return;
      }

      try {
        const user = await apiClient.getMe();
        if (isMounted && user && user.id) {
          const normalized = normalizeUserProfile(user);
          setCurrentUser(normalized);
          setActiveRoleState(normalized.role);
          setIsAuthenticated(true);
        }
      } catch (err: any) {
        // Only clear stored token when backend explicitly rejects it (401/403)
        if (err?.status === 401 || err?.status === 403) {
          clearStoredToken();
          if (isMounted) {
            setCurrentUser(EMPTY_USER);
            setIsAuthenticated(false);
          }
        }
      } finally {
        if (isMounted) {
          setIsHydrated(true);
        }
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const setActiveRole = (role: UserRole) => {
    setActiveRoleState(role);
  };

  const toggleRole = () => {
    const nextRole: UserRole = activeRole === "FREELANCER" ? "CLIENT" : "FREELANCER";
    setActiveRoleState(nextRole);
  };

  const refreshUser = useCallback(async () => {
    try {
      const user = await apiClient.getMe();
      if (user && user.id) {
        const normalized = normalizeUserProfile(user);
        setCurrentUser(normalized);
        setActiveRoleState(normalized.role);
        setIsAuthenticated(true);
      }
    } catch {
      // ignore
    }
  }, []);

  /**
   * Real Authentication Login
   * Cryptographically verifies credentials against the backend API and stores JWT.
   */
  const login = async (email: string, password = "", _role?: UserRole): Promise<UserProfile> => {
    const authData = await apiClient.login({
      email: email.trim(),
      password,
    });

    const normalized = normalizeUserProfile(authData.user);
    setCurrentUser(normalized);
    setActiveRoleState(normalized.role);
    setIsAuthenticated(true);
    return normalized;
  };

  /**
   * Real Registration
   * Cryptographically registers a new user in the backend database and stores JWT.
   */
  const signup = async (
    name: string,
    email: string,
    password = "",
    role: UserRole = "FREELANCER"
  ): Promise<UserProfile> => {
    const authData = await apiClient.register({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      domain: role === "FREELANCER" ? "Full-Stack Development" : "Enterprise",
    });

    const normalized = normalizeUserProfile(authData.user);
    setCurrentUser(normalized);
    setActiveRoleState(normalized.role);
    setIsAuthenticated(true);
    return normalized;
  };

  /**
   * Update Profile Details via backend API
   */
  const updateProfile = async (profileData: Partial<UserProfile>): Promise<void> => {
    try {
      const updated = await apiClient.updateProfile(profileData);
      const normalized = normalizeUserProfile(updated);
      setCurrentUser(normalized);
    } catch {
      // Optimistic local update as fallback
      setCurrentUser((prev) => ({
        ...prev,
        ...profileData,
      }));
    }
  };

  /**
   * Secure Logout
   * Clears stored JWT token and resets state.
   */
  const logout = () => {
    clearStoredToken();
    setCurrentUser(EMPTY_USER);
    setIsAuthenticated(false);
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        activeRole,
        setActiveRole,
        toggleRole,
        isAuthenticated,
        login,
        signup,
        updateProfile,
        logout,
        refreshUser,
        isHydrated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
