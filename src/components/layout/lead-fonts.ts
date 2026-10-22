import { Cormorant_Garamond, Lora } from 'next/font/google'

/**
 * Lead View's faces (2026-10-22, the redesign v2 handoff `docs/design_handoff_lead_view_inbox`): Lora for every
 * word of its pages, Cormorant Garamond for page titles and a panel's heading. The third theme of the portal
 * (DESIGN.md › Three views, one system), so — like the Revenue app's Inter Tight — only Lead View's shell loads
 * them: LeadShell hangs both variables on its root (`[data-lead-view]`), and the portal never downloads them.
 */
export const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-lora',
  display: 'swap',
})

export const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-cormorant',
  display: 'swap',
})
