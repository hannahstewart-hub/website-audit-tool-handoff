import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#00264D",
          75: "#405E7A",
          50: "#7F92A6",
          25: "#BFC9D3",
        },
        teal: "#54BDB8",
        blue: "#1789FC",
        mint: {
          DEFAULT: "#A6FAE8",
          75: "#BCFBED",
          50: "#D2FCF3",
          25: "#E9FEF9",
        },
        orange: "#F09600",
        "audit-bg": "#F7F9FF",
        "audit-fix": "#EEF5FF",
      },
      fontFamily: {
        heading: ["Poppins", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "JetBrains Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
        "3xl": "22px",
      },
    },
  },
  plugins: [],
};

export default config;
