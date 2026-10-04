import type { BillShare, SalesLine, SalesOrder } from './types'

/**
 * A bill shared between salespeople (2026-09-24, `sales_order_shares`).
 *
 * The owner — the name the ERP put on the document — keeps 1 − Σ(shares); every
 * other holder gets their `pct`. Each PART is paid at its holder's own rate and
 * climbs its holder's own upline line: an 8% owner sharing RM 10,000 50/50 with
 * a 5% member is paid 8% of 5,000, the member 5% of 5,000, and the member's
 * uplines earn override on the member's 5,000 exactly as if the member had
 * written it (user 2026-09-24).
 *
 * WHY BEFORE THE ENGINE. The engine groups orders by salesperson and knows
 * nothing about who else was at the table. Scaling every money figure on the
 * order — each line, its cost, the total, what was paid — by the part gives each
 * holder an ordinary, smaller bill of their own. The deposit ratio and the margin
 * are ratios, so every part passes or fails the gate and lands in the same margin
 * band as the whole bill: a share can never turn a held bill into a paid one.
 * The Open Bill pick is keyed by order id, so each part carries it and each
 * holder's bonus is on their own part.
 *
 * Money is split to the sen, and the OWNER takes the remainder, so the parts
 * always add back to the bill exactly.
 *
 * Every part — the owner's too — carries `share`: whose bill it is and who
 * holds what (2026-09-30), so a ledger can say "From ADRIAN's bill" on the
 * part it shows and name both holders. The engine never reads it.
 */
export interface OrderShare {
  orderId: string
  staffId: string
  /** 0.5 = half. Strictly between 0 and 1; the shares on one bill sum below 1. */
  pct: number
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function scaleLine(line: SalesLine, pct: number): SalesLine {
  return {
    ...line,
    qty: line.qty * pct,
    lineAmount: round2(line.lineAmount * pct),
    costAmount: line.costAmount === undefined ? undefined : round2(line.costAmount * pct),
    optionCharge: line.optionCharge === undefined ? undefined : round2(line.optionCharge * pct),
  }
}

/** `whole − Σ parts`, so the owner's part makes the bill add back exactly. */
function remainderLine(line: SalesLine, parts: SalesLine[]): SalesLine {
  const sum = (pick: (l: SalesLine) => number | undefined) =>
    parts.reduce((a, l) => a + (pick(l) ?? 0), 0)
  return {
    ...line,
    qty: line.qty - sum(l => l.qty),
    lineAmount: round2(line.lineAmount - sum(l => l.lineAmount)),
    costAmount:
      line.costAmount === undefined ? undefined : round2(line.costAmount - sum(l => l.costAmount)),
    optionCharge:
      line.optionCharge === undefined ? undefined : round2(line.optionCharge - sum(l => l.optionCharge)),
  }
}

/**
 * Every order as the parts its holders are paid on. An order nobody shares is
 * returned untouched (the same object), so a month with no shares runs exactly
 * as it did before shares existed.
 *
 * A share naming the owner, or shares that leave the owner nothing, are refused
 * by the database (23SHR); here they are skipped defensively rather than paid
 * twice.
 */
export function splitOrdersByShares(
  orders: readonly SalesOrder[],
  shares: readonly OrderShare[],
): SalesOrder[] {
  const byOrder = new Map<string, OrderShare[]>()
  for (const s of shares) {
    if (!(s.pct > 0 && s.pct < 1)) continue
    const list = byOrder.get(s.orderId)
    if (list) list.push(s)
    else byOrder.set(s.orderId, [s])
  }

  const out: SalesOrder[] = []
  for (const order of orders) {
    const mine = (byOrder.get(order.id) ?? []).filter(s => s.staffId !== order.staffId)
    const given = mine.reduce((a, s) => a + s.pct, 0)
    if (mine.length === 0 || given >= 1) {
      out.push(order)
      continue
    }

    const share: BillShare = {
      ownerStaffId: order.staffId,
      parts: [{ staffId: order.staffId, pct: 1 - given }, ...mine.map(s => ({ staffId: s.staffId, pct: s.pct }))],
      wholeTotal: order.orderTotal,
    }
    const parts: SalesOrder[] = mine.map(s => ({
      ...order,
      staffId: s.staffId,
      orderTotal: round2(order.orderTotal * s.pct),
      paidAmount: round2(order.paidAmount * s.pct),
      lines: order.lines.map(l => scaleLine(l, s.pct)),
      share,
    }))

    out.push({
      ...order,
      orderTotal: round2(order.orderTotal - parts.reduce((a, p) => a + p.orderTotal, 0)),
      paidAmount: round2(order.paidAmount - parts.reduce((a, p) => a + p.paidAmount, 0)),
      lines: order.lines.map((l, i) => remainderLine(l, parts.map(p => p.lines[i]))),
      share,
    })
    out.push(...parts)
  }
  return out
}

/** The owner's part of a bill: 1 − Σ(shares), never below 0. */
export function ownerPart(shares: readonly { pct: number }[]): number {
  return Math.max(0, 1 - shares.reduce((a, s) => a + s.pct, 0))
}
