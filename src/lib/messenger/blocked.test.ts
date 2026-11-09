import { describe, expect, it, vi } from 'vitest'
import { blockedOnPage } from './blocked'

const res = (j: unknown, ok = true) => ({ ok, json: async () => j }) as Response

describe('blockedOnPage', () => {
  it("lists the people a Page cannot reply to, across Meta's pages and every folder, and says the list is whole", async () => {
    // The owner, 2026-11-09: Bailan Apo, blocked and moved to spam ("垃圾信息"), sat in the API's `other` folder.
    const f = vi.fn(async (url: string) => {
      if (url === 'https://graph.facebook.com/next') return res({ data: [{ can_reply: false, participants: { data: [{ id: '222' }] } }] })
      const folder = new URL(url).searchParams.get('folder')
      if (folder === 'inbox') return res({ data: [
        { can_reply: false, participants: { data: [{ id: '29194119233532997' }, { id: '102351059576534' }] } },
        { can_reply: true, participants: { data: [{ id: '111' }, { id: '102351059576534' }] } },
      ], paging: { next: 'https://graph.facebook.com/next' } })
      if (folder === 'other') return res({ data: [{ can_reply: false, participants: { data: [{ id: '28801803619475959' }, { id: '102351059576534' }] } }] })
      return res({ data: [] })
    })
    const got = await blockedOnPage('102351059576534', 'tok', f as unknown as typeof fetch)
    expect(got).toEqual({ psids: ['29194119233532997', '222', '28801803619475959'], complete: true })
    expect(f.mock.calls.map(c => new URL(c[0]).searchParams.get('folder')).filter(Boolean)).toEqual(['inbox', 'other', 'spam', 'page_done'])
  })
  it('says the list is not whole when it stops early, and gives up on an error', async () => {
    const f = vi.fn().mockResolvedValue(res({ data: [], paging: { next: 'https://graph.facebook.com/more' } }))
    expect(await blockedOnPage('1', 'tok', f as unknown as typeof fetch, 2)).toEqual({ psids: [], complete: false })
    const bad = vi.fn().mockResolvedValue(res({ error: { message: 'no' } }, false))
    expect(await blockedOnPage('1', 'tok', bad as unknown as typeof fetch)).toBeNull()
  })
})
