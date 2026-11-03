import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'

// Settings › Departments' Bill back salary (2026-11-03 — the user: "为什么我勾不到？"): a Finance login's tick matched no
// row under the table's old principal-only policy, raised nothing, and sprang back. An update the database lets
// through to no row is now said, never taken as saved.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn, requirePermission: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setDepartmentBillbackInWords } from './actions'

const HR = { name: 'HR', segment_key: 'hr', is_internal: false }

function database(updatedRows: unknown[]) {
  const db = recordingSupabase((call) => {
    if (call.table !== 'departments') return {}
    if (call.op === 'update') return { data: updatedRows }
    return { data: call.single ? HR : [HR] }
  })
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'finance-user' })
})

describe('setDepartmentBillbackInWords', () => {
  it('saves the tick and reads the row back', async () => {
    const db = database([{ id: 'd-hr' }])
    expect(await setDepartmentBillbackInWords('d-hr', true)).toEqual({ ok: true })
    const update = db.writes('departments').find((w) => w.op === 'update')!
    expect(update.values).toEqual({ own_share_billback: true })
    expect(update.chain).toContainEqual(['select', 'id'])
  })

  it('an update that reached no row is said, not taken as saved', async () => {
    database([])
    expect(await setDepartmentBillbackInWords('d-hr', true)).toEqual({
      ok: false,
      reason: 'HR’s bill-back was not saved — your permissions do not let you change it (Settings · Manage).',
    })
  })
})
