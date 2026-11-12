"use client";

import React from "react";
import Link from "next/link";
import { ShieldCheck, Lock, Twitter, Linkedin, Github } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#1E1820] text-[#EDF7F6] border-t border-[#A28089]/25 pt-16 pb-10 mt-auto">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-14">
          {/* Brand Info */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-5 group inline-flex">
              <div className="w-9 h-9 bg-[#51E2F5] rounded-xl flex items-center justify-center text-[#1E1820] shadow-xs group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-[#EDF7F6]">
                TrustPay <span className="text-[#51E2F5]">AI</span>
              </span>
            </Link>
            <p className="text-[#EDF7F6]/70 text-sm max-w-xs leading-relaxed mb-7">
              Autonomous milestone escrow marketplace bridging companies with verified freelancers through PayPal Orders v2 &amp; AI deliverable inspection.
            </p>
            <div className="flex gap-3">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noreferrer"
                id="social-tw"
                aria-label="Twitter"
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#EDF7F6]/70 hover:text-[#1E1820] hover:bg-[#51E2F5] transition-colors"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer"
                id="social-li"
                aria-label="LinkedIn"
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#EDF7F6]/70 hover:text-[#1E1820] hover:bg-[#9DF9EF] transition-colors"
              >
                <Linkedin className="w-4 h-4" />
              </a>
              <a
                href="https://github.com/advikakhandelwal/PayPalIsImportant"
                target="_blank"
                rel="noreferrer"
                id="social-gh"
                aria-label="GitHub"
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#EDF7F6]/70 hover:text-[#1E1820] hover:bg-[#FFA8B6] transition-colors"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Col 1: Marketplace */}
          <div>
            <h5 className="font-display text-[#9DF9EF] font-bold text-xs mb-5 uppercase tracking-widest">
              Marketplace
            </h5>
            <ul className="space-y-3.5">
              <li>
                <Link href="/freelancer/dashboard?tab=projects" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  Browse Projects
                </Link>
              </li>
              <li>
                <Link href="/client/dashboard?tab=post" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  Post a Project
                </Link>
              </li>
              <li>
                <Link href="/messages" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  Unified Messages
                </Link>
              </li>
              <li>
                <Link href="/ledger" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  Escrow Ledger
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 2: Architecture */}
          <div>
            <h5 className="font-display text-[#FFA8B6] font-bold text-xs mb-5 uppercase tracking-widest">
              Platform
            </h5>
            <ul className="space-y-3.5">
              <li>
                <a href="/#about" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  Dual Portals
                </a>
              </li>
              <li>
                <a href="/#how-it-works" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="/#features" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  AI Capabilities
                </a>
              </li>
              <li>
                <Link href="/auth/signup" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  Join Platform
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Resources */}
          <div>
            <h5 className="font-display text-[#51E2F5] font-bold text-xs mb-5 uppercase tracking-widest">
              Resources
            </h5>
            <ul className="space-y-3.5">
              <li>
                <Link href="/disputes" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  Dispute Resolution
                </Link>
              </li>
              <li>
                <a href="/#escrow" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  Milestone Protocol
                </a>
              </li>
              <li>
                <Link href="/auth/login" className="text-[#EDF7F6]/70 hover:text-[#51E2F5] text-sm transition-colors">
                  Account Sign In
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-[#A28089] text-xs font-medium tracking-wider">
            © 2026 TrustPay AI. All rights reserved. Built with PayPal Escrow &amp; Gemini AI.
          </p>
          <div className="flex items-center gap-6 sm:gap-8">
            <span className="text-[10px] font-bold text-[#A28089] uppercase tracking-widest flex items-center gap-2">
              Enterprise Escrow Security
              <Lock className="w-3 h-3 text-[#51E2F5]" />
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#9DF9EF] animate-pulse" />
              <span className="text-[10px] font-bold text-[#9DF9EF] uppercase tracking-widest">
                Systems Operational
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
