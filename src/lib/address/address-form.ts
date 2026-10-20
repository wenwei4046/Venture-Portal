import { ADDRESS_COLUMNS, ADDRESS_KEYS, cleanAddress, isEmptyAddress, type Address } from './address'

/**
 * An address as a form carries it and a record keeps it (2026-10-20): the six parts under their columns' names —
 * `address_line1` … `address_country` (`ADDRESS_COLUMNS`) — always sent together, so the record never holds half of
 * one address and half of another. Pure.
 */

/** The six parts a form sent, or null when it sent none of them (the address was not edited). */
export function addressFromForm(formData: FormData): Address | null {
  const sent = ADDRESS_KEYS.filter(key => formData.has(ADDRESS_COLUMNS[key]))
  if (sent.length === 0) return null
  const part = (key: keyof Address) => {
    const v = formData.get(ADDRESS_COLUMNS[key])
    return typeof v === 'string' ? v : ''
  }
  return { line1: part('line1'), line2: part('line2'), postcode: part('postcode'), city: part('city'), state: part('state'), country: part('country') }
}

/**
 * The address a profile change names — Me's Edit profile sends a changed address as all six parts, `{ key, to }` by
 * their columns (`lib/me/profile.ts`) — or null when it names none of them.
 */
export function addressFromChanges(changes: unknown): Address | null {
  if (!Array.isArray(changes)) return null
  const byKey = new Map<string, string>()
  for (const c of changes) {
    if (c && typeof c === 'object' && typeof (c as { key?: unknown }).key === 'string') {
      const to = (c as { to?: unknown }).to
      byKey.set((c as { key: string }).key, typeof to === 'string' ? to : '')
    }
  }
  if (!ADDRESS_KEYS.some(key => byKey.has(ADDRESS_COLUMNS[key]))) return null
  const part = (key: keyof Address) => byKey.get(ADDRESS_COLUMNS[key]) ?? ''
  return { line1: part('line1'), line2: part('line2'), postcode: part('postcode'), city: part('city'), state: part('state'), country: part('country') }
}

/** The six parts on a form, by their columns' names — every one, a blank as ''. */
export function addressFormEntries(a: Address): Array<[string, string]> {
  return ADDRESS_KEYS.map(key => [ADDRESS_COLUMNS[key], a[key]])
}

/**
 * The columns to write: each part trimmed, a blank one NULL, the country Malaysia unless another — and for no
 * address at all, every part NULL (the record's one-line `address` follows in the database).
 */
export function addressPatch(a: Address): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  if (isEmptyAddress(a)) {
    for (const key of ADDRESS_KEYS) out[ADDRESS_COLUMNS[key]] = null
    return out
  }
  const x = cleanAddress(a)
  for (const key of ADDRESS_KEYS) out[ADDRESS_COLUMNS[key]] = x[key] || null
  return out
}
