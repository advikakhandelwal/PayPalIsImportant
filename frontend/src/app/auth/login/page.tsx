"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types";
import { Card, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ShieldCheck, User, Building, ArrowRight, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, currentUser, isAuthenticated, isHydrated, logout } = useAuth();

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const user = await login(email.trim(), password);
      if (user.role === "FREELANCER") {
        router.push("/freelancer/dashboard");
      } else {
        router.push("/client/dashboard");
      }
    } catch (err: any) {
      setErrors({ form: err.message || "Invalid email or password." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] hero-gradient flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#1E1820] flex items-center justify-center text-[#51E2F5] mx-auto shadow-md">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#1E1820] tracking-tight">
            Log In to TrustPay
          </h1>
          <p className="text-sm text-gray-500">
            Access your milestone escrow contracts and active dashboard.
          </p>
        </div>

        {/* Already Signed-In Session Banner */}
        {isHydrated && isAuthenticated && (
          <Card className="p-4 border-emerald-200 bg-emerald-50/70 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-emerald-900">
              <p className="font-bold">Already signed in as {currentUser.name}</p>
              <p className="text-[11px] text-emerald-700">Role: {currentUser.role}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href={currentUser.role === "FREELANCER" ? "/freelancer/dashboard" : "/client/dashboard"}>
                <Button variant="primary" size="sm">
                  Go to Dashboard
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={logout}>
                Sign Out
              </Button>
            </div>
          </Card>
        )}

        {/* Card Form */}
        <Card className="border-gray-200/80 rounded-3xl shadow-xl overflow-hidden bg-white">
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-5 pt-8">
              {errors.form && (
                <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errors.form}</span>
                </div>
              )}

              {/* Role Toggle for Login Target */}
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold text-gray-700">Account Type</label>
                <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-50 rounded-full border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setSelectedRole("FREELANCER")}
                    className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
                      selectedRole === "FREELANCER"
                        ? "bg-white text-[#0EA5B7] shadow-sm ring-1 ring-gray-200"
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
                        ? "bg-white text-[#1E1820] shadow-sm ring-1 ring-gray-200"
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

              <div className="space-y-1.5">
                <Input
                  label="Password"
                  type="password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={errors.password}
                />
                <div className="flex justify-end">
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs font-semibold text-[#0EA5B7] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-3 h-12 text-sm"
                isLoading={isSubmitting}
              >
                Log In
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </CardContent>
          </form>

          <CardFooter className="justify-center border-t border-gray-100 py-4 text-xs text-gray-500 bg-gray-50/50">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-[#0EA5B7] font-bold ml-1 hover:underline">
              Sign Up
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
