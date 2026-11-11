"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types";
import { Card, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ShieldCheck, User, Building, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("FREELANCER");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email.trim()) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Enter a valid email address";
    }
    if (!password) {
      errs.password = "Password is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    login(email.trim(), selectedRole);

    if (selectedRole === "FREELANCER") {
      router.push("/freelancer/dashboard");
    } else {
      router.push("/client/dashboard");
    }
  };

  const handleQuickDemoLogin = (role: UserRole) => {
    const demoEmail = role === "FREELANCER" ? "vachan@talent.trustpay.ai" : "contracts@acmeventures.com";
    setEmail(demoEmail);
    setPassword("demo-password-123");
    setSelectedRole(role);
    login(demoEmail, role);

    if (role === "FREELANCER") {
      router.push("/freelancer/dashboard");
    } else {
      router.push("/client/dashboard");
    }
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] hero-gradient flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#087EAA] flex items-center justify-center text-white mx-auto shadow-md">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#073B68] tracking-tight">
            Log In to TrustPay
          </h1>
          <p className="text-sm text-gray-500">
            Access your milestone escrow contracts and active dashboard.
          </p>
        </div>

        {/* Card Form */}
        <Card className="border-gray-200/80 rounded-3xl shadow-xl overflow-hidden bg-white">
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-5 pt-8">
              {/* Role Toggle for Login Target */}
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold text-gray-700">Account Type</label>
                <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-50 rounded-full border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setSelectedRole("FREELANCER")}
                    className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
                      selectedRole === "FREELANCER"
                        ? "bg-white text-[#087EAA] shadow-sm ring-1 ring-gray-200"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    Freelancer
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole("CLIENT")}
                    className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
                      selectedRole === "CLIENT"
                        ? "bg-white text-[#073B68] shadow-sm ring-1 ring-gray-200"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    <Building className="w-3.5 h-3.5" />
                    Client
                  </button>
                </div>
              </div>

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
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
              />

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-3 h-12 text-sm"
                isLoading={isSubmitting}
              >
                Log In
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>

              {/* Fast Quick-Demo Login Buttons for Reviewers */}
              <div className="pt-4 border-t border-gray-100 space-y-2.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block text-center">
                  Quick Demo Access
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleQuickDemoLogin("FREELANCER")}
                  >
                    Demo Freelancer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleQuickDemoLogin("CLIENT")}
                  >
                    Demo Client
                  </Button>
                </div>
              </div>
            </CardContent>
          </form>

          <CardFooter className="justify-center border-t border-gray-100 py-4 text-xs text-gray-500 bg-gray-50/50">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-[#087EAA] font-bold ml-1 hover:underline">
              Sign Up
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
