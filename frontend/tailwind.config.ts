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
        brand: {
          navy: "#073B68",
          blue: "#087EAA",
          teal: "#16A6A1",
          amber: "#F0A44B",
          bg: "#F5F8FC",
          surface: "#FFFFFF",
          text: "#25364A",
          muted: "#64748B",
          border: "#E2E8F0",
        },
        paypal: {
          blue: "#087EAA",
          dark: "#073B68",
          light: "#16A6A1",
        },
        escrow: {
          success: "#16A6A1",
          warning: "#F0A44B",
          locked: "#94A3B8",
          inReview: "#087EAA",
        },
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(7, 59, 104, 0.04), 0 1px 2px -1px rgba(7, 59, 104, 0.04)',
        'card': '0 4px 20px -2px rgba(7, 59, 104, 0.06), 0 2px 6px -1px rgba(7, 59, 104, 0.03)',
        'card-hover': '0 14px 30px -4px rgba(7, 59, 104, 0.10), 0 4px 12px -2px rgba(7, 59, 104, 0.05)',
        'btn-primary': '0 4px 14px 0 rgba(8, 126, 170, 0.35)',
        'btn-teal': '0 4px 14px 0 rgba(22, 166, 161, 0.35)',
        'glow-teal': '0 0 20px -3px rgba(22, 166, 161, 0.30)',
        'glow-amber': '0 0 20px -3px rgba(240, 164, 75, 0.30)',
      },
      borderRadius: {
        '2.5xl': '1.25rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
export default config;
