/** Tailwind config — tokens mirror docs/DESIGN-SYSTEM.md + design-reference/ */
module.exports = {
  content: ["./views/**/*.ejs", "./public/js/**/*.js"],
  theme: {
    extend: {
      colors: {
        accent: "#3b6cf5",
        "accent-strong": "#2c54d6",
        "accent-soft": "#e9f0fe",
        "accent-softer": "#f3f7ff",
        bg: "#eef2fb",
        surface: "#ffffff",
        "surface-2": "#f7f9fe",
        border: "#e6ebf5",
        "border-strong": "#d6deec",
        ink: "#182338",
        "ink-2": "#4a566e",
        "ink-3": "#8893a8",
        "ink-4": "#aab3c6",
        ok: "#18a571",
        warn: "#d99411",
        bad: "#e1474d",
        info: "#2c8fb8",
        violet: "#7b5cf0",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: { xs: "7px", sm: "10px", md: "14px", lg: "18px", xl: "24px" },
      boxShadow: {
        sm: "0 1px 3px rgba(24,35,56,.04)",
        md: "0 4px 14px rgba(24,35,56,.06)",
        lg: "0 18px 50px rgba(24,35,56,.16)",
      },
    },
  },
  plugins: [],
};
