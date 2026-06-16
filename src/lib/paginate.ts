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
