/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        /* NEON SWARM design tokens (design.md §4) */
        void: {
          950: "#030712",
          900: "#07111F",
          800: "#0B1628",
        },
        neon: {
          cyan: "#22D3EE",
          "cyan-light": "#67E8F9",
          magenta: "#E935C1",
          violet: "#8B5CF6",
          lime: "#A3E635",
          amber: "#FBBF24",
          red: "#EF4444",
        },
      },
      fontFamily: {
        display: ["Orbitron", "Noto Sans SC", "sans-serif"],
        sans: ["Noto Sans SC", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        label: ["Rajdhani", "Noto Sans SC", "sans-serif"],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "glow-cyan": "0 0 24px rgba(34,211,238,.35)",
        "glow-cyan-lg": "0 0 28px rgba(34,211,238,.5)",
        "glow-magenta": "0 0 28px rgba(233,53,193,.30)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "scan-sweep": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        "glow-line": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.9" },
        },
        "drift-slow": {
          "0%": { transform: "translateX(-12px)" },
          "50%": { transform: "translateX(12px)" },
          "100%": { transform: "translateX(-12px)" },
        },
        "data-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        "pulse-soft": {
          "0%, 100%": { boxShadow: "0 0 16px rgba(34,211,238,.35)" },
          "50%": { boxShadow: "0 0 30px rgba(34,211,238,.6)" },
        },
        "trail-fly": {
          "0%": { transform: "translate(-30%, 120%) rotate(-38deg)", opacity: "0" },
          "8%": { opacity: "1" },
          "60%": { opacity: "1" },
          "100%": { transform: "translate(140%, -60%) rotate(-38deg)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "scan-sweep": "scan-sweep 1.6s linear infinite",
        "glow-line": "glow-line 3.2s ease-in-out infinite",
        "drift-slow": "drift-slow 30s ease-in-out infinite",
        "data-flow": "data-flow 12s linear infinite",
        "pulse-soft": "pulse-soft 2.8s ease-in-out infinite",
        "trail-fly": "trail-fly 8s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
