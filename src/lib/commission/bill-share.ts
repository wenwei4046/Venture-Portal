/**
 * Sharing a bill from its right-click menu (2026-09-30): *Share this bill…* on
 * a salesperson's ledger on Comm Cal and on Sales orders.
 *
 * Two people often close one customer together at a fair; the bill carries
 * one name, so HR says who else holds a part and how much (default 50/50).
 * The rule is the database's (`sales_order_shares`, mig 20260924010000): the
 * owner — the name the ERP put on the bill — keeps 1 − Σ(shares) and never
 * nothing (23SHR), a paid month refuses (23RUN), and the actions refuse a bill
 * a closed salesperson is paid on. Each part is paid at its holder's own rate
 * and climbs its holder's own upline line (`lib/commission/shares.ts`). This
 * file only decides what the menu shows and says what happened.
 */

/** One holder of a bill and their part (0.5 = half) — the owner's included. */
export interface ShareHolder {
  staffId: string
  name: string
  pct: number
}

/** Somebody a bill may be shared with: a member of the sub-department's team. */
export interface ShareCandidate {
  staffId: string
  name: string
  /** Why they cannot take a part now ("closed for September 2026"), or null. */
  closed?: string | null
}

export type BillShareAction =
  /** The bill can be shared, or its shares changed. `parts` is the owner first. */
  | { kind: 'share'; ownerStaffId: string; ownerName: string; parts: ShareHolder[] }
  /** Would be offered, but the month has paid or somebody paid on it is closed. */
  | { kind: 'locked'; ownerStaffId: string; ownerName: string; parts: ShareHolder[]; reason: string }

/** What a share, a change of part or a stop did (`shareOrder` / `unshareOrder`). */
export interface BillShareResult {
  orderId: string
  orderNo: string
  /** False when it was already that way and nothing was written. */
  changed: boolean
  /** The holder the write was about. */
  staffId: string
  name: string
  /** Their part before the write; null when they held none. */
  before: number | null
  /** Their part now; null once they hold none. */
  after: number | null
  /** Every holder now, the owner first. */
  parts: ShareHolder[]
}

/**
 * What `shareOrder` / `unshareOrder` answer. A refusal the user must act on —
 * a closed month, a paid run, a part that leaves the owner nothing — comes
 * back as `reason`, because a production build hands the browser only a
 * digest of anything a Server Action throws.
 */
export type BillShareAnswer = { ok: true; result: BillShareResult } | { ok: false; reason: string }

/** 0.5 → "50%", 1/3 → "33.3%". */
export function sharePct(p: number): string {
  const v = Math.round(p * 1000) / 10
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}%`
}

/** "ADRIAN 50% · ANTHONY 50%" */
export function holdersLine(parts: readonly ShareHolder[]): string {
  return parts.map(p => `${p.name} ${sharePct(p.pct)}`).join(' · ')
}

/**
 * The bill's holders, the owner first with what nobody else holds. The owner
 * is never stored as a share; a share naming the owner is dropped here as the
 * split drops it.
 */
export function holdersOf(owner: { staffId: string; name: string }, shares: readonly ShareHolder[]): ShareHolder[] {
  const others = shares.filter(s => s.staffId !== owner.staffId)
    .slice().sort((a, b) => a.name.localeCompare(b.name))
  const given = others.reduce((a, s) => a + s.pct, 0)
  return [{ staffId: owner.staffId, name: owner.name, pct: Math.max(0, 1 - given) }, ...others]
}

export function billShareAction(
  bill: { ownerStaffId: string; ownerName: string; parts: readonly ShareHolder[] },
  ctx: { runLocked: boolean; closedReason: string | null; monthLabel: string },
): BillShareAction {
  const base = { ownerStaffId: bill.ownerStaffId, ownerName: bill.ownerName, parts: [...bill.parts] }
  if (ctx.runLocked) {
    return { kind: 'locked', ...base, reason: `The run for ${ctx.monthLabel} has paid — reopen it before changing who shares this bill` }
  }
  if (ctx.closedReason) return { kind: 'locked', ...base, reason: ctx.closedReason }
  return { kind: 'share', ...base }
}

/** What the owner keeps once `staffId` holds `pct` (their old part, if any, replaced). */
export function ownerKeeps(parts: readonly ShareHolder[], ownerStaffId: string, staffId: string, pct: number): number {
  const others = parts.filter(p => p.staffId !== ownerStaffId && p.staffId !== staffId)
  return 1 - others.reduce((a, p) => a + p.pct, 0) - pct
}

/**
 * The part the form starts at, in whole percent: an existing holder's own;
 * otherwise half of the bill while the owner holds it all (the claim form's
 * 50/50), else half of what the owner still keeps.
 */
export function defaultPartFor(parts: readonly ShareHolder[], ownerStaffId: string, staffId: string): number {
  const held = parts.find(p => p.staffId === staffId && p.staffId !== ownerStaffId)
  if (held) return Math.round(held.pct * 10_000) / 100
  const keeps = ownerKeeps(parts, ownerStaffId, staffId, 0)
  return Math.max(1, Math.floor((keeps >= 0.999 ? 1 : keeps) * 100 / 2))
}

/** Parse the form's percent: "50" → 0.5. Null when it is not a number. */
export function parsePart(text: string): number | null {
  const n = Number(text.trim())
  if (!text.trim() || !Number.isFinite(n)) return null
  return Math.round(n * 100) / 10_000
}

/** Why the form cannot be saved as it stands, or null. */
export function shareProblem(
  parts: readonly ShareHolder[],
  owner: { staffId: string; name: string },
  staffId: string,
  pct: number | null,
): string | null {
  if (!staffId) return 'Pick who to share it with.'
  if (staffId === owner.staffId) return `It is ${owner.name}’s bill already.`
  if (pct === null || !(pct > 0 && pct < 1)) return 'Their part is more than 0% and less than 100%.'
  if (ownerKeeps(parts, owner.staffId, staffId, pct) < 0.0001) {
    return `That leaves ${owner.name} nothing — the owner always keeps a part.`
  }
  return null
}

/** The holders the form would leave, for the line under it. */
export function partsAfter(
  parts: readonly ShareHolder[],
  owner: { staffId: string; name: string },
  who: { staffId: string; name: string },
  pct: number,
): ShareHolder[] {
  const others = parts.filter(p => p.staffId !== owner.staffId && p.staffId !== who.staffId)
  return holdersOf(owner, [...others, { staffId: who.staffId, name: who.name, pct }])
}

/** What the share, the change or the stop did, in words. */
export function shareOutcomeMessage(result: BillShareResult): string {
  const owner = result.parts[0]
  if (!result.changed) {
    return result.after === null
      ? `${result.name} holds no part of ${result.orderNo} — nothing changed.`
      : `${result.name} already holds ${sharePct(result.after)} of ${result.orderNo} — nothing changed.`
  }
  if (result.after === null) {
    return result.parts.length > 1
      ? `${result.orderNo} is no longer shared with ${result.name}: ${holdersLine(result.parts)}.`
      : `${result.orderNo} is no longer shared with ${result.name} — ${owner?.name ?? 'its owner'} holds all of it again.`
  }
  return `${result.orderNo} is shared: ${holdersLine(result.parts)}. Each part is paid at its holder’s own rate.`
}
