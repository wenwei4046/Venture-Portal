/**
 * One at a time: a second tap while the first is still going does nothing.
 * Screen state (a `sending` flag) lands only on the next render, so a quick
 * double tap — or Enter and a click — passed it and the customer got the
 * message twice (prod 2026-10-09: two "from crm testing", five "visit is
 * changed" in 12 s). Keyed by what is being done to whom.
 */
const inFlight = new Set<string>();

export async function oneAtATime<T>(key: string, run: () => Promise<T>): Promise<T | undefined> {
  if (inFlight.has(key)) return undefined;
  inFlight.add(key);
  try {
    return await run();
  } finally {
    inFlight.delete(key);
  }
}
