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
    paypal: "bg-paypal-blue",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    inReview: "bg-purple-500",
  };

  return (
    <div className={cn("w-full space-y-1.5", className)} {...props}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center text-xs font-medium text-slate-600">
          <span>{label}</span>
          {showPercentage && <span>{percentage}%</span>}
        </div>
      )}
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
        <div
          className={cn("h-full transition-all duration-500 ease-out rounded-full", barVariants[variant])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
