import React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, required, id, rows = 3, ...props }, ref) => {
    const generatedId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label htmlFor={generatedId} className="block text-xs font-bold text-gray-700">
            {label}
            {required && <span className="text-rose-500 font-bold ml-1">*</span>}
          </label>
        )}
        <textarea
          id={generatedId}
          ref={ref}
          rows={rows}
          required={required}
          className={cn(
            "w-full px-4 py-3 rounded-xl border bg-white text-sm text-[#1E1820] placeholder:text-[#A28089] transition-all shadow-2xs resize-y",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51E2F5] focus-visible:border-transparent",
            "disabled:opacity-50 disabled:bg-[#EDF7F6] disabled:cursor-not-allowed",
            error ? "border-rose-400 focus-visible:ring-rose-400" : "border-[#A28089]/30 hover:border-[#A28089]/60",
            className
          )}
          {...props}
        />
        {error ? (
          <p className="text-xs text-rose-600 font-medium">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-gray-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
