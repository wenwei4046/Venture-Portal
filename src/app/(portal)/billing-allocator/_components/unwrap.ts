// Server actions in this feature RETURN their error message instead of
// throwing — Next.js masks thrown server-action errors in production builds
// ("An error occurred in the Server Components render…", user hit it
// 2026-08-01), which hid the real "period already invoiced" guidance.
// Client code funnels results through unwrap(): a returned error becomes a
// local throw, which the tabs' run() helpers already catch and display.
export function unwrap<T extends { error?: string }>(result: T): T {
  if (result?.error) throw new Error(result.error)
  return result
}
