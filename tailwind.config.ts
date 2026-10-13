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

        // The design system's semantic colours (2026-10-14, globals.css › the
        // design system's tokens): `bg-ds-accent`, `text-ds-ink-2`,
        // `border-ds-border` … draw HR's value by default and the Revenue
        // app's inside [data-revenue-app]. Full colours, so no `/opacity`.
        ds: {
          page: 'var(--ds-page)',
          surface: 'var(--ds-surface)',
          'surface-2': 'var(--ds-surface-2)',
          'surface-3': 'var(--ds-surface-3)',
          zebra: 'var(--ds-zebra)',
          ink: 'var(--ds-ink)',
          'ink-2': 'var(--ds-ink-2)',
          'ink-3': 'var(--ds-ink-3)',
          'ink-4': 'var(--ds-ink-4)',
          placeholder: 'var(--ds-placeholder)',
          accent: 'var(--ds-accent)',
          'accent-hover': 'var(--ds-accent-hover)',
          'on-accent': 'var(--ds-on-accent)',
          'accent-text': 'var(--ds-accent-text)',
          link: 'var(--ds-link)',
          'accent-soft': 'var(--ds-accent-soft)',
          'accent-soft-ink': 'var(--ds-accent-soft-ink)',
          'accent-soft-border': 'var(--ds-accent-soft-border)',
          dark: 'var(--ds-dark)',
          'on-dark': 'var(--ds-on-dark)',
          'dark-sub': 'var(--ds-dark-sub)',
          border: 'var(--ds-border)',
          'border-strong': 'var(--ds-border-strong)',
          'border-hover': 'var(--ds-border-hover)',
          divider: 'var(--ds-divider)',
          hover: 'var(--ds-hover)',
          'row-hover': 'var(--ds-row-hover)',
          selected: 'var(--ds-selected)',
          'table-head': 'var(--ds-table-head)',
          'table-head-rule': 'var(--ds-table-head-rule)',
          disabled: 'var(--ds-disabled)',
          success: 'var(--ds-success)',
          'success-bg': 'var(--ds-success-bg)',
          'success-border': 'var(--ds-success-border)',
          warning: 'var(--ds-warning)',
          'warning-bg': 'var(--ds-warning-bg)',
          'warning-border': 'var(--ds-warning-border)',
          danger: 'var(--ds-danger)',
          'danger-bg': 'var(--ds-danger-bg)',
          'danger-border': 'var(--ds-danger-border)',
          info: 'var(--ds-info)',
          'info-bg': 'var(--ds-info-bg)',
          'info-border': 'var(--ds-info-border)',
          scrim: 'var(--ds-scrim)',
        },
      },

      // ─── Typography ──────────────────────────────────────────────────────
      fontFamily: {
        // 2026-06-24: retired Instrument Serif — the whole portal now reads in
        // Inter to match the HOUZS Century house style. `font-serif` is kept as
        // an alias of the sans stack so the ~40 pages using it need no edits;
        // inline `italic` on those elements simply slants Inter.
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        // Newsreader, Georgia behind it (2026-10-14) — globals.css --font-display.
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)', '"Chivo Mono"', 'Menlo', 'monospace'],
        cjk: ['var(--font-cjk)', '"Noto Sans SC"', 'sans-serif'],
        // The design system's faces, per theme: HR's body / Newsreader /
        // Chivo Mono; the Revenue app's body / Inter Tight / Inter Tight.
        'ds-body': ['var(--ds-font-body)'],
        'ds-display': ['var(--ds-font-display)'],
        'ds-num': ['var(--ds-font-num)'],
      },

      // Shared statement weight: medium emphasis throughout the portal.
      // Explicit strong emphasis stays one step above ordinary labels.
      fontWeight: {
        semibold: '500',
        bold: '600',
      },

      fontSize: {
        // Override defaults with DESIGN.md type scale
        'mono-xs': ['11px', { lineHeight: '16px', letterSpacing: '0' }],
        'mono-sm': ['12px', { lineHeight: '16px', letterSpacing: '0' }],
        xs: ['11px', '16px'],
        sm: ['13px', '20px'],
        base: ['13px', '20px'],
        md: ['15px', '24px'],
        lg: ['18px', '24px'],
        xl: ['22px', '28px'],
        '2xl': ['28px', '32px'],
        '3xl': ['40px', '44px'],
        hero: ['64px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'hero-lg': ['72px', { lineHeight: '1', letterSpacing: '-0.025em' }],
        // The design system's scale, per theme (HR 36 / 17 / 13 / 12 / 10.5,
        // Revenue 28 / 18 / 14 / 12.5 / 12).
        'ds-title': 'var(--ds-title-size)',
        'ds-h2': 'var(--ds-h2-size)',
        'ds-body': 'var(--ds-body-size)',
        'ds-small': 'var(--ds-small-size)',
        'ds-label': 'var(--ds-label-size)',
      },

      // ─── Spacing ─────────────────────────────────────────────────────────
      spacing: {
        '18': '72px',
      },
      // The design system's control heights, paddings and gaps, per theme.
      height: {
        'ds-control': 'var(--ds-control-h)',
        'ds-control-sm': 'var(--ds-control-h-sm)',
        'ds-control-lg': 'var(--ds-control-h-lg)',
      },
      padding: {
        'ds-control': 'var(--ds-control-px)',
        'ds-page': 'var(--ds-pad)',
      },
      gap: {
        ds: 'var(--ds-gap)',
        'ds-lg': 'var(--ds-gap-lg)',
        'ds-section': 'var(--ds-section-gap)',
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
        // The design system's radii, per theme (HR 6 / 10 / 12 / 16 …,
        // Revenue 14 / 14 / 18 / 24 …).
        'ds-control': 'var(--ds-r-control)',
        'ds-field': 'var(--ds-r-field)',
        'ds-card': 'var(--ds-r-card)',
        'ds-panel': 'var(--ds-r-panel)',
        'ds-chip': 'var(--ds-r-chip)',
        'ds-row': 'var(--ds-r-row)',
        'ds-sheet': 'var(--ds-r-sheet)',
        'ds-tile': 'var(--ds-r-tile)',
      },

      // ─── Shadows (subtle, warm) ───────────────────────────────────────────
      boxShadow: {
        modal: '0 10px 40px rgb(var(--ink) / 0.15)',
        dropdown: '0 4px 12px rgb(var(--ink) / 0.08)',
        'ds-card': 'var(--ds-shadow-card)',
        'ds-menu': 'var(--ds-shadow-menu)',
        'ds-overlay': 'var(--ds-shadow-overlay)',
        'ds-button': 'var(--ds-shadow-button)',
      },

      // ─── Animation ────────────────────────────────────────────────────────
      // The design system's one curve (`ease-ds`) and its durations by job
      // (`duration-press` … `duration-drawer`).
      transitionTimingFunction: {
        ds: 'var(--ds-ease)',
      },
      transitionDuration: {
        '120': '120ms',
        '250': '250ms',
        press: 'var(--ds-dur-press)',
        menu: 'var(--ds-dur-menu)',
        dialog: 'var(--ds-dur-dialog)',
        fade: 'var(--ds-dur-fade)',
        slide: 'var(--ds-dur-slide)',
        sheet: 'var(--ds-dur-sheet)',
        drawer: 'var(--ds-dur-drawer)',
      },
    },
  },
  plugins: [],
}

export default config
