// Start a read now, await it later (2026-10-08).
//
// A Server Component that awaits its reads one after another pays a full round
// trip for each — ~35–40 ms in production (Vercel sin1 → Supabase
// ap-southeast-1, RLS checks included) — even when no read needs another's
// answer. Starting every independent read before the first `await` costs one
// round trip for the lot; only a read that truly needs an earlier answer should
// wait for it (revenue/[sub]/[period]/page.tsx is the in-repo pattern).
//
// Two traps this closes:
//   - A PostgREST builder sends its request EVERY time something awaits it.
//     `Promise.resolve` pins it to one request, however often the answer is
//     awaited afterwards.
//   - A read that fails while the page is still awaiting an EARLIER one would be
//     an unhandled rejection. The no-op catch only marks it handled: awaiting
//     the returned promise still throws the same error, at the same place in
//     the page as before — so when two reads fail, the one the page reads first
//     is still the one that surfaces. A read the page never gets to (it
//     returned or redirected first) fails silently, as a read never made would.
export function startRead<T>(read: PromiseLike<T>): Promise<T> {
  const started = Promise.resolve(read)
  started.catch(() => {})
  return started
}
