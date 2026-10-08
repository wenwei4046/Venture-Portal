// Run a test step in another time zone.
//
// A client component is rendered twice: on the server, which keeps UTC on
// Vercel, and again in the browser, which in the office is UTC+8. If it prints
// a time from the machine's clock the two disagree and React throws the
// server's page away (2026-10-08: Approvals and Payments). The suite's own
// machine is in neither zone for certain — KL on a laptop, UTC in CI — so a
// test that wants to be the server or the browser says which, here.
//
// Node re-reads process.env.TZ the moment it is assigned, so Date (and dayjs
// on top of it) answer in the new zone at once. Deleting it does not reset it,
// hence the zone this process started in is put back explicitly.

const startZone = Intl.DateTimeFormat().resolvedOptions().timeZone

/** `fn()` with the process in `timeZone` (an IANA name). Synchronous only. */
export function inTimeZone<T>(timeZone: string, fn: () => T): T {
  const before = process.env.TZ
  process.env.TZ = timeZone
  try {
    return fn()
  } finally {
    process.env.TZ = before ?? startZone
  }
}

/**
 * The same for a step that awaits — a server component, a server action, a
 * route handler — kept in `timeZone` until it settles. A file's tests run one
 * at a time (and each file in its own process), so nothing else runs in the
 * borrowed zone meanwhile.
 */
export async function inTimeZoneAsync<T>(timeZone: string, fn: () => Promise<T>): Promise<T> {
  const before = process.env.TZ
  process.env.TZ = timeZone
  try {
    return await fn()
  } finally {
    process.env.TZ = before ?? startZone
  }
}
