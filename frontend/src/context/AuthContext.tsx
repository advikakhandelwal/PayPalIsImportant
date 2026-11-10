"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { UserProfile, UserRole } from "@/types";
import { SAMPLE_FREELANCER, SAMPLE_CLIENT } from "@/lib/mockData";

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers (SSR-safe)
// ─────────────────────────────────────────────────────────────────────────────
const LS_USER = "tp_demo_user";
const LS_ROLE = "tp_demo_role";
const LS_AUTH = "tp_demo_auth";

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
    // quota exceeded – silently ignore in demo mode
  }
}

function removeLS(key: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

interface AuthContextType {
  currentUser: UserProfile;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  toggleRole: () => void;
  isAuthenticated: boolean;
  login: (email: string, role?: UserRole) => void;
  signup: (name: string, email: string, role: UserRole) => void;
  updateProfile: (profileData: Partial<UserProfile>) => void;
  logout: () => void;
  isHydrated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Deterministic initial state identical on SSR and initial client render
  const [activeRole, setActiveRoleState] = useState<UserRole>("FREELANCER");
  const [currentUser, setCurrentUser] = useState<UserProfile>(SAMPLE_FREELANCER);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  // 1. Restore persisted state from localStorage only after client mounting
  useEffect(() => {
    try {
      const savedRole = readLS<UserRole | null>(LS_ROLE, null);
      const savedUser = readLS<UserProfile | null>(LS_USER, null);
      const savedAuth = readLS<boolean | null>(LS_AUTH, null);

      if (savedRole === "CLIENT" || savedRole === "FREELANCER") {
        setActiveRoleState(savedRole);
      }
      if (savedUser && savedUser.id) {
        setCurrentUser(savedUser);
      } else if (savedRole === "CLIENT") {
        setCurrentUser(SAMPLE_CLIENT);
      }
      if (savedAuth !== null) {
        setIsAuthenticated(savedAuth);
      }
    } catch {
      // Safe fallback in demo mode
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // 2. Persist auth state changes to localStorage only after hydration has completed
  useEffect(() => {
    if (!isHydrated) return;
    writeLS(LS_USER, currentUser);
  }, [currentUser, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeLS(LS_ROLE, activeRole);
  }, [activeRole, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeLS(LS_AUTH, isAuthenticated);
  }, [isAuthenticated, isHydrated]);

  const setActiveRole = (role: UserRole) => {
    setActiveRoleState(role);
    // Switch preview user when toggling roles in demo mode
    if (currentUser.id === SAMPLE_FREELANCER.id || currentUser.id === SAMPLE_CLIENT.id) {
      setCurrentUser(role === "FREELANCER" ? SAMPLE_FREELANCER : SAMPLE_CLIENT);
    }
  };

  const toggleRole = () => {
    const nextRole: UserRole = activeRole === "FREELANCER" ? "CLIENT" : "FREELANCER";
    setActiveRole(nextRole);
  };

  /**
   * Frontend Demo Signup
   * NOTE: Passwords are intentionally NOT received, handled, or stored here.
   * New members begin in an UNRATED / PENDING state with 0 scores and 0 completed projects.
   */
  const signup = (name: string, email: string, role: UserRole) => {
    const newUser: UserProfile = {
      id: `user-${Date.now()}`,
      name,
      email,
      role,
      domain: role === "FREELANCER" ? "General Talent" : "General Enterprise",
      bio: "",
      portfolioLinks: [],
      createdAt: new Date().toISOString(),
      isNewMember: true,
      trustScorecard: {
        rating: 0, // Unrated initially
        onTimeDeliveryRate: 0,
        complianceScore: 0,
        completedProjects: 0,
        totalEarningsOrSpent: 0,
        currency: "USD",
        badges: [], // No badges until real milestone delivery
      },
    };

    setCurrentUser(newUser);
    setActiveRoleState(role);
    setIsAuthenticated(true);
  };

  /**
   * Frontend Demo Login
   */
  const login = (email: string, role?: UserRole) => {
    const targetRole = role || activeRole;
    setActiveRoleState(targetRole);

    // If logging in as pre-seeded demo users
    if (targetRole === "FREELANCER") {
      setCurrentUser({ ...SAMPLE_FREELANCER, email: email || SAMPLE_FREELANCER.email });
    } else {
      setCurrentUser({ ...SAMPLE_CLIENT, email: email || SAMPLE_CLIENT.email });
    }
    setIsAuthenticated(true);
  };

  /**
   * Update current user profile (used by Onboarding flow)
   */
  const updateProfile = (profileData: Partial<UserProfile>) => {
    setCurrentUser((prev) => ({
      ...prev,
      ...profileData,
    }));
  };

  const logout = () => {
    setIsAuthenticated(false);
    // Clear persisted demo session so the next visit starts fresh
    removeLS(LS_USER);
    removeLS(LS_ROLE);
    removeLS(LS_AUTH);
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
