import { belongTogether, citiesOf, postcodesOf, statesOf, type PostcodeData } from './malaysia'

/**
 * An address as the portal keeps it (2026-10-20 — the user: "凡是有提到 address 的东西 … 填写的 format 要区分成 address 1、
 * address 2、postcode、state、city，国家 default 是 Malaysia", and "所有关联到 address 的，都要跟着我刚才上面讲的 format 给他们去
 * 填"): two lines typed, then — in Malaysia — the state, the city and the postcode picked from Pos Malaysia's list in that
 * order (`malaysia.ts`), and the country, Malaysia unless another is picked. Abroad the three are typed: the list is
 * Malaysia's. The old one-box address stays on each record as the six put together (`addressText`, the database's
 * `address_compose`), for everything that still prints one line. Pure.
 */

export const MALAYSIA = 'Malaysia'

export interface Address {
  line1: string
  line2: string
  postcode: string
  city: string
  state: string
  country: string
}

export const ADDRESS_KEYS = ['line1', 'line2', 'state', 'city', 'postcode', 'country'] as const satisfies ReadonlyArray<keyof Address>

/** Each part's column on a record (hr_staff_costs, att_locations). */
export const ADDRESS_COLUMNS: Readonly<Record<keyof Address, string>> = {
  line1: 'address_line1',
  line2: 'address_line2',
  postcode: 'address_postcode',
  city: 'address_city',
  state: 'address_state',
  country: 'address_country',
}

/** The parts in words — a field's label, a refusal's. */
export const ADDRESS_LABELS: Readonly<Record<keyof Address, string>> = {
  line1: 'Address line 1',
  line2: 'Address line 2',
  postcode: 'Postcode',
  city: 'City',
  state: 'State',
  country: 'Country',
}

/** No address yet: nothing typed, Malaysia picked. */
export const EMPTY_ADDRESS: Address = { line1: '', line2: '', postcode: '', city: '', state: '', country: MALAYSIA }

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** Nothing of it given — the country alone is no address. */
export function isEmptyAddress(a: Address): boolean {
  return !clean(a.line1) && !clean(a.line2) && !clean(a.postcode) && !clean(a.city) && !clean(a.state)
}

/** In Malaysia: the state, city and postcode are picked from its list (a blank country is Malaysia). */
export function inMalaysia(a: Pick<Address, 'country'>): boolean {
  const c = clean(a.country)
  return c === '' || c.toLowerCase() === MALAYSIA.toLowerCase()
}

/** A record's six columns (hr_staff_costs, att_locations), each as it came. */
export interface AddressRow {
  address_line1?: unknown
  address_line2?: unknown
  address_postcode?: unknown
  address_city?: unknown
  address_state?: unknown
  address_country?: unknown
}

/** The parts as a record keeps them — `address_line1` … — an empty one as nothing, Malaysia when the country is blank. */
export function addressOf(row: AddressRow | null | undefined): Address {
  const a: Address = {
    line1: clean(row?.address_line1),
    line2: clean(row?.address_line2),
    postcode: clean(row?.address_postcode),
    city: clean(row?.address_city),
    state: clean(row?.address_state),
    country: clean(row?.address_country),
  }
  return { ...a, country: a.country || MALAYSIA }
}

/** The parts trimmed, a blank country Malaysia — what is saved and compared. */
export function cleanAddress(a: Address): Address {
  const out: Address = {
    line1: clean(a.line1),
    line2: clean(a.line2),
    postcode: clean(a.postcode),
    city: clean(a.city),
    state: clean(a.state),
    country: clean(a.country) || MALAYSIA,
  }
  return out
}

/** Whether two addresses say the same — every part, trimmed; two empty ones alike whatever their country. */
export function sameAddress(a: Address, b: Address): boolean {
  if (isEmptyAddress(a) && isEmptyAddress(b)) return true
  const x = cleanAddress(a)
  const y = cleanAddress(b)
  return ADDRESS_KEYS.every(k => x[k] === y[k])
}

/**
 * The address as it prints, a line each: "No 83, Jalan Jambu 3" · "Machang Bubok" · "14000 Bukit Mertajam" ·
 * "Pulau Pinang, Malaysia". None for no address.
 */
export function addressLines(a: Address): string[] {
  if (isEmptyAddress(a)) return []
  const x = cleanAddress(a)
  return [x.line1, x.line2, [x.postcode, x.city].filter(Boolean).join(' '), [x.state, x.country].filter(Boolean).join(', ')].filter(Boolean)
}

/** On one line, as the old box kept it and the database puts it together (`address_compose`); null for none. */
export function addressText(a: Address): string | null {
  const lines = addressLines(a)
  return lines.length ? lines.join(', ') : null
}

// ── Picking, in the order the user chose: state, then city, then postcode ──

/** A state picked: its city and postcode start again. */
export function withState(a: Address, state: string): Address {
  return { ...a, state, city: '', postcode: '' }
}

/** A city picked: its postcode starts again — or is picked at once, when the city has only one. */
export function withCity(a: Address, city: string, data: PostcodeData | null): Address {
  const only = data && city ? postcodesOf(data, a.state, city) : []
  return { ...a, city, postcode: only.length === 1 ? only[0] : '' }
}

/** A country picked: Malaysia's three come from its list and another country's are typed, so a move across starts them again. */
export function withCountry(a: Address, country: string): Address {
  return inMalaysia(a) === inMalaysia({ country }) ? { ...a, country } : { ...a, country, state: '', city: '', postcode: '' }
}

/**
 * What each picker offers, in Malaysia: the states; the picked state's cities; the picked city's postcodes — each
 * with the value on file first when the list does not have it (an older record), so the field shows what is there.
 */
export function choicesFor(a: Address, data: PostcodeData | null): { states: string[]; cities: string[]; postcodes: string[] } {
  const keep = (list: string[], v: string) => (v && !list.includes(v) ? [v, ...list] : list)
  if (!data) return { states: keep([], a.state), cities: keep([], a.city), postcodes: keep([], a.postcode) }
  return {
    states: keep(statesOf(data), a.state),
    cities: keep(a.state ? citiesOf(data, a.state) : [], a.city),
    postcodes: keep(a.state && a.city ? postcodesOf(data, a.state, a.city) : [], a.postcode),
  }
}

const MAX_LINE = 200
const MAX_PART = 120

/**
 * What stops an address from being saved, in words — or null. None at all is fine (an address may be cleared); else
 * the first line, and in Malaysia the state, city and postcode from its list, as one place; abroad the city and the
 * country.
 */
export function addressRefusal(input: Address, data: PostcodeData): string | null {
  if (isEmptyAddress(input)) return null
  const a = cleanAddress(input)
  if (!a.line1) return 'Fill in address line 1.'
  if (a.line1.length > MAX_LINE || a.line2.length > MAX_LINE) return `Keep each address line under ${MAX_LINE} characters.`
  if ([a.postcode, a.city, a.state, a.country].some(v => v.length > MAX_PART)) return `Keep the postcode, city, state and country under ${MAX_PART} characters.`
  if (inMalaysia(a)) {
    const missing = (['state', 'city', 'postcode'] as const).filter(k => !a[k])
    if (missing.length) return `Pick the ${missing.map(k => ADDRESS_LABELS[k].toLowerCase()).join(', ')}.`
    if (!statesOf(data).includes(a.state)) return 'Pick the state from the list.'
    if (!belongTogether(data, a)) return `${a.postcode} is not a postcode of ${a.city}, ${a.state} — pick them from the list.`
    return null
  }
  if (!a.city) return 'Fill in the city.'
  return null
}
