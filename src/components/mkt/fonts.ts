import { IBM_Plex_Sans, Nunito } from 'next/font/google'

/**
 * Marketing's Appearance faces (2026-10-23, the handoff's Settings › Appearance): Nunito and IBM Plex Sans, beside the
 * portal's Inter. Declared here, hung on Marketing's shell only (lib/marketing/look.ts) — a browser downloads one only
 * when somebody picks it.
 */
export const nunito = Nunito({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-mk-nunito', display: 'swap' })
export const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mk-plex', display: 'swap' })

/** The CSS font-family for a face of the Appearance panel. */
export function lookFamily(font: 'Inter' | 'Nunito' | 'IBM Plex'): string {
  if (font === 'Nunito') return 'var(--font-mk-nunito), system-ui, sans-serif'
  if (font === 'IBM Plex') return 'var(--font-mk-plex), system-ui, sans-serif'
  return 'var(--font-sans), system-ui, sans-serif'
}
