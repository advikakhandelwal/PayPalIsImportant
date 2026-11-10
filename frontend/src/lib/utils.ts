import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { MilestoneStatus, EscrowStatus } from "@/types";

/**
 * Combines conditional class names with Tailwind merge to resolve styling conflicts.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a monetary amount with configurable currency symbols and international formatting.
 * Defaults to INR (₹) using Indian numbering conventions (en-IN).
 */
export function formatCurrency(amount: number, currency = "INR"): string {
  try {
    const curr = (currency || "INR").toUpperCase();
    const locale = curr === "INR" ? "en-IN" : "en-US";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: curr,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Fallback if currency code is non-standard
    return `${(currency || "INR").toUpperCase()} ${amount.toLocaleString("en-IN")}`;
  }
}

/**
 * Formats an ISO date string into a clean, human-readable date.
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

/**
 * Returns human-friendly label and color mapping for milestone statuses.
 */
export function getMilestoneStatusInfo(status: MilestoneStatus): {
  label: string;
  variant: "success" | "warning" | "inReview" | "locked" | "neutral" | "danger";
} {
  switch (status) {
    case "RELEASED":
      return { label: "Paid & Released", variant: "success" };
    case "ACTIVE":
      return { label: "In Progress", variant: "warning" };
    case "SUBMITTED":
    case "IN_REVIEW":
      return { label: "AI & Client Review", variant: "inReview" };
    case "REVISION_REQUESTED":
      return { label: "Revisions Needed", variant: "warning" };
    case "DISPUTED":
      return { label: "Under Dispute", variant: "danger" };
    case "LOCKED":
    default:
      return { label: "Locked", variant: "locked" };
  }
}

/**
 * Returns human-friendly label and color mapping for escrow statuses.
 */
export function getEscrowStatusInfo(status: EscrowStatus): {
  label: string;
  variant: "success" | "warning" | "inReview" | "locked" | "neutral" | "danger";
} {
  switch (status) {
    case "HELD_IN_ESCROW":
      return { label: "Funds Locked in Escrow", variant: "success" };
    case "PARTIALLY_RELEASED":
      return { label: "Partially Disbursed", variant: "warning" };
    case "COMPLETED":
      return { label: "Escrow Settled", variant: "success" };
    case "DISPUTED":
      return { label: "Dispute Mediation", variant: "danger" };
    case "REFUNDED":
      return { label: "Refunded to Client", variant: "neutral" };
    case "AWAITING_AUTHORIZATION":
    default:
      return { label: "Awaiting Funding", variant: "locked" };
  }
}
