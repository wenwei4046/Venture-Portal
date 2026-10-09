// The Trial Balance in groups (2026-10-09, the user's Claude Design handoff):
// accounts by type in the statement's order, each account under its
// top-level parent in the chart of accounts, with debit / credit totals at
// every level. The figures are the trial balance's own (lib/cfo-reports
// fetchTrialBalance); this only arranges them.

const r2 = (n: number) => Math.round(n * 100) / 100

export interface TbItem {
  code: string
  name: string
  debit: number
  credit: number
}

export interface TbGroup {
  /** The top-level parent's code (the account's own when it has none). */
  code: string
  name: string
  items: TbItem[]
  debit: number
  credit: number
}

export interface TbBlock {
  type: string
  title: string
  total: string
  groups: TbGroup[]
  debit: number
  credit: number
}

const ORDER = ['asset', 'fixed_asset', 'liability', 'equity', 'revenue', 'cost', 'other_income', 'expense']
const TITLE: Record<string, string> = {
  asset: 'Assets',
  fixed_asset: 'Fixed assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  cost: 'Cost',
  other_income: 'Other income',
  expense: 'Expenses',
}

export function groupTrialBalance(
  rows: ReadonlyArray<{ code: string; name: string; type: string; debit: number; credit: number }>,
  coa: ReadonlyArray<{ code: string; name: string; parent_code: string | null }>,
): TbBlock[] {
  const byCode = new Map(coa.map((a) => [a.code, a]))
  const topOf = (code: string): { code: string; name: string } => {
    let cur = byCode.get(code)
    let guard = 0
    while (cur?.parent_code && byCode.has(cur.parent_code) && guard < 50) {
      cur = byCode.get(cur.parent_code)
      guard++
    }
    return cur ? { code: cur.code, name: cur.name } : { code, name: rows.find((r) => r.code === code)?.name ?? code }
  }

  const types = [...ORDER, ...Array.from(new Set(rows.map((r) => r.type))).filter((t) => !ORDER.includes(t))]
  const blocks: TbBlock[] = []
  for (const type of types) {
    const inType = rows.filter((r) => r.type === type)
    if (inType.length === 0) continue
    const groups = new Map<string, TbGroup>()
    for (const r of inType) {
      const top = topOf(r.code)
      const g = groups.get(top.code) ?? { code: top.code, name: top.name, items: [], debit: 0, credit: 0 }
      g.items.push({ code: r.code, name: r.name, debit: r.debit, credit: r.credit })
      g.debit = r2(g.debit + r.debit)
      g.credit = r2(g.credit + r.credit)
      groups.set(top.code, g)
    }
    const list = Array.from(groups.values()).sort((a, b) => a.code.localeCompare(b.code))
    for (const g of list) g.items.sort((a, b) => a.code.localeCompare(b.code))
    const title = TITLE[type] ?? type.replace(/_/g, ' ')
    blocks.push({
      type,
      title,
      total: `Total ${title.toLowerCase()}`,
      groups: list,
      debit: r2(list.reduce((s, g) => s + g.debit, 0)),
      credit: r2(list.reduce((s, g) => s + g.credit, 0)),
    })
  }
  return blocks
}
