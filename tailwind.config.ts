import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ─── Colors (DESIGN.md v2.0 — warm paper + rust accent) ──────────────
      colors: {
        // Base warm paper (renamed from "bg" to avoid Tailwind utility prefix collision)
        paper: '#F5EFE4',
        surface: '#FBF8F2',
        'surface-2': '#EEE6D6',
        hairline: '#DFD4BE',
        ink: '#1A1613',
        graphite: '#6B5F52',
        muted: '#9E8F7F',

        // Single rust accent
        accent: {
          DEFAULT: '#CC5A2E',
          bg: '#FBE8DE',
          border: '#E8B098',
          hover: '#B54A22',
        },

        // Semantic (muted)
        ledger: {
          DEFAULT: '#3D6B45',
          bg: '#E7EFE6',
        },
        alert: {
          DEFAULT: '#A07020',
          bg: '#F5EBD3',
        },
        danger: {
          DEFAULT: '#A3371A',
          bg: '#F8E1D8',
        },
        info: {
          DEFAULT: '#5A6B8A',
          bg: '#EBEEF3',
        },
      },

      // ─── Typography ──────────────────────────────────────────────────────
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', '"Instrument Serif"', '"Noto Serif TC"', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', '"JetBrains Mono"', 'Menlo', 'monospace'],
        cjk: ['var(--font-cjk)', '"Noto Serif TC"', 'serif'],
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

      // ─── Radius (rounded-md max, nothing bigger) ──────────────────────────
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },

      // ─── Shadows (subtle, warm) ───────────────────────────────────────────
      boxShadow: {
        modal: '0 10px 40px rgba(26, 22, 19, 0.15)',
        dropdown: '0 4px 12px rgba(26, 22, 19, 0.08)',
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
