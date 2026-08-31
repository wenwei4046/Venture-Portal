import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ─── Colors (DESIGN.md v2.0 — CSS variables for dark mode support) ──
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'num-ink': 'rgb(var(--num-ink) / <alpha-value>)',
        graphite: 'rgb(var(--graphite) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',

        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          bg: 'rgb(var(--accent-bg) / <alpha-value>)',
          border: 'rgb(var(--accent-border) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover) / <alpha-value>)',
        },

        ledger: {
          DEFAULT: 'rgb(var(--ledger) / <alpha-value>)',
          bg: 'rgb(var(--ledger-bg) / <alpha-value>)',
        },
        alert: {
          DEFAULT: 'rgb(var(--alert) / <alpha-value>)',
          bg: 'rgb(var(--alert-bg) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          bg: 'rgb(var(--danger-bg) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          bg: 'rgb(var(--info-bg) / <alpha-value>)',
        },

        // Walnut — the one dark object (hero figures, primary buttons, scrim).
        // Deliberately NOT a semantic colour and never a large chrome surface;
        // see the header comment in globals.css.
        walnut: 'rgb(var(--walnut) / <alpha-value>)',
        scrim: 'rgb(var(--scrim) / <alpha-value>)',

        // Chrome — shared by the two floating panels (sidebar rail, header).
        chrome: 'rgb(var(--chrome) / <alpha-value>)',
      },

      // ─── Typography ──────────────────────────────────────────────────────
      fontFamily: {
        // 2026-06-24: retired Instrument Serif — the whole portal now reads in
        // Inter to match the HOUZS Century house style. `font-serif` is kept as
        // an alias of the sans stack so the ~40 pages using it need no edits;
        // inline `italic` on those elements simply slants Inter.
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"Chivo Mono"', 'Menlo', 'monospace'],
        cjk: ['var(--font-cjk)', '"Noto Sans SC"', 'sans-serif'],
      },

      fontSize: {
        // Override defaults with DESIGN.md type scale
        'mono-xs': ['11px', { lineHeight: '16px', letterSpacing: '0' }],
        'mono-sm': ['12px', { lineHeight: '16px', letterSpacing: '0' }],
        xs: ['11px', '16px'],
        sm: ['13px', '20px'],
        base: ['14px', '20px'],
        md: ['15px', '24px'],
        lg: ['18px', '24px'],
        xl: ['22px', '28px'],
        '2xl': ['28px', '32px'],
        '3xl': ['40px', '44px'],
        hero: ['64px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'hero-lg': ['72px', { lineHeight: '1', letterSpacing: '-0.025em' }],
      },

      // ─── Spacing ─────────────────────────────────────────────────────────
      spacing: {
        '18': '72px',
      },

      // ─── Radius scale (2026-08-31) ────────────────────────────────────────
      // Four steps, each with a job. Random `rounded-lg` everywhere is what
      // makes an interface look templated; a named scale is what makes it look
      // designed. Guardrail: round the CONTAINER, never the rows — a ledger
      // table sits in a `rounded-card` well with overflow-hidden, but every
      // <tr> inside stays square, because rounded rows break the vertical
      // alignment the eye uses to scan a column of figures.
      // `md` is the codebase default (~950 uses) and carries the general
      // softening — nudged 6→8px so everything reads a touch rounder without
      // touching a single component. The named steps below are for the places
      // that should be deliberately softer than the default.
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '10px',
        control: '6px', // inputs, buttons — tighter than the default on purpose
        card: '12px', // cards, table wells
        panel: '16px', // modals, the sidebar rail
      },

      // ─── Shadows (subtle, warm) ───────────────────────────────────────────
      boxShadow: {
        modal: '0 10px 40px rgb(var(--ink) / 0.15)',
        dropdown: '0 4px 12px rgb(var(--ink) / 0.08)',
      },

      // ─── Animation ────────────────────────────────────────────────────────
      transitionDuration: {
        '120': '120ms',
        '250': '250ms',
      },
    },
  },
  plugins: [],
}

export default config
