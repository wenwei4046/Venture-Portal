import { describe, expect, it, vi } from 'vitest'
import { ErpApiError, createErpClient, type FetchLike } from './client'

interface Call {
  url: string
  headers: Record<string, string>
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A fake ERP: a map of path → response, and a log of what was asked. */
function fakeErp(routes: Record<string, (url: URL) => Response>) {
  const calls: Call[] = []
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input)
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k] = v
    calls.push({ url: input, headers })
    const handler = routes[url.pathname]
    if (!handler) return jsonResponse(404, { error: 'not_found' })
    return handler(url)
  }
  return { calls, fetchImpl }
}

const base = { baseUrl: 'https://erp.example.com', apiKey: 'k'.repeat(40), companyId: 1 }

describe('createErpClient', () => {
  it('sends the bearer and the company on every request', async () => {
    const erp = fakeErp({ '/api/auth/me': () => jsonResponse(200, { user: { id: 0, name: 'Service' } }) })
    await createErpClient({ ...base, fetchImpl: erp.fetchImpl }).whoAmI()
    expect(erp.calls).toHaveLength(1)
    expect(erp.calls[0].url).toBe('https://erp.example.com/api/auth/me')
    expect(erp.calls[0].headers.Authorization).toBe(`Bearer ${'k'.repeat(40)}`)
    expect(erp.calls[0].headers['X-Company-Id']).toBe('1')
  })

  it('tolerates a trailing slash on the base', async () => {
    const erp = fakeErp({ '/api/auth/me': () => jsonResponse(200, { user: { id: 0, name: 'Service' } }) })
    await createErpClient({ ...base, baseUrl: 'https://erp.example.com/', fetchImpl: erp.fetchImpl }).whoAmI()
    expect(erp.calls[0].url).toBe('https://erp.example.com/api/auth/me')
  })

  describe('whoAmI', () => {
    it('recognises the service key by user id 0', async () => {
      const erp = fakeErp({
        '/api/auth/me': () =>
          jsonResponse(200, { user: { id: 0, email: 'service@local', name: 'Service', role_name: 'Service', permissions: ['*'] } }),
      })
      const who = await createErpClient({ ...base, fetchImpl: erp.fetchImpl }).whoAmI()
      expect(who).toEqual({ id: 0, name: 'Service', email: 'service@local', role: 'Service', service: true })
    })

    it('names a person behind a session token', async () => {
      const erp = fakeErp({
        '/api/auth/me': () => jsonResponse(200, { user: { id: 12, email: 'wen@houzs.my', name: 'Wen Wei', role_name: 'Owner' } }),
      })
      const who = await createErpClient({ ...base, fetchImpl: erp.fetchImpl }).whoAmI()
      expect(who.service).toBe(false)
      expect(who.name).toBe('Wen Wei')
      expect(who.role).toBe('Owner')
    })

    it("reports the ERP's own words on 401", async () => {
      const erp = fakeErp({ '/api/auth/me': () => jsonResponse(401, { error: 'Unauthorized' }) })
      const p = createErpClient({ ...base, fetchImpl: erp.fetchImpl }).whoAmI()
      await expect(p).rejects.toBeInstanceOf(ErpApiError)
      await expect(p).rejects.toMatchObject({ kind: 'unauthorized', status: 401, message: 'Unauthorized' })
    })

    it('says so when the address answers with a web page instead of JSON', async () => {
      const erp = fakeErp({
        '/api/auth/me': () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      })
      await expect(createErpClient({ ...base, fetchImpl: erp.fetchImpl }).whoAmI()).rejects.toMatchObject({
        kind: 'bad_response',
      })
    })

    it('maps a network failure to unreachable', async () => {
      const fetchImpl: FetchLike = async () => {
        throw new TypeError('fetch failed')
      }
      await expect(createErpClient({ ...base, fetchImpl }).whoAmI()).rejects.toMatchObject({ kind: 'unreachable' })
    })

    it('gives up after the timeout', async () => {
      vi.useFakeTimers()
      try {
        const fetchImpl: FetchLike = (_input, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const e = new Error('aborted')
              e.name = 'AbortError'
              reject(e)
            })
          })
        const p = createErpClient({ ...base, fetchImpl, timeoutMs: 1000 }).whoAmI()
        const expectation = expect(p).rejects.toMatchObject({ kind: 'timeout' })
        await vi.advanceTimersByTimeAsync(1001)
        await expectation
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('listSalesOrdersBetween', () => {
    it('walks every page with the month window and a stable sort', async () => {
      const pages = [
        Array.from({ length: 100 }, (_, i) => ({ doc_no: `HC-SO-${String(i).padStart(3, '0')}` })),
        Array.from({ length: 23 }, (_, i) => ({ doc_no: `HC-SO-${String(100 + i).padStart(3, '0')}` })),
      ]
      const erp = fakeErp({
        '/api/scm/mfg-sales-orders': url => {
          const page = Number(url.searchParams.get('page'))
          return jsonResponse(200, { salesOrders: pages[page] ?? [], total: 123, page, pageSize: 100 })
        },
      })
      const rows = await createErpClient({ ...base, fetchImpl: erp.fetchImpl }).listSalesOrdersBetween('2026-09-01', '2026-09-30')
      expect(rows).toHaveLength(123)
      expect(erp.calls).toHaveLength(2)
      const first = new URL(erp.calls[0].url)
      expect(first.searchParams.get('from')).toBe('2026-09-01')
      expect(first.searchParams.get('to')).toBe('2026-09-30')
      expect(first.searchParams.get('sort')).toBe('doc_no:asc')
      expect(first.searchParams.get('pageSize')).toBe('100')
    })

    it('stops on an empty month', async () => {
      const erp = fakeErp({
        '/api/scm/mfg-sales-orders': () => jsonResponse(200, { salesOrders: [], total: 0, page: 0, pageSize: 100 }),
      })
      const rows = await createErpClient({ ...base, fetchImpl: erp.fetchImpl }).listSalesOrdersBetween('2026-09-01', '2026-09-30')
      expect(rows).toEqual([])
      expect(erp.calls).toHaveLength(1)
    })

    it('refuses a list that is not a list', async () => {
      const erp = fakeErp({ '/api/scm/mfg-sales-orders': () => jsonResponse(200, { nope: true }) })
      await expect(
        createErpClient({ ...base, fetchImpl: erp.fetchImpl }).listSalesOrdersBetween('2026-09-01', '2026-09-30'),
      ).rejects.toMatchObject({ kind: 'bad_response' })
    })
  })

  describe('getSalesOrder', () => {
    it('returns the header and its lines', async () => {
      const erp = fakeErp({
        '/api/scm/mfg-sales-orders/HC-SO-1': () =>
          jsonResponse(200, { salesOrder: { doc_no: 'HC-SO-1', status: 'CONFIRMED' }, items: [{ id: 'a' }, { id: 'b' }], pwpCodes: [] }),
      })
      const d = await createErpClient({ ...base, fetchImpl: erp.fetchImpl }).getSalesOrder('HC-SO-1')
      expect(d?.header.doc_no).toBe('HC-SO-1')
      expect(d?.items).toHaveLength(2)
    })

    it('is null for a document the ERP no longer has', async () => {
      const erp = fakeErp({})
      const d = await createErpClient({ ...base, fetchImpl: erp.fetchImpl }).getSalesOrder('HC-SO-GONE')
      expect(d).toBeNull()
    })

    it('escapes the document number in the path', async () => {
      const erp = fakeErp({
        '/api/scm/mfg-sales-orders/HC%2FSO%201': () => jsonResponse(200, { salesOrder: { doc_no: 'HC/SO 1' }, items: [] }),
      })
      const d = await createErpClient({ ...base, fetchImpl: erp.fetchImpl }).getSalesOrder('HC/SO 1')
      expect(d?.header.doc_no).toBe('HC/SO 1')
    })

    it('still throws for a server failure', async () => {
      const erp = fakeErp({
        '/api/scm/mfg-sales-orders/HC-SO-1': () => jsonResponse(500, { error: 'load_failed', reason: 'db down' }),
      })
      await expect(createErpClient({ ...base, fetchImpl: erp.fetchImpl }).getSalesOrder('HC-SO-1')).rejects.toMatchObject({
        kind: 'server',
        message: 'load_failed: db down',
      })
    })
  })

  describe('getPayments', () => {
    it('returns the rows, or nothing when the ERP has none', async () => {
      const erp = fakeErp({
        '/api/scm/mfg-sales-orders/HC-SO-1/payments': () => jsonResponse(200, { payments: [{ amount_sen: 100 }] }),
        '/api/scm/mfg-sales-orders/HC-SO-2/payments': () => jsonResponse(200, {}),
      })
      const c = createErpClient({ ...base, fetchImpl: erp.fetchImpl })
      expect(await c.getPayments('HC-SO-1')).toEqual([{ amount_sen: 100 }])
      expect(await c.getPayments('HC-SO-2')).toEqual([])
    })
  })
})
