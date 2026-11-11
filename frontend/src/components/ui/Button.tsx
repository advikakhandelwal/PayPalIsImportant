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
      "inline-flex items-center justify-center font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none rounded-full cursor-pointer";

    const variantStyles = {
      primary:
        "btn-shadow bg-[#087EAA] text-white hover:bg-[#073B68] focus-visible:ring-[#087EAA] active:scale-[0.98]",
      dark:
        "bg-[#073B68] text-white hover:bg-[#052847] focus-visible:ring-[#073B68] shadow-sm active:scale-[0.98]",
      secondary:
        "bg-[#F0F5FA] text-[#073B68] hover:bg-[#E2EDF7] focus-visible:ring-[#087EAA] active:scale-[0.98]",
      outline:
        "border border-[#D4E2F1] bg-white text-[#25364A] hover:border-[#087EAA] hover:text-[#087EAA] focus-visible:ring-[#087EAA] shadow-2xs active:scale-[0.98]",
      ghost:
        "text-[#4A5D73] hover:bg-[#EDF4FA] hover:text-[#073B68] focus-visible:ring-gray-200",
      danger:
        "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500 shadow-sm active:scale-[0.98]",
    };

    const sizeStyles = {
      sm: "h-8 px-4 text-xs gap-1.5",
      md: "h-10 px-5 text-sm gap-2",
      lg: "h-12 px-7 text-base gap-2.5",
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
