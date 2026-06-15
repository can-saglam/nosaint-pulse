/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // NO SAINT brand palette (official)
        ink: "#222222", // ns-black
        canvas: "#FFFFFF", // ns-white page canvas
        lime: {
          DEFAULT: "#D7EA00", // ns-green
          dark: "#C2D300",
        },
        border: "hsl(0 0% 91%)",
        input: "hsl(0 0% 91%)",
        ring: "#222222",
        background: "#FFFFFF",
        foreground: "#222222",
        muted: {
          DEFAULT: "#F4F4F2",
          foreground: "#6B6B6B",
        },
      },
      fontFamily: {
        sans: [
          "Saans",
          "Inter",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out",
      },
    },
  },
  plugins: [],
};
