/** @type {import('tailwindcss').Config} */
// Neutral base, one accent, muted priority dots. Colours are named by role, not by look.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F5F6F8",
        surface: "#FFFFFF",
        ink: "#111827",
        muted: "#6B7280",
        subtle: "#9CA3AF",
        line: "#E5E7EB",
        accent: { DEFAULT: "#2447A8", hover: "#1C3A8A", soft: "#EEF2FB" },
        critical: "#D92D20",
        high: "#F79009",
        medium: "#2E90FA",
        low: "#98A2B3",
        success: "#067647",
        warn: "#B54708",
      },
      fontFamily: {
        serif: ['"Literata"', "Georgia", "serif"],
        sans: ['"Hanken Grotesk"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
