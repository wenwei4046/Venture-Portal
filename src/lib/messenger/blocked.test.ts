import { describe, expect, it, vi } from 'vitest'
import { blockedOnPage } from './blocked'

const res = (j: unknown, ok = true) => ({ ok, json: async () => j }) as Response

describe('blockedOnPage', () => {
  it("lists the people a Page cannot reply to, across Meta's pages, and says the list is whole", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res({ data: [
        { can_reply: false, participants: { data: [{ id: '29194119233532997' }, { id: '102351059576534' }] } },
        { can_reply: true, participants: { data: [{ id: '111' }, { id: '102351059576534' }] } },
      ], paging: { next: 'https://graph.facebook.com/next' } }))
      .mockResolvedValueOnce(res({ data: [{ can_reply: false, participants: { data: [{ id: '222' }] } }] }))
    const got = await blockedOnPage('102351059576534', 'tok', f as unknown as typeof fetch)
    expect(got).toEqual({ psids: ['29194119233532997', '222'], complete: true })
  })
  it('says the list is not whole when it stops early, and gives up on an error', async () => {
    const f = vi.fn().mockResolvedValue(res({ data: [], paging: { next: 'https://graph.facebook.com/more' } }))
    expect(await blockedOnPage('1', 'tok', f as unknown as typeof fetch, 2)).toEqual({ psids: [], complete: false })
    const bad = vi.fn().mockResolvedValue(res({ error: { message: 'no' } }, false))
    expect(await blockedOnPage('1', 'tok', bad as unknown as typeof fetch)).toBeNull()
  })
})
