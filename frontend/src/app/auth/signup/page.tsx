"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types";
import { Card, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ShieldCheck, User, Building, CheckCircle2, ArrowRight } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("FREELANCER");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "Full name is required";
    if (!email.trim()) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Enter a valid email address";
    }
    if (!password) {
      errs.password = "Password is required";
    } else if (password.length < 6) {
      errs.password = "Password must be at least 6 characters";
    }
    if (password !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    signup(fullName.trim(), email.trim(), selectedRole);

    if (selectedRole === "FREELANCER") {
      router.push("/auth/onboarding/freelancer");
    } else {
      router.push("/auth/onboarding/client");
    }
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] hero-gradient flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#0070E0] flex items-center justify-center text-white mx-auto shadow-md">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#003087] tracking-tight">
            Create your TrustPay Account
          </h1>
          <p className="text-sm text-gray-500">
            Join the autonomous milestone escrow marketplace.
          </p>
        </div>

        {/* Card Form */}
        <Card className="border-gray-200/80 rounded-3xl shadow-xl overflow-hidden bg-white">
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5 pt-8">
              {/* Role Selection */}
              <div className="space-y-2 text-left">
                <label className="block text-xs font-bold text-gray-700">
                  Select Your Account Role <span className="text-rose-500 font-bold ml-0.5">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Freelancer Card */}
                  <div
                    onClick={() => setSelectedRole("FREELANCER")}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedRole === "FREELANCER"
                        ? "border-[#0070E0] bg-blue-50/40 ring-2 ring-[#0070E0] shadow-xs"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`p-2 rounded-xl ${selectedRole === "FREELANCER" ? "bg-[#0070E0] text-white" : "bg-gray-100 text-gray-600"}`}>
                        <User className="w-4 h-4" />
                      </div>
                      {selectedRole === "FREELANCER" && <CheckCircle2 className="w-4 h-4 text-[#0070E0]" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">Freelancer</h4>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">Find projects and earn.</p>
                    </div>
                  </div>

                  {/* Client Card */}
                  <div
                    onClick={() => setSelectedRole("CLIENT")}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedRole === "CLIENT"
                        ? "border-[#003087] bg-slate-50 ring-2 ring-[#003087] shadow-xs"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`p-2 rounded-xl ${selectedRole === "CLIENT" ? "bg-[#003087] text-white" : "bg-gray-100 text-gray-600"}`}>
                        <Building className="w-4 h-4" />
                      </div>
                      {selectedRole === "CLIENT" && <CheckCircle2 className="w-4 h-4 text-[#003087]" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">Client</h4>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">Post projects and hire talent.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Inputs */}
              <Input
                label="Full Name"
                required
                placeholder="e.g. Alex Morgan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                error={errors.fullName}
              />

              <Input
                label="Email Address"
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />

              <Input
                label="Password"
                type="password"
                required
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
              />

              <Input
                label="Confirm Password"
                type="password"
                required
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
              />

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-3 h-12 text-sm"
                isLoading={isSubmitting}
              >
                Continue to Onboarding
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </CardContent>
          </form>

          <CardFooter className="justify-center border-t border-gray-100 py-4 text-xs text-gray-500 bg-gray-50/50">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-[#0070E0] font-bold ml-1 hover:underline">
              Log In
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
