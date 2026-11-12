"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types";
import { Card, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { ShieldCheck, User, Building, CheckCircle2, ArrowRight, ArrowLeft, AlertCircle } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { signup, updateProfile } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedRole, setSelectedRole] = useState<UserRole>("FREELANCER");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 2: Role-specific required fields (account is NOT created until Step 2 is submitted)
  const [domain, setDomain] = useState("Full-Stack Development");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [education, setEducation] = useState("");
  const [experienceYears, setExperienceYears] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "Full name is required";
    if (!email.trim()) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Enter a valid email address";
    }
    if (!password) {
      errs.password = "Password is required";
    } else if (password.length < 8) {
      errs.password = "Password must be at least 8 characters";
    }
    if (password !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    if (selectedRole === "FREELANCER") {
      if (!domain.trim()) errs.domain = "Primary domain is required";
      if (!bio.trim()) errs.bio = "A brief professional bio is required";
      if (!skills.trim()) errs.skills = "Please list at least one key skill";
    } else {
      if (!companyName.trim()) errs.companyName = "Company or brand name is required";
      if (!industry.trim()) errs.industry = "Industry or domain is required";
      if (!companyDescription.trim()) errs.companyDescription = "Company description is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1()) return;
    setErrors({});
    setStep(2);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1() || !validateStep2()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      await signup(fullName.trim(), email.trim(), password, selectedRole);

      if (selectedRole === "FREELANCER") {
        const skillsArray = skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const educationArray = education
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter(Boolean);
        await updateProfile({
          name: fullName.trim(),
          domain: domain.trim(),
          bio: bio.trim(),
          skills: skillsArray,
          education: educationArray,
          experienceYears: experienceYears ? parseInt(experienceYears, 10) || 0 : undefined,
        });
        router.push("/freelancer/dashboard");
      } else {
        await updateProfile({
          name: fullName.trim(),
          companyName: companyName.trim(),
          domain: industry.trim(),
          bio: companyDescription.trim(),
          companyDescription: companyDescription.trim(),
        });
        router.push("/client/dashboard");
      }
    } catch (err: any) {
      setErrors({ form: err.message || "Registration failed. Please check your information." });
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
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#003087] tracking-tight">
            Create your TrustPay Account
          </h1>
          <p className="text-sm text-gray-500">
            Step {step} of 2 • {step === 1 ? "Account credentials & role" : selectedRole === "FREELANCER" ? "Talent profile details" : "Organization profile details"}
          </p>
        </div>

        {/* Card Form */}
        <Card className="border-gray-200/80 rounded-3xl shadow-xl overflow-hidden bg-white">
          {step === 1 ? (
            <form onSubmit={handleNextStep}>
              <CardContent className="space-y-5 pt-8">
                {errors.form && (
                  <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{errors.form}</span>
                  </div>
                )}

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
                        <div
                          className={`p-2 rounded-xl ${
                            selectedRole === "FREELANCER"
                              ? "bg-[#0070E0] text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          <User className="w-4 h-4" />
                        </div>
                        {selectedRole === "FREELANCER" && (
                          <CheckCircle2 className="w-4 h-4 text-[#0070E0]" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">Freelancer</h4>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                          Find projects and earn.
                        </p>
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
                        <div
                          className={`p-2 rounded-xl ${
                            selectedRole === "CLIENT"
                              ? "bg-[#003087] text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          <Building className="w-4 h-4" />
                        </div>
                        {selectedRole === "CLIENT" && (
                          <CheckCircle2 className="w-4 h-4 text-[#003087]" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">Client</h4>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                          Post projects and hire talent.
                        </p>
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
                  placeholder="At least 8 characters"
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
                >
                  Continue to Profile Details
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </CardContent>
            </form>
          ) : (
            <form onSubmit={handleCreateAccount}>
              <CardContent className="space-y-4 pt-8">
                {errors.form && (
                  <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{errors.form}</span>
                  </div>
                )}

                {selectedRole === "FREELANCER" ? (
                  <>
                    <Input
                      label="Primary Domain"
                      required
                      placeholder="e.g. Full-Stack Development, UI/UX, AI/ML"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      error={errors.domain}
                    />
                    <Textarea
                      label="Professional Bio"
                      required
                      rows={3}
                      placeholder="Briefly describe your experience and what you build..."
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      error={errors.bio}
                    />
                    <Input
                      label="Key Skills (comma separated)"
                      required
                      placeholder="e.g. React, Next.js, Python, FastAPI"
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      error={errors.skills}
                    />
                    <Input
                      label="Education & Credentials (Optional)"
                      placeholder="e.g. B.Tech Computer Science, 2024"
                      value={education}
                      onChange={(e) => setEducation(e.target.value)}
                    />
                    <Input
                      label="Years of Experience (Optional)"
                      type="number"
                      min="0"
                      max="60"
                      placeholder="e.g. 3"
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                    />
                  </>
                ) : (
                  <>
                    <Input
                      label="Company / Brand Name"
                      required
                      placeholder="e.g. Acme Studio"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      error={errors.companyName}
                    />
                    <Input
                      label="Industry / Domain"
                      required
                      placeholder="e.g. Fintech, SaaS, E-Commerce"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      error={errors.industry}
                    />
                    <Textarea
                      label="Company Description"
                      required
                      rows={3}
                      placeholder="Describe your company or the projects you are hiring for..."
                      value={companyDescription}
                      onChange={(e) => setCompanyDescription(e.target.value)}
                      error={errors.companyDescription}
                    />
                  </>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 text-xs"
                    onClick={() => {
                      setErrors({});
                      setStep(1);
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
                    Create Account
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </CardContent>
            </form>
          )}

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
