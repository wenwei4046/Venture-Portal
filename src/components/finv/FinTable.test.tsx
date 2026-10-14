import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

// The hub's table (2026-10-14, the Finance revamp v2 — D03 / D04): Name ·
// Description · Amount always; a column ticked on in the Columns panel takes
// its place before Amount; a heading sorts ↕ → ▲ → ▼ → off; the funnel lists
// a column's values with their counts; the arrangement is kept.

const saved = vi.hoisted(() => ({ own: null as unknown, def: null as unknown, writes: [] as unknown[] }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const row = table === 'table_layout_defaults' ? saved.def : saved.own
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: row ? { layout: row } : null, error: null }),
        upsert: (row: { layout: unknown }) => {
          saved.writes.push(row.layout)
          return Promise.resolve({ error: null })
        },
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
      return q
    },
  }),
}))

import { FinTable, type FinColumn } from './FinTable'

type Row = { id: string; name: string; desc: string; no: string; status: string; amount: number }
const ROWS: Row[] = [
  { id: '1', name: 'Meta Platforms Ireland', desc: 'FB ads top-up', no: 'HV-PV-202610-0044', status: 'approved', amount: 25000 },
  { id: '2', name: 'LHDN', desc: 'PCB Sep 2026', no: 'HV-PV-202610-0040', status: 'pending', amount: 31180 },
  { id: '3', name: 'KWSP', desc: 'EPF Sep 2026', no: 'HV-PV-202610-0039', status: 'pending', amount: 48612.4 },
]
const COLUMNS: FinColumn<Row>[] = [
  { key: 'name', label: 'Name', kind: 'name', fixed: true, width: 180, min: 120, value: (r) => r.name, text: (r) => r.name },
  { key: 'desc', label: 'Description', kind: 'desc', fixed: true, width: 200, min: 120, value: (r) => r.desc, text: (r) => r.desc },
  { key: 'no', label: 'Ref #', kind: 'no', width: 170, value: (r) => r.no, text: (r) => r.no },
  { key: 'status', label: 'Status', kind: 'chip', width: 112, value: (r) => r.status, text: (r) => r.status, chip: (r) => ({ text: r.status, tone: 'def' }) },
  { key: 'amount', label: 'Amount', kind: 'amount', fixed: true, width: 130, value: (r) => r.amount, text: (r) => `RM ${r.amount}` },
]

const heads = () => screen.getAllByRole('columnheader').map((h) => h.querySelector('span')?.textContent)
const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)

function draw() {
  return render(
    <FinTable
      layoutId="test.table"
      title="All vouchers"
      rows={ROWS}
      rowKey={(r) => r.id}
      columns={COLUMNS}
      amountOf={(r) => r.amount}
      onRowClick={() => undefined}
      emptyText="No vouchers here."
    />,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  saved.own = null
  saved.def = null
  saved.writes = []
})

describe('the hub table', () => {
  it('opens on Name · Description · Amount, the count summing the list', async () => {
    draw()
    await act(async () => undefined)
    expect(heads()).toEqual(['Name', 'Description', 'Amount'])
    expect(screen.getByText('3 · RM 104,792.40')).toBeInTheDocument()
  })

  it('puts a column ticked on before Amount, and keeps it', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Ref #/ }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Status/ }))
    expect(heads()).toEqual(['Name', 'Description', 'Ref #', 'Status', 'Amount'])
    // Every extra on is still the person's own arrangement, not the code's.
    expect(JSON.parse(window.localStorage.getItem('table-layout:test.table') ?? '{}').hidden).toEqual([])
  })

  it('a late answer from the account does not undo what was just changed', async () => {
    saved.own = { order: ['name', 'desc', 'amount', 'no'], widths: {}, hidden: ['status'] }
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await act(async () => undefined)
    expect(heads()).toEqual(['Name', 'Description', 'Amount'])
  })

  it('after a Reset, a column ticked on still takes its place before Amount', async () => {
    saved.own = { order: ['name', 'desc', 'amount', 'no'], widths: {}, hidden: ['status'] }
    draw()
    await act(async () => undefined)
    expect(heads()).toEqual(['Name', 'Description', 'Amount', 'Ref #'])
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(heads()).toEqual(['Name', 'Description', 'Amount'])
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Ref #/ }))
    expect(heads()).toEqual(['Name', 'Description', 'Ref #', 'Amount'])
    expect(JSON.parse(window.localStorage.getItem('table-layout:test.table') ?? '{}').order).toEqual([])
  })

  it('sorts ↕ → ▲ → ▼ → off', async () => {
    draw()
    await act(async () => undefined)
    const sort = () => screen.getByRole('button', { name: 'Sort by Amount' })
    expect(sort()).toHaveTextContent('↕')
    fireEvent.click(sort())
    expect(sort()).toHaveTextContent('▲')
    expect(names()).toEqual(['Meta Platforms Ireland', 'LHDN', 'KWSP'])
    fireEvent.click(sort())
    expect(sort()).toHaveTextContent('▼')
    expect(names()).toEqual(['KWSP', 'LHDN', 'Meta Platforms Ireland'])
    fireEvent.click(sort())
    expect(sort()).toHaveTextContent('↕')
    expect(names()).toEqual(['Meta Platforms Ireland', 'LHDN', 'KWSP'])
  })

  it('filters a column by its values, counted, and says the list is filtered', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Status/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Filter Status' }))
    const pop = screen.getByRole('dialog', { name: 'Filter · Status' })
    expect(within(pop).getByRole('menuitemcheckbox', { name: /pending/ })).toHaveTextContent('2')
    fireEvent.click(within(pop).getByRole('menuitemcheckbox', { name: /pending/ }))
    expect(names()).toEqual(['LHDN', 'KWSP'])
    expect(screen.getByText('2 of 3 · filtered')).toBeInTheDocument()
    fireEvent.click(within(pop).getByRole('button', { name: 'Clear' }))
    expect(names()).toHaveLength(3)
  })

  it('has no funnel on Amount', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.queryByRole('button', { name: 'Filter Amount' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Filter Name' })).toBeInTheDocument()
  })
})
