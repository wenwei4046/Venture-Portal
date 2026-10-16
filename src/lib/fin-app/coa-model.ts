// Report › Chart of Account in the Finance phone app (2026-10-15, part E3b — a
// page the design does not draw, in its style): Settings › Chart of Accounts
// as the desktop reads it — the active accounts as the headline, the inactive
// ones in a word (hidden until *Show inactive*, as the desktop's), a card per
// account type with its range, the type's accounts as the desktop's tree (a
// parent before its own, at any depth), each account its own screen. Pure.

import { ACCOUNT_TYPES, rangeFor, typeLabel, type AccountType, type CashFlowCategory } from '@/lib/coa'
import type { CoaAccount } from '@/lib/coa-edit'
import type { CardTone, HubCardItem } from '@/components/finv/Hub'
import { plural } from './page-model'

export const CFC_WORDS: Record<CashFlowCategory, string> = { operating: 'Operating', investing: 'Investing', financing: 'Financing' }

/** Each type its own card colour, in the chart's order. */
const TONE: Record<AccountType, CardTone> = {
  equity: 'all',
  fixed_asset: 'company',
  asset: 'paid',
  liability: 'approved',
  revenue: 'payroll',
  cost: 'staff',
  other_income: 'issued',
  expense: 'draft',
}

export const rangeWords = (t: AccountType) => `${rangeFor(t)[0]}–${rangeFor(t)[1]}`

export interface CoaRow {
  acc: CoaAccount
  depth: number
  /** Its parents, nearest last. */
  ancestors: string[]
  /** Its sub-accounts (active or not). */
  children: number
}

/**
 * A type's accounts in the desktop's tree order (`sortForRender`): a parent
 * before its own at any depth; roots and siblings by code; one whose parent
 * is not among them a root; never a loop.
 */
export function treeOf(rows: readonly CoaAccount[], all: readonly CoaAccount[]): CoaRow[] {
  const childCount = new Map<string, number>()
  for (const a of all) if (a.parent_code) childCount.set(a.parent_code, (childCount.get(a.parent_code) ?? 0) + 1)
  const byCode = new Map(rows.map((r) => [r.code, r]))
  const kids = new Map<string, CoaAccount[]>()
  for (const r of rows) {
    if (r.parent_code && byCode.has(r.parent_code)) kids.set(r.parent_code, [...(kids.get(r.parent_code) ?? []), r])
  }
  const out: CoaRow[] = []
  const seen = new Set<string>()
  const visit = (acc: CoaAccount, depth: number, ancestors: string[]) => {
    if (seen.has(acc.code)) return
    seen.add(acc.code)
    out.push({ acc, depth, ancestors, children: childCount.get(acc.code) ?? 0 })
    for (const k of (kids.get(acc.code) ?? []).sort((a, b) => a.code.localeCompare(b.code))) visit(k, depth + 1, [...ancestors, acc.code])
  }
  for (const root of rows.filter((r) => !r.parent_code || !byCode.has(r.parent_code)).sort((a, b) => a.code.localeCompare(b.code))) visit(root, 0, [])
  return out
}

/** The desktop's search: the accounts whose code or name holds the words, and their parents, so the tree still reads. */
export function searchKeep(all: readonly CoaAccount[], shown: readonly CoaAccount[], query: string): Set<string> | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return null
  const byCode = new Map(all.map((a) => [a.code, a]))
  const keep = new Set<string>()
  for (const a of shown) {
    if (!a.code.toLowerCase().includes(needle) && !a.name.toLowerCase().includes(needle)) continue
    let cur: CoaAccount | undefined = a
    for (let guard = 0; cur && guard < 50; guard++) {
      keep.add(cur.code)
      cur = cur.parent_code ? byCode.get(cur.parent_code) : undefined
    }
  }
  return keep
}

export interface CoaModel {
  hero: { value: string; label: string }
  chip: string | null
  cards: HubCardItem[]
  /** Each type's accounts on show, in tree order. */
  types: Array<{ type: AccountType; label: string; range: string; rows: CoaRow[] }>
}

export function coaModel(accounts: readonly CoaAccount[], showInactive: boolean): CoaModel {
  const active = accounts.filter((a) => a.is_active)
  const shown = showInactive ? accounts : active
  const types = ACCOUNT_TYPES.map((t) => ({ type: t, label: `${typeLabel(t)} accounts`, range: rangeWords(t), rows: treeOf(shown.filter((a) => a.type === t), accounts) }))
  const kinds = new Set(active.map((a) => a.type)).size
  const inactive = accounts.length - active.length
  return {
    hero: { value: String(active.length), label: `Active accounts · ${plural(kinds, 'account type', 'account types')}` },
    chip: inactive > 0 ? `${inactive} inactive` : null,
    cards: types
      .filter((t) => t.rows.length > 0)
      .map((t) => ({ key: t.type, tone: TONE[t.type], icon: 'tree' as const, label: typeLabel(t.type), sub: t.range, value: plural(t.rows.length, 'account', 'accounts') })),
    types,
  }
}

/** An account's line in its type's list: indented under its parent, its cash flow, its sub-accounts, inactive in words. */
export function coaLine(r: CoaRow): { label: string; sub: string; value: string; muted: boolean } {
  const indent = r.depth > 0 ? `${' '.repeat(r.depth - 1)}└ ` : ''
  const parts = [CFC_WORDS[r.acc.cash_flow_category], r.children > 0 ? plural(r.children, 'sub-account', 'sub-accounts') : '', r.acc.is_active ? '' : 'inactive'].filter(Boolean)
  return { label: `${indent}${r.acc.name}`, sub: parts.join(' · '), value: r.acc.code, muted: !r.acc.is_active }
}
