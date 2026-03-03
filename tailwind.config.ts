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
        paper:          "var(--paper)",
        "paper-dark":   "var(--paper-dark)",
        "paper-fold":   "var(--paper-fold)",
        ink:            "var(--ink)",
        "ink-mid":      "var(--ink-mid)",
        "ink-light":    "var(--ink-light)",
        "ink-faint":    "var(--ink-faint)",
        accent:         "var(--accent)",
        "accent-light": "var(--accent-light)",
        "accent-warm":  "var(--accent-warm)",
        "accent-green": "var(--accent-green)",
        "accent-red":   "var(--accent-red)",
      },
      fontFamily: {
        sans:    ["var(--font-patrick-hand)", "cursive"],
        display: ["var(--font-indie-flower)", "cursive"],
        doodle:  ["var(--font-chewy)", "cursive"],
      },
      aspectRatio: {
        "4/3": "4 / 3",
      },
    },
  },
  plugins: [],
};

export default config;
