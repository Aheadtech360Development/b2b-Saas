import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

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
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a8a",
        },
        af: {
          black: "#080808",
          dark: "#111016",
          mid: "#1E1D24",
          red: "#E8242A",
          blue: "#1A5CFF",
          gold: "#f69d0b",
          offwhite: "#F8F8F6",
          border: "#E2E2DE",
          text: "#1A1A1A",
          muted: "#6B6B6B",
        },
        accent: '#1C3557',
        'text-sec': '#6B6B6B',
        bg: '#F8F8F6',
        divider: '#E2E2DE',
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        bebas: ["var(--font-bebas)", "sans-serif"],
        jakarta: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        fraunces: ["'Fraunces'", "serif"],
        'dm-sans': ["'DM Sans'", "sans-serif"],
      },
      screens: {
        xs: "375px",
      },
    },
  },
  plugins: [forms, typography],
};

export default config;
