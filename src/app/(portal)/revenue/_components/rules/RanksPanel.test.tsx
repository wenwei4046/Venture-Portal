import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommissionSettingsData, RankDefRow, RankRow, SchemeRow } from '../config/types'

// Rules › Ranks (2026-10-10, the HR revamp): the catalogue top down — Rank ·
// Product rate · Held by — edited in place by whoever manages the rules; a
// rank no title sits on can be removed.

const nav = vi.hoisted(() => ({ refresh: vi.fn() }))
const act = vi.hoisted(() => ({ saveRankDef: vi.fn(), removeRankDef: vi.fn() }))
const toast = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: nav.refresh }) }))
vi.mock('../../config-actions', () => act)
vi.mock('@/components/hrv/toast', () => toast)

import RanksPanel from './RanksPanel'

const scheme = { id: 'scheme-fair' } as SchemeRow
const def = (id: string, rate: number, sort: number): RankDefRow => ({
  id, scheme_id: 'scheme-fair', product_rate: rate, group_incentive_amount: 0, group_subsidy_cap: 0, label: '', sort_order: sort,
})
// Three rungs on 9%, 7%, 6% — and a 4% nobody's title points at. Letters
// count from the top of the catalogue: SS, A, B, C.
const defs = [def('r9', 0.09, 40), def('r7', 0.07, 30), def('r6', 0.06, 20), def('r4', 0.04, 10)]
const rung = (id: string, rankDef: string) => ({ id, rank_def_id: rankDef, title_id: `t-${id}` }) as RankRow
const data = {
  rankDefs: defs,
  ranks: [rung('tl', 'r9'), rung('ta', 'r7'), rung('srs', 'r6')],
} as unknown as CommissionSettingsData

const holders = { r9: ['ANTHONY', 'CHEA HUAN'], r7: ['LIM YAU WEI'] }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RanksPanel', () => {
  it('lists the catalogue from the top, with who is paid from each rank', () => {
    render(<RanksPanel data={data} scheme={scheme} holders={holders} canManage />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map(r => within(r).getAllByRole('cell').slice(0, 3).map(c => c.textContent))).toEqual([
      ['Rank SS', '9%', 'ANTHONY, CHEA HUAN'],
      ['Rank A', '7%', 'LIM YAU WEI'],
      ['Rank B', '6%', '—'],
      ['Rank C', '4%', '—'],
    ])
  })

  it('offers Remove only on a rank no title sits on', () => {
    render(<RanksPanel data={data} scheme={scheme} holders={holders} canManage />)
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1)
  })

  it('edits a rank in place and saves its pay', async () => {
    act.saveRankDef.mockResolvedValue({ ok: true })
    render(<RanksPanel data={data} scheme={scheme} holders={holders} canManage />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1])
    const form = screen.getByRole('form', { name: 'Edit Rank A' })
    fireEvent.change(within(form).getByLabelText('Rate percent'), { target: { value: '7.5' } })
    expect(within(form).getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit')
    // happy-dom checks step="0.01" with a float %, so every typed rate looks off-step to it; a browser does not.
    fireEvent.submit(form)
    await waitFor(() => expect(act.saveRankDef).toHaveBeenCalledTimes(1))
    const fd = act.saveRankDef.mock.calls[0][0] as FormData
    expect([fd.get('id'), fd.get('scheme_id'), fd.get('product_rate')]).toEqual(['r7', 'scheme-fair', '7.5'])
    await waitFor(() => expect(toast.flash).toHaveBeenCalledWith('Rank A saved — every rung on it pays the new rate'))
  })

  it('shows the catalogue only, to whoever may not manage the rules', () => {
    render(<RanksPanel data={data} scheme={scheme} holders={holders} canManage={false} />)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Add rank' })).toBeNull()
  })
})
