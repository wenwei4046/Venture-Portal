import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), redirect: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { uploadVoucherAttachment } from './actions'

function database(status: string) {
  const writes: Array<{ table: string; values: Record<string, unknown> }> = []
  const stored: string[] = []
  const removed: string[] = []
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: table === 'payment_vouchers' ? { id: 'pv', status } : null, error: null }),
      insert: vi.fn((values: Record<string, unknown>) => {
        writes.push({ table, values })
        return Promise.resolve({ data: null, error: null })
      }),
    }
    return query
  })
  const storage = {
    from: () => ({
      upload: vi.fn(async (key: string) => { stored.push(key); return { data: { path: key }, error: null } }),
      remove: vi.fn(async (keys: string[]) => { removed.push(...keys); return { data: null, error: null } }),
    }),
  }
  mocks.createClient.mockResolvedValue({ from, storage })
  return { writes, stored, removed, from }
}

function upload(...names: string[]) {
  const fd = new FormData()
  fd.set('voucher_id', 'pv')
  for (const name of names) fd.append('files', new File(['%PDF-1.4 receipt'], name, { type: 'application/pdf' }))
  return uploadVoucherAttachment(fd)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
})

// 2026-10-05 (user: two paid PVs had been made without their receipts — "做第 2 条").
describe('uploadVoucherAttachment', () => {
  it('still files onto a voucher that is pending, and writes no audit row for it', async () => {
    const { writes, stored } = database('pending_approval')
    expect(await upload('receipt.pdf')).toEqual({ count: 1 })
    expect(stored).toHaveLength(1)
    expect(writes.map((w) => w.table)).toEqual(['payment_attachments'])
  })

  it.each(['approved', 'paid'])('adds to a %s voucher, and says in the audit log who added what', async (status) => {
    const { writes, stored } = database(status)
    expect(await upload('receipt-1.pdf', 'receipt-2.pdf')).toEqual({ count: 2 })
    expect(stored).toHaveLength(2)
    expect(writes.map((w) => w.table)).toEqual(['payment_attachments', 'payment_attachments', 'access_log'])
    const audit = writes[2].values
    expect(audit).toMatchObject({ user_id: 'finance-user', action: 'add_attachment', resource_type: 'payment_voucher', resource_id: 'pv' })
    expect(audit.metadata).toEqual({ voucher_status: status, count: 2, files: ['receipt-1.pdf', 'receipt-2.pdf'] })
    for (const row of writes.slice(0, 2)) expect(row.values).toMatchObject({ voucher_id: 'pv', uploaded_by: 'finance-user', file_type: 'application/pdf' })
  })

  it('refuses a voided voucher before touching storage', async () => {
    const { writes, stored } = database('voided')
    await expect(upload('receipt.pdf')).rejects.toThrow('Cannot upload attachments when voucher status is "voided"')
    expect(stored).toEqual([])
    expect(writes).toEqual([])
  })

  it('keeps the file rules on a late addition: a type that is not allowed is refused', async () => {
    const { stored } = database('paid')
    const fd = new FormData()
    fd.set('voucher_id', 'pv')
    fd.append('files', new File(['MZ'], 'tool.exe', { type: 'application/x-msdownload' }))
    await expect(uploadVoucherAttachment(fd)).rejects.toThrow('disallowed MIME type')
    expect(stored).toEqual([])
  })
})
