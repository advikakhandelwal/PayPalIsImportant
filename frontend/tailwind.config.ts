import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paypal: {
          blue: "#0070BA",
          dark: "#003087",
          light: "#00CFDE",
        },
        escrow: {
          success: "#10B981",
          warning: "#F59E0B",
          locked: "#6B7280",
          inReview: "#8B5CF6",
        }
      },
    },
  },
  plugins: [],
};
export default config;
