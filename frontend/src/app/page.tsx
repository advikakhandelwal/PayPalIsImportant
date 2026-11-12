"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
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
  Scale,
  BarChart3,
  MessageSquare,
  FileCheck,
  Zap,
  Layers,
} from "lucide-react";

export default function HomePage() {
  const { activeRole, currentUser, isAuthenticated, isHydrated } = useAuth();
  const { activeContract } = useMarketplace();
  const [selectedPortal, setSelectedPortal] = useState<"CLIENT" | "FREELANCER">("CLIENT");
  const [demoStep, setDemoStep] = useState<number>(2);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // Smooth scroll-driven colour transitions across homepage sections using TrustPay AI palette
      const transitions: Array<{ selector: string; color: string }> = [
        { selector: "#about", color: "#E9FBF8" },
        { selector: "#escrow", color: "#DFF7FA" },
        { selector: "#how-it-works", color: "#FFF2F5" },
        { selector: "#features", color: "#F2EBEE" },
      ];

      transitions.forEach(({ selector, color }) => {
        const el = pageRef.current?.querySelector(selector);
        if (!el || !pageRef.current) return;
        gsap.to(pageRef.current, {
          backgroundColor: color,
          duration: 0.9,
          ease: "power2.out",
          scrollTrigger: {
            trigger: el,
            start: "top 65%",
            end: "bottom 35%",
            toggleActions: "play reverse play reverse",
          },
        });
      });

      // Continuous subtle ambient glow colour shift on hero orbs
      gsap.to(".hero-glow-cyan", {
        backgroundColor: "rgba(157, 249, 239, 0.40)",
        scale: 1.08,
        duration: 4.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
      gsap.to(".hero-glow-rose", {
        backgroundColor: "rgba(162, 128, 137, 0.28)",
        scale: 1.1,
        duration: 5.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }, pageRef);

    return () => ctx.revert();
  }, []);

  const canBrowseFreelancer = isAuthenticated && currentUser.role === "FREELANCER";
  const canBrowseClient = isAuthenticated && currentUser.role === "CLIENT";

  const hasLiveContract = Boolean(isAuthenticated && activeContract && activeContract.id);

  const sampleMilestones = [
    {
      id: "sample-1",
      stepNumber: 1,
      title: "Architecture & Spec Lock",
      description: "System schema, PayPal Orders v2 authorization & milestone sign-off.",
      paymentAmount: 900,
      currency: "USD",
      deadline: "2026-12-01T00:00:00Z",
      status: (demoStep >= 1 ? "RELEASED" : "ACTIVE") as "RELEASED" | "ACTIVE" | "LOCKED",
    },
    {
      id: "sample-2",
      stepNumber: 2,
      title: "Core Implementation & AI Audit",
      description: "Deliverable submitted for Gemini AI audit and requirement verification.",
      paymentAmount: 1200,
      currency: "USD",
      deadline: "2026-12-10T00:00:00Z",
      status: (demoStep >= 3 ? "RELEASED" : demoStep === 2 ? "ACTIVE" : "LOCKED") as "RELEASED" | "ACTIVE" | "LOCKED",
    },
    {
      id: "sample-3",
      stepNumber: 3,
      title: "Final Release & Settlement",
      description: "Final milestone captured via PayPal and reputation scorecard updated.",
      paymentAmount: 900,
      currency: "USD",
      deadline: "2026-12-20T00:00:00Z",
      status: (demoStep >= 4 ? "RELEASED" : demoStep === 3 ? "ACTIVE" : "LOCKED") as "RELEASED" | "ACTIVE" | "LOCKED",
    },
  ];

  const sampleReleased = sampleMilestones
    .filter((m) => m.status === "RELEASED")
    .reduce((sum, m) => sum + m.paymentAmount, 0);

  const previewContract = hasLiveContract
    ? activeContract
    : {
        id: "TP-ESCROW-2026",
        projectTitle: "Interactive Milestone Escrow Architecture",
        totalBudget: 3000,
        releasedAmount: sampleReleased,
        currency: "USD",
        escrowStatus: (sampleReleased >= 3000 ? "COMPLETED" : "PARTIALLY_RELEASED") as
          | "COMPLETED"
          | "PARTIALLY_RELEASED",
        milestones: sampleMilestones,
      };

  const escrowStatusInfo = getEscrowStatusInfo(previewContract.escrowStatus);
  const progressPct =
    previewContract.totalBudget > 0
      ? Math.round((previewContract.releasedAmount / previewContract.totalBudget) * 100)
      : 0;

  return (
    <div ref={pageRef} className="min-h-screen bg-[#EDF7F6] flex flex-col overflow-x-hidden transition-colors">
      {/* 1. HERO SECTION */}
      <section id="home" className="relative pt-14 pb-20 lg:pt-20 lg:pb-28 border-b border-[#A28089]/20 hero-gradient">
        {/* Ambient Mesh Glows */}
        <div className="hero-glow-cyan pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#51E2F5]/25 blur-3xl" />
        <div className="hero-glow-rose pointer-events-none absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-[#FFA8B6]/25 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 border border-[#A28089]/25 text-xs font-bold text-[#1E1820] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#51E2F5] animate-pulse" />
              <span>PayPal Orders v2 Escrow · Gemini AI Verification</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-[#1E1820] leading-[1.06]">
              Hire &amp; get paid with{" "}
              <span className="relative inline-block">
                <span className="relative z-10">zero-trust</span>
                <span className="absolute left-0 bottom-1 w-full h-3.5 bg-[#51E2F5]/65 -z-0 rounded-sm" />
              </span>{" "}
              milestone escrow.
            </h1>

            <p className="text-base sm:text-lg text-[#5C4B51] leading-relaxed max-w-xl">
              TrustPay AI locks project funds upfront in PayPal escrow, shortlists talent from real PDF &amp; DOCX resumes with Gemini AI, and releases payouts partwise as deliverables pass review.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {isHydrated && isAuthenticated ? (
                <Link
                  href={activeRole === "CLIENT" ? "/client/dashboard" : "/freelancer/dashboard"}
                  className="btn-shadow inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#51E2F5] hover:bg-[#3ad3e8] text-[#1E1820] font-bold text-sm transition-all"
                >
                  <span>Open {activeRole === "CLIENT" ? "Client" : "Freelancer"} Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/auth/signup"
                    className="btn-shadow inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#51E2F5] hover:bg-[#3ad3e8] text-[#1E1820] font-bold text-sm transition-all"
                  >
                    <span>Start Free Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#1E1820] hover:bg-[#312834] text-[#EDF7F6] font-bold text-sm transition-all"
                  >
                    <span>Log In</span>
                  </Link>
                </>
              )}
              <a
                href="#escrow"
                className="inline-flex items-center gap-1.5 px-5 py-3.5 rounded-full border border-[#A28089]/35 bg-white/80 hover:bg-white text-[#1E1820] font-semibold text-sm transition-all"
              >
                <span>Explore Escrow Flow</span>
              </a>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-[#A28089]/20 max-w-lg">
              <div>
                <p className="font-display text-2xl font-bold text-[#1E1820]">100%</p>
                <p className="text-xs text-[#5C4B51]">Upfront Escrow Lock</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-[#1E1820]">PDF · DOCX</p>
                <p className="text-xs text-[#5C4B51]">Full-Screen Dossier</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-[#1E1820]">Gemini AI</p>
                <p className="text-xs text-[#5C4B51]">Shortlist &amp; Mediation</p>
              </div>
            </div>
          </div>

          {/* Right Hero Visual with Floating Glass Micro-Cards */}
          <div className="lg:col-span-6 relative">
            <div className="relative rounded-3xl overflow-hidden border border-[#A28089]/25 bg-white shadow-elegant p-3">
              <img
                src="/images/hero-escrow.jpg"
                alt="TrustPay AI milestone escrow architecture"
                className="w-full h-auto rounded-2xl object-cover"
              />

              {/* Bottom Feature Strip inside Hero Card */}
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-[#EDF7F6] border border-[#9DF9EF] flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#1E1820] text-[#51E2F5] flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-[#1E1820]">PayPal Escrow Engine</p>
                    <p className="text-[11px] text-[#5C4B51]">Orders v2 &amp; Payouts API</p>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#FFA8B6]/20 border border-[#FFA8B6]/60 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FFA8B6] text-[#1E1820] flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-[#1E1820]">AI Candidate Fit</p>
                    <p className="text-[11px] text-[#5C4B51]">Resume, skills &amp; proposal match</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. INTERACTIVE DUAL PORTAL SHOWCASE */}
      <section id="about" className="py-20 bg-transparent border-b border-[#A28089]/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-3">
              <span className="inline-block px-3 py-1 rounded-full bg-[#9DF9EF]/55 text-[#1E1820] text-xs font-bold uppercase tracking-wider">
                Two Purpose-Built Portals
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#1E1820]">
                One unified platform for Clients &amp; Freelancers.
              </h2>
            </div>

            {/* Interactive Portal Switcher */}
            <div className="inline-flex p-1.5 rounded-full bg-[#EDF7F6] border border-[#A28089]/25 self-start">
              <button
                type="button"
                onClick={() => setSelectedPortal("CLIENT")}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedPortal === "CLIENT"
                    ? "bg-[#1E1820] text-[#EDF7F6] shadow-xs"
                    : "text-[#5C4B51] hover:text-[#1E1820]"
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>For Clients</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPortal("FREELANCER")}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedPortal === "FREELANCER"
                    ? "bg-[#51E2F5] text-[#1E1820] shadow-xs"
                    : "text-[#5C4B51] hover:text-[#1E1820]"
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>For Freelancers</span>
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-[#A28089]/25 bg-[#EDF7F6]/65 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-xs">
            <div className="lg:col-span-6 space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#A28089]/20 text-xs font-bold text-[#1E1820]">
                {selectedPortal === "CLIENT" ? (
                  <>
                    <Building className="w-3.5 h-3.5 text-[#0EA5B7]" />
                    <span>Client Command Center</span>
                  </>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5 text-[#0EA5B7]" />
                    <span>Freelancer Delivery Workspace</span>
                  </>
                )}
              </div>

              <h3 className="font-display text-2xl sm:text-3xl font-bold text-[#1E1820]">
                {selectedPortal === "CLIENT"
                  ? "Post scoped projects, inspect full CVs, and fund milestones safely."
                  : "Apply with your resume, verify escrow upfront, and track every payout."}
              </h3>

              <ul className="space-y-3 text-sm text-[#5C4B51]">
                {(selectedPortal === "CLIENT"
                  ? [
                      "Strict per-client project isolation and PayPal Orders v2 escrow funding",
                      "Full-screen Candidate Dossier with inline PDF/DOCX preview & Gemini AI ranking",
                      "Approve deliverables partwise, request revisions, or trigger early settlement",
                    ]
                  : [
                      "Upload once or attach a new resume per application with automatic skill extraction",
                      "Never start unpaid work — Milestone 1 unlocks only after client PayPal authorization",
                      "Unified Messages inbox, shared Dispute Resolution, and downloadable Earnings Report",
                    ]
                ).map((point) => (
                  <li key={point} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-[#0EA5B7] shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-2">
                <Link
                  href={
                    selectedPortal === "CLIENT"
                      ? canBrowseClient
                        ? "/client/dashboard"
                        : "/auth/signup"
                      : canBrowseFreelancer
                      ? "/freelancer/dashboard"
                      : "/auth/signup"
                  }
                  className="btn-shadow inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#51E2F5] hover:bg-[#3ad3e8] text-[#1E1820] text-xs font-bold transition-all"
                >
                  <span>
                    {selectedPortal === "CLIENT"
                      ? canBrowseClient
                        ? "Open Client Dashboard"
                        : "Sign Up as Client"
                      : canBrowseFreelancer
                      ? "Open Freelancer Dashboard"
                      : "Sign Up as Freelancer"}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-2xl overflow-hidden border border-[#A28089]/25 bg-white p-2.5 shadow-elegant">
                <img
                  src={selectedPortal === "CLIENT" ? "/images/client-escrow.jpg" : "/images/freelancer-workspace.jpg"}
                  alt={selectedPortal === "CLIENT" ? "Client Escrow Dashboard" : "Freelancer Workspace"}
                  className="w-full h-64 sm:h-72 object-cover rounded-xl"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE ESCROW PROTOCOL SIMULATOR */}
      <section id="escrow" className="py-20 bg-transparent border-b border-[#A28089]/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <span className="inline-block px-3 py-1 rounded-full bg-[#FFA8B6]/35 text-[#1E1820] text-xs font-bold uppercase tracking-wider">
                Escrow Architecture
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#1E1820]">
                Step-by-step milestone settlement.
              </h2>
              <p className="text-sm text-[#5C4B51]">
                {hasLiveContract
                  ? "Live preview of your current active contract."
                  : "Select any stage below to preview how escrow funds release milestone by milestone."}
              </p>
            </div>

            {!hasLiveContract && (
              <div className="inline-flex items-center gap-1.5 p-1 rounded-full bg-white border border-[#A28089]/25 self-start">
                {[1, 2, 3, 4].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setDemoStep(st)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      demoStep === st
                        ? "bg-[#1E1820] text-[#51E2F5]"
                        : "text-[#5C4B51] hover:text-[#1E1820]"
                    }`}
                  >
                    {st === 4 ? "All Settled" : `Step ${st}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white border border-[#A28089]/25 shadow-elegant p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EDF7F6] pb-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#A28089]">
                  {hasLiveContract ? "ACTIVE CONTRACT" : "LIVE MILESTONE ESCROW WORKFLOW"}
                </span>
                <h3 className="font-display text-xl sm:text-2xl font-bold text-[#1E1820] mt-0.5">
                  {previewContract.projectTitle}
                </h3>
                <p className="text-xs text-[#5C4B51] font-mono mt-1">
                  Contract ID: {previewContract.id} · Status: {escrowStatusInfo.label}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#A28089] block">
                  Total Escrow Vault
                </span>
                <span className="font-display text-3xl font-bold text-[#1E1820]">
                  {formatCurrency(previewContract.totalBudget, previewContract.currency)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-[#5C4B51]">Fund Settlement Progress</span>
                <span className="text-[#1E1820]">
                  {formatCurrency(previewContract.releasedAmount, previewContract.currency)} of{" "}
                  {formatCurrency(previewContract.totalBudget, previewContract.currency)} Released ({progressPct}%)
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-[#EDF7F6] border border-[#A28089]/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#51E2F5] via-[#9DF9EF] to-[#FFA8B6] transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {previewContract.milestones.map((ms) => {
                const st = getMilestoneStatusInfo(ms.status);
                return (
                  <div
                    key={ms.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      ms.status === "ACTIVE"
                        ? "border-[#51E2F5] bg-[#EDF7F6]/80 ring-1 ring-[#51E2F5]"
                        : ms.status === "RELEASED"
                        ? "border-emerald-200 bg-emerald-50/45"
                        : "border-[#A28089]/20 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#5C4B51]">Step {ms.stepNumber}</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#EDF7F6] text-[#1E1820] border border-[#A28089]/25">
                        {st.label}
                      </span>
                    </div>
                    <h4 className="font-display font-bold text-sm text-[#1E1820] mb-1">{ms.title}</h4>
                    <p className="text-xs text-[#5C4B51] line-clamp-2 mb-4">{ms.description}</p>
                    <div className="flex items-center justify-between text-xs pt-3 border-t border-[#EDF7F6]">
                      <span className="font-bold text-[#1E1820]">
                        {formatCurrency(ms.paymentAmount, ms.currency)}
                      </span>
                      <span className="text-[#A28089]">Due {formatDate(ms.deadline)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section id="how-it-works" className="py-20 bg-transparent border-b border-[#A28089]/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-2xl space-y-3">
            <span className="inline-block px-3 py-1 rounded-full bg-[#9DF9EF]/55 text-[#1E1820] text-xs font-bold uppercase tracking-wider">
              How It Works
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#1E1820]">
              Four transparent steps from brief to payout.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Post & Scope", desc: "Define project deliverables and split the budget into verifiable milestones." },
              { step: "02", title: "AI Shortlisting", desc: "Inspect full-screen PDF/DOCX CVs ranked by skills, experience, and proposal fit." },
              { step: "03", title: "Lock PayPal Escrow", desc: "Authorize escrow upfront via PayPal Checkout before work begins." },
              { step: "04", title: "Verify & Release", desc: "Audit submissions with Gemini AI and release payouts or settle disputes cleanly." },
            ].map((item) => (
              <div key={item.step} className="p-6 rounded-2xl border border-[#A28089]/25 bg-[#EDF7F6]/45 space-y-3 card-hover">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#1E1820] text-[#51E2F5] font-display font-bold text-sm">
                  {item.step}
                </span>
                <h3 className="font-display font-bold text-lg text-[#1E1820]">{item.title}</h3>
                <p className="text-xs text-[#5C4B51] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. BENTO CAPABILITIES GRID */}
      <section id="features" className="py-20 bg-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-2xl space-y-3">
            <span className="inline-block px-3 py-1 rounded-full bg-[#FFA8B6]/35 text-[#1E1820] text-xs font-bold uppercase tracking-wider">
              Platform Capabilities
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#1E1820]">
              Built for high-assurance freelance delivery.
            </h2>
          </div>

          {/* Integrated Ecosystem & Sponsor Strip */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/90 border border-[#A28089]/20 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#A28089] shrink-0">
              Powered By &amp; Integrated With
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              {[
                { name: "PayPal Orders v2 & Payouts", tone: "bg-[#9DF9EF]/50 border-[#51E2F5]/60 text-[#1E1820]" },
                { name: "Google Gemini AI", tone: "bg-[#FFA8B6]/30 border-[#FFA8B6]/70 text-[#1E1820]" },
                { name: "Zapier Webhooks", tone: "bg-[#EDF7F6] border-[#A28089]/30 text-[#1E1820]" },
                { name: "AG Grid Ledger", tone: "bg-[#EDF7F6] border-[#A28089]/30 text-[#1E1820]" },
                { name: "Render Cloud", tone: "bg-[#1E1820] border-[#1E1820] text-[#51E2F5]" },
              ].map((partner) => (
                <span
                  key={partner.name}
                  className={`px-3.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap ${partner.tone}`}
                >
                  {partner.name}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: ShieldCheck,
                title: "PayPal Orders v2 Escrow",
                desc: "Authorize upfront, capture partwise, and trigger refunds directly back to the client's funding source.",
                accent: "bg-[#1E1820] text-[#51E2F5]",
              },
              {
                icon: FileCheck,
                title: "Full-Screen CV Dossier",
                desc: "Inline PDF, DOCX, and TXT resume previews with automatic education and skill extraction.",
                accent: "bg-[#9DF9EF] text-[#1E1820]",
              },
              {
                icon: Sparkles,
                title: "Gemini AI Evaluation",
                desc: "Multimodal resume analysis, deliverable metadata inspection, and AI-assisted dispute mediation.",
                accent: "bg-[#FFA8B6]/60 text-[#1E1820]",
              },
              {
                icon: MessageSquare,
                title: "Unified Messages & Alerts",
                desc: "Centralized cross-device inbox and SQLite-backed notifications for every contract event.",
                accent: "bg-[#51E2F5]/45 text-[#1E1820]",
              },
              {
                icon: Scale,
                title: "Disputes & Early Settlement",
                desc: "Shared dispute threads visible to both sides plus mutual early-settlement escrow splits.",
                accent: "bg-[#9DF9EF] text-[#1E1820]",
              },
              {
                icon: BarChart3,
                title: "AG Grid Ledger & Zapier",
                desc: "Exportable transaction audit grid, Zapier webhook dispatch, and Postman API collection.",
                accent: "bg-[#1E1820] text-[#FFA8B6]",
              },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title} className="p-6 rounded-2xl bg-white border border-[#A28089]/20 shadow-2xs space-y-3 card-hover">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${feat.accent}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display font-bold text-base text-[#1E1820]">{feat.title}</h3>
                  <p className="text-xs text-[#5C4B51] leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. DARK EDITORIAL CTA BANNER */}
      <section className="relative py-20 bg-[#1E1820] text-[#EDF7F6] overflow-hidden">
        <div className="pointer-events-none absolute top-0 right-0 w-80 h-80 rounded-full bg-[#51E2F5]/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-80 h-80 rounded-full bg-[#FFA8B6]/15 blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-[#9DF9EF]">
            <Zap className="w-3.5 h-3.5 text-[#51E2F5]" />
            <span>Ready in 60 Seconds</span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold">
            Ready to build with protected milestone escrow?
          </h2>
          <p className="text-sm sm:text-base text-[#EDF7F6]/75 max-w-xl mx-auto">
            Create a Client or Freelancer account and manage projects, CVs, messages, disputes, and PayPal payouts from one cohesive workspace.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#51E2F5] hover:bg-[#3ad3e8] text-[#1E1820] font-bold text-sm transition-all"
            >
              <span>Create Account</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-[#A28089]/50 text-[#EDF7F6] hover:bg-white/10 font-bold text-sm transition-all"
            >
              <span>Log In</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
