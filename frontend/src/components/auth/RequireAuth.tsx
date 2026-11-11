"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, AlertCircle, ShieldCheck, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface RequireAuthProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children, requiredRole }) => {
  const { currentUser, isAuthenticated, isHydrated, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [isHydrated, isAuthenticated, router]);

  if (!isHydrated) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-500">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0070E0] flex items-center justify-center animate-pulse">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <p className="text-xs font-semibold">Verifying your session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Card className="p-8 border-slate-200 bg-white shadow-sm rounded-3xl space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-[#0070E0] flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <Badge variant="paypal" size="md">Authentication Required</Badge>
          <h2 className="text-xl font-bold text-[#003087]">Sign in to access this workspace</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Escrow vaults, milestone deliverables, contracts, and account metrics are private. Please sign in or create an account to continue.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/auth/login">
              <Button variant="primary" size="sm">
                <span>Sign In</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="outline" size="sm">
                Create Account
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (requiredRole && currentUser.role !== requiredRole) {
    const targetDashboard =
      currentUser.role === "CLIENT" ? "/client/dashboard" : "/freelancer/dashboard";
    const targetLabel =
      currentUser.role === "CLIENT" ? "Go to Client Dashboard" : "Go to Freelancer Dashboard";

    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Card className="p-8 border-slate-200 bg-white shadow-sm rounded-3xl space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <Badge variant="warning" size="md">Workspace Restricted</Badge>
          <h2 className="text-xl font-bold text-slate-900">
            Signed in as {currentUser.role === "CLIENT" ? "Client" : "Freelancer"}
          </h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Your account is registered with the <strong>{currentUser.role}</strong> role and cannot access the{" "}
            <strong>{requiredRole}</strong> workspace.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href={targetDashboard}>
              <Button variant="primary" size="sm">
                {targetLabel}
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={logout}>
              Switch Account
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
