import { describe, expect, it, vi } from 'vitest'
import { READ_ONLY_MESSAGE, READS_WHILE_VIEWING_AS, readOnly } from './read-only'

// Viewing the portal as somebody writes nothing (2026-10-11): the server client
// reads tables, calls only functions that cannot write, and reads storage.

function fakeClient() {
  const select = vi.fn(() => ({ eq: () => Promise.resolve({ data: [{ id: 1 }], error: null }) }))
  const insert = vi.fn(() => Promise.resolve({ data: null, error: null }))
  const download = vi.fn(() => Promise.resolve({ data: 'blob', error: null }))
  const upload = vi.fn(() => Promise.resolve({ data: { path: 'x' }, error: null }))
  const rpc = vi.fn((fn: string) => Promise.resolve({ data: `ran ${fn}`, error: null }))
  return {
    spies: { select, insert, download, upload, rpc },
    client: {
      from: () => ({ select, insert, update: insert, upsert: insert, delete: insert }),
      rpc,
      storage: { from: () => ({ download, upload, remove: upload, createSignedUrl: download }) },
      auth: { getClaims: () => Promise.resolve({ data: { claims: { sub: 'me' } } }) },
    },
  }
}

describe('the read-only server client', () => {
  it('reads a table, and answers a write with the refusal in words instead of running it', async () => {
    const { client, spies } = fakeClient()
    const ro = readOnly(client)
    expect(await ro.from('payment_vouchers').select().eq()).toEqual({ data: [{ id: 1 }], error: null })
    for (const write of ['insert', 'update', 'upsert', 'delete'] as const) {
      const result = await (ro.from('payment_vouchers') as unknown as Record<string, () => PromiseLike<unknown>>)[write]()
      expect(result).toMatchObject({ data: null, error: { message: READ_ONLY_MESSAGE, code: 'VIEW_AS' } })
    }
    expect(spies.insert).not.toHaveBeenCalled()
  })

  it('a refused write still chains like a query: .select().single() resolves to the refusal', async () => {
    const { client } = fakeClient()
    const ro = readOnly(client) as unknown as { from: (t: string) => { insert: (r: object) => { select: () => { single: () => PromiseLike<unknown> } } } }
    expect(await ro.from('claims').insert({}).select().single()).toMatchObject({ error: { message: READ_ONLY_MESSAGE } })
  })

  it('calls only functions that cannot write', async () => {
    const { client, spies } = fakeClient()
    const ro = readOnly(client)
    expect(await ro.rpc('current_actions')).toEqual({ data: 'ran current_actions', error: null })
    expect(await ro.rpc('view_as_person')).toEqual({ data: 'ran view_as_person', error: null })
    expect(await ro.rpc('approve_payroll_run')).toMatchObject({ data: null, error: { message: READ_ONLY_MESSAGE } })
    expect(await ro.rpc('permission_template_tabs_save')).toMatchObject({ error: { code: 'VIEW_AS' } })
    expect(spies.rpc.mock.calls.map(c => c[0])).toEqual(['current_actions', 'view_as_person'])
  })

  it('reads storage and signs links, refuses uploads and removals', async () => {
    const { client, spies } = fakeClient()
    const ro = readOnly(client)
    expect(await ro.storage.from('member-forms').download()).toEqual({ data: 'blob', error: null })
    expect(await ro.storage.from('member-forms').createSignedUrl()).toEqual({ data: 'blob', error: null })
    expect(await ro.storage.from('member-forms').upload()).toMatchObject({ error: { message: READ_ONLY_MESSAGE } })
    expect(await ro.storage.from('member-forms').remove()).toMatchObject({ error: { message: READ_ONLY_MESSAGE } })
    expect(spies.upload).not.toHaveBeenCalled()
  })

  it('leaves the session alone', async () => {
    const { client } = fakeClient()
    expect(await readOnly(client).auth.getClaims()).toEqual({ data: { claims: { sub: 'me' } } })
  })

  it('lets through no function that writes', () => {
    // A sample of the portal's writers (VOLATILE functions that write): none may be on the list.
    for (const fn of ['approve_payroll_run', 'payroll_submit_batch', 'post_journal_entry_as_caller', 'permission_user_tabs_set',
      'member_schedule_replacement', 'department_set_cost_model', 'mint_invoice_no', 'erp_link_put_secret', 'revenue_save_pay_lines']) {
      expect(READS_WHILE_VIEWING_AS.has(fn), fn).toBe(false)
    }
  })
})

const browser = vi.hoisted(() => ({ upsert: vi.fn(() => Promise.resolve({ data: null, error: null })) }))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ from: () => ({ upsert: browser.upsert }) }) }))

describe('the browser client while viewing as somebody', () => {
  it('reads only while the readable mark is set, and writes again once it is gone', async () => {
    const { createClient } = await import('./client')
    const { VIEW_AS_PERSON_MARK } = await import('@/lib/view-as')
    document.cookie = `${VIEW_AS_PERSON_MARK}=1; path=/`
    const ro = createClient() as unknown as { from: (t: string) => { upsert: (r: object) => PromiseLike<unknown> } }
    expect(await ro.from('user_table_layouts').upsert({})).toMatchObject({ error: { message: READ_ONLY_MESSAGE } })
    expect(browser.upsert).not.toHaveBeenCalled()
    document.cookie = `${VIEW_AS_PERSON_MARK}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    const rw = createClient() as unknown as { from: (t: string) => { upsert: (r: object) => PromiseLike<unknown> } }
    await rw.from('user_table_layouts').upsert({})
    expect(browser.upsert).toHaveBeenCalledTimes(1)
  })
})
