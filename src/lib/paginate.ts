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
//
// The chunks go CHUNKS_IN_FLIGHT at a time (2026-09-26). One after another,
// every chunk was a full round trip in a row: the month page asked for ~1,500
// bills' fairs in 15 of them and waited 0.2–3.2 s. Four at once hides most of
// that without flooding PostgREST, and the rows still come back in key order.
const KEY_CHUNK = 100
const CHUNKS_IN_FLIGHT = 4

export async function fetchByKeys<T, K extends string | number>(
  keys: readonly K[],
  buildChunk: (chunk: K[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  if (keys.length === 0) return []
  const chunks: K[][] = []
  for (let i = 0; i < keys.length; i += KEY_CHUNK) chunks.push(keys.slice(i, i + KEY_CHUNK) as K[])

  const results: T[][] = new Array(chunks.length)
  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const index = next++
      const { data, error } = await buildChunk(chunks[index])
      if (error) throw new Error(`fetchByKeys: ${error.message}`)
      results[index] = data ?? []
    }
  }
  await Promise.all(Array.from({ length: Math.min(CHUNKS_IN_FLIGHT, chunks.length) }, worker))
  return results.flat()
}
