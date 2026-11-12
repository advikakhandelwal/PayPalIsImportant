"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  showPasswordToggle?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      label,
      error,
      helperText,
      required,
      showPasswordToggle = true,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
    const [showPassword, setShowPassword] = useState(false);

    const isPasswordField = type === "password" && showPasswordToggle;
    const effectiveType = isPasswordField ? (showPassword ? "text" : "password") : type;

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label htmlFor={generatedId} className="block text-xs font-bold text-gray-700">
            {label}
            {required && <span className="text-rose-500 font-bold ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            id={generatedId}
            type={effectiveType}
            ref={ref}
            required={required}
            className={cn(
              "w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#1E1820] placeholder:text-[#A28089] transition-all shadow-2xs",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51E2F5] focus-visible:border-transparent",
              "disabled:opacity-50 disabled:bg-[#EDF7F6] disabled:cursor-not-allowed",
              isPasswordField && "pr-10",
              error ? "border-rose-400 focus-visible:ring-rose-400" : "border-[#A28089]/30 hover:border-[#A28089]/60",
              className
            )}
            {...props}
          />
          {isPasswordField && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer p-1 rounded"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        {error ? (
          <p className="text-xs text-rose-600 font-medium">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-gray-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
