/**
 * The portal as a client of the Houzs ERP's REST API.
 *
 * What is read here was read from the ERP's source (2026-09-13,
 * `backend/src/middleware/auth.ts`, `routes/auth.ts`,
 * `scm/routes/mfg-sales-orders.ts`), and the shape of every answer is the
 * ERP's own:
 *
 *   GET /api/auth/me                       → { user: { id, name, email, role_name, … } }
 *        The bearer is either a person's session token (7 days) or the ERP's
 *        service key (`DASHBOARD_API_KEY`), which answers as user id 0,
 *        name "Service", every permission. Anything else is 401.
 *   GET /api/scm/mfg-sales-orders?page=N&pageSize=100&from=…&to=…&sort=doc_no:asc
 *        → { salesOrders: [header rows of mfg_sales_orders_with_payment_totals
 *             plus paid_total_sen / balance_sen_live], total, page, pageSize }
 *        The presence of `page` switches the ERP to server-side paging.
 *   GET /api/scm/mfg-sales-orders/:docNo   → { salesOrder: header, items: [...] }
 *        404 { error: "not_found" } when the document is gone or out of scope.
 *   GET /api/scm/mfg-sales-orders/:docNo/payments → { payments: [...] }
 *
 * Every request carries `Authorization: Bearer <key>` and `X-Company-Id` —
 * the ERP hosts more than one company and scopes each read to the one named.
 *
 * Pure over an injected fetch, so the tests drive it without a network.
 */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export type ErpErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'unreachable'
  | 'timeout'
  | 'bad_response'
  | 'server'

export class ErpApiError extends Error {
  readonly kind: ErpErrorKind
  readonly status: number | null

  constructor(kind: ErpErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'ErpApiError'
    this.kind = kind
    this.status = status
  }
}

export interface ErpIdentity {
  id: number
  name: string
  email: string | null
  role: string | null
  /** The ERP's shared service key rather than a person's sign-in. */
  service: boolean
}

export type ErpRow = Record<string, unknown>

export interface ErpListPage {
  rows: ErpRow[]
  total: number
  page: number
  pageSize: number
}

export interface ErpOrderDetail {
  header: ErpRow
  items: ErpRow[]
}

export interface ErpClientOptions {
  baseUrl: string
  apiKey: string
  companyId: number
  fetchImpl?: FetchLike
  timeoutMs?: number
}

export interface ErpClient {
  whoAmI(): Promise<ErpIdentity>
  listSalesOrders(args: { from: string; to: string; page: number; pageSize?: number }): Promise<ErpListPage>
  /** Every header row dated inside [from, to], across pages. */
  listSalesOrdersBetween(from: string, to: string): Promise<ErpRow[]>
  /** The document, or null when the ERP no longer has it. */
  getSalesOrder(docNo: string): Promise<ErpOrderDetail | null>
  getPayments(docNo: string): Promise<ErpRow[]>
}

export const ERP_LIST_PAGE_SIZE = 100
const DEFAULT_TIMEOUT_MS = 30_000

function isRow(v: unknown): v is ErpRow {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function errorText(body: unknown, fallback: string): string {
  if (isRow(body)) {
    const e = body.error
    if (typeof e === 'string' && e.trim() !== '') {
      const reason = body.reason
      return typeof reason === 'string' && reason.trim() !== '' ? `${e}: ${reason}` : e
    }
  }
  return fallback
}

export function createErpClient(opts: ErpClientOptions): ErpClient {
  const base = opts.baseUrl.replace(/\/+$/, '')
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function get(path: string): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetchImpl(`${base}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'X-Company-Id': String(opts.companyId),
          Accept: 'application/json',
        },
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ErpApiError('timeout', `The ERP did not answer within ${Math.round(timeoutMs / 1000)} s`)
      }
      const detail = err instanceof Error ? err.message : String(err)
      throw new ErpApiError('unreachable', `Could not reach the ERP at ${base}: ${detail}`)
    }
    clearTimeout(timer)

    let body: unknown = null
    const text = await res.text()
    if (text.trim() !== '') {
      try {
        body = JSON.parse(text)
      } catch {
        if (res.ok) {
          throw new ErpApiError(
            'bad_response',
            `The ERP answered ${path} with something other than JSON — is the address right?`,
            res.status,
          )
        }
      }
    }

    if (res.status === 401) {
      throw new ErpApiError('unauthorized', errorText(body, 'The ERP did not accept this key'), 401)
    }
    if (res.status === 403) {
      throw new ErpApiError('forbidden', errorText(body, 'This key may not read sales orders'), 403)
    }
    if (res.status === 404) {
      throw new ErpApiError('not_found', errorText(body, 'Not found'), 404)
    }
    if (res.status >= 500) {
      throw new ErpApiError('server', errorText(body, `The ERP failed (${res.status})`), res.status)
    }
    if (!res.ok) {
      throw new ErpApiError('bad_response', errorText(body, `The ERP answered ${res.status}`), res.status)
    }
    return { status: res.status, body }
  }

  return {
    async whoAmI() {
      const { body } = await get('/api/auth/me')
      const user = isRow(body) && isRow(body.user) ? body.user : null
      if (!user) throw new ErpApiError('bad_response', 'The ERP did not say who this key belongs to')
      const id = Number(user.id)
      return {
        id: Number.isFinite(id) ? id : -1,
        name: typeof user.name === 'string' && user.name.trim() !== '' ? user.name : 'Unknown',
        email: typeof user.email === 'string' ? user.email : null,
        role: typeof user.role_name === 'string' ? user.role_name : null,
        service: id === 0,
      }
    },

    async listSalesOrders({ from, to, page, pageSize = ERP_LIST_PAGE_SIZE }) {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        from,
        to,
        sort: 'doc_no:asc',
      })
      const { body } = await get(`/api/scm/mfg-sales-orders?${qs.toString()}`)
      if (!isRow(body) || !Array.isArray(body.salesOrders)) {
        throw new ErpApiError('bad_response', 'The ERP did not answer with a list of sales orders')
      }
      const rows = body.salesOrders.filter(isRow)
      const total = Number(body.total)
      return {
        rows,
        total: Number.isFinite(total) ? total : rows.length,
        page: Number(body.page ?? page) || 0,
        pageSize: Number(body.pageSize ?? pageSize) || pageSize,
      }
    },

    async listSalesOrdersBetween(from, to) {
      const all: ErpRow[] = []
      let page = 0
      for (;;) {
        const p = await this.listSalesOrders({ from, to, page })
        all.push(...p.rows)
        const fetched = (page + 1) * p.pageSize
        if (p.rows.length === 0 || p.rows.length < p.pageSize || fetched >= p.total) break
        page++
        if (page > 500) throw new ErpApiError('bad_response', 'The ERP list never ended')
      }
      return all
    },

    async getSalesOrder(docNo) {
      let res: { status: number; body: unknown }
      try {
        res = await get(`/api/scm/mfg-sales-orders/${encodeURIComponent(docNo)}`)
      } catch (err) {
        if (err instanceof ErpApiError && err.kind === 'not_found') return null
        throw err
      }
      const body = res.body
      if (!isRow(body) || !isRow(body.salesOrder)) {
        throw new ErpApiError('bad_response', `The ERP did not answer with sales order ${docNo}`)
      }
      const items = Array.isArray(body.items) ? body.items.filter(isRow) : []
      return { header: body.salesOrder, items }
    },

    async getPayments(docNo) {
      const { body } = await get(`/api/scm/mfg-sales-orders/${encodeURIComponent(docNo)}/payments`)
      if (!isRow(body) || !Array.isArray(body.payments)) return []
      return body.payments.filter(isRow)
    },
  }
}
