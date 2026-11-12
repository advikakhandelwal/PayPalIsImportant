import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "dark" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none rounded-full cursor-pointer whitespace-nowrap shrink-0 leading-tight";

    const variantStyles = {
      primary:
        "btn-shadow bg-[#51E2F5] text-[#1E1820] hover:bg-[#3ad3e8] focus-visible:ring-[#51E2F5] active:scale-[0.98]",
      dark:
        "bg-[#1E1820] text-[#EDF7F6] hover:bg-[#312834] focus-visible:ring-[#1E1820] shadow-sm active:scale-[0.98]",
      secondary:
        "bg-[#9DF9EF]/55 text-[#1E1820] hover:bg-[#9DF9EF]/85 focus-visible:ring-[#9DF9EF] active:scale-[0.98]",
      outline:
        "border border-[#A28089]/35 bg-white text-[#1E1820] hover:border-[#51E2F5] hover:bg-[#EDF7F6] focus-visible:ring-[#51E2F5] shadow-2xs",
      ghost:
        "text-[#5C4B51] hover:bg-[#EDF7F6] hover:text-[#1E1820] focus-visible:ring-[#A28089]/30",
      danger:
        "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500 shadow-sm active:scale-[0.98]",
    };

    const sizeStyles = {
      sm: "min-h-8 py-1.5 px-4 text-xs gap-1.5",
      md: "min-h-10 py-2 px-5 text-sm gap-2",
      lg: "min-h-12 py-2.5 px-7 text-base gap-2.5",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
