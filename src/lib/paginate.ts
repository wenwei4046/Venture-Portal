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

// fetchAllRows, its pages in PARALLEL (2026-10-08).
//
// One page after another, every page is a full round trip in a row (~35–40 ms
// from Vercel sin1, 66–95 ms for a page of the ledger). The GL reports read the
// whole of journal_lines that way — ~4,230 lines, five pages — so the read
// alone cost five round trips before a single figure could be worked out.
//
// So: the FIRST page asks PostgREST for the total as well (`count: 'exact'`,
// answered in Content-Range), and the pages it implies go PAGES_IN_FLIGHT at a
// time — two round trips for journal_lines instead of five. Same page size,
// same `.order()`, pages put back in page order: the answer is fetchAllRows'.
//
// The builder gets a third argument, `withCount` — true on the first page only,
// where it must ask for the count. ONLY there: counting is a second query, and
// a counted page that starts past the end is a 416, not an empty page.
//
//   const rows = await fetchAllRowsParallel((from, to, withCount) => supabase
//     .from('journal_lines')
//     .select('debit, credit', withCount ? { count: 'exact' } : undefined)
//     .order('id', { ascending: true })
//     .range(from, to))
//
// The count only decides how much to ask for AT ONCE; it never decides where
// the rows end. That is still fetchAllRows' rule — never stop on a full page —
// so a total that is a multiple of the page size, a table that grew while it
// was read, or a builder that did not count (no `count` in the answer: it reads
// one page after another, exactly as fetchAllRows does) all still end on a
// short page.
//
// `label` prefixes the error, for the callers that had their own message.
const PAGES_IN_FLIGHT = 4

export async function fetchAllRowsParallel<T>(
  buildPage: (
    from: number,
    to: number,
    withCount: boolean,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>,
  label = 'fetchAllRowsParallel',
): Promise<T[]> {
  const first = await buildPage(0, PAGE_SIZE - 1, true)
  if (first.error) throw new Error(`${label}: ${first.error.message}`)
  const pages: T[][] = [first.data ?? []]

  // Pages the count promises beyond the first (none without a count).
  const counted = typeof first.count === 'number' ? Math.ceil(first.count / PAGE_SIZE) : 1
  if (pages[0].length >= PAGE_SIZE && counted > 1) {
    const rest: T[][] = new Array(counted - 1)
    let next = 1
    let failed = false
    const worker = async () => {
      while (next < counted && !failed) {
        const index = next++
        const from = index * PAGE_SIZE
        const { data, error } = await buildPage(from, from + PAGE_SIZE - 1, false)
        if (error) {
          failed = true
          throw new Error(`${label}: ${error.message}`)
        }
        rest[index - 1] = data ?? []
      }
    }
    await Promise.all(Array.from({ length: Math.min(PAGES_IN_FLIGHT, counted - 1) }, worker))
    pages.push(...rest)
  }

  // Never stop on a full page.
  while (pages[pages.length - 1].length >= PAGE_SIZE) {
    const from = pages.length * PAGE_SIZE
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1, false)
    if (error) throw new Error(`${label}: ${error.message}`)
    pages.push(data ?? [])
  }
  return pages.flat()
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
//
// `label` prefixes the error, for the callers that had their own message.
const KEY_CHUNK = 100
const CHUNKS_IN_FLIGHT = 4

export async function fetchByKeys<T, K extends string | number>(
  keys: readonly K[],
  buildChunk: (chunk: K[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label = 'fetchByKeys',
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
      if (error) throw new Error(`${label}: ${error.message}`)
      results[index] = data ?? []
    }
  }
  await Promise.all(Array.from({ length: Math.min(CHUNKS_IN_FLIGHT, chunks.length) }, worker))
  return results.flat()
}
