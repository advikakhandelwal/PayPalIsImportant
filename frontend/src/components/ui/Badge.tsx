import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "success"
    | "warning"
    | "inReview"
    | "locked"
    | "paypal"
    | "danger"
    | "neutral";
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "neutral",
  size = "md",
  children,
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center font-medium rounded-full border tracking-wide select-none transition-colors";

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
  };

  const variantStyles = {
    success: "bg-[#EAF7F6] text-[#0C6D6A] border-[#B9E9E7] font-semibold",
    warning: "bg-[#FEF6ED] text-[#A66212] border-[#FCDDB5] font-semibold",
    inReview: "bg-[#EFF6FF] text-[#087EAA] border-[#CDE5F2] font-semibold",
    locked: "bg-slate-100 text-slate-600 border-slate-200 font-medium",
    paypal: "bg-[#EAF3FA] text-[#073B68] border-[#CCE0F3] font-bold",
    danger: "bg-rose-50 text-rose-700 border-rose-200 font-semibold",
    neutral: "bg-slate-50 text-slate-700 border-slate-200 font-medium",
  };

  return (
    <span
      className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
      {...props}
    >
      {children}
    </span>
  );
};
