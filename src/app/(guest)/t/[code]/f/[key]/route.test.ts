import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-24 — ②b-2e: a file of the work on a PIC's link, signed at the click as the stranger. The code decides (the
// database's two asks are tests/member-sql/validate-marketing-stage-files.mjs's); this is what the route does with the answer.

const db = vi.hoisted(() => ({ rpc: vi.fn(), sign: vi.fn(), codes: [] as string[] }))
vi.mock('@/lib/marketing/pic-server', () => ({
  picFileClient: (code: string) => {
    db.codes.push(code)
    return {
      rpc: (fn: string, args: unknown) => db.rpc(fn, args),
      storage: { from: (bucket: string) => ({ createSignedUrl: (path: string, s: number, o?: unknown) => db.sign(bucket, path, s, o) }) },
    }
  },
}))

import { GET } from './route'

const CODE = '0123456789abcdef0123456789abcdef'
const KEY = '30000000-0000-4000-8000-000000000001'
const ask = (code = CODE, key = KEY, query = '') => GET(new Request(`https://erp.houzsventure.com/t/${code}/f/${key}${query}`), { params: Promise.resolve({ code, key }) })
const file = (over: Record<string, unknown> = {}) => ({ data: { path: `stage/${KEY}/final.png`, name: 'RedTruck final.png', mime: 'image/png', ...over }, error: null })

beforeEach(() => {
  db.rpc.mockReset().mockResolvedValue(file())
  db.sign.mockReset().mockResolvedValue({ data: { signedUrl: 'https://r2.example/signed' }, error: null })
  db.codes = []
})

describe('a file on the PIC’s link', () => {
  it('signs it for an hour as the stranger with the code, shown in place, and sends the browser there', async () => {
    const r = await ask(CODE.toUpperCase())
    expect([r.status, r.headers.get('Location'), r.headers.get('Referrer-Policy'), r.headers.get('Cache-Control')])
      .toEqual([302, 'https://r2.example/signed', 'no-referrer', 'no-store'])
    expect(db.codes).toEqual([CODE])
    expect(db.rpc).toHaveBeenCalledWith('mkt_pic_file', { p_code: CODE, p_key: KEY })
    expect(db.sign).toHaveBeenCalledWith('marketing', `stage/${KEY}/final.png`, 3600, undefined)
  })

  it('saves it under its name when asked, or when a browser could run it', async () => {
    await ask(CODE, KEY, '?download=1')
    expect(db.sign).toHaveBeenLastCalledWith('marketing', `stage/${KEY}/final.png`, 3600, { download: 'RedTruck final.png' })
    db.rpc.mockResolvedValue(file({ path: `stage/${KEY}/a.svg`, name: 'logo.svg', mime: 'image/svg+xml' }))
    await ask()
    expect(db.sign).toHaveBeenLastCalledWith('marketing', `stage/${KEY}/a.svg`, 3600, { download: 'logo.svg' })
  })

  it('closed for a code or key of the wrong shape, a file the page does not show, or a refused link — asking nothing', async () => {
    for (const [code, key] of [['nope', KEY], [CODE, 'stage/x/a.png']]) {
      const r = await ask(code, key)
      expect([r.status, await r.text()]).toEqual([404, 'This link is closed.'])
    }
    expect(db.rpc).not.toHaveBeenCalled()
    db.rpc.mockResolvedValue({ data: null, error: null })
    expect((await ask()).status).toBe(404)
    db.rpc.mockResolvedValue(file())
    db.sign.mockResolvedValue({ data: null, error: { message: 'denied' } })
    expect((await ask()).status).toBe(404)
  })
})
