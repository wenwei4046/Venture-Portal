// Lead View v2's status colours (README §4.1 of `docs/design_handoff_lead_view_v2` — "use everywhere"): a status's
// words decide its tone, so every screen colours the same word the same way.

export type Tone = 'pos' | 'warn' | 'idle' | 'muted' | 'rust'

const POS = new Set(['in use', 'receiving', 'saved', 'came', 'closed', 'on', 'added', 'handed', 'connected'])
const WARN = new Set(['ending soon', 'to review', 'appointment', 'contacted', 'paused'])
const IDLE = new Set(['scheduled', 'not used', 'dismissed', 'draft', 'off', 'edited'])
const RUST = new Set(['expired', 'reconnect', 'not handed', 'not handed yet', 'needs follow-up', 'no phone', 'no phone yet', 'deleted', 'lost'])

/** The tone of a status by its words; "Ends in N days" is Ending soon, "Starts …" Scheduled. Unknown words are muted. */
export function toneOf(status: string): Tone {
  const w = status.trim().toLowerCase()
  if (/^ends in \d+ days?$/.test(w)) return 'warn'
  if (w.startsWith('starts ')) return 'idle'
  if (POS.has(w)) return 'pos'
  if (WARN.has(w)) return 'warn'
  if (IDLE.has(w)) return 'idle'
  if (RUST.has(w)) return 'rust'
  return 'muted'
}
