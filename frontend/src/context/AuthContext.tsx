"use client";

import React, { createContext, useContext, useState } from "react";
import { UserProfile, UserRole } from "@/types";
import { SAMPLE_FREELANCER, SAMPLE_CLIENT } from "@/lib/mockData";

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeRole, setActiveRoleState] = useState<UserRole>("FREELANCER");
  const [currentUser, setCurrentUser] = useState<UserProfile>(SAMPLE_FREELANCER);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

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
