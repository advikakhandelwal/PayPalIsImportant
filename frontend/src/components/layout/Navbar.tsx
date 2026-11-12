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
  LogOut,
  MessageSquare,
  ShieldAlert,
  Table2,
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
  const { currentUser, activeRole, setActiveRole, isAuthenticated, logout, isHydrated } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
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
      <div className="bg-[#001C3D] text-white py-2 text-xs font-medium px-4 sm:px-6 lg:px-8 flex justify-between items-center z-50 relative">
        <div className="flex items-center gap-3 sm:gap-4 max-w-7xl mx-auto w-full justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="flex items-center gap-1.5 opacity-90 text-[11px] sm:text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              PayPal Milestone Escrow
            </span>
            <span className="hidden sm:inline h-3 w-px bg-white/20" />
            <span className="hidden sm:inline opacity-75 text-[11px] sm:text-xs">
              Protected Client &amp; Freelancer Workspace
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
              Features
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
              How Escrow Works
            </a>
          </div>
        </div>
      </div>

      {/* ── Main Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200/80">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 bg-[#0070E0] rounded-xl flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="leading-none">
              <span className="text-xl font-extrabold tracking-tight text-[#003087] block">TrustPay</span>
              <span className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">
                Autonomous Escrow
              </span>
            </div>
          </Link>

          {/* Centered Clean Navigation Links */}
          {isLandingPage && !isAuthenticated && (
            <div className="hidden lg:flex items-center gap-7">
              {LANDING_NAV.map(({ id, label }) => {
                const isActive = activeSection === id;
                return (
                  <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    className={`text-sm font-semibold transition-colors cursor-pointer py-1 border-b-2 ${
                      isActive
                        ? "text-[#003087] border-[#0070E0]"
                        : "text-gray-500 border-transparent hover:text-[#0070E0]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {isHydrated && isAuthenticated && (
            <div className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-full border border-slate-200/70">
              {[
                { href: activeDashboardHref, label: "Dashboard", icon: LayoutDashboard, active: pathname?.includes("/dashboard") },
                { href: "/messages", label: "Messages", icon: MessageSquare, active: pathname?.startsWith("/messages") },
                { href: "/disputes", label: "Disputes", icon: ShieldAlert, active: pathname?.includes("/disputes") },
                { href: "/ledger", label: "Ledger", icon: Table2, active: pathname?.startsWith("/ledger") },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                      item.active
                        ? "bg-white text-[#003087] shadow-xs"
                        : "text-slate-600 hover:text-[#003087]"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Right Controls: Notifications & Auth */}
          <div className="flex items-center gap-2 shrink-0">
            {isHydrated && isAuthenticated ? (
              <>
                {/* Global Notification Bell with Dropdown */}
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => setNotifOpen((prev) => !prev)}
                    className="relative p-2 rounded-full text-gray-600 hover:text-[#003087] hover:bg-gray-100 transition-colors cursor-pointer"
                    aria-label="View notifications"
                    title="Notifications"
                  >
                    <Bell className="w-5 h-5 text-gray-700 hover:text-[#003087]" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Dropdown Panel */}
                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-gray-100 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-gray-100 px-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#003087]">Notifications</span>
                          {unreadCount > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-[#0070E0] rounded-full">
                              {unreadCount} new
                            </span>
                          )}
                        </div>
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-[11px] font-semibold text-[#0070E0] hover:underline cursor-pointer"
                          >
                            Mark all read
                          </button>
                        )}
                      </div>

                      <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto my-1">
                        {notifications.length === 0 ? (
                          <div className="py-8 text-center text-gray-400 text-xs">
                            No notifications yet
                          </div>
                        ) : (
                          notifications.slice(0, 5).map((n) => (
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

            {/* 3. Auth Buttons or Logged-in Profile */}
            {isHydrated && isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                  {currentUser.role === "CLIENT" ? (
                    <Building className="w-3.5 h-3.5 text-[#003087]" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-[#0070E0]" />
                  )}
                  <span>{currentUser.name}</span>
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-rose-600 px-3 py-2 rounded-full hover:bg-rose-50 transition-all cursor-pointer"
                  title="Log Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Log Out</span>
                </button>
              </div>
            ) : (
              <>
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
              </>
            )}

            {/* Mobile Hamburger Toggle */}
            {(isLandingPage || isAuthenticated) && (
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
        {(isLandingPage || isAuthenticated) && mobileOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white/98 backdrop-blur-md px-6 py-5 shadow-xl animate-in slide-in-from-top-2 duration-150">
            <nav className="flex flex-col gap-2">
              {isLandingPage && LANDING_NAV.map(({ id, label }) => {
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
                {isHydrated && isAuthenticated && (
                  <>
                    <Link
                      href={activeDashboardHref}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-[#0070E0] bg-blue-50 border border-blue-200 rounded-full"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      Dashboard
                    </Link>
                    <Link
                      href="/messages"
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-full"
                    >
                      <MessageSquare className="w-4 h-4 text-[#0070E0]" />
                      Messages
                    </Link>
                    <Link
                      href="/disputes"
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full"
                    >
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                      Disputes
                    </Link>
                    <Link
                      href="/ledger"
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-[#003087] bg-slate-50 border border-slate-200 rounded-full"
                    >
                      <Table2 className="w-4 h-4 text-[#003087]" />
                      Escrow Ledger
                    </Link>

                    <Link
                      href="/notifications"
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-full cursor-pointer hover:bg-gray-100"
                    >
                      <Bell className="w-4 h-4 text-[#0070E0]" />
                      <span>Notifications</span>
                      {unreadCount > 0 && (
                        <span className="px-2 py-0.5 text-xs font-bold bg-rose-500 text-white rounded-full">
                          {unreadCount}
                        </span>
                      )}
                    </Link>
                  </>
                )}

                {isHydrated && isAuthenticated ? (
                  <button
                    onClick={logout}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-full cursor-pointer hover:bg-rose-100 mt-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out ({currentUser.name})</span>
                  </button>
                ) : (
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
                )}
              </div>
            </nav>
          </div>
        )}
      </header>
    </>
  );
};
