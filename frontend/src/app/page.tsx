"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { formatCurrency, formatDate, getMilestoneStatusInfo, getEscrowStatusInfo } from "@/lib/utils";
import {
  ShieldCheck,
  Building,
  User,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sparkles,
  Layers,
  Scale,
  BarChart3,
  Search,
  PlusCircle,
  ChevronRight,
  Award,
  Zap,
} from "lucide-react";

export default function HomePage() {
  const { activeRole, currentUser, isAuthenticated, isHydrated } = useAuth();
  const { activeContract } = useMarketplace();

  const canBrowseFreelancer = isAuthenticated && currentUser.role === "FREELANCER";
  const canBrowseClient = isAuthenticated && currentUser.role === "CLIENT";

  const previewContract =
    isAuthenticated && activeContract && activeContract.id
      ? activeContract
      : {
          id: "SAMPLE-ESCROW-DEMO",
          projectTitle: "Sample Milestone Escrow Architecture (Preview)",
          totalBudget: 3000,
          releasedAmount: 900,
          currency: "USD",
          escrowStatus: "PARTIALLY_RELEASED" as const,
          milestones: [
            {
              id: "sample-1",
              stepNumber: 1,
              title: "Architecture & Spec Lock",
              description: "System schema, PayPal Orders v2 authorization & milestone sign-off.",
              paymentAmount: 900,
              currency: "USD",
              deadline: "2026-12-01T00:00:00Z",
              status: "RELEASED" as const,
              submission: undefined,
            },
            {
              id: "sample-2",
              stepNumber: 2,
              title: "Core Implementation & AI Audit",
              description: "Deliverable submitted for security scan and requirement verification.",
              paymentAmount: 1200,
              currency: "USD",
              deadline: "2026-12-10T00:00:00Z",
              status: "ACTIVE" as const,
              submission: undefined,
            },
            {
              id: "sample-3",
              stepNumber: 3,
              title: "Final Release & Settlement",
              description: "Final milestone captured via PayPal and reputation scorecard updated.",
              paymentAmount: 900,
              currency: "USD",
              deadline: "2026-12-20T00:00:00Z",
              status: "LOCKED" as const,
              submission: undefined,
            },
          ],
        };

  const escrowStatusInfo = getEscrowStatusInfo(previewContract.escrowStatus);
  const progressPct =
    previewContract.totalBudget > 0
      ? Math.round((previewContract.releasedAmount / previewContract.totalBudget) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ─────────────────────────────────────────────────────────────────
          1. HERO SECTION
      ───────────────────────────────────────────────────────────────── */}
      <section id="home" className="hero-gradient pt-16 sm:pt-20 pb-24 sm:pb-28 px-4 sm:px-6 overflow-hidden relative scroll-mt-24">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 mb-6 sm:mb-8">
            <span className="flex h-2 w-2 rounded-full bg-[#0070E0] animate-pulse" />
            <span className="text-xs font-bold text-[#0070E0] tracking-wider uppercase">
              Next-Gen Milestone Security
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold text-[#003087] tracking-tight mb-6 max-w-4xl leading-tight">
            TrustPay Escrow
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-xl text-gray-600 max-w-2xl leading-relaxed mb-8 sm:mb-10">
            An autonomous milestone escrow marketplace bridging companies with verified freelancers.
            Funds are held safely in escrow upfront and released step-by-step with intelligent advisory verification.
          </p>

          {/* Dual CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 mb-14 w-full sm:w-auto">
            <Link
              href={isAuthenticated ? "/freelancer/dashboard" : "/auth/login"}
              id="hero-cta-find"
              className="btn-shadow bg-[#0070E0] hover:bg-[#003087] text-white px-8 sm:px-10 py-4 rounded-full text-base sm:text-lg font-bold flex items-center justify-center gap-2 transition-all group cursor-pointer"
            >
              <Search className="w-5 h-5" />
              <span>{canBrowseFreelancer ? "Open Freelancer Workspace" : "Find Work"}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href={isAuthenticated ? "/client/dashboard" : "/auth/login"}
              id="hero-cta-hire"
              className="bg-white border-2 border-gray-200 hover:border-[#0070E0] hover:text-[#0070E0] text-gray-700 px-8 sm:px-10 py-4 rounded-full text-base sm:text-lg font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <PlusCircle className="w-5 h-5 text-[#0070E0]" />
              <span>{canBrowseClient ? "Open Client Dashboard" : "Hire Talent"}</span>
            </Link>
          </div>

        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────
          2. MARKETPLACE PORTALS (CLIENT & FREELANCER)
      ───────────────────────────────────────────────────────────────── */}
      <section id="about" className="py-24 bg-white scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#003087] mb-4">
              Marketplace Portals
            </h2>
            <p className="text-gray-500 text-base max-w-xl mx-auto">
              Dedicated workflows tailored for talent and hiring clients.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Freelancer Portal Card */}
            <div
              className={`group relative p-8 sm:p-10 rounded-3xl border bg-gray-50/50 card-hover transition-all ${
                isHydrated && isAuthenticated && activeRole === "FREELANCER" ? "border-[#0070E0] ring-2 ring-[#0070E0]/20 bg-blue-50/10" : "border-gray-100"
              }`}
            >
              {isHydrated && isAuthenticated && activeRole === "FREELANCER" && (
                <div className="absolute top-6 right-8">
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                    Active
                  </span>
                </div>
              )}
              <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-[#0070E0] mb-6">
                <User className="w-7 h-7 text-[#0070E0]" />
              </div>
              <h3 className="text-2xl font-bold text-[#003087] mb-2">
                Freelancer &amp; Creator Portal
              </h3>
              <p className="text-gray-600 mb-8 leading-relaxed text-sm">
                Discover gigs, submit deliverables &amp; guarantee payments with objective on-time delivery metrics.
              </p>
              <ul className="space-y-4 mb-10">
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#0070E0] shrink-0 mt-0.5" />
                  <span><strong>Domain Filtering:</strong> Specialized browse with configurable budgets.</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#0070E0] shrink-0 mt-0.5" />
                  <span><strong>Guaranteed Escrow:</strong> Never get ghosted; milestones are funded upfront.</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#0070E0] shrink-0 mt-0.5" />
                  <span><strong>Trust Scorecard:</strong> Earn badges for clean delivery and compliance.</span>
                </li>
              </ul>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={isAuthenticated ? "/freelancer/dashboard?tab=projects" : "/auth/login"}
                  id="portal-browse-projects"
                  className="bg-[#0070E0] hover:bg-[#005bb8] text-white px-6 py-2.5 rounded-full text-sm font-bold transition-colors"
                >
                  Browse Projects
                </Link>
                <Link
                  href={isAuthenticated ? "/freelancer/dashboard?tab=profile" : "/auth/signup"}
                  id="portal-view-profile"
                  className="bg-white border border-gray-200 hover:border-gray-300 text-gray-700 px-6 py-2.5 rounded-full text-sm font-bold transition-colors"
                >
                  {isAuthenticated ? "View Profile" : "Join as Talent"}
                </Link>
              </div>
            </div>

            {/* Client Portal Card */}
            <div
              className={`group relative p-8 sm:p-10 rounded-3xl border bg-gray-50/50 card-hover transition-all ${
                isHydrated && isAuthenticated && activeRole === "CLIENT" ? "border-[#003087] ring-2 ring-[#003087]/20 bg-blue-50/10" : "border-gray-100"
              }`}
            >
              {isHydrated && isAuthenticated && activeRole === "CLIENT" && (
                <div className="absolute top-6 right-8">
                  <span className="px-3 py-1 rounded-full bg-blue-100 text-[#003087] text-[10px] font-bold uppercase tracking-wider">
                    Active
                  </span>
                </div>
              )}
              <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-[#003087] mb-6">
                <Building className="w-7 h-7 text-[#003087]" />
              </div>
              <h3 className="text-2xl font-bold text-[#003087] mb-2">
                Client &amp; Company Portal
              </h3>
              <p className="text-gray-600 mb-8 leading-relaxed text-sm">
                Post briefs, review proposals &amp; manage milestone escrow to protect project capital automatically.
              </p>
              <ul className="space-y-4 mb-10">
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#003087] shrink-0 mt-0.5" />
                  <span><strong>Configurable Milestones:</strong> Define custom percentages and multi-currency budgets.</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#003087] shrink-0 mt-0.5" />
                  <span><strong>AI-Assisted Shortlist:</strong> Select applicants manually or review top curated picks.</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#003087] shrink-0 mt-0.5" />
                  <span><strong>Objective Inspection:</strong> Automated quality gates for code, assets, and documents.</span>
                </li>
              </ul>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={isAuthenticated ? "/client/dashboard?tab=post" : "/auth/login"}
                  id="portal-post-project"
                  className="bg-[#003087] hover:bg-[#00205c] text-white px-6 py-2.5 rounded-full text-sm font-bold transition-colors"
                >
                  Post a Project
                </Link>
                <Link
                  href={isAuthenticated ? "/client/dashboard?tab=proposals" : "/auth/signup"}
                  id="portal-review-inbox"
                  className="bg-white border border-gray-200 hover:border-gray-300 text-gray-700 px-6 py-2.5 rounded-full text-sm font-bold transition-colors"
                >
                  {isAuthenticated ? "Review Inbox" : "Join as Client"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────
          3. HOW IT WORKS
      ───────────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-[#F5F7FA] scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#003087] mb-4">
              How It Works
            </h2>
            <p className="text-gray-500 text-base max-w-xl mx-auto">
              The four-stage milestone escrow workflow from kickoff to payout.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {/* Connector line (Desktop only) */}
            <div className="hidden lg:block absolute top-1/2 left-0 w-full h-px bg-blue-100 -z-0" />

            {/* Step 1 */}
            <div className="relative bg-white p-8 rounded-2xl border border-gray-100 z-10 card-hover">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#0070E0] font-bold text-sm mb-6">
                01
              </div>
              <h4 className="font-bold text-[#003087] mb-2 text-base">Post Project</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Client specifies project requirements, budget, currency, and custom milestones.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative bg-white p-8 rounded-2xl border border-gray-100 z-10 card-hover">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#0070E0] font-bold text-sm mb-6">
                02
              </div>
              <h4 className="font-bold text-[#003087] mb-2 text-base">Select Talent</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Freelancers apply with trust profiles. Clients choose candidates manually or via AI matches.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative bg-white p-8 rounded-2xl border border-gray-100 z-10 card-hover">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#0070E0] font-bold text-sm mb-6">
                03
              </div>
              <h4 className="font-bold text-[#003087] mb-2 text-base">Work Through Milestones</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Freelancers execute sequentially and upload deliverables for the active step.
              </p>
            </div>

            {/* Step 4 */}
            <div className="relative bg-white p-8 rounded-2xl border border-gray-100 z-10 card-hover">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#0070E0] font-bold text-sm mb-6">
                04
              </div>
              <h4 className="font-bold text-[#003087] mb-2 text-base">Review &amp; Release</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Advisory verification inspects compliance. Clients approve, releasing funds instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────
          4. PLATFORM CAPABILITIES
      ───────────────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-white scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#003087] mb-4">
                Platform Capabilities
              </h2>
              <p className="text-gray-500 text-base max-w-xl">
                Core architectural features powering the TrustPay ecosystem.
              </p>
            </div>
            <a
              href="#escrow"
              id="view-all-capabilities"
              className="text-[#0070E0] font-bold text-sm flex items-center gap-1 hover:underline"
            >
              <span>View all technical specs</span>
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Cap 1 */}
            <div className="p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-purple-200 transition-colors group card-hover bg-white">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 mb-6 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Smart Recommendations</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Domain-specific matching that analyzes portfolios and delivery records to recommend top-fit candidates.
              </p>
            </div>

            {/* Cap 2 */}
            <div className="p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-blue-200 transition-colors group card-hover bg-white">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-[#0070E0] mb-6 group-hover:scale-110 transition-transform">
                <Layers className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Milestone Escrow Workflow</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Project capital is held in escrow upfront. Sequential steps unlock only when criteria are met.
              </p>
            </div>

            {/* Cap 3 */}
            <div className="p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-emerald-200 transition-colors group card-hover bg-white">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Advisory Verification</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Submissions are pre-checked for criteria adherence and vulnerability scans before human review.
              </p>
            </div>

            {/* Cap 4 */}
            <div className="p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-amber-200 transition-colors group card-hover bg-white">
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 mb-6 group-hover:scale-110 transition-transform">
                <Scale className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Transparent Resolution</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                If expectations diverge, parties submit structured evidence for objective settlement recommendations.
              </p>
            </div>

            {/* Cap 5 */}
            <div className="p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-teal-200 transition-colors group card-hover bg-white">
              <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600 mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Performance Scorecards</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Algorithmic reputation calculated from real milestone completions and compliance scores.
              </p>
            </div>

            {/* Cap 6 */}
            <div className="p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-rose-200 transition-colors group card-hover bg-white">
              <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 mb-6 group-hover:scale-110 transition-transform">
                <Lock className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Quality Assurance</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Integrated code linting and asset validation to ensure deliverables meet project standards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────
          5. ESCROW PROCESS DETAILED PREVIEW
      ───────────────────────────────────────────────────────────────── */}
      <section id="escrow" className="py-24 bg-[#F5F7FA] scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-[#0070E0] text-xs font-bold mb-4">
              <Zap className="w-3.5 h-3.5" />
              Live Escrow Demonstration
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#003087] mb-4">
              Milestone Escrow Workflow
            </h2>
            <p className="text-gray-500 text-base max-w-xl mx-auto">
              Transparent, step-by-step capital security with human sign-off authority and advisory AI inspection.
            </p>
          </div>

          {/* Escrow Details Card */}
          <div className="bg-white rounded-3xl border border-gray-200 p-8 sm:p-10 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-8 border-b border-gray-100 gap-4">
              <div>
                <span className="text-xs uppercase tracking-widest font-bold text-gray-400">
                  {isAuthenticated && activeContract?.id ? "Current Project In Escrow" : "Sample Escrow Workflow"}
                </span>
                <h3 className="text-2xl font-bold text-[#003087] mt-1">{previewContract.projectTitle}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Contract ID: <span className="font-mono text-gray-700">{previewContract.id}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  {isAuthenticated && activeContract?.id ? (
                    <>
                      <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider block">Total Escrow Vault</span>
                      <span className="text-2xl font-extrabold text-[#003087]">
                        {formatCurrency(previewContract.totalBudget, previewContract.currency)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider block">Escrow Protection</span>
                      <span className="text-sm font-bold text-[#0070E0]">
                        Sign in to view live balances
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Stepper with progress */}
            <div className="py-8 border-b border-gray-100">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-2">
                <span>Fund Settlement Progress</span>
                <span className="text-[#0070E0]">
                  {isAuthenticated && activeContract?.id
                    ? `${formatCurrency(previewContract.releasedAmount, previewContract.currency)} of ${formatCurrency(previewContract.totalBudget, previewContract.currency)} Released`
                    : `${progressPct}% Milestone Progress`}
                </span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#0070E0] to-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPct}%`,
                  }}
                />
              </div>
            </div>

            {/* Milestone Cards Grid */}
            <div className="pt-8">
              <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-6">
                Milestone Execution Steps
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {previewContract.milestones.map((ms) => {
                  const statusInfo = getMilestoneStatusInfo(ms.status);
                  return (
                    <div
                      key={ms.id}
                      className={`p-6 rounded-2xl border transition-all ${
                        ms.status === "ACTIVE"
                          ? "border-[#0070E0] bg-blue-50/20 ring-1 ring-[#0070E0] shadow-sm"
                          : ms.status === "RELEASED"
                          ? "border-emerald-200 bg-emerald-50/20"
                          : "border-gray-200 bg-gray-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-400">Step {ms.stepNumber}</span>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            ms.status === "RELEASED"
                              ? "bg-emerald-100 text-emerald-800"
                              : ms.status === "ACTIVE"
                              ? "bg-blue-100 text-[#0070E0]"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      <h5 className="font-bold text-gray-900 text-base mb-1">{ms.title}</h5>
                      <p className="text-xs text-gray-500 leading-relaxed mb-4">{ms.description}</p>

                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                        <span className="font-extrabold text-[#003087]">
                          {isAuthenticated && activeContract?.id
                            ? formatCurrency(ms.paymentAmount, ms.currency)
                            : `${previewContract.totalBudget > 0 ? Math.round((ms.paymentAmount / previewContract.totalBudget) * 100) : 0}% Milestone Share`}
                        </span>
                        <span className="text-gray-400 font-medium">Due {formatDate(ms.deadline)}</span>
                      </div>

                      {ms.submission?.aiVerificationReport && (
                        <div className="mt-4 p-3 rounded-xl bg-purple-50/80 border border-purple-200 text-xs text-purple-900 space-y-1">
                          <div className="flex items-center justify-between font-bold">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                              AI Advisory Check
                            </span>
                            <span className="text-purple-700">{ms.submission.aiVerificationReport.overallScore}%</span>
                          </div>
                          <p className="text-[11px] text-purple-700">
                            Grade {ms.submission.aiVerificationReport.qualityGrade} • Advisory only, human approval required
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────
          6. NEWSLETTER / CALL TO ACTION
      ───────────────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto bg-[#003087] rounded-[2.5rem] p-10 sm:p-14 md:p-20 text-center text-white relative overflow-hidden shadow-2xl">
          {/* Subtle Background Circles */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full -ml-32 -mb-32" />

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-6 sm:mb-8 tracking-tight">
            Ready to build with total confidence?
          </h2>

          <p className="text-base sm:text-lg text-blue-100/90 mb-10 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
            Join 10,000+ businesses and verified freelancers using TrustPay to secure their professional collaborations.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              id="cta-get-started"
              className="btn-shadow bg-[#0070E0] hover:bg-[#005bb8] text-white px-8 sm:px-10 py-4 rounded-full font-bold text-base transition-all w-full sm:w-auto"
            >
              Get Started
            </Link>

            <Link
              href="/auth/login"
              id="cta-account-login"
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 sm:px-10 py-4 rounded-full font-bold text-base transition-all w-full sm:w-auto"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
