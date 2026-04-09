import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
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
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
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
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        transport: {
          flight: "hsl(var(--transport-flight))",
          train: "hsl(var(--transport-train))",
          ferry: "hsl(var(--transport-ferry))",
          car: "hsl(var(--transport-car))",
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
        // ── V2 Material Design 3 tokens ──
        "v2-primary":                   "var(--v2-primary)",
        "v2-on-primary":                "var(--v2-on-primary)",
        "v2-primary-container":         "var(--v2-primary-container)",
        "v2-on-primary-container":      "var(--v2-on-primary-container)",
        "v2-primary-fixed":             "var(--v2-primary-fixed)",
        "v2-primary-fixed-dim":         "var(--v2-primary-fixed-dim)",
        "v2-secondary":                 "var(--v2-secondary)",
        "v2-on-secondary":              "var(--v2-on-secondary)",
        "v2-secondary-container":       "var(--v2-secondary-container)",
        "v2-on-secondary-container":    "var(--v2-on-secondary-container)",
        "v2-tertiary":                  "var(--v2-tertiary)",
        "v2-on-tertiary":               "var(--v2-on-tertiary)",
        "v2-tertiary-container":        "var(--v2-tertiary-container)",
        "v2-on-tertiary-container":     "var(--v2-on-tertiary-container)",
        "v2-error":                     "var(--v2-error)",
        "v2-on-error":                  "var(--v2-on-error)",
        "v2-error-container":           "var(--v2-error-container)",
        "v2-background":                "var(--v2-background)",
        "v2-on-background":             "var(--v2-on-background)",
        "v2-surface":                   "var(--v2-surface)",
        "v2-on-surface":                "var(--v2-on-surface)",
        "v2-surface-variant":           "var(--v2-surface-variant)",
        "v2-on-surface-variant":        "var(--v2-on-surface-variant)",
        "v2-surface-bright":            "var(--v2-surface-bright)",
        "v2-surface-dim":               "var(--v2-surface-dim)",
        "v2-surface-container":         "var(--v2-surface-container)",
        "v2-surface-container-low":     "var(--v2-surface-container-low)",
        "v2-surface-container-high":    "var(--v2-surface-container-high)",
        "v2-surface-container-highest": "var(--v2-surface-container-highest)",
        "v2-surface-container-lowest":  "var(--v2-surface-container-lowest)",
        "v2-outline":                   "var(--v2-outline)",
        "v2-outline-variant":           "var(--v2-outline-variant)",
        "v2-inverse-surface":           "var(--v2-inverse-surface)",
        "v2-inverse-on-surface":        "var(--v2-inverse-on-surface)",
      },
      fontFamily: {
        "plus-jakarta": ["'Plus Jakarta Sans'", "sans-serif"],
        manrope: ["Manrope", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",               /* 16px */
        md: "calc(var(--radius) - 4px)",   /* 12px */
        sm: "calc(var(--radius) - 8px)",   /* 8px */
        xl: "calc(var(--radius) + 4px)",   /* 20px */
        "2xl": "calc(var(--radius) + 8px)",/* 24px */
      },
      boxShadow: {
        'card': 'var(--shadow-card)',
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
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
