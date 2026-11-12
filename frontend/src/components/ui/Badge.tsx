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
    "inline-flex items-center font-medium rounded-full border tracking-wide select-none whitespace-nowrap shrink-0";

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
  };

  const variantStyles = {
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
    inReview: "bg-[#FFA8B6]/30 text-[#6E2335] border-[#FFA8B6]/70",
    locked: "bg-[#EDF7F6] text-[#5C4B51] border-[#A28089]/30",
    paypal: "bg-[#9DF9EF]/50 text-[#1E1820] border-[#51E2F5]/70 font-semibold",
    danger: "bg-rose-50 text-rose-800 border-rose-200",
    neutral: "bg-[#EDF7F6] text-[#1E1820] border-[#A28089]/25",
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
