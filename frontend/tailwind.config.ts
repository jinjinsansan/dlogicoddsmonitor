import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        base: "#0A0E17",
        surface: "#131826",
        line: "#1F2937",
        ink: "#E5E7EB",
        muted: "#94A3B8",
        brand: "#3B82F6",
        cta: "#F59E0B",
        drop: "#22D3EE",   // 急落 (cyan)
        surge: "#FB7185",  // 急騰 (rose)
        reversal: "#A78BFA", // 逆転 (purple)
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
