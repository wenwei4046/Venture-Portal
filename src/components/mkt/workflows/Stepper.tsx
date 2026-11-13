'use client'

import w from './workflows.module.css'

// The − n + stepper (the prototype's): `small` is the summary row's Promise (26px), else the panel's (34px).

export default function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  small,
  over,
  wide,
}: {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  label: string
  small?: boolean
  /** Drawn red (the promise when the stages run longer). */
  over?: boolean
  /** The SLA's wider number. */
  wide?: boolean
}) {
  if (small) {
    return (
      <span className={w.stepSm} role="group" aria-label={label}>
        <button type="button" className={w.stepSmBtn} aria-label={`${label}: one less`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span className={`${w.stepSmN}${over ? ` ${w.stepOver}` : ''}`} aria-live="polite">{value}</span>
        <button type="button" className={w.stepSmBtn} aria-label={`${label}: one more`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </span>
    )
  }
  return (
    <span className={w.step} role="group" aria-label={label}>
      <button type="button" className={w.stepBtn} aria-label={`${label}: one less`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className={`${w.stepN}${wide ? ` ${w.stepNWide}` : ''}`} aria-live="polite">{value}</span>
      <button type="button" className={w.stepBtn} aria-label={`${label}: one more`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </span>
  )
}
