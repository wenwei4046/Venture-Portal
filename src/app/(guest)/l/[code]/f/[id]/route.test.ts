import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-23 — ⑥-3: a share link's file, signed at the click as the stranger. The code decides (the database's two
// asks are the PGlite checks'); this is what the route does with the answer.

const db = vi.hoisted(() => ({ rpc: vi.fn(), sign: vi.fn(), signedFor: [] as unknown[] }))
vi.mock('@/lib/marketing/share-server', () => ({
  shareClient: (code: string) => ({
    rpc: (fn: string, args: unknown) => db.rpc(code, fn, args),
    storage: { from: (bucket: string) => ({ createSignedUrl: (path: string, s: number, o?: unknown) => db.sign(bucket, path, s, o) }) },
  }),
}))

import { GET } from './route'

const CODE = '0123456789abcdef0123456789abcdef'
const ID = '30000000-0000-4000-8000-000000000001'
const ask = (code = CODE, id = ID, query = '') => GET(new Request(`https://erp.houzsventure.com/l/${code}/f/${id}${query}`), { params: Promise.resolve({ code, id }) })
const file = (over: Record<string, unknown> = {}) => ({ data: { path: `library/${ID}/brief.pdf`, name: 'Brief', mime: 'application/pdf', download: true, ...over }, error: null })

beforeEach(() => {
  db.rpc.mockReset().mockResolvedValue(file())
  db.sign.mockReset().mockResolvedValue({ data: { signedUrl: 'https://r2.example/signed' }, error: null })
})

describe('a share link’s file', () => {
  it('signs it for an hour as the stranger with the code, and sends the browser there', async () => {
    const r = await ask()
    expect(r.status).toBe(302)
    expect(r.headers.get('Location')).toBe('https://r2.example/signed')
    expect(r.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(db.rpc).toHaveBeenCalledWith(CODE, 'mkt_lib_shared_file', { p_code: CODE, p_file: ID })
    expect(db.sign).toHaveBeenCalledWith('marketing', `library/${ID}/brief.pdf`, 3600, undefined)
  })

  it('saves it under its name and ending when asked and allowed', async () => {
    await ask(CODE, ID, '?download=1')
    expect(db.sign).toHaveBeenCalledWith('marketing', `library/${ID}/brief.pdf`, 3600, { download: 'Brief.pdf' })
  })

  it('without Allow download: shows in place what a browser can, saves nothing', async () => {
    db.rpc.mockResolvedValue(file({ download: false }))
    expect((await ask()).status).toBe(302)
    expect((await ask(CODE, ID, '?download=1')).status).toBe(404)
    db.rpc.mockResolvedValue(file({ download: false, mime: 'application/zip', path: `library/${ID}/logo.zip` }))
    expect((await ask()).status).toBe(404)
    expect(db.sign).toHaveBeenCalledTimes(1)
  })

  it('opens nothing for a closed link, a wrong code or id, or a refusal to sign', async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect((await ask()).status).toBe(404)
    expect((await ask('NOPE')).status).toBe(404)
    expect((await ask(CODE, '../../x')).status).toBe(404)
    db.sign.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
    expect((await ask()).status).toBe(404)
    expect(db.rpc).toHaveBeenCalledTimes(2)
  })
})
