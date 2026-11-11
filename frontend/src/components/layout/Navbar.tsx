"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Bell,
  Check,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
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
  const { currentUser, activeRole, setActiveRole, isHydrated } = useAuth();
  const { notifications, markAsRead, markAllAsRead, getNotificationsForUser } = useNotifications();
  const userNotifications = isHydrated ? getNotificationsForUser(currentUser.id, activeRole) : [];
  const userUnreadCount = userNotifications.filter((n) => !n.isRead).length;
  const pathname = usePathname();
  const router = useRouter();
  const isLandingPage = pathname === "/";

  const [activeSection, setActiveSection] = useState<SectionId>("home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notifications dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen]);

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
      <div className="bg-[#073B68] text-white py-2 text-xs font-medium px-4 sm:px-6 lg:px-8 flex justify-between items-center z-50 relative border-b border-white/10">
        <div className="flex items-center gap-3 sm:gap-4 max-w-7xl mx-auto w-full justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="flex items-center gap-1.5 opacity-90 text-[11px] sm:text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A6A1] animate-pulse" />
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
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5ECF6] shadow-[0_2px_12px_rgba(7,59,104,0.04)]">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8 lg:gap-10">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 bg-[#087EAA] rounded-xl flex items-center justify-center text-white text-xl shadow-[0_4px_12px_rgba(8,126,170,0.3)] group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-2xl font-extrabold tracking-tighter text-[#073B68]">TrustPay</span>
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
                          ? "text-[#073B68] active font-bold"
                          : "text-[#4A5D73] hover:text-[#087EAA]"
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
            {isHydrated ? (
              <>
                {/* 1. Back to Dashboard Button (Hidden on Landing Page) */}
                {!isLandingPage && (
                  <Link
                    href={activeDashboardHref}
                    className="flex items-center gap-2 bg-[#EAF3FA] hover:bg-[#D9EAF7] text-[#087EAA] px-3.5 sm:px-4 py-2 rounded-full text-xs font-bold transition-all border border-[#CDE1F4] shadow-xs group cursor-pointer"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 text-[#087EAA]" />
                    <span className="whitespace-nowrap">Back to Dashboard</span>
                  </Link>
                )}

                {/* 3. Global Notification Bell with Dropdown */}
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => setNotifOpen((prev) => !prev)}
                    className="relative p-2 rounded-full text-gray-600 hover:text-[#073B68] hover:bg-gray-100 transition-colors cursor-pointer"
                    aria-label="View notifications"
                    title="Notifications"
                  >
                    <Bell className="w-5 h-5 text-gray-700 hover:text-[#003087]" />
                    {userUnreadCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs">
                        {userUnreadCount > 9 ? "9+" : userUnreadCount}
                      </span>
                    )}
                  </button>

                  {/* Dropdown Panel */}
                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-[#E5ECF6] p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-gray-100 px-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#073B68]">Notifications</span>
                          {userUnreadCount > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-[#0070E0] rounded-full">
                              {userUnreadCount} new
                            </span>
                          )}
                        </div>
                        {userUnreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-[11px] font-semibold text-[#0070E0] hover:underline cursor-pointer"
                          >
                            Mark all read
                          </button>
                        )}
                      </div>

                      <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto my-1">
                        {userNotifications.length === 0 ? (
                          <div className="py-8 text-center text-gray-400 text-xs">
                            No notifications yet
                          </div>
                        ) : (
                          userNotifications.slice(0, 5).map((n) => (
                            <Link
                              key={n.id}
                              href={n.linkHref || "/notifications"}
                              onClick={() => {
                                markAsRead(n.id);
                                setNotifOpen(false);
                              }}
                              className={`block p-2.5 rounded-xl transition-colors hover:bg-gray-50 ${
                                !n.isRead ? "bg-blue-50/40" : ""
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-xs font-bold line-clamp-1 ${!n.isRead ? "text-[#003087]" : "text-gray-800"}`}>
                                  {n.title}
                                </p>
                                {!n.isRead && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#0070E0] shrink-0 mt-1" />
                                )}
                              </div>
                              <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5 leading-normal">
                                {n.description}
                              </p>
                            </Link>
                          ))
                        )}
                      </div>

                      <div className="pt-2 border-t border-gray-100 text-center">
                        <Link
                          href="/notifications"
                          onClick={() => setNotifOpen(false)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#0070E0] hover:text-[#003087] transition-colors py-1"
                        >
                          <span>Open Notification Centre</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {/* 3. Auth Buttons */}
            <Link
              href="/auth/login"
              className="text-sm font-bold text-[#073B68] hover:text-[#087EAA] px-3 py-2 hidden md:inline-block transition-colors"
            >
              Log In
            </Link>

            <Link
              href="/auth/signup"
              className="btn-shadow bg-[#087EAA] hover:bg-[#073B68] text-white text-xs sm:text-sm font-bold px-4 sm:px-6 py-2.5 rounded-full transition-all flex items-center gap-1.5"
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
                {isHydrated && (
                  <>
                    {!isLandingPage && (
                      <Link
                        href={activeDashboardHref}
                        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-[#0070E0] bg-blue-50 border border-blue-200 rounded-full"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        Back to Dashboard
                      </Link>
                    )}

                    <Link
                      href="/notifications"
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-full cursor-pointer hover:bg-gray-100"
                    >
                      <Bell className="w-4 h-4 text-[#0070E0]" />
                      <span>Notifications</span>
                      {userUnreadCount > 0 && (
                        <span className="px-2 py-0.5 text-xs font-bold bg-rose-500 text-white rounded-full">
                          {userUnreadCount}
                        </span>
                      )}
                    </Link>
                  </>
                )}

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
