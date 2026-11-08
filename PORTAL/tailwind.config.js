/** Cores iguais às do PDV Salvados (definidas em src/index.css). */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "oklch(var(--background) / <alpha-value>)",
        foreground: "oklch(var(--foreground) / <alpha-value>)",
        card: "oklch(var(--card) / <alpha-value>)",
        primary: { DEFAULT: "oklch(var(--primary) / <alpha-value>)", foreground: "oklch(var(--primary-foreground) / <alpha-value>)" },
        muted: { DEFAULT: "oklch(var(--muted) / <alpha-value>)", foreground: "oklch(var(--muted-foreground) / <alpha-value>)" },
        border: "oklch(var(--border) / <alpha-value>)",
        destructive: "oklch(var(--destructive) / <alpha-value>)",
      },
      borderRadius: { xl: "calc(var(--radius) + 4px)", lg: "var(--radius)" },
    },
  },
  plugins: [],
};
