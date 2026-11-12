"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { apiClient } from "@/services/api";
import { Card, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  KeyRound,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

type Step = "request" | "reset" | "done";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      if (urlToken) {
        setToken(urlToken);
        setStep("reset");
      }
    }
  }, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.forgotPassword(cleanEmail);
      setInfoMessage(res.message);
      if (res.resetToken) {
        setGeneratedToken(res.resetToken);
        setToken(res.resetToken);
      } else {
        setGeneratedToken(null);
      }
      setStep("reset");
    } catch (err: any) {
      setError(err?.message || "Unable to initiate password reset.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token.trim()) {
      setError("Reset token is required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.resetPassword(token.trim(), newPassword);
      setInfoMessage(res.message);
      setStep("done");
    } catch (err: any) {
      setError(err?.message || "Failed to reset password. Check your token and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] hero-gradient flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#0070E0] flex items-center justify-center text-white mx-auto shadow-md">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#003087] tracking-tight">
            Reset Your Password
          </h1>
          <p className="text-sm text-gray-500">
            {step === "request" && "Enter your registered email to generate a 15-minute reset token."}
            {step === "reset" && "Enter your reset token and choose a new password."}
            {step === "done" && "Your TrustPay password has been updated."}
          </p>
        </div>

        <Card className="border-gray-200/80 rounded-3xl shadow-xl overflow-hidden bg-white">
          {step === "request" && (
            <form onSubmit={handleRequestReset}>
              <CardContent className="space-y-5 pt-8">
                {error && (
                  <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                )}

                <Input
                  label="Registered Email Address"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full h-12 text-sm"
                  isLoading={isSubmitting}
                >
                  Generate Reset Token
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </CardContent>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={handleResetPassword}>
              <CardContent className="space-y-4 pt-8">
                {infoMessage && (
                  <div className="flex items-start gap-2 p-3 text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-xl">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-[#0070E0] mt-0.5" />
                    <span>{infoMessage}</span>
                  </div>
                )}

                {generatedToken && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                    <p className="font-bold">Reset Token Ready (Single-Use · 15 min)</p>
                    <p className="text-[11px] text-emerald-800">
                      Your reset token has been auto-filled below so you can set a new password right away.
                    </p>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                )}

                <Input
                  label="Reset Token"
                  type="text"
                  required
                  placeholder="Paste your password reset token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />

                <Input
                  label="New Password"
                  type="password"
                  required
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />

                <Input
                  label="Confirm New Password"
                  type="password"
                  required
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 text-xs"
                    onClick={() => {
                      setError("");
                      setStep("request");
                    }}
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    className="flex-1 h-11 text-sm"
                    isLoading={isSubmitting}
                  >
                    Update Password
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </CardContent>
            </form>
          )}

          {step === "done" && (
            <CardContent className="space-y-5 pt-8 pb-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-[#003087]">Password Updated</h2>
                <p className="text-xs text-gray-600">{infoMessage}</p>
              </div>
              <Link href="/auth/login" className="block">
                <Button variant="primary" className="w-full h-11 text-sm">
                  Go to Log In
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
            </CardContent>
          )}

          <CardFooter className="justify-center border-t border-gray-100 py-4 text-xs text-gray-500 bg-gray-50/50">
            Remembered your password?{" "}
            <Link href="/auth/login" className="text-[#0070E0] font-bold ml-1 hover:underline">
              Back to Log In
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
