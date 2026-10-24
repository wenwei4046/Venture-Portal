import { beforeEach, describe, expect, it, vi } from 'vitest'

// Renew a contract (2026-10-24 — the user: "当它已经 expired 之后，到时候按一下 renew，就可以再选一次是几个月，对不对？同时要
// attach 一个新的 contract"): renewed over the contract the page read, then the new contract filed to their Data center
// record — and put back as it was should the filing be refused, so a renewal never stands without its contract.

const mocks = vi.hoisted(() => ({ gate: vi.fn(), revalidatePath: vi.fn(), pushSoon: vi.fn(), db: null as unknown }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.gate }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/push/outbox', () => ({ pushSoon: mocks.pushSoon }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.db }))

import { renewContract } from './renew-actions'

type Call = { op: 'select' | 'update'; patch?: unknown; filters: Array<[string, unknown]>; columns?: string }
type Builder = {
  select: (columns: string) => Builder
  update: (patch: unknown) => Builder
  eq: (column: string, value: unknown) => Builder
  maybeSingle: () => Promise<{ data: unknown; error: null }>
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
}

/** hr_staff_costs as the page's session reaches it: the row read, what an update matches, and hr_letter_file's answer. */
function fakeDb(o: { row: unknown; renewed?: unknown[]; fileError?: { code: string; message: string } | null }) {
  const calls: Call[] = []
  const rpcs: Array<[string, unknown]> = []
  mocks.db = {
    from: () => {
      const call: Call = { op: 'select', filters: [] }
      const b: Builder = {
        select: columns => ((call.columns = columns), b),
        update: patch => ((call.op = 'update'), (call.patch = patch), b),
        eq: (column, value) => (call.filters.push([column, value]), b),
        maybeSingle: async () => (calls.push(call), { data: o.row, error: null }),
        then: (resolve, reject) => {
          calls.push(call)
          const answer = call.op === 'update' && call.columns ? { data: o.renewed ?? [], error: null } : { data: null, error: null }
          return Promise.resolve(answer).then(resolve, reject)
        },
      }
      return b
    },
    rpc: async (fn: string, args: unknown) => (rpcs.push([fn, args]), { data: 'letter-1', error: o.fileError ?? null }),
  }
  return { calls, rpcs, updates: () => calls.filter(c => c.op === 'update') }
}

const ROW = { status: 'active', employment_status: 'contract', hire_date: '2026-10-01', contract_start: null, contract_months: 12, contract_end: '2027-09-30' }
const LETTER = { typeId: 'cfs', path: 'letters/p1/u/contract.pdf', fileName: 'contract.pdf', contentType: 'application/pdf', size: 4 }
const INPUT = { staffId: 'p1', start: '2027-10-01', months: 12, endsWas: '2027-09-30', letter: LETTER }

beforeEach(() => {
  for (const m of [mocks.gate, mocks.revalidatePath, mocks.pushSoon]) m.mockReset()
})

describe('renewContract', () => {
  it('asks People · Edit and Documentation · Create on the person’s page', async () => {
    fakeDb({ row: ROW, renewed: [{ contract_end: '2028-09-30' }] })
    await renewContract(INPUT)
    expect(mocks.gate).toHaveBeenCalledWith('/team/people/[id]', 'team', 'edit')
    expect(mocks.gate).toHaveBeenCalledWith('/team/people/[id]', 'documentation', 'create')
  })

  it('renews over the contract the page read, then files the new contract — and its person is told', async () => {
    const db = fakeDb({ row: ROW, renewed: [{ contract_end: '2028-09-30' }] })
    expect(await renewContract(INPUT)).toEqual({ ok: true, endsOn: '2028-09-30' })
    const [renew] = db.updates()
    expect(renew.patch).toEqual({ contract_start: '2027-10-01', contract_months: 12 })
    expect(renew.filters).toEqual([['id', 'p1'], ['employment_status', 'contract'], ['contract_months', 12], ['contract_end', '2027-09-30']])
    expect(db.rpcs).toEqual([['hr_letter_file', {
      p_staff: 'p1', p_type: 'cfs', p_path: 'letters/p1/u/contract.pdf', p_file_name: 'contract.pdf', p_content_type: 'application/pdf', p_size: 4,
    }]])
    expect(mocks.pushSoon).toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/team', 'layout')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/team/documentation')
  })

  it('refuses before writing: off a contract, an end that moved, a first day before this one’s', async () => {
    let db = fakeDb({ row: { ...ROW, employment_status: 'permanent', contract_months: null, contract_end: null } })
    expect(await renewContract(INPUT)).toEqual({ ok: false, reason: 'They are not on a contract any more — reload the page.' })
    expect(db.updates()).toEqual([])

    db = fakeDb({ row: { ...ROW, status: 'inactive' } })
    expect((await renewContract(INPUT)).ok).toBe(false)
    expect(db.updates()).toEqual([])

    db = fakeDb({ row: { ...ROW, contract_months: 18, contract_end: '2028-03-31' } })
    expect(await renewContract(INPUT)).toEqual({ ok: false, reason: 'Their contract changed since this page was opened — reload it.' })
    expect(db.updates()).toEqual([])

    db = fakeDb({ row: ROW })
    expect(await renewContract({ ...INPUT, start: '2026-09-01' })).toEqual({ ok: false, reason: 'The new contract starts after this one did (1 Oct 2026).' })
    expect(await renewContract({ ...INPUT, months: 7 })).toEqual({ ok: false, reason: "Pick the new contract's period." })
    expect(db.updates()).toEqual([])
    expect(db.rpcs).toEqual([])
  })

  it('a renewal another made meanwhile matches nothing, and nothing is filed', async () => {
    const db = fakeDb({ row: ROW, renewed: [] })
    expect(await renewContract(INPUT)).toEqual({ ok: false, reason: 'Their contract changed since this page was opened — reload it.' })
    expect(db.rpcs).toEqual([])
  })

  it('a contract that could not be filed puts the renewal back — written over the renewal just made', async () => {
    const db = fakeDb({ row: { ...ROW, contract_start: '2026-10-01' }, renewed: [{ contract_end: '2028-09-30' }], fileError: { code: '22023', message: 'The file did not arrive. Please upload it again.' } })
    expect(await renewContract(INPUT)).toEqual({ ok: false, reason: 'Not renewed — the new contract could not be filed: The file did not arrive. Please upload it again.' })
    const [, back] = db.updates()
    expect(back.patch).toEqual({ contract_start: '2026-10-01', contract_months: 12 })
    expect(back.filters).toEqual([['id', 'p1'], ['contract_start', '2027-10-01'], ['contract_months', 12]])
    expect(mocks.pushSoon).not.toHaveBeenCalled()
  })
})
