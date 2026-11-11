"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { User, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";

export default function FreelancerOnboardingPage() {
  const router = useRouter();
  const { currentUser, updateProfile } = useAuth();

  const [name, setName] = useState(currentUser.name || "");
  const [domain, setDomain] = useState("Full-Stack Development");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [experienceYears, setExperienceYears] = useState("3");
  const [portfolioLink, setPortfolioLink] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Full name is required";
    if (!bio.trim()) errs.bio = "A brief professional bio is required";
    if (!skills.trim()) errs.skills = "Please list at least one key skill";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    const skillsArray = skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const linksArray = portfolioLink.trim() ? [portfolioLink.trim()] : [];

    updateProfile({
      name: name.trim(),
      domain: domain.trim(),
      bio: bio.trim(),
      skills: skillsArray,
      experienceYears: parseInt(experienceYears, 10) || 0,
      portfolioLinks: linksArray,
    });

    // Redirect to Freelancer Dashboard as required
    router.push("/freelancer/dashboard");
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        {/* Step Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#073B68] text-xs font-semibold">
            <User className="w-3.5 h-3.5" />
            <span>Step 2 of 2 • Freelancer Profile Setup</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Complete Your Talent Profile</h1>
          <p className="text-xs text-slate-500">
            Tell clients about your domains of expertise, key skills, and past work.
          </p>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-6">
              <Input
                label="Full Name"
                required
                placeholder="e.g. Alex Morgan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
              />

              {/* Domain / Specialization */}
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-semibold text-slate-700">
                  Domain / Specialization <span className="text-rose-500 font-bold ml-0.5">*</span>
                </label>
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087EAA]"
                >
                  <option value="Full-Stack Development">Full-Stack Development</option>
                  <option value="Frontend Engineering">Frontend Engineering</option>
                  <option value="Backend & APIs">Backend & APIs</option>
                  <option value="Smart Escrow & Web3">Smart Escrow & Web3</option>
                  <option value="AI Engineering & Models">AI Engineering & Models</option>
                  <option value="Video & Content Creation">Video & Content Creation</option>
                  <option value="UI/UX Design">UI/UX Design</option>
                </select>
              </div>

              <Textarea
                label="Professional Bio"
                required
                placeholder="Summarize your background, core strengths, and what kind of projects you excel at..."
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                error={errors.bio}
              />

              <Input
                label="Key Skills (comma separated)"
                required
                placeholder="e.g. Next.js, React, TypeScript, Tailwind CSS, Python"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                error={errors.skills}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-semibold text-slate-700">
                    Years of Experience <span className="text-rose-500 font-bold ml-0.5">*</span>
                  </label>
                  <select
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087EAA]"
                  >
                    <option value="1">1 year (Junior)</option>
                    <option value="2">2 years</option>
                    <option value="3">3 - 4 years (Mid-level)</option>
                    <option value="5">5+ years (Senior)</option>
                    <option value="8">8+ years (Lead / Architect)</option>
                  </select>
                </div>

                <Input
                  label="Portfolio / GitHub Link (Optional)"
                  placeholder="https://github.com/yourhandle"
                  value={portfolioLink}
                  onChange={(e) => setPortfolioLink(e.target.value)}
                />
              </div>

              {/* Notice regarding unrated initial status */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Unrated Profile:</strong> As a new member, your trust scorecard begins in a clean unrated state. Your on-time delivery rate and compliance score will calculate automatically from verified milestone completions.
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-2"
                isLoading={isSubmitting}
              >
                Complete Onboarding & Enter Dashboard
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
