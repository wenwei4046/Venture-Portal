// Turning an access_log row back into a sentence.
//
// `access_log` has recorded privileged reads (salary, payouts, payments) since
// Phase 1, and from 2026-09-01 it also records page views — one row per
// navigation, written by the portal shell. Both shapes land in the same table,
// so both have to render in the same list on somebody's Activity tab.
//
// Pure on purpose: the lookup map is passed in (nav-config owns it) so this
// file has no import of its own and can be unit-tested against a fixture.

export interface ActivityRow {
  resource_type: string
  resource_id: string | null
  action: string | null
  metadata: unknown
  created_at: string
}

export interface ActivityLine {
  /** What they did — "Opened", "Viewed", "Exported". */
  verb: string
  /** What they did it to — a page name, or a resource. */
  target: string
  /** Extra identifying detail, when there is any worth showing. */
  detail: string | null
}

const VERBS: Record<string, string> = {
  view: 'Opened',
  export: 'Exported',
  print: 'Printed',
  download: 'Downloaded',
  create: 'Created',
  update: 'Edited',
  delete: 'Deleted',
}

const RESOURCE_LABELS: Record<string, string> = {
  hr_staff_costs: 'Staff directory',
  director_payouts: 'Director payouts',
  director_salary_print: 'Director salary print',
  payment_voucher: 'Payment voucher',
}

/**
 * The label the sidebar gives a path, for the deepest nav entry that contains
 * it. `/team/people/<id>` resolves through `/team/people`; a path under no nav
 * entry at all falls back to its own last segment.
 */
export function describePagePath(
  pathname: string,
  labels: ReadonlyMap<string, string>,
): { target: string; detail: string | null } {
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/'

  let bestPath = ''
  for (const path of labels.keys()) {
    if (clean !== path && !clean.startsWith(path + '/')) continue
    if (path.length > bestPath.length) bestPath = path
  }

  if (!bestPath) {
    const last = clean.split('/').filter(Boolean).pop()
    return { target: last ? titleCase(last) : 'Portal', detail: null }
  }

  const label = labels.get(bestPath)!
  const rest = clean.slice(bestPath.length).replace(/^\//, '')
  return { target: label, detail: rest ? describeRest(rest) : null }
}

// Deeper segments are almost always an id. Naming the row would need a lookup
// per log line, so say which KIND of thing it was and show a short handle.
function describeRest(rest: string): string {
  const parts = rest.split('/')
  const readable = parts.filter(p => !isId(p)).map(titleCase)
  const ids = parts.filter(isId)
  const head = readable.length > 0 ? readable.join(' · ') : 'detail'
  return ids.length > 0 ? `${head} ${ids[0].slice(0, 8)}` : head
}

function isId(segment: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^\d{4}-\d{2}(-\d{2})?$/.test(segment)
  )
}

function titleCase(segment: string): string {
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function describeActivity(
  row: ActivityRow,
  labels: ReadonlyMap<string, string>,
): ActivityLine {
  if (row.resource_type === 'page') {
    const { target, detail } = describePagePath(row.resource_id ?? '/', labels)
    return { verb: verbFor(row.action, 'page'), target, detail }
  }

  const target = RESOURCE_LABELS[row.resource_type] ?? titleCase(row.resource_type)
  return { verb: verbFor(row.action, row.resource_type), target, detail: shortId(row.resource_id) }
}

/**
 * Actions were written whole where they were logged — `update_payment_voucher`
 * on a `payment_voucher` row — so the plain reading is "UPDATE PAYMENT VOUCHER
 * Payment voucher". Dropping the trailing resource name leaves a verb the
 * table above knows.
 */
function verbFor(action: string | null, resourceType: string): string {
  const raw = action ?? 'view'
  const suffix = '_' + resourceType
  const stem = raw.endsWith(suffix) ? raw.slice(0, -suffix.length) : raw
  return VERBS[stem] ?? titleCase(stem || raw)
}

/** A uuid is unreadable at full length and recognisable at eight; anything
 *  else somebody chose to log (a period, a voucher number) is already short. */
function shortId(resourceId: string | null): string | null {
  if (!resourceId) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(resourceId) ? resourceId.slice(0, 8) : resourceId
}
