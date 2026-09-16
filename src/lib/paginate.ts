// Paginate a Supabase select past PostgREST's 1000-row default cap.
//
// PostgREST silently truncates an unranged `select` at 1000 rows — no error — so
// ANY read whose rows are summed / reduced / counted into a total, balance, or
// count MUST loop with `.range()` until a short page comes back. (Regression
// 2026-06-16: the Trial Balance stopped tying once journal_lines passed 1000.)
//
// The caller supplies a builder that REBUILDS the query per page (Supabase query
// builders are single-use) and applies `.range(from, to)` plus a STABLE `.order()`
// — order by the primary key (e.g. `.order('id')`) so pages never overlap or skip.
//
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from('journal_lines').select('debit, credit').eq('x', y).order('id').range(from, to))
const PAGE_SIZE = 1000

export async function fetchAllRows<T>(
  buildPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`fetchAllRows: ${error.message}`)
    if (data && data.length > 0) out.push(...data)
    if (!data || data.length < PAGE_SIZE) break
  }
  return out
}

// The other end of the same trap: too many keys in one `.in(...)`.
//
// PostgREST takes its filters in the QUERY STRING, so `.in('order_id', ids)`
// with a few hundred UUIDs builds a URL of tens of kilobytes. The gateway does
// not truncate it politely — the request fails outright, which surfaces in
// supabase-js as `{ data: null, error: 'TypeError: fetch failed' }`. A caller
// that reads `data` without reading `error` then carries on with NOTHING and
// no sign that anything went wrong.
//
// (Regression 2026-09-16: the commission run gathers Open Bill picks for every
// order in the run, including the ones carried forward from earlier months. At
// 507 orders that query failed, the error was not checked, and the run paid no
// Open Bill bonus at all — RM 18,677 missing from one month, silently.)
//
// So: chunk the keys, and let a failure be a failure.
const KEY_CHUNK = 100

export async function fetchByKeys<T, K extends string | number>(
  keys: readonly K[],
  buildChunk: (chunk: K[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  if (keys.length === 0) return []
  const out: T[] = []
  for (let i = 0; i < keys.length; i += KEY_CHUNK) {
    const { data, error } = await buildChunk(keys.slice(i, i + KEY_CHUNK) as K[])
    if (error) throw new Error(`fetchByKeys: ${error.message}`)
    if (data) out.push(...data)
  }
  return out
}
