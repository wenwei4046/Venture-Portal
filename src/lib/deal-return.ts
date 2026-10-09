// Where a deal's own page returns to (2026-10-09, the user's Claude Design
// handoff): "← Back to Overview" when it was opened from the Overview's
// instalments, "← Back to Calendar" from the repayment calendar (on the month
// the calendar showed), else its list. The link is a ReturnLink, so it steps
// back through the tab's history when that is where the reader came from —
// the page returns exactly as it was left.

export interface DealReturn {
  href: string
  label: string
}

export function dealReturn(list: DealReturn, sp: { from?: string; month?: string }): DealReturn {
  if (sp.from === 'overview') return { href: '/dashboard', label: 'Overview' }
  if (sp.from === 'calendar') {
    const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month : null
    return { href: month ? `/repayment-schedule?month=${month}` : '/repayment-schedule', label: 'Calendar' }
  }
  return list
}

/** A deal's page as the repayment calendar opens it — the month only when the calendar's own URL named one, so Back matches it. */
export function fromCalendar(href: string, month?: string | null): string {
  const m = /^\d{4}-\d{2}$/.test(month ?? '') ? `&month=${month}` : ''
  return `${href}?from=calendar${m}`
}
