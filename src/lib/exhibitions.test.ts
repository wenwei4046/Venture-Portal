import { describe, it, expect } from 'vitest'
import {
  boothOf, brandCodeFor, brandLabel, exhibitionBrandOf, exhibitionQuery, inExhibition, placeOf, salesByExhibition, NO_BRAND, NO_FAIR,
} from './exhibitions'

const BRANDS = [
  { code: 'AKEMI', name: 'Akemi' }, { code: 'DUNLOP', name: 'Dunlopillo' },
  { code: 'ERGOTEX', name: 'Ergotex' }, { code: 'ZANOTTI', name: 'Zanotti' },
]

describe('brandCodeFor', () => {
  // The twin of SQL's erp_sync_brand_code: the code or the name, case and spaces aside.
  it('reads the ERP’s brand name as the portal’s code', () => {
    expect(brandCodeFor('DUNLOPILLO', BRANDS)).toBe('DUNLOP')
    expect(brandCodeFor(' akemi ', BRANDS)).toBe('AKEMI')
    expect(brandCodeFor('Zanotti', BRANDS)).toBe('ZANOTTI')
  })

  it('is nothing for a brand the portal does not sell under', () => {
    expect(brandCodeFor('MYLATEX', BRANDS)).toBeNull()
    expect(brandCodeFor('  ', BRANDS)).toBeNull()
    expect(brandCodeFor(null, BRANDS)).toBeNull()
  })

  // 2026-10-31: HappiSleep is Akemi's sub-brand — one brand, so one exhibition.
  it('reads a sub-brand’s booth as its brand’s exhibition', () => {
    const withSub = BRANDS.map(b => (b.code === 'AKEMI' ? { ...b, subBrands: ['HAPPI SLEEP'] } : b))
    expect(brandCodeFor('HAPPI SLEEP', withSub)).toBe('AKEMI')
    expect(exhibitionBrandOf({ booth: 'HAPPI SLEEP', brandCode: null }, withSub)).toBe('AKEMI')
    expect(exhibitionBrandOf({ booth: 'HAPPI SLEEP', brandCode: null }, BRANDS)).toBe('HAPPI SLEEP')
  })
})

describe('boothOf', () => {
  it('is the booth the salesperson picked, while that pick is the bill’s fair', () => {
    expect(boothOf({ fairSource: 'erp', boothBrand: ' DUNLOPILLO ', boothStatus: 'confirmed' })).toBe('DUNLOPILLO')
  })

  it('is no booth for a fair a person pinned or the calendar guessed, or a cancelled project', () => {
    expect(boothOf({ fairSource: 'manual', boothBrand: 'AKEMI', boothStatus: 'confirmed' })).toBeNull()
    expect(boothOf({ fairSource: 'venue_match', boothBrand: null, boothStatus: null })).toBeNull()
    expect(boothOf({ fairSource: null, boothBrand: null, boothStatus: null })).toBeNull()
    expect(boothOf({ fairSource: 'erp', boothBrand: 'AKEMI', boothStatus: 'cancelled' })).toBeNull()
    expect(boothOf({ fairSource: 'erp', boothBrand: '  ', boothStatus: 'confirmed' })).toBeNull()
  })
})

describe('exhibitionBrandOf', () => {
  // The user's own example (2026-10-03): a Dunlopillo pillow sold at the Akemi
  // booth still lands at the fair the salesperson picked — Akemi's.
  it('follows the booth picked in the ERP, whatever the goods are', () => {
    expect(exhibitionBrandOf({ booth: 'AKEMI', brandCode: 'DUNLOP' }, BRANDS)).toBe('AKEMI')
    expect(exhibitionBrandOf({ booth: 'DUNLOPILLO', brandCode: 'AKEMI' }, BRANDS)).toBe('DUNLOP')
  })

  it('keeps a booth the portal has no brand for under the ERP’s own name', () => {
    expect(exhibitionBrandOf({ booth: 'mylatex  pro', brandCode: 'AKEMI' }, BRANDS)).toBe('MYLATEX PRO')
  })

  // A bed frame alone, sold with no booth picked: the bill's own brand — what
  // the salesperson named in the ERP, or its SKUs' — else none.
  it('falls back to the bill’s own brand without a booth, and to none without either', () => {
    expect(exhibitionBrandOf({ booth: null, brandCode: 'ZANOTTI' }, BRANDS)).toBe('ZANOTTI')
    expect(exhibitionBrandOf({ booth: '  ', brandCode: 'ZANOTTI' }, BRANDS)).toBe('ZANOTTI')
    expect(exhibitionBrandOf({ booth: null, brandCode: null }, BRANDS)).toBeNull()
    expect(exhibitionBrandOf({ booth: null, brandCode: ' ' }, BRANDS)).toBeNull()
  })
})

const mvec = { id: 'f-mle', venueKey: 'MVEC SOUTHKEY', venueName: 'MVEC SOUTHKEY' }
const mvecLater = { id: 'f-bighome', venueKey: 'MVEC SOUTHKEY', venueName: 'MVEC SOUTHKEY' }

describe('salesByExhibition', () => {
  // The user's own example (2026-10-03): one venue, one organiser, the same
  // days — and an Akemi booth beside a Dunlopillo one. Two exhibitions.
  it('splits one fair into an exhibition per brand', () => {
    const rows = salesByExhibition([
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '18–20 Sep', organizer: 'MLE', brand: 'AKEMI', staffKey: 'a', amount: 2_000, commissionable: 1_900 },
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '18–20 Sep', organizer: 'MLE', brand: 'DUNLOP', staffKey: 'b', amount: 1_000, commissionable: 1_000 },
      { venue: 'mvec  southkey', fair: mvec, event: '18–20 Sep', organizer: 'MLE', brand: 'AKEMI', staffKey: 'c', amount: 500 },
    ])
    expect(rows).toEqual([
      {
        key: 'fair:f-mle|AKEMI', brand: 'AKEMI', venueKey: 'MVEC SOUTHKEY', displayName: 'MVEC SOUTHKEY', fairId: 'f-mle',
        event: '18–20 Sep', organizer: 'MLE', orders: 2, people: 2, total: 2_500, commissionable: 1_900,
      },
      {
        key: 'fair:f-mle|DUNLOP', brand: 'DUNLOP', venueKey: 'MVEC SOUTHKEY', displayName: 'MVEC SOUTHKEY', fairId: 'f-mle',
        event: '18–20 Sep', organizer: 'MLE', orders: 1, people: 1, total: 1_000, commissionable: 1_000,
      },
    ])
  })

  // One hall, two fairs, two organisers (REX mid-August, BIGHOME at month end).
  it('keeps two fairs of one brand at one hall apart, each with its own organiser', () => {
    const rows = salesByExhibition([
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '14–16 Aug', organizer: 'REX', brand: 'AKEMI', staffKey: 'a', amount: 1_000 },
      { venue: 'MVEC SOUTHKEY', fair: mvecLater, event: '28–31 Aug', organizer: 'BIGHOME', brand: 'AKEMI', staffKey: 'a', amount: 1_000 },
    ])
    expect(rows.map(r => [r.brand, r.venueKey, r.event, r.organizer])).toEqual([
      ['AKEMI', 'MVEC SOUTHKEY', '14–16 Aug', 'REX'],
      ['AKEMI', 'MVEC SOUTHKEY', '28–31 Aug', 'BIGHOME'],
    ])
  })

  it('is biggest first, whatever the brand', () => {
    const rows = salesByExhibition([
      { venue: 'MID VALLEY', fair: { id: 'f-rex', venueKey: 'MID VALLEY', venueName: 'MID VALLEY' }, event: '11–13 Sep', brand: 'ZANOTTI', staffKey: 'a', amount: 400 },
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '18–20 Sep', brand: 'AKEMI', staffKey: 'a', amount: 900 },
      { venue: 'MID VALLEY', fair: { id: 'f-rex', venueKey: 'MID VALLEY', venueName: 'MID VALLEY' }, event: '11–13 Sep', brand: 'AKEMI', staffKey: 'a', amount: 700 },
    ])
    expect(rows.map(r => `${r.brand} ${r.displayName}`)).toEqual(['AKEMI MVEC SOUTHKEY', 'AKEMI MID VALLEY', 'ZANOTTI MID VALLEY'])
  })

  it('keeps the bills that name no brand, as their own row of the fair', () => {
    const rows = salesByExhibition([
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '18–20 Sep', brand: 'AKEMI', staffKey: 'a', amount: 2_000 },
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '18–20 Sep', brand: null, staffKey: 'a', amount: 1_600 },
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '18–20 Sep', brand: '  ', staffKey: 'b', amount: 100 },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ key: 'fair:f-mle|', brand: null, orders: 2, people: 2, total: 1_700 })
  })

  it('groups the bills no fair claims by their brand and place, every spelling of the place in one row', () => {
    const rows = salesByExhibition([
      { venue: 'PISA SPICE ARENA', groupKey: 'PISA SPICE ARENA', groupName: 'PISA SPICE ARENA', brand: 'AKEMI', staffKey: 'a', amount: 1_000 },
      { venue: 'PISA SPICE ARENA CONVENTION CENTRE', groupKey: 'PISA SPICE ARENA', groupName: 'PISA SPICE ARENA', brand: 'AKEMI', staffKey: 'b', amount: 500 },
      { venue: 'PISA SPICE ARENA', groupKey: 'PISA SPICE ARENA', brand: 'ZANOTTI', staffKey: 'a', amount: 300 },
      { venue: 'PISA SPICE ARENA', groupKey: 'PISA SPICE ARENA', fair: { id: 'f1', venueKey: 'PISA SPICE ARENA', venueName: 'PISA SPICE ARENA' }, event: '5–7 Sep', brand: 'AKEMI', staffKey: 'a', amount: 100 },
    ])
    expect(rows.map(r => [r.key, r.event, r.orders, r.total])).toEqual([
      ['place:PISA SPICE ARENA|AKEMI', null, 2, 1_500],
      ['place:PISA SPICE ARENA|ZANOTTI', null, 1, 300],
      ['fair:f1|AKEMI', '5–7 Sep', 1, 100],
    ])
  })

  it('names a fair by its own place, even for a bill pinned there that typed another venue', () => {
    const rows = salesByExhibition([
      { venue: 'KUALA LUMPUR CONVENTION CENTRE', fair: mvec, event: '18–20 Sep', organizer: 'MLE', brand: 'AKEMI', staffKey: 'a', amount: 700 },
      { venue: null, fair: mvec, event: '18–20 Sep', organizer: 'MLE', brand: 'AKEMI', staffKey: 'b', amount: 300 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ venueKey: 'MVEC SOUTHKEY', displayName: 'MVEC SOUTHKEY', event: '18–20 Sep', total: 1_000 })
  })

  it('keeps two places apart when nobody has said they are the same', () => {
    const rows = salesByExhibition([
      { venue: 'SPICE ARENA', groupKey: 'SPICE ARENA', brand: 'AKEMI', staffKey: 'a', amount: 100 },
      { venue: 'SETIA SPICE CONVENTION CENTRE', groupKey: 'SETIA SPICE CONVENTION CENTRE', brand: 'AKEMI', staffKey: 'a', amount: 100 },
    ])
    expect(rows).toHaveLength(2)
  })

  it('shows the bills the ERP sent without a venue rather than dropping them', () => {
    const rows = salesByExhibition([
      { venue: null, brand: 'AKEMI', staffKey: 'a', amount: 900 },
      { venue: '  ', brand: 'AKEMI', staffKey: null, amount: 100 },
    ])
    expect(rows).toEqual([{
      key: 'place:|AKEMI', brand: 'AKEMI', venueKey: '', displayName: '(no venue)', fairId: null, event: null, organizer: null,
      orders: 2, people: 1, total: 1_000, commissionable: 0,
    }])
  })

  it('counts a person once per exhibition however many bills they wrote', () => {
    const rows = salesByExhibition([
      { venue: 'SPICE ARENA', brand: 'AKEMI', staffKey: 'a', amount: 100 },
      { venue: 'SPICE ARENA', brand: 'AKEMI', staffKey: 'a', amount: 100 },
    ])
    expect(rows[0].people).toBe(1)
    expect(rows[0].orders).toBe(2)
  })

  it('adds up to every bill it was given', () => {
    const bills = [
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '18–20 Sep', brand: 'AKEMI', staffKey: 'a', amount: 1_234.5 },
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '18–20 Sep', brand: 'DUNLOP', staffKey: 'a', amount: 0.1 },
      { venue: 'HALL', brand: null, staffKey: 'b', amount: 0.2 },
    ]
    const rows = salesByExhibition(bills)
    expect(rows.reduce((a, r) => a + r.orders, 0)).toBe(3)
    expect(Math.round(rows.reduce((a, r) => a + r.total, 0) * 100) / 100).toBe(1_234.8)
  })
})

describe('exhibitionQuery', () => {
  it('lists a fair’s bills of one brand — by the fair, not by the venue typed on them', () => {
    expect(exhibitionQuery({ fairId: 'f-mle', venueKey: 'MVEC SOUTHKEY', brand: 'AKEMI' })).toBe('fair=f-mle&brand=AKEMI')
  })

  it('lists a place’s bills no fair claims, and the ones with no brand', () => {
    expect(exhibitionQuery({ fairId: null, venueKey: 'PISA SPICE ARENA', brand: null }))
      .toBe('venue=PISA+SPICE+ARENA&fair=none&brand=none')
    expect(exhibitionQuery({ fairId: null, venueKey: '', brand: 'AKEMI' })).toBe('venue=&fair=none&brand=AKEMI')
  })
})

describe('inExhibition', () => {
  const bill = (brand: string | null, fairId: string | null) => ({ brand, fairId })

  it('keeps everything when the URL names no exhibition', () => {
    expect(inExhibition(bill(null, null), {})).toBe(true)
    expect(inExhibition(bill('AKEMI', 'f1'), {})).toBe(true)
  })

  it('keeps one fair’s bills of one brand', () => {
    const filter = { fair: 'f1', brand: 'AKEMI' }
    expect(inExhibition(bill('AKEMI', 'f1'), filter)).toBe(true)
    expect(inExhibition(bill('DUNLOP', 'f1'), filter)).toBe(false)
    expect(inExhibition(bill('AKEMI', 'f2'), filter)).toBe(false)
    expect(inExhibition(bill('AKEMI', null), filter)).toBe(false)
  })

  it('reads none as no fair and no brand', () => {
    expect(inExhibition(bill(null, null), { fair: NO_FAIR, brand: NO_BRAND })).toBe(true)
    expect(inExhibition(bill(' ', null), { brand: NO_BRAND })).toBe(true)
    expect(inExhibition(bill('AKEMI', null), { fair: NO_FAIR, brand: NO_BRAND })).toBe(false)
    expect(inExhibition(bill(null, 'f1'), { fair: NO_FAIR })).toBe(false)
  })

  // The month's row and the bills it opens must be the same bills — both read
  // the exhibition's brand the same way, booth first.
  it('finds exactly the bills a row of salesByExhibition was made of', () => {
    const bills = [
      { id: 1, venue: 'MVEC SOUTHKEY', groupKey: 'MVEC SOUTHKEY', fair: mvec, booth: 'AKEMI', brandCode: 'AKEMI' },
      { id: 2, venue: 'KLCC', groupKey: 'KLCC', fair: mvec, booth: 'AKEMI', brandCode: 'AKEMI' },
      // A Dunlopillo pillow at the Akemi booth: the Akemi exhibition's.
      { id: 3, venue: 'MVEC SOUTHKEY', groupKey: 'MVEC SOUTHKEY', fair: mvec, booth: 'AKEMI', brandCode: 'DUNLOP' },
      { id: 4, venue: 'MVEC SOUTHKEY', groupKey: 'MVEC SOUTHKEY', fair: mvec, booth: 'DUNLOPILLO', brandCode: 'AKEMI' },
      { id: 5, venue: 'MVEC SOUTHKEY', groupKey: 'MVEC SOUTHKEY', fair: null, booth: null, brandCode: 'AKEMI' },
      { id: 6, venue: 'MVEC SOUTHKEY', groupKey: 'MVEC SOUTHKEY', fair: null, booth: null, brandCode: null },
      { id: 7, venue: 'MVEC SOUTHKEY', groupKey: 'MVEC SOUTHKEY', fair: mvecLater, booth: null, brandCode: 'AKEMI' },
    ]
    const brandOfBill = (b: (typeof bills)[number]) => exhibitionBrandOf(b, BRANDS)
    const rows = salesByExhibition(bills.map(b => ({ ...b, brand: brandOfBill(b), staffKey: 'a', amount: 1 })))
    for (const row of rows) {
      const q = new URLSearchParams(exhibitionQuery(row))
      const venue = q.get('venue')
      const opened = bills.filter(b =>
        (venue === null || placeOf(b) === venue) &&
        inExhibition({ brand: brandOfBill(b), fairId: b.fair?.id ?? null }, { fair: q.get('fair') ?? undefined, brand: q.get('brand') ?? undefined }))
      expect(opened.length).toBe(row.orders)
    }
    expect(Object.fromEntries(rows.map(r => [r.key, r.orders]))).toEqual({
      'fair:f-mle|AKEMI': 3, 'fair:f-mle|DUNLOP': 1, 'fair:f-bighome|AKEMI': 1,
      'place:MVEC SOUTHKEY|AKEMI': 1, 'place:MVEC SOUTHKEY|': 1,
    })
  })
})

describe('brandLabel', () => {
  it('says so when the bills name no brand', () => {
    expect(brandLabel('AKEMI')).toBe('AKEMI')
    expect(brandLabel(null)).toBe('No brand')
  })
})
