import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        hostbg: "#0f0f1a",
        answerA: "#E21B3C",
        answerB: "#1368CE",
        answerC: "#D89E00",
        answerD: "#26890C",
      },
    },
  },
  plugins: [],
};
export default config;
