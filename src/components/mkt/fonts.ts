import { DM_Serif_Display, IBM_Plex_Sans, Nunito, Playfair_Display, Space_Grotesk } from 'next/font/google'

/**
 * Marketing's Appearance faces (2026-10-23, the handoff's Settings › Appearance): Nunito and IBM Plex Sans, beside the
 * portal's Inter. Declared here, hung on Marketing's shell only (lib/marketing/look.ts) — a browser downloads one only
 * when somebody picks it.
 */
export const nunito = Nunito({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-mk-nunito', display: 'swap' })
export const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mk-plex', display: 'swap' })

/**
 * A subsidiary's brand font in the Library (2026-10-24, ⑥-2 — the handoff's six: Newsreader, Nunito, Playfair, DM Serif,
 * Space Grotesk, Inter): the three the portal has not, hung on Marketing's shell beside the two above and drawn only on
 * a brand's own name (lib/marketing/library.ts › brandFace), so a browser downloads one only when a brand wears it.
 */
export const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-mk-playfair', display: 'swap' })
export const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: '400', variable: '--font-mk-dmserif', display: 'swap' })
export const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mk-grotesk', display: 'swap' })

/** The CSS font-family for a face of the Appearance panel. */
export function lookFamily(font: 'Inter' | 'Nunito' | 'IBM Plex'): string {
  if (font === 'Nunito') return 'var(--font-mk-nunito), system-ui, sans-serif'
  if (font === 'IBM Plex') return 'var(--font-mk-plex), system-ui, sans-serif'
  return 'var(--font-sans), system-ui, sans-serif'
}
