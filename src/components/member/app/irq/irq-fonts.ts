import { Manrope, Space_Grotesk } from 'next/font/google'

/**
 * IR Quote's faces (2026-11-05, the handoff `.design/ir-quote/design_handoff_ir_quote` — "Fonts: Space Grotesk 500–700
 * (titles, numbers), Manrope 400–800 (UI). Quotation doc: Georgia."; the user: "确保它跟 prototype 的东西是长得一模一样的").
 * Like Lead View's Figtree, only the IR Quote screens load them: their root (`[data-irq]`) hangs the two variables,
 * which the generated templates read (`var(--font-manrope)`, `var(--font-space-grotesk)` — tools/ir-quote/dc-to-tsx.mjs).
 * The weights are the prototype's own Google Fonts request, one face each — so its in-between weights (550, 650) draw
 * as the nearest of these, exactly as on the prototype (a variable font would draw a true 650, a shade lighter).
 * The screens read the face's own name alone (IrQuoteScreens › FACES), without next/font's made-up fallback: a glyph
 * neither face has (⚠, →) falls to the prototype's own list — 'Noto Sans SC', system-ui — so its line is as tall.
 */
export const manrope = Manrope({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700', '800'], variable: '--font-manrope', display: 'swap' })
export const spaceGrotesk = Space_Grotesk({ subsets: ['latin', 'latin-ext'], weight: ['500', '600', '700'], variable: '--font-space-grotesk', display: 'swap' })
