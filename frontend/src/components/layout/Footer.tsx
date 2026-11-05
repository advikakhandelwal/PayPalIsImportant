"use client";

import React from "react";
import Link from "next/link";
import { ShieldCheck, Lock, Twitter, Linkedin, Github } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-gray-100 pt-20 pb-10 mt-auto">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
          {/* Brand Info */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-6 group inline-block">
              <div className="w-8 h-8 bg-[#0070E0] rounded-lg flex items-center justify-center text-white text-lg shadow-xs group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-extrabold tracking-tighter text-[#003087]">TrustPay</span>
            </Link>
            <p className="text-gray-500 text-sm max-w-xs leading-relaxed mb-8">
              Autonomous milestone escrow marketplace designed to bridge companies with verified freelancers and creators with algorithmic proof-of-work.
            </p>
            <div className="flex gap-4">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noreferrer"
                id="social-tw"
                aria-label="Twitter"
                className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#0070E0] hover:bg-blue-50 transition-colors"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer"
                id="social-li"
                aria-label="LinkedIn"
                className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#0070E0] hover:bg-blue-50 transition-colors"
              >
                <Linkedin className="w-4 h-4" />
              </a>
              <a
                href="https://github.com/advikakhandelwal/PayPalIsImportant"
                target="_blank"
                rel="noreferrer"
                id="social-gh"
                aria-label="GitHub"
                className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#0070E0] hover:bg-blue-50 transition-colors"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Col 1: Marketplace */}
          <div>
            <h5 className="text-[#003087] font-bold text-sm mb-6 uppercase tracking-wider">Marketplace</h5>
            <ul className="space-y-4">
              <li>
                <Link href="/freelancer/dashboard?tab=browse" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  Browse Projects
                </Link>
              </li>
              <li>
                <Link href="/client/dashboard?tab=post" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  Post a Project
                </Link>
              </li>
              <li>
                <a href="#about" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  Portals Overview
                </a>
              </li>
              <li>
                <a href="#escrow" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  Escrow Services
                </a>
              </li>
            </ul>
          </div>

          {/* Col 2: Company */}
          <div>
            <h5 className="text-[#003087] font-bold text-sm mb-6 uppercase tracking-wider">Company</h5>
            <ul className="space-y-4">
              <li>
                <a href="#about" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  About Us
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#features" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  Capabilities
                </a>
              </li>
              <li>
                <Link href="/auth/signup" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  Join Platform
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Resources */}
          <div>
            <h5 className="text-[#003087] font-bold text-sm mb-6 uppercase tracking-wider">Resources</h5>
            <ul className="space-y-4">
              <li>
                <a href="#features" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  AI Verification Specs
                </a>
              </li>
              <li>
                <a href="#escrow" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  Milestone Protocol
                </a>
              </li>
              <li>
                <span className="text-gray-400 text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Hackathon Build v2.4
                </span>
              </li>
              <li>
                <Link href="/auth/login" className="text-gray-500 hover:text-[#0070E0] text-sm transition-colors">
                  Account Sign In
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-10 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">
            © 2026 TrustPay Inc. All rights reserved. Built for PayPal &amp; AI Hackathon.
          </p>
          <div className="flex items-center gap-6 sm:gap-8">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              Built for Enterprise Security
              <Lock className="w-3 h-3 text-gray-400" />
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Systems Operational
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
