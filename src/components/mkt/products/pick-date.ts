import type { MouseEvent } from 'react'

/** A click anywhere on a date field opens its calendar (not only its small icon) — every date field of the Product
 * Builder, one look, the browser's own picker. A browser without showPicker keeps its own way. */
export function pickDate(e: MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget
  if (el.disabled || el.readOnly) return
  try {
    el.showPicker()
  } catch {
    // Not allowed here (or not supported): the field still takes a typed date.
  }
}
