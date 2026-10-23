import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), redirect: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
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

// 2026-10-23 (the owner: "make the size more bigger for all"): the page sends each file ahead to its own folder of
// `uploads` (a Server Action's body stops at 4 MB); the action reads it back, files it, and takes the copy away.
describe('uploadVoucherAttachment, a file sent ahead', () => {
  const ME = '0e2f8a7c-1b3d-4e5f-8a9b-0c1d2e3f4a5b'
  const STAGED = `${ME}/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d/statement.pdf`
  const BYTES = new TextEncoder().encode('%PDF-1.4 a long bank statement')

  function staged(size: number) {
    const writes: Array<{ table: string; values: Record<string, unknown> }> = []
    const stored: Array<{ bucket: string; key: string; bytes: number }> = []
    const removed: Array<{ bucket: string; keys: string[] }> = []
    const from = vi.fn((table: string) => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'pv', status: 'draft' }, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: table === 'file_objects' ? { metadata: { size, mimetype: 'application/pdf' } } : null, error: null }),
        insert: vi.fn((values: Record<string, unknown>) => {
          writes.push({ table, values })
          return Promise.resolve({ data: null, error: null })
        }),
      }
      return query
    })
    const storage = {
      from: (bucket: string) => ({
        download: vi.fn(async () => ({ data: new Blob([BYTES]), error: null })),
        upload: vi.fn(async (key: string, body: Uint8Array) => {
          stored.push({ bucket, key, bytes: body.byteLength })
          return { data: { path: key }, error: null }
        }),
        remove: vi.fn(async (keys: string[]) => {
          removed.push({ bucket, keys })
          return { data: null, error: null }
        }),
      }),
    }
    mocks.createClient.mockResolvedValue({ from, storage })
    return { writes, stored, removed }
  }
  const send = (size = BYTES.length) => {
    const fd = new FormData()
    fd.set('voucher_id', 'pv')
    fd.append('files', JSON.stringify({ staged: STAGED, name: 'Bank statement Oct.pdf', type: 'application/pdf', size }))
    return uploadVoucherAttachment(fd)
  }

  it('reads it back, files it on the voucher under its own name and size, and takes the staged copy away', async () => {
    const { writes, stored, removed } = staged(BYTES.length)
    expect(await send()).toEqual({ count: 1 })
    expect(stored).toEqual([{ bucket: 'payment-attachments', key: expect.stringMatching(/^pv\/[0-9a-f-]{36}-Bank_statement_Oct\.pdf$/), bytes: BYTES.length }])
    expect(writes).toEqual([{ table: 'payment_attachments', values: expect.objectContaining({ voucher_id: 'pv', file_name: 'Bank statement Oct.pdf', file_type: 'application/pdf', file_size: BYTES.length }) }])
    expect(removed).toEqual([{ bucket: 'uploads', keys: [STAGED] }])
  })

  it('refuses one past 100 MB without reading it — and still takes the staged copy away', async () => {
    const { stored, removed } = staged(100 * 1024 * 1024 + 1)
    await expect(send(100 * 1024 * 1024 + 1)).rejects.toThrow('is larger than 100 MB')
    expect(stored).toEqual([])
    expect(removed).toEqual([{ bucket: 'uploads', keys: [STAGED] }])
  })
})
