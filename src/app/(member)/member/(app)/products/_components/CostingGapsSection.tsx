'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type { CostingGap } from '../load'
import ColumnTable, { type TableColumn } from './ColumnTable'
import { productTabHref } from './ProductListTabs'
import { useProductDraftState } from './ProductWorkspace'
import { ActionRow, categoryLabel, Controls, FilterPanel, Heading, money, SearchField, SelectField, TableFoot } from './ui'
import c from './products.module.css'

const REASONS: Record<string, string> = {
  not_in_sku_master: 'Missing from SKU Master',
  unpriced: 'Price needed',
  no_height: 'Seat size not matched',
  error: 'Pricing error',
}

const LIMIT_STEP = 200

/** The RPC's end date is exclusive and its bill counts overlap across codes. */
export default function CostingGapsSection({ gaps, from, to, columnLayouts = {} }: {
  gaps: CostingGap[]
  /** The window as the page writes it: "1 Aug 2026". */
  from: string
  to: string
  /** The reader's column layouts from the request (`layoutsFromCookies`). */
  columnLayouts?: Record<string, string>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  const { requestLeave } = useProductDraftState()
  const [query, setQuery] = useState('')
  const [reason, setReason] = useState('')
  const [limit, setLimit] = useState(LIMIT_STEP)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return gaps.filter(g => (!reason || g.reason === reason) && (!q ||
      [g.item_code, g.product_name, g.item_group, g.brand_code].some(v => (v ?? '').toLowerCase().includes(q))))
      .sort((a, b) => b.revenue - a.revenue || b.lines - a.lines || a.item_code.localeCompare(b.item_code))
  }, [gaps, query, reason])
  const lines = shown.reduce((total, g) => total + g.lines, 0)
  const revenue = shown.reduce((total, g) => total + g.revenue, 0)
  const visible = shown.slice(0, limit)

  /** The SKU Master, searched to one code (or not searched) — behind the leave guard. */
  function openSku(code: string | null) {
    requestLeave({
      label: 'SKU Master',
      go: () => startTransition(() => router.push(productTabHref(pathname, 'sku', { q: code, department: params.get('department') }), { scroll: false })),
    })
  }

  function nextStep(g: CostingGap) {
    if (g.reason === 'unpriced' && g.has_price) return <span className={c.good}>Price now available. Recost the affected orders in Comm Cal.</span>
    if (!g.in_sku_master) return <span className={c.muted}>Check this code in the ERP catalogue.</span>
    return <button type="button" className={c.cellLink} onClick={() => openSku(g.item_code)}>Review SKU price →</button>
  }

  // The table's own order; the reader may move and resize the columns (ColumnTable).
  const columns: TableColumn<CostingGap>[] = [
    { key: 'code', label: 'ITEM CODE', defaultWidth: 160, cell: g => g.item_code },
    { key: 'product', label: 'PRODUCT', className: c.wrap, defaultWidth: 230, cell: g => g.product_name ?? '—' },
    { key: 'group', label: 'GROUP', defaultWidth: 100, cell: g => categoryLabel(g.item_group) },
    { key: 'lines', label: 'LINES', num: true, defaultWidth: 70, cell: g => g.lines.toLocaleString() },
    { key: 'bills', label: 'BILLS', num: true, defaultWidth: 70, cell: g => g.bills.toLocaleString() },
    { key: 'revenue', label: 'REVENUE (RM)', num: true, className: c.bold, defaultWidth: 120, cell: g => money(g.revenue) },
    { key: 'reason', label: 'REASON', defaultWidth: 170, cell: g => <span className={g.reason === 'error' ? c.danger : undefined}>{REASONS[g.reason] ?? g.reason}</span> },
    { key: 'next', label: 'NEXT STEP', className: c.wrap, defaultWidth: 260, cell: nextStep },
  ]
  const reasons = [...new Set([...Object.keys(REASONS), ...gaps.map(g => g.reason)])]

  return (
    <>
      <FilterPanel>
        <Controls ruled={false}>
          <SearchField value={query} onChange={v => { setQuery(v); setLimit(LIMIT_STEP) }} placeholder="Search code, product or brand…" label="Search costing gaps" />
          <SelectField label="Reason" value={reason} onChange={v => { setReason(v); setLimit(LIMIT_STEP) }}
            options={[['', 'All reasons'], ...reasons.map(key => [key, REASONS[key] ?? key] as const)]} />
        </Controls>
      </FilterPanel>
      <Heading title="Costing gaps" sub={`Sales from ${from} up to, but not including, ${to}.`} />
      <ActionRow count={shown.length.toLocaleString()} rest={`codes · ${lines.toLocaleString()} sales lines · RM ${money(revenue)} revenue`}>
        <button type="button" className={c.secondary} onClick={() => openSku(null)}>Open SKU Master</button>
      </ActionRow>
      <ColumnTable
        id="costing-gaps"
        initialLayout={columnLayouts['costing-gaps']}
        label="Costing gaps table"
        columns={columns}
        rows={visible}
        rowKey={g => g.item_code}
        empty={gaps.length === 0 ? 'No costing gaps were found in this sales period.' : 'No costing gaps match these filters.'}
        footer={reset => (
          <TableFoot
            shown={`${visible.length.toLocaleString()} of ${shown.length.toLocaleString()} codes shown`}
            more={visible.length < shown.length ? `Show ${Math.min(LIMIT_STEP, shown.length - visible.length)} more` : undefined}
            onMore={() => setLimit(n => n + LIMIT_STEP)}
            note="Bills are counted per code; the same bill may appear in several rows."
          >
            {reset}
          </TableFoot>
        )}
      />
    </>
  )
}
