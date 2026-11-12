import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          cyan: "#51E2F5",
          mint: "#9DF9EF",
          ice: "#EDF7F6",
          coral: "#FFA8B6",
          mauve: "#A28089",
          ink: "#1E1820",
          muted: "#5C4B51",
        },
        // Semantic aliases mapped to the new design system
        paypal: {
          blue: "#0EA5B7",
          dark: "#1E1820",
          light: "#51E2F5",
        },
        escrow: {
          success: "#10B981",
          warning: "#F59E0B",
          locked: "#A28089",
          inReview: "#FFA8B6",
        },
      },
      boxShadow: {
        elegant: "0 18px 40px -16px rgba(30, 24, 32, 0.14), 0 4px 12px -4px rgba(162, 128, 137, 0.12)",
        glowCyan: "0 10px 28px -6px rgba(81, 226, 245, 0.45)",
      },
    },
  },
  plugins: [],
};
export default config;
