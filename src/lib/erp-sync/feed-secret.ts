import 'server-only'
import { getFeedSecret } from './feed-key'

/**
 * The pasted key, for the receiver — or null, and never a throw.
 *
 * The receiver answers the ERP's outbox, whose drainer keeps a row pending on
 * 401/503 without spending an attempt. A portal that cannot reach Vault for a
 * moment must therefore look "not configured" (503), not fail the delivery
 * (500) — a 500 costs the row one of its six attempts. The failure is logged so
 * it is not silent.
 */
export async function storedFeedSecret(): Promise<string | null> {
  try {
    return await getFeedSecret()
  } catch (err) {
    console.error('[erp-feed] could not read the pasted key:', err instanceof Error ? err.message : err)
    return null
  }
}
