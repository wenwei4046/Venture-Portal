import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
const deliver = vi.fn()
vi.mock('./messenger', () => ({ deliver: (...a: unknown[]) => deliver(...a) }))

const { sendLeadOutbox } = await import('./messenger-outbox')

function clientWith(outbox: unknown, error: { message: string } | null = null) {
  const calls: Array<{ fn: string; args: unknown }> = []
  const rpc = vi.fn(async (fn: string, args: unknown) => {
    calls.push({ fn, args })
    return fn === 'lead_outbox' ? { data: outbox, error } : { data: null, error: null }
  })
  return { client: { rpc } as unknown as SupabaseClient, calls }
}

describe('Lead View › the templates’ messages out', () => {
  it('asks nothing for a delivery that reached no conversation', async () => {
    const { client, calls } = clientWith([])
    expect(await sendLeadOutbox(client, [], 'SYS')).toBe(0)
    expect(calls).toEqual([])
  })

  it('sends each in order and keeps what Meta said, sent or not', async () => {
    deliver.mockReset()
    const order: number[] = []
    deliver.mockImplementation(async (o: { id: number }) => {
      order.push(o.id)
      return o.id === 2 ? { error: 'Outside the window' } : { mid: `m_${o.id}` }
    })
    const rows = [1, 2, 3].map(id => ({ id, pageId: '946946021838962', psid: '7700001', body: `#${id}`, buttons: null, lastInAt: '2026-10-28T03:00:00Z' }))
    const { client, calls } = clientWith(rows)
    expect(await sendLeadOutbox(client, ['c1'], 'SYS')).toBe(2)
    expect(order).toEqual([1, 2, 3])
    expect(calls.map(c => c.fn)).toEqual(['lead_outbox', 'lead_outbox_done'])
    expect(calls[1].args).toEqual({ p_results: [{ id: 1, mid: 'm_1' }, { id: 2, error: 'Outside the window' }, { id: 3, mid: 'm_3' }] })
  })

  it('never throws when the outbox cannot be read', async () => {
    const { client, calls } = clientWith(null, { message: 'down' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await sendLeadOutbox(client, ['c1'], 'SYS')).toBe(0)
    expect(calls.map(c => c.fn)).toEqual(['lead_outbox'])
  })
})
