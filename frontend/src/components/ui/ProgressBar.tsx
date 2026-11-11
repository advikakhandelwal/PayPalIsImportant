import React from "react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0 to 100
  max?: number;
  label?: string;
  showPercentage?: boolean;
  variant?: "paypal" | "success" | "warning" | "inReview";
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  showPercentage = true,
  variant = "paypal",
  className,
  ...props
}) => {
  const percentage = Math.min(Math.max(Math.round((value / max) * 100), 0), 100);

  const barVariants = {
    paypal: "bg-gradient-to-r from-[#087EAA] to-[#16A6A1]",
    success: "bg-[#16A6A1]",
    warning: "bg-[#F0A44B]",
    inReview: "bg-gradient-to-r from-[#087EAA] to-[#8B5CF6]",
  };

  return (
    <div className={cn("w-full space-y-1.5", className)} {...props}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
          <span>{label}</span>
          {showPercentage && <span className="tabular-nums font-bold text-[#073B68]">{percentage}%</span>}
        </div>
      )}
      <div className="w-full h-2.5 bg-[#EAF2FA] rounded-full overflow-hidden border border-[#D5E4F3]">
        <div
          className={cn("h-full transition-all duration-500 ease-out rounded-full", barVariants[variant])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
