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
        copper: {
          50: "#fdf6f0",
          100: "#fae8d9",
          200: "#f4ceb2",
          300: "#ecad81",
          400: "#e3844e",
          500: "#dc662b",
          600: "#ce4f20",
          700: "#ab3c1d",
          800: "#89321e",
          900: "#6f2b1b",
          950: "#3c140c",
        },
        slate: {
          850: "#172033",
          925: "#0b1120",
        }
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      }
    },
  },
  plugins: [],
};
export default config;

