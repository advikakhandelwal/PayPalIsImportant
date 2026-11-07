"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShieldCheck,
  User,
  Building,
  Menu,
  X,
  ArrowRight,
  LayoutDashboard,
  ArrowRightLeft,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types";

const LANDING_NAV = [
  { label: "Home", id: "home" },
  { label: "About", id: "about" },
  { label: "How It Works", id: "how-it-works" },
  { label: "Features", id: "features" },
  { label: "Escrow Process", id: "escrow" },
] as const;

type SectionId = (typeof LANDING_NAV)[number]["id"];

export const Navbar: React.FC = () => {
  const { activeRole, setActiveRole } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLandingPage = pathname === "/";

  const [activeSection, setActiveSection] = useState<SectionId>("home");
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeDashboardHref =
    activeRole === "FREELANCER" ? "/freelancer/dashboard" : "/client/dashboard";
  const otherRole: UserRole = activeRole === "FREELANCER" ? "CLIENT" : "FREELANCER";
  const otherRoleLabel = otherRole === "FREELANCER" ? "Freelancer" : "Client";
  const otherRoleDashboardHref =
    otherRole === "FREELANCER" ? "/freelancer/dashboard" : "/client/dashboard";

  /* ───── Switch account role & navigate to its dashboard ───── */
  const handleSwitchAccount = () => {
    setActiveRole(otherRole);
    router.push(otherRoleDashboardHref);
    setMobileOpen(false);
  };

  /* ───── IntersectionObserver for highlighting active section ───── */
  useEffect(() => {
    if (!isLandingPage) return;

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      const visible = entries.find((e) => e.isIntersecting);
      if (visible) {
        setActiveSection(visible.target.id as SectionId);
      }
    };

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: "-20% 0px -60% 0px",
      threshold: 0,
    });

    LANDING_NAV.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isLandingPage]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setMobileOpen(false);
  }, []);

  return (
    <>
      {/* ── Top Status Bar ── */}
      <div className="bg-[#001C3D] text-white py-2 text-xs font-medium px-4 sm:px-6 lg:px-8 flex justify-between items-center z-50 relative">
        <div className="flex items-center gap-3 sm:gap-4 max-w-7xl mx-auto w-full justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="flex items-center gap-1.5 opacity-90 text-[11px] sm:text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Demo Environment Active
            </span>
            <span className="hidden sm:inline h-3 w-px bg-white/20" />
            <span className="hidden sm:inline opacity-70 text-[11px] sm:text-xs">
              Milestone Escrow Protocol v2.4
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] sm:text-xs">
            <a
              href="#features"
              onClick={(e) => {
                if (isLandingPage) {
                  e.preventDefault();
                  scrollTo("features");
                }
              }}
              className="hover:text-blue-300 transition-colors opacity-90"
            >
              Advisory Specs
            </a>
            <span className="h-3 w-px bg-white/20" />
            <a
              href="#escrow"
              onClick={(e) => {
                if (isLandingPage) {
                  e.preventDefault();
                  scrollTo("escrow");
                }
              }}
              className="hover:text-blue-300 transition-colors opacity-90"
            >
              Escrow Flow
            </a>
          </div>
        </div>
      </div>

      {/* ── Main Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-xs">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8 lg:gap-10">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 bg-[#0070E0] rounded-xl flex items-center justify-center text-white text-xl shadow-xs group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-2xl font-extrabold tracking-tighter text-[#003087]">TrustPay</span>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold -mt-1">
                  Autonomous Escrow
                </p>
              </div>
            </Link>

            {/* Desktop Section Links (Landing Page Only) */}
            {isLandingPage && (
              <div className="hidden lg:flex items-center gap-8">
                {LANDING_NAV.map(({ id, label }) => {
                  const isActive = activeSection === id;
                  return (
                    <button
                      key={id}
                      onClick={() => scrollTo(id)}
                      className={`nav-link text-sm font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? "text-[#003087] active font-bold"
                          : "text-gray-500 hover:text-[#0070E0]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Controls: Back to Dashboard, Account Switcher, Auth */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* 1. Back to Dashboard Button */}
            <Link
              href={activeDashboardHref}
              className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100/80 text-[#0070E0] px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold transition-all border border-blue-200/60 shadow-xs group cursor-pointer"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-[#0070E0]" />
              <span className="whitespace-nowrap">Back to Dashboard</span>
            </Link>

            {/* 2. Switch Account Button (for dual-role users) */}
            <button
              onClick={handleSwitchAccount}
              className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-[#003087] bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-full border border-gray-200 transition-all cursor-pointer whitespace-nowrap shadow-2xs"
              title={`Switch to ${otherRoleLabel} account`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#0070E0]" />
              <span>Switch to {otherRoleLabel}</span>
            </button>

            {/* 3. Auth Buttons */}
            <Link
              href="/auth/login"
              className="text-sm font-bold text-[#003087] hover:text-[#0070E0] px-3 py-2 hidden md:inline-block transition-colors"
            >
              Log In
            </Link>

            <Link
              href="/auth/signup"
              className="btn-shadow bg-[#0070E0] hover:bg-[#005bb8] text-white text-xs sm:text-sm font-bold px-4 sm:px-6 py-2.5 rounded-full transition-all flex items-center gap-1.5"
            >
              <span>Sign Up</span>
              <ArrowRight className="w-3.5 h-3.5 hidden sm:inline-block" />
            </Link>

            {/* Mobile Hamburger Toggle (on landing page) */}
            {isLandingPage && (
              <button
                onClick={() => setMobileOpen((o) => !o)}
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                className="lg:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            )}
          </div>
        </nav>

        {/* ── Mobile Menu Dropdown ── */}
        {isLandingPage && mobileOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white/98 backdrop-blur-md px-6 py-5 shadow-xl animate-in slide-in-from-top-2 duration-150">
            <nav className="flex flex-col gap-2">
              {LANDING_NAV.map(({ id, label }) => {
                const isActive = activeSection === id;
                return (
                  <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    className={`text-left px-4 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                      isActive
                        ? "bg-blue-50 text-[#0070E0]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}

              <div className="pt-4 border-t border-gray-100 flex flex-col gap-2">
                <Link
                  href={activeDashboardHref}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-[#0070E0] bg-blue-50 border border-blue-200 rounded-full"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Back to Dashboard
                </Link>

                <button
                  onClick={handleSwitchAccount}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-full cursor-pointer hover:bg-gray-100"
                >
                  <ArrowRightLeft className="w-4 h-4 text-[#0070E0]" />
                  Switch to {otherRoleLabel} Account
                </button>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Link
                    href="/auth/login"
                    className="w-full text-center py-2.5 text-sm font-bold text-[#003087] border border-gray-200 rounded-full hover:bg-gray-50"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="w-full text-center py-2.5 text-sm font-bold text-white bg-[#0070E0] rounded-full shadow-md hover:bg-[#005bb8]"
                  >
                    Sign Up
                  </Link>
                </div>
              </div>
            </nav>
          </div>
        )}
      </header>
    </>
  );
};
