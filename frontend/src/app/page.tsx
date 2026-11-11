"use client";

import React, { useEffect, useRef } from "react";
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
  const { activeRole, setActiveRole, toggleRole, isHydrated } = useAuth();
  const { activeContract } = useMarketplace();
  const mainContainerRef = useRef<HTMLDivElement>(null);

  const escrowStatusInfo = getEscrowStatusInfo(activeContract.escrowStatus);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // 1. Hero Entrance Timeline (Visible, smooth entrance on page load)
      const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });

      heroTl
        .fromTo(
          ".gsap-hero-badge",
          { opacity: 0, y: -24, scale: 0.9 },
          { opacity: 1, y: 0, scale: 1, duration: 0.8 }
        )
        .fromTo(
          ".gsap-hero-title",
          { opacity: 0, y: 45 },
          { opacity: 1, y: 0, duration: 0.9 },
          "-=0.45"
        )
        .fromTo(
          ".gsap-hero-sub",
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.8 },
          "-=0.45"
        )
        .fromTo(
          ".gsap-hero-cta",
          { opacity: 0, y: 30, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.15, ease: "back.out(1.4)" },
          "-=0.35"
        )
        .fromTo(
          ".gsap-hero-metrics > div",
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: "power2.out" },
          "-=0.25"
        );

      // 2. Hero Gentle Floating Ambient Elements (continuous loop)
      gsap.to(".gsap-float-1", {
        y: -30,
        x: 18,
        duration: 5.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
      gsap.to(".gsap-float-2", {
        y: 28,
        x: -20,
        duration: 6.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      // 3. Marketplace Portals Section ScrollTrigger
      gsap.fromTo(
        ".gsap-portals-header",
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".gsap-portals-header",
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        }
      );

      gsap.fromTo(
        ".gsap-portal-card",
        { opacity: 0, y: 55, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.85,
          stagger: 0.2,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".gsap-portals-grid",
            start: "top 82%",
            toggleActions: "play none none reverse",
          },
        }
      );

      // 4. How It Works Section ScrollTrigger
      gsap.fromTo(
        ".gsap-how-header",
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".gsap-how-header",
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        }
      );

      // Animated connector line across the steps
      gsap.fromTo(
        ".gsap-how-line",
        { scaleX: 0, transformOrigin: "left center" },
        {
          scaleX: 1,
          duration: 1.1,
          ease: "power2.inOut",
          scrollTrigger: {
            trigger: ".gsap-how-grid",
            start: "top 78%",
            toggleActions: "play none none reverse",
          },
        }
      );

      // Sequential Step Cards
      gsap.fromTo(
        ".gsap-step-card",
        { opacity: 0, y: 50, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.75,
          stagger: 0.16,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".gsap-how-grid",
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        }
      );

      // 5. Platform Capabilities Section ScrollTrigger
      gsap.fromTo(
        ".gsap-features-header",
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".gsap-features-header",
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        }
      );

      // 6 Feature cards staggered ripple
      gsap.fromTo(
        ".gsap-feature-card",
        { opacity: 0, y: 45, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.65,
          stagger: 0.12,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".gsap-features-grid",
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        }
      );

      // 6. Escrow Process Detailed Preview ScrollTrigger
      gsap.fromTo(
        ".gsap-escrow-header",
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".gsap-escrow-header",
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        }
      );

      gsap.fromTo(
        ".gsap-escrow-card",
        { opacity: 0, y: 50, scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.85,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".gsap-escrow-card",
            start: "top 82%",
            toggleActions: "play none none reverse",
          },
        }
      );

      // Progress bar fill animation
      const targetPct = Math.round((activeContract.releasedAmount / activeContract.totalBudget) * 100);
      gsap.fromTo(
        ".gsap-progress-fill",
        { width: "0%" },
        {
          width: `${targetPct}%`,
          duration: 1.3,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".gsap-escrow-card",
            start: "top 75%",
            toggleActions: "play none none reverse",
          },
        }
      );

      // Milestone Step cards in escrow preview
      gsap.fromTo(
        ".gsap-milestone-step",
        { opacity: 0, y: 40, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.7,
          stagger: 0.15,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".gsap-milestone-grid",
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        }
      );

      // 7. Final Call to Action Section ScrollTrigger
      gsap.fromTo(
        ".gsap-cta-card",
        { opacity: 0, y: 50, scale: 0.94 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.85,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".gsap-cta-card",
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        }
      );

      // Metric Counter Animation for 10,000+ businesses
      const counterObj = { count: 0 };
      const counterEl = document.querySelector(".gsap-counter-stat");
      if (counterEl) {
        gsap.to(counterObj, {
          count: 10000,
          duration: 1.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".gsap-cta-card",
            start: "top 85%",
            toggleActions: "play none none none",
          },
          onUpdate: () => {
            counterEl.textContent = Math.floor(counterObj.count).toLocaleString() + "+";
          },
        });
      }

      // 8. Footer Section ScrollTrigger
      gsap.fromTo(
        ".gsap-footer-col",
        { opacity: 0, y: 35 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: "footer",
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, mainContainerRef);

    // Refresh ScrollTrigger after DOM reflow
    const refreshTimer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 150);

    return () => {
      clearTimeout(refreshTimer);
      ctx.revert();
    };
  }, [activeContract.releasedAmount, activeContract.totalBudget]);

  return (
    <div ref={mainContainerRef} className="min-h-screen bg-white flex flex-col">
      {/* ─────────────────────────────────────────────────────────────────
          1. HERO SECTION
      ───────────────────────────────────────────────────────────────── */}
      <section id="home" className="fintech-hero-gradient pt-20 sm:pt-24 pb-28 sm:pb-32 px-4 sm:px-6 overflow-hidden relative scroll-mt-24 border-b border-[#E5ECF6]">
        {/* Subtle Floating Ambient Glow Orbs */}
        <div className="absolute top-1/4 left-8 w-72 h-72 bg-[#087EAA]/8 rounded-full blur-3xl pointer-events-none gsap-float-1" />
        <div className="absolute top-1/3 right-8 w-80 h-80 bg-[#16A6A1]/8 rounded-full blur-3xl pointer-events-none gsap-float-2" />

        <div className="max-w-7xl mx-auto flex flex-col items-center text-center relative z-10">
          {/* Badge */}
          <div className="gsap-hero-badge inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-xs border border-[#CDE1F4] shadow-xs mb-6 sm:mb-8">
            <span className="flex h-2 w-2 rounded-full bg-[#16A6A1] animate-pulse" />
            <span className="text-xs font-bold text-[#087EAA] tracking-wider uppercase">
              Next-Gen Milestone Security
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="gsap-hero-title text-4xl sm:text-6xl md:text-7xl font-extrabold text-[#073B68] tracking-tight mb-6 max-w-4xl leading-[1.1]">
            TrustPay Escrow
          </h1>

          {/* Subtitle */}
          <p className="gsap-hero-sub text-base sm:text-lg text-[#4A5D73] max-w-2xl leading-relaxed mb-8 sm:mb-10 font-normal">
            An autonomous milestone escrow marketplace bridging companies with verified freelancers.
            Funds are held safely in escrow upfront and released step-by-step with intelligent advisory verification.
          </p>

          {/* Dual CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 mb-14 w-full sm:w-auto">
            <Link
              href="/freelancer/dashboard"
              onClick={() => setActiveRole("FREELANCER")}
              id="hero-cta-find"
              className="gsap-hero-cta btn-shadow bg-[#087EAA] hover:bg-[#073B68] text-white px-8 sm:px-10 py-4 rounded-full text-base sm:text-lg font-bold flex items-center justify-center gap-2 transition-all group cursor-pointer"
            >
              <Search className="w-5 h-5" />
              <span>Find Work</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/client/dashboard"
              onClick={() => setActiveRole("CLIENT")}
              id="hero-cta-hire"
              className="gsap-hero-cta bg-white border-2 border-[#D5E4F3] hover:border-[#087EAA] hover:text-[#087EAA] text-[#25364A] px-8 sm:px-10 py-4 rounded-full text-base sm:text-lg font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <PlusCircle className="w-5 h-5 text-[#087EAA]" />
              <span>Hire Talent</span>
            </Link>
          </div>

          {/* Fintech Trust Badges Strip */}
          <div className="gsap-hero-metrics pt-4 border-t border-[#E2EEF8] flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-semibold text-[#4A5D73]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#16A6A1]" />
              <span>100% Milestone Collateralized</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#087EAA]" />
              <span>Autonomous AI Verification Gates</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#F0A44B]" />
              <span>Mutual Dispute Resolution Hub</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────
          2. MARKETPLACE PORTALS (CLIENT & FREELANCER)
      ───────────────────────────────────────────────────────────────── */}
      <section id="about" className="py-24 bg-white scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="gsap-portals-header text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#073B68] mb-3 tracking-tight">
              Marketplace Portals
            </h2>
            <p className="text-gray-500 text-base max-w-xl mx-auto">
              Dedicated workflows tailored for talent and hiring clients.
            </p>
          </div>

          <div className="gsap-portals-grid grid md:grid-cols-2 gap-8">
            {/* Freelancer Portal Card */}
            <div
              className={`gsap-portal-card group relative p-8 sm:p-10 rounded-3xl border bg-gray-50/50 card-hover transition-all ${
                isHydrated && activeRole === "FREELANCER" ? "border-[#087EAA] ring-2 ring-[#087EAA]/20 bg-[#F5FBFD]" : "border-gray-100"
              }`}
            >
              {isHydrated && activeRole === "FREELANCER" && (
                <div className="absolute top-6 right-8">
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                    Active
                  </span>
                </div>
              )}
              <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-[#087EAA] mb-6">
                <User className="w-7 h-7 text-[#087EAA]" />
              </div>
              <h3 className="text-2xl font-bold text-[#073B68] mb-2">
                Freelancer &amp; Creator Portal
              </h3>
              <p className="text-gray-600 mb-8 leading-relaxed text-sm">
                Discover gigs, submit deliverables &amp; guarantee payments with objective on-time delivery metrics.
              </p>
              <ul className="space-y-4 mb-10">
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#087EAA] shrink-0 mt-0.5" />
                  <span><strong>Domain Filtering:</strong> Specialized browse with configurable budgets.</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#087EAA] shrink-0 mt-0.5" />
                  <span><strong>Guaranteed Escrow:</strong> Never get ghosted; milestones are funded upfront.</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#087EAA] shrink-0 mt-0.5" />
                  <span><strong>Trust Scorecard:</strong> Earn badges for clean delivery and compliance.</span>
                </li>
              </ul>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/freelancer/dashboard?tab=browse"
                  onClick={() => setActiveRole("FREELANCER")}
                  id="portal-browse-projects"
                  className="bg-[#087EAA] hover:bg-[#073B68] text-white px-6 py-2.5 rounded-full text-sm font-bold transition-colors"
                >
                  Browse Projects
                </Link>
                <Link
                  href="/freelancer/dashboard?tab=profile"
                  onClick={() => setActiveRole("FREELANCER")}
                  id="portal-view-profile"
                  className="bg-white border border-gray-200 hover:border-gray-300 text-gray-700 px-6 py-2.5 rounded-full text-sm font-bold transition-colors"
                >
                  View Profile
                </Link>
              </div>
            </div>

            {/* Client Portal Card */}
            <div
              className={`gsap-portal-card group relative p-8 sm:p-10 rounded-3xl border bg-gray-50/50 card-hover transition-all ${
                isHydrated && activeRole === "CLIENT" ? "border-[#073B68] ring-2 ring-[#073B68]/20 bg-[#F5F8FC]" : "border-gray-100"
              }`}
            >
              {isHydrated && activeRole === "CLIENT" && (
                <div className="absolute top-6 right-8">
                  <span className="px-3 py-1 rounded-full bg-blue-100 text-[#073B68] text-[10px] font-bold uppercase tracking-wider">
                    Active
                  </span>
                </div>
              )}
              <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-[#073B68] mb-6">
                <Building className="w-7 h-7 text-[#073B68]" />
              </div>
              <h3 className="text-2xl font-bold text-[#073B68] mb-2">
                Client &amp; Company Portal
              </h3>
              <p className="text-gray-600 mb-8 leading-relaxed text-sm">
                Post briefs, review proposals &amp; manage milestone escrow to protect project capital automatically.
              </p>
              <ul className="space-y-4 mb-10">
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#073B68] shrink-0 mt-0.5" />
                  <span><strong>Configurable Milestones:</strong> Define custom percentages and multi-currency budgets.</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#073B68] shrink-0 mt-0.5" />
                  <span><strong>AI-Assisted Shortlist:</strong> Select applicants manually or review top curated picks.</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-[#073B68] shrink-0 mt-0.5" />
                  <span><strong>Objective Inspection:</strong> Automated quality gates for code, assets, and documents.</span>
                </li>
              </ul>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/client/dashboard?tab=post"
                  onClick={() => setActiveRole("CLIENT")}
                  id="portal-post-project"
                  className="bg-[#073B68] hover:bg-[#052847] text-white px-6 py-2.5 rounded-full text-sm font-bold transition-colors"
                >
                  Post a Project
                </Link>
                <Link
                  href="/client/dashboard?tab=applications"
                  onClick={() => setActiveRole("CLIENT")}
                  id="portal-review-inbox"
                  className="bg-white border border-gray-200 hover:border-gray-300 text-gray-700 px-6 py-2.5 rounded-full text-sm font-bold transition-colors"
                >
                  Review Inbox
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────
          3. HOW IT WORKS
      ───────────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-[#F5F8FC] scroll-mt-24 border-b border-[#E5ECF6]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="gsap-how-header text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#073B68] mb-4">
              How It Works
            </h2>
            <p className="text-gray-500 text-base max-w-xl mx-auto">
              The four-stage milestone escrow workflow from kickoff to payout.
            </p>
          </div>

          <div className="gsap-how-grid grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {/* Connector line (Desktop only) */}
            <div className="gsap-how-line hidden lg:block absolute top-1/2 left-0 w-full h-px bg-blue-200 -z-0 origin-left" />

            {/* Step 1 */}
            <div className="gsap-step-card relative bg-white p-8 rounded-2xl border border-[#E5ECF6] z-10 fintech-card">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#087EAA] font-bold text-sm mb-6">
                01
              </div>
              <h4 className="font-bold text-[#073B68] mb-2 text-base">Post Project</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Client specifies project requirements, budget, currency, and custom milestones.
              </p>
            </div>

            {/* Step 2 */}
            <div className="gsap-step-card relative bg-white p-8 rounded-2xl border border-[#E5ECF6] z-10 fintech-card">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#087EAA] font-bold text-sm mb-6">
                02
              </div>
              <h4 className="font-bold text-[#073B68] mb-2 text-base">Select Talent</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Freelancers apply with trust profiles. Clients choose candidates manually or via AI matches.
              </p>
            </div>

            {/* Step 3 */}
            <div className="gsap-step-card relative bg-white p-8 rounded-2xl border border-[#E5ECF6] z-10 fintech-card">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#087EAA] font-bold text-sm mb-6">
                03
              </div>
              <h4 className="font-bold text-[#073B68] mb-2 text-base">Work Through Milestones</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Freelancers execute sequentially and upload deliverables for the active step.
              </p>
            </div>

            {/* Step 4 */}
            <div className="gsap-step-card relative bg-white p-8 rounded-2xl border border-[#E5ECF6] z-10 fintech-card">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#087EAA] font-bold text-sm mb-6">
                04
              </div>
              <h4 className="font-bold text-[#073B68] mb-2 text-base">Review &amp; Release</h4>
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
          <div className="gsap-features-header flex flex-col md:flex-row md:items-end justify-between mb-16 gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#073B68] mb-4">
                Platform Capabilities
              </h2>
              <p className="text-gray-500 text-base max-w-xl">
                Core architectural features powering the TrustPay ecosystem.
              </p>
            </div>
            <a
              href="#escrow"
              id="view-all-capabilities"
              className="text-[#087EAA] font-bold text-sm flex items-center gap-1 hover:underline"
            >
              <span>View all technical specs</span>
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>

          <div className="gsap-features-grid grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Cap 1 */}
            <div className="gsap-feature-card p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-[#087EAA]/30 transition-all group fintech-card">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 mb-6 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Smart Recommendations</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Domain-specific matching that analyzes portfolios and delivery records to recommend top-fit candidates.
              </p>
            </div>

            {/* Cap 2 */}
            <div className="gsap-feature-card p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-[#087EAA]/30 transition-all group fintech-card">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-[#087EAA] mb-6 group-hover:scale-110 transition-transform">
                <Layers className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Milestone Escrow Workflow</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Project capital is held in escrow upfront. Sequential steps unlock only when criteria are met.
              </p>
            </div>

            {/* Cap 3 */}
            <div className="gsap-feature-card p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-[#16A6A1]/40 transition-all group fintech-card">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Advisory Verification</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Submissions are pre-checked for criteria adherence and vulnerability scans before human review.
              </p>
            </div>

            {/* Cap 4 */}
            <div className="gsap-feature-card p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-[#F0A44B]/40 transition-all group fintech-card">
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 mb-6 group-hover:scale-110 transition-transform">
                <Scale className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Transparent Resolution</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                If expectations diverge, parties submit structured evidence for objective settlement recommendations.
              </p>
            </div>

            {/* Cap 5 */}
            <div className="gsap-feature-card p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-[#16A6A1]/40 transition-all group fintech-card">
              <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600 mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Performance Scorecards</h4>
              <p className="text-sm text-gray-500 leading-relaxed">
                Algorithmic reputation calculated from real milestone completions and compliance scores.
              </p>
            </div>

            {/* Cap 6 */}
            <div className="gsap-feature-card p-6 sm:p-8 rounded-2xl border border-gray-100 hover:border-rose-300 transition-all group fintech-card">
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
          <div className="gsap-escrow-header text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EAF3FA] text-[#087EAA] text-xs font-bold mb-4">
              <Zap className="w-3.5 h-3.5" />
              Live Escrow Demonstration
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#073B68] mb-4">
              Milestone Escrow Workflow
            </h2>
            <p className="text-gray-500 text-base max-w-xl mx-auto">
              Transparent, step-by-step capital security with human sign-off authority and advisory AI inspection.
            </p>
          </div>

          {/* Escrow Details Card */}
          <div className="gsap-escrow-card bg-white rounded-3xl border border-[#E5ECF6] p-8 sm:p-10 shadow-[0_8px_30px_-4px_rgba(7,59,104,0.08)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-8 border-b border-gray-100 gap-4">
              <div>
                <span className="text-xs uppercase tracking-widest font-bold text-gray-400">Current Project In Escrow</span>
                <h3 className="text-2xl font-bold text-[#073B68] mt-1">{activeContract.projectTitle}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Contract ID: <span className="font-mono text-gray-700">{activeContract.id}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider block">Total Escrow Vault</span>
                  <span className="text-2xl font-extrabold text-[#073B68]">
                    {formatCurrency(activeContract.totalBudget, activeContract.currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Stepper with progress */}
            <div className="py-8 border-b border-gray-100">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-2">
                <span>Fund Settlement Progress</span>
                <span className="text-[#087EAA] tabular-nums">
                  {formatCurrency(activeContract.releasedAmount, activeContract.currency)} of{" "}
                  {formatCurrency(activeContract.totalBudget, activeContract.currency)} Released
                </span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="gsap-progress-fill h-full bg-gradient-to-r from-[#087EAA] to-[#16A6A1] rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round((activeContract.releasedAmount / activeContract.totalBudget) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Milestone Cards Grid */}
            <div className="pt-8">
              <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-6">
                Milestone Execution Steps
              </h4>
              <div className="gsap-milestone-grid grid grid-cols-1 md:grid-cols-3 gap-6">
                {activeContract.milestones.map((ms) => {
                  const statusInfo = getMilestoneStatusInfo(ms.status);
                  return (
                    <div
                      key={ms.id}
                      className={`gsap-milestone-step p-6 rounded-2xl border transition-all ${
                        ms.status === "ACTIVE"
                          ? "border-[#087EAA] bg-[#EFF7FA] ring-1 ring-[#087EAA] shadow-xs"
                          : ms.status === "RELEASED"
                          ? "border-[#BCE8E6] bg-[#F0FAF9]"
                          : "border-gray-200 bg-gray-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-400">Step {ms.stepNumber}</span>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            ms.status === "RELEASED"
                              ? "bg-[#EAF7F6] text-[#0C6D6A]"
                              : ms.status === "ACTIVE"
                              ? "bg-[#EAF3FA] text-[#087EAA]"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      <h5 className="font-bold text-gray-900 text-base mb-1">{ms.title}</h5>
                      <p className="text-xs text-gray-500 leading-relaxed mb-4">{ms.description}</p>

                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                        <span className="font-extrabold text-[#073B68]">
                          {formatCurrency(ms.paymentAmount, ms.currency)}
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
        <div className="gsap-cta-card max-w-5xl mx-auto bg-[#073B68] rounded-[2.5rem] p-10 sm:p-14 md:p-20 text-center text-white relative overflow-hidden shadow-2xl">
          {/* Subtle Background Circles */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full backdrop-blur-3xl -mr-32 -mt-32 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full -ml-32 -mb-32 pointer-events-none" />

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-6 sm:mb-8 tracking-tight">
            Ready to build with total confidence?
          </h2>

          <p className="text-base sm:text-lg text-blue-100/90 mb-10 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
            Join <span className="gsap-counter-stat font-bold tabular-nums">10,000+</span> businesses and verified freelancers using TrustPay to secure their professional collaborations.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              id="cta-get-started"
              className="btn-shadow bg-[#087EAA] hover:bg-[#073B68] text-white px-8 sm:px-10 py-4 rounded-full font-bold text-base transition-all w-full sm:w-auto"
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
