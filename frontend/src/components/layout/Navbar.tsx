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
      {/* ── Main Sticky Editorial Header ── */}
      <header className="sticky top-0 z-40 bg-[#EDF7F6]/85 backdrop-blur-md border-b border-[#A28089]/20">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 bg-[#1E1820] rounded-xl flex items-center justify-center text-[#51E2F5] shadow-xs group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5 text-[#51E2F5]" />
            </div>
            <div className="leading-none">
              <span className="font-display text-xl font-bold tracking-tight text-[#1E1820] block">
                TrustPay <span className="text-[#0EA5B7]">AI</span>
              </span>
              <span className="text-[9px] uppercase tracking-widest text-[#A28089] font-bold">
                Milestone Escrow
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
                    className={`text-sm font-medium transition-colors cursor-pointer py-1 border-b-2 ${
                      isActive
                        ? "text-[#1E1820] border-[#51E2F5] font-semibold"
                        : "text-[#5C4B51] border-transparent hover:text-[#1E1820]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {isHydrated && isAuthenticated && (
            <div className="hidden md:flex items-center gap-1 bg-white/80 p-1 rounded-full border border-[#A28089]/20 shadow-2xs">
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
                        ? "bg-[#1E1820] text-[#EDF7F6] shadow-xs"
                        : "text-[#5C4B51] hover:text-[#1E1820] hover:bg-[#EDF7F6]"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${item.active ? "text-[#51E2F5]" : ""}`} />
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
                    className="relative p-2 rounded-full text-[#5C4B51] hover:text-[#1E1820] hover:bg-white/80 transition-colors cursor-pointer"
                    aria-label="View notifications"
                    title="Notifications"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#FFA8B6] text-[10px] font-bold text-[#1E1820] shadow-xs">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Dropdown Panel */}
                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-[#A28089]/25 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-[#EDF7F6] px-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#1E1820]">Notifications</span>
                          {unreadCount > 0 && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-[#9DF9EF]/60 text-[#1E1820] rounded-full">
                              {unreadCount} new
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={markAllAsRead}
                          disabled={unreadCount === 0}
                          className={`text-[11px] font-semibold transition-colors ${
                            unreadCount > 0
                              ? "text-[#0EA5B7] hover:underline cursor-pointer"
                              : "text-gray-400 cursor-default"
                          }`}
                        >
                          Mark all read
                        </button>
                      </div>

                      <div className="divide-y divide-[#EDF7F6] max-h-72 overflow-y-auto my-1">
                        {notifications.length === 0 ? (
                          <div className="py-8 text-center text-[#A28089] text-xs">
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
                              className={`block p-2.5 rounded-xl transition-colors hover:bg-[#EDF7F6] ${
                                !n.isRead ? "bg-[#9DF9EF]/25" : ""
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-xs font-bold line-clamp-1 ${!n.isRead ? "text-[#1E1820]" : "text-[#5C4B51]"}`}>
                                  {n.title}
                                </p>
                                {!n.isRead && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#51E2F5] shrink-0 mt-1" />
                                )}
                              </div>
                              <p className="text-[11px] text-[#5C4B51] line-clamp-2 mt-0.5 leading-normal">
                                {n.description}
                              </p>
                            </Link>
                          ))
                        )}
                      </div>

                      <div className="pt-2 border-t border-[#EDF7F6] text-center">
                        <Link
                          href="/notifications"
                          onClick={() => setNotifOpen(false)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#1E1820] hover:text-[#0EA5B7] transition-colors py-1"
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
                <span className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 border border-[#A28089]/25 text-xs font-bold text-[#1E1820]">
                  {currentUser.role === "CLIENT" ? (
                    <Building className="w-3.5 h-3.5 text-[#0EA5B7]" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-[#0EA5B7]" />
                  )}
                  <span>{currentUser.name}</span>
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 text-xs font-bold text-[#5C4B51] hover:text-[#1E1820] px-3 py-2 rounded-full hover:bg-[#FFA8B6]/35 transition-all cursor-pointer"
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
                  className="text-sm font-bold text-[#1E1820] hover:text-[#0EA5B7] px-3 py-2 hidden md:inline-block transition-colors"
                >
                  Log In
                </Link>

                <Link
                  href="/auth/signup"
                  className="btn-shadow bg-[#51E2F5] hover:bg-[#3ad3e8] text-[#1E1820] text-xs sm:text-sm font-bold px-4 sm:px-6 py-2 rounded-full transition-all flex items-center gap-1.5"
                >
                  <span>Join Platform</span>
                  <ArrowRight className="w-3.5 h-3.5 hidden sm:inline-block" />
                </Link>
              </>
            )}

            {/* Mobile Hamburger Toggle */}
            {(isLandingPage || isAuthenticated) && (
              <button
                onClick={() => setMobileOpen((o) => !o)}
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                className="lg:hidden p-2 rounded-xl text-[#1E1820] hover:bg-white/80 transition-colors cursor-pointer"
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
