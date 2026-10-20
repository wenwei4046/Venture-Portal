import { describe, expect, it } from 'vitest'
import file from './malaysia-postcodes.json'
import {
  EMPTY_ADDRESS,
  addressLines,
  addressOf,
  addressRefusal,
  addressText,
  choicesFor,
  inMalaysia,
  isEmptyAddress,
  sameAddress,
  withCity,
  withCountry,
  withState,
  type Address,
} from './address'
import { addressFormEntries, addressFromChanges, addressFromForm, addressPatch } from './address-form'
import { belongTogether, citiesOf, placesOfPostcode, postcodesOf, statesOf, type PostcodeData } from './malaysia'

// An address in six parts (2026-10-20 — the user: "填写的 format 要区分成 address 1、address 2、postcode、state、city，国家
// default 是 Malaysia"; "确保 city、state 还有 postcode 跟 Malaysia 的 database 是一样的 … 不是填的，应该都是选的"; "go with
// state, city, postcode").

const DATA = file.states as unknown as PostcodeData
const at = (over: Partial<Address> = {}): Address => ({ ...EMPTY_ADDRESS, ...over })
const CHEA = at({ line1: 'No 83, Jalan Jambu 3', line2: 'Machang Bubok', postcode: '14000', city: 'Bukit Mertajam', state: 'Pulau Pinang' })

describe('Malaysia’s postcode list', () => {
  it('holds the sixteen states, the federal territories last, as Pos Malaysia names their cities', () => {
    expect(statesOf(DATA)).toEqual([
      'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak',
      'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya',
    ])
    const cities = DATA.reduce((n, [, c]) => n + c.length, 0)
    const postcodes = new Set(DATA.flatMap(([, c]) => c.flatMap(([, p]) => p)))
    expect([cities, postcodes.size]).toEqual([444, 2929])
    expect([...postcodes].every(p => /^\d{5}$/.test(p))).toBe(true)
  })

  it('answers a state’s cities and a city’s postcodes, A→Z and ascending', () => {
    expect(citiesOf(DATA, 'Pulau Pinang')).toContain('Bukit Mertajam')
    expect(postcodesOf(DATA, 'Pulau Pinang', 'Bukit Mertajam')).toEqual(['14000', '14007', '14009', '14020'])
    expect(citiesOf(DATA, 'Nowhere')).toEqual([])
    expect(postcodesOf(DATA, 'Pulau Pinang', 'Ipoh')).toEqual([])
  })

  it('places a postcode — where Pos Malaysia says, not where people say (11060 is Pulau Pinang, not Ayer Itam)', () => {
    expect(placesOfPostcode(DATA, '11060')).toEqual([{ state: 'Pulau Pinang', city: 'Pulau Pinang' }])
    expect(placesOfPostcode(DATA, '86400')).toEqual([{ state: 'Johor', city: 'Batu Pahat' }, { state: 'Johor', city: 'Parit Raja' }])
    expect(placesOfPostcode(DATA, '00000')).toEqual([])
  })

  it('knows when the three are one place', () => {
    expect(belongTogether(DATA, { state: 'Pulau Pinang', city: 'Bukit Mertajam', postcode: '14000' })).toBe(true)
    expect(belongTogether(DATA, { state: 'Pulau Pinang', city: 'Ayer Itam', postcode: '11060' })).toBe(false)
    // A city name two states share is the state's own.
    expect(belongTogether(DATA, { state: 'Perlis', city: 'Simpang Ampat', postcode: '14100' })).toBe(false)
    expect(belongTogether(DATA, { state: 'Pulau Pinang', city: 'Simpang Ampat', postcode: '14100' })).toBe(true)
  })
})

describe('an address', () => {
  // The same examples as tests/member-sql/validate-structured-address.mjs › address_compose: one line, word for word.
  it('prints a line each, and on one line as the database puts it together', () => {
    expect(addressLines(CHEA)).toEqual(['No 83, Jalan Jambu 3', 'Machang Bubok', '14000 Bukit Mertajam', 'Pulau Pinang, Malaysia'])
    expect(addressText(CHEA)).toBe('No 83, Jalan Jambu 3, Machang Bubok, 14000 Bukit Mertajam, Pulau Pinang, Malaysia')
    expect(addressText(at({ line1: '  No 8,   Jalan Mawar 2 ', postcode: '82100', city: 'Ayer Baloi', state: 'Johor', country: '' }))).toBe(
      'No 8, Jalan Mawar 2, 82100 Ayer Baloi, Johor, Malaysia',
    )
    expect(addressText(at({ line1: '1 Raffles Place', postcode: '048616', city: 'Singapore', country: 'Singapore' }))).toBe(
      '1 Raffles Place, 048616 Singapore, Singapore',
    )
    expect(addressText(at({ line1: 'Lot 5', city: 'Kota Kinabalu', state: 'Sabah' }))).toBe('Lot 5, Kota Kinabalu, Sabah, Malaysia')
    expect(addressText(at({ line2: ' ' }))).toBeNull()
    expect(addressLines(EMPTY_ADDRESS)).toEqual([])
  })

  it('reads a record’s parts, Malaysia when the country is blank; the country alone is no address', () => {
    expect(addressOf({ address_line1: ' No 83 ', address_postcode: '14000', address_city: 'Bukit Mertajam', address_state: 'Pulau Pinang' })).toEqual(
      at({ line1: 'No 83', postcode: '14000', city: 'Bukit Mertajam', state: 'Pulau Pinang' }),
    )
    expect(addressOf(null)).toEqual(EMPTY_ADDRESS)
    expect(isEmptyAddress(at({ country: 'Singapore' }))).toBe(true)
    expect(inMalaysia(at({ country: ' malaysia ' }))).toBe(true)
    expect(inMalaysia(at({ country: 'Singapore' }))).toBe(false)
  })

  it('says the same whatever the spaces, and two empty ones alike', () => {
    expect(sameAddress(CHEA, { ...CHEA, line1: ' No 83,  Jalan Jambu 3 ' })).toBe(true)
    expect(sameAddress(CHEA, { ...CHEA, postcode: '14020' })).toBe(false)
    expect(sameAddress(EMPTY_ADDRESS, at({ country: 'Singapore' }))).toBe(true)
  })
})

describe('picking, state then city then postcode', () => {
  it('starts the city and postcode again on a new state, the postcode on a new city', () => {
    expect(withState(CHEA, 'Johor')).toEqual({ ...CHEA, state: 'Johor', city: '', postcode: '' })
    expect(withCity(CHEA, 'Butterworth', DATA)).toEqual({ ...CHEA, city: 'Butterworth', postcode: '' })
  })

  it('picks the postcode at once for a city that has only one', () => {
    expect(withCity(at({ state: 'Johor' }), 'Ayer Baloi', DATA).postcode).toBe('82100')
    expect(withCity(at({ state: 'Johor' }), 'Ayer Baloi', null).postcode).toBe('')
  })

  it('starts the three again when the country moves across Malaysia’s border, not otherwise', () => {
    expect(withCountry(CHEA, 'Singapore')).toEqual({ ...CHEA, country: 'Singapore', state: '', city: '', postcode: '' })
    const sg = at({ line1: '1 Raffles Place', city: 'Singapore', postcode: '048616', country: 'Singapore' })
    expect(withCountry(sg, 'Brunei')).toEqual({ ...sg, country: 'Brunei' })
    expect(withCountry(sg, 'Malaysia')).toEqual({ ...sg, country: 'Malaysia', city: '', postcode: '' })
  })

  it('offers each picker its list — with a value on file the list has not, first', () => {
    const c = choicesFor(CHEA, DATA)
    expect(c.states).toHaveLength(16)
    expect(c.cities).toContain('Bukit Mertajam')
    expect(c.postcodes).toEqual(['14000', '14007', '14009', '14020'])
    expect(choicesFor(at({ state: 'Pulau Pinang', city: 'Ayer Itam', postcode: '11060' }), DATA).postcodes).toEqual(['11060', '11500'])
    expect(choicesFor(at({ state: 'Penang' }), DATA).states[0]).toBe('Penang')
    expect(choicesFor(CHEA, null)).toEqual({ states: ['Pulau Pinang'], cities: ['Bukit Mertajam'], postcodes: ['14000'] })
    expect(choicesFor(EMPTY_ADDRESS, DATA).cities).toEqual([])
  })
})

describe('what stops an address', () => {
  it('lets none at all through — an address may be cleared', () => {
    expect(addressRefusal(EMPTY_ADDRESS, DATA)).toBeNull()
  })

  it('asks for the first line, and in Malaysia the three from the list, as one place', () => {
    expect(addressRefusal(CHEA, DATA)).toBeNull()
    expect(addressRefusal({ ...CHEA, line1: ' ' }, DATA)).toBe('Fill in address line 1.')
    expect(addressRefusal(at({ line1: 'No 1' }), DATA)).toBe('Pick the state, city, postcode.')
    expect(addressRefusal({ ...CHEA, postcode: '' }, DATA)).toBe('Pick the postcode.')
    expect(addressRefusal({ ...CHEA, state: 'Penang' }, DATA)).toBe('Pick the state from the list.')
    expect(addressRefusal({ ...CHEA, postcode: '11060' }, DATA)).toBe('11060 is not a postcode of Bukit Mertajam, Pulau Pinang — pick them from the list.')
    expect(addressRefusal({ ...CHEA, line2: 'x'.repeat(201) }, DATA)).toBe('Keep each address line under 200 characters.')
  })

  it('abroad, asks the city — the state and postcode are theirs to type, or not', () => {
    expect(addressRefusal(at({ line1: '1 Raffles Place', city: 'Singapore', country: 'Singapore' }), DATA)).toBeNull()
    expect(addressRefusal(at({ line1: '1 Raffles Place', country: 'Singapore' }), DATA)).toBe('Fill in the city.')
  })
})

describe('on a form and on a record', () => {
  it('rides a form as its six columns, and is read back only when the form carried them', () => {
    const fd = new FormData()
    for (const [name, value] of addressFormEntries(CHEA)) fd.set(name, value)
    expect(addressFromForm(fd)).toEqual(CHEA)
    expect(addressFromForm(new FormData())).toBeNull()
  })

  it('writes each part trimmed, a blank one NULL, Malaysia unless another — and no address as every part NULL', () => {
    expect(addressPatch({ ...CHEA, line2: ' ', country: '' })).toEqual({
      address_line1: 'No 83, Jalan Jambu 3', address_line2: null, address_postcode: '14000',
      address_city: 'Bukit Mertajam', address_state: 'Pulau Pinang', address_country: 'Malaysia',
    })
    expect(addressPatch(at({ country: 'Singapore' }))).toEqual({
      address_line1: null, address_line2: null, address_postcode: null, address_city: null, address_state: null, address_country: null,
    })
  })

  it('reads the address a profile change names by its columns, else none', () => {
    const changes = [{ key: 'contact_number', to: '012' }, ...addressFormEntries(CHEA).map(([key, to]) => ({ key, to }))]
    expect(addressFromChanges(changes)).toEqual(CHEA)
    expect(addressFromChanges([{ key: 'contact_number', to: '012' }])).toBeNull()
    expect(addressFromChanges('nope')).toBeNull()
  })
})
