import { PR_LIMITS, type SavePayload, type UploadedFile } from './model'

// What `savePaymentRequest` hands payment_request_save (moved out of actions.ts on 2026-11-28 so it can be tested — a
// 'use server' file exports only its actions). A SPLIT BY PERCENT KEEPS ITS PERCENTS (2026-11-28): the window sends a
// percent share as `{ amount: '', percent: '33.33' }` (model.ts › draftPayload) and the database works the ringgit out
// of the percent (mig 20261112210000); until then this dropped `percent`, so every share of such a split was saved at
// RM 0 and the requester's own department bore the whole claim.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** What the browser sent, as the database files it — nothing else of what it said. */
export function cleanPayload(raw: unknown): SavePayload | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!o || (o.kind !== 'claim' && o.kind !== 'direct_pay')) return null
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  const rows = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []).map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
  const payTo = o.payTo && typeof o.payTo === 'object' ? (o.payTo as Record<string, unknown>) : null
  const supplier = o.supplier && typeof o.supplier === 'object' ? (o.supplier as Record<string, unknown>) : null
  const files: UploadedFile[] = rows(o.files, PR_LIMITS.files + 1).flatMap((f) =>
    typeof f.path === 'string'
      ? [{
          path: f.path.slice(0, 400),
          name: text(f.name, 200) || 'file',
          contentType: text(f.contentType, 120),
          size: typeof f.size === 'number' && Number.isFinite(f.size) ? Math.max(0, Math.round(f.size)) : 0,
        }]
      : [],
  )
  return {
    kind: o.kind,
    ...(o.kind === 'claim'
      ? {
          payTo: {
            ...(isId(payTo?.staffId) ? { staffId: payTo.staffId } : typeof payTo?.name === 'string' ? { name: text(payTo.name, 200) } : {}),
            ...(payTo?.salary === false ? { salary: false as const, bank: text(payTo.bank, 120), accountNo: text(payTo.accountNo, 40) } : { salary: true as const }),
          },
        }
      : { supplier: { name: text(supplier?.name, 200), bank: text(supplier?.bank, 120), accountNo: text(supplier?.accountNo, 40) } }),
    items: rows(o.items, PR_LIMITS.items + 1).map((i) => ({ description: text(i.description, 200), amount: text(i.amount, 20) })),
    shares: rows(o.shares, PR_LIMITS.shares + 1).map((s) => ({
      party: s.party === 'company' ? ('company' as const) : ('department' as const),
      ...(s.party === 'company' ? { companyId: text(s.companyId, 40) } : { departmentId: text(s.departmentId, 40) }),
      amount: text(s.amount, 20),
      // As typed: the database reads it (a number up to 100, like 33.33) and refuses anything else in words.
      ...(typeof s.percent === 'string' ? { percent: text(s.percent, 10) } : {}),
    })),
    files,
    removeFiles: (Array.isArray(o.removeFiles) ? o.removeFiles : []).filter(isId).slice(0, 20),
  }
}
