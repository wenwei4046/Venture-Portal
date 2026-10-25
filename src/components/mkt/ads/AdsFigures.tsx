import { adsCard, figureText, type AdsCard, type AdsReport, type AdsTargets } from '@/lib/marketing/ads'
import s from './ads.module.css'

// A report's figures, two a row — the handoff's PIC Link report cards: each figure's words, its value and, under it, how it
// stands against its target (on target in green, off it in red).

const TONE: Record<AdsCard['tone'], string> = { good: s.good, bad: s.bad, muted: '' }

export default function AdsFigures({ cards }: { cards: AdsCard[] }) {
  return (
    <div className={s.figs}>
      {cards.map(c => (
        <div key={c.key} className={s.fig}>
          <div className={s.figLabel}>{c.label}</div>
          <div className={s.figValue}>{c.value}</div>
          {c.sub ? <div className={`${s.figSub} ${TONE[c.tone]}`}>{c.sub}</div> : null}
        </div>
      ))}
    </div>
  )
}

/** A published report's cards, in its setup's order (a figure since taken off the setup last). */
export const reportCards = (r: Pick<AdsReport, 'values' | 'targets'>, figures: readonly string[]): AdsCard[] => {
  const at = (k: string) => (figures.indexOf(k) < 0 ? 99 : figures.indexOf(k))
  return (Object.keys(r.values) as (keyof AdsReport['values'])[]).sort((a, b) => at(a) - at(b)).map(k => adsCard(k, r.values, r.targets))
}

/** Its targets in words: "Budget RM 6,000 · Cost per lead RM 20.00 · ROAS 3.0 · Appointment rate 25%". */
export function targetWords(t: AdsTargets): string {
  const out: string[] = []
  if (t.budget != null) out.push(`Budget ${figureText('spend', t.budget)}`)
  if (t.cpl != null) out.push(`Cost per lead ${figureText('cpl', t.cpl)}`)
  if (t.roas != null) out.push(`ROAS ${figureText('roas', t.roas)}`)
  if (t.apptRate != null) out.push(`Appointment rate ${figureText('apptRate', t.apptRate)}`)
  return out.join(' · ')
}
