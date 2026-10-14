import { addDays, balanceOf, dayMon, daysToDecide, firstOfMonth, indexMonth, dayInfo, assignmentFor, monthName } from './engine'
import type { AttConfig, AttLedger, AttMonth, AttRequest } from './types'

/**
 * What HR's Overview says about Attendance (2026-10-15, the Attendance
 * handoff's Overview): "4 requests waiting for HR · 2 not in yet · October
 * closes 3 Nov" — and the badges on Approve, Leave and Month close.
 */
export function attendanceNews(config: AttConfig, month: AttMonth, requests: AttRequest[], ledger: AttLedger) {
  const today = config.today
  const waitingHr = requests.filter(r => r.status === 'pending' && r.steps.some(s => s.state === 'waiting' && s.role === 'hr')).length
  const waitingAll = requests.filter(r => r.status === 'pending').length
  const ctx = { config, month, today, now: config.now }
  const idx = indexMonth(month)
  const notIn = config.people.filter(p => {
    const a = assignmentFor(p, today, config.assignments)
    return a?.mode === 'clock' && dayInfo(p, today, ctx, idx).code === '·'
  }).length
  const al = config.leaveTypes.find(t => t.code === 'AL') ?? null
  const low = al ? config.people.filter(p => {
    const b = balanceOf(p, al, config, ledger, today)
    return b.covered && b.left != null && b.left <= 2
  }).length : 0
  const undecided = daysToDecide(ctx).filter(d => !d.decision).length
  const closesOn = addDays(firstOfMonth(addDays(firstOfMonth(today), 40)), 2)
  const summary = `${waitingHr} ${waitingHr === 1 ? 'request' : 'requests'} waiting for HR · ${notIn} not in yet · ${monthName(today)} closes ${dayMon(closesOn)}`
  return { summary, badges: { requests: waitingHr, balances: low, close: undecided + waitingAll }, waitingHr, notIn, low, undecided }
}
