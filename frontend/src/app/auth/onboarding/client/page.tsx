"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Building, ArrowRight, ShieldCheck } from "lucide-react";

export default function ClientOnboardingPage() {
  const router = useRouter();
  const { currentUser, updateProfile } = useAuth();

  const [contactName, setContactName] = useState(currentUser.name || "");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState(currentUser.email || "");
  const [industry, setIndustry] = useState("Fintech & Autonomous Commerce");
  const [companyDescription, setCompanyDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!contactName.trim()) errs.contactName = "Contact name is required";
    if (!companyName.trim()) errs.companyName = "Company or brand name is required";
    if (!email.trim()) errs.email = "Business email is required";
    if (!companyDescription.trim()) errs.companyDescription = "Company description is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      await updateProfile({
        name: contactName.trim(),
        companyName: companyName.trim(),
        email: email.trim(),
        domain: industry.trim(),
        bio: companyDescription.trim(),
        companyDescription: companyDescription.trim(),
      });
    } catch {
      // ignore
    }

    // Redirect to Client Dashboard as required
    router.push("/client/dashboard");
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        {/* Step Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-paypal-dark text-xs font-semibold">
            <Building className="w-3.5 h-3.5" />
            <span>Step 2 of 2 • Client Organization Setup</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Set Up Your Hiring Profile</h1>
          <p className="text-xs text-slate-500">
            Tell talent about your company, project domains, and escrow preferences.
          </p>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Contact Name"
                  required
                  placeholder="e.g. Sarah Jenkins"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  error={errors.contactName}
                />

                <Input
                  label="Company / Brand Name"
                  required
                  placeholder="e.g. Acme Global Labs"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  error={errors.companyName}
                />
              </div>

              <Input
                label="Business Email"
                type="email"
                required
                placeholder="billing@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />

              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-semibold text-slate-700">
                  Industry / Domain <span className="text-rose-500 font-bold ml-0.5">*</span>
                </label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paypal-blue"
                >
                  <option value="Fintech & Autonomous Commerce">Fintech & Autonomous Commerce</option>
                  <option value="Software & SaaS">Software & SaaS</option>
                  <option value="Media & Creator Brands">Media & Creator Brands</option>
                  <option value="AI & Machine Learning">AI & Machine Learning</option>
                  <option value="E-Commerce & Retail">E-Commerce & Retail</option>
                  <option value="Web3 & Crypto">Web3 & Crypto</option>
                </select>
              </div>

              <Textarea
                label="Company Description"
                required
                placeholder="Describe your organization, mission, and the type of deliverables you typically hire for..."
                rows={3}
                value={companyDescription}
                onChange={(e) => setCompanyDescription(e.target.value)}
                error={errors.companyDescription}
              />

              {/* Escrow note */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Escrow Guarantee:</strong> As a verified client, you will be able to lock budgets in PayPal escrow and break projects into customizable sequential milestones before inviting talent.
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-2"
                isLoading={isSubmitting}
              >
                Complete Setup & Enter Dashboard
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
