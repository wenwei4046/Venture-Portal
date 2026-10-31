import { describe, expect, it } from 'vitest'
import { brandCodeFor, parseSubBrands } from './brand-code'

// 2026-10-31 — the user: "happisleep is the subbrand of akemi, so the shena for magrin leader is same as well";
// "i dont differentiate it out with 2 calcualtor, i wnat make them into one". The twin of SQL's erp_sync_brand_code
// (20261031200000; tests/member-sql/validate-happisleep-is-akemi.mjs asks the database the same questions).
const BRANDS = [
  { code: 'AKEMI', name: 'Akemi', subBrands: ['HAPPI SLEEP'] },
  { code: 'ZANOTTI', name: 'Zanotti', subBrands: [] },
  { code: 'ERGOTEX', name: 'Ergotex' },
  { code: 'DUNLOP', name: 'Dunlopillo', subBrands: null },
]

describe('brandCodeFor', () => {
  it('reads an ERP brand word by the code or the name, case and spaces aside', () => {
    expect(brandCodeFor('AKEMI', BRANDS)).toBe('AKEMI')
    expect(brandCodeFor(' akemi ', BRANDS)).toBe('AKEMI')
    expect(brandCodeFor('DUNLOPILLO', BRANDS)).toBe('DUNLOP')
    expect(brandCodeFor('Zanotti', BRANDS)).toBe('ZANOTTI')
  })

  it('reads a sub-brand as its brand — HAPPI SLEEP is Akemi', () => {
    expect(brandCodeFor('HAPPI SLEEP', BRANDS)).toBe('AKEMI')
    expect(brandCodeFor('  happi sleep ', BRANDS)).toBe('AKEMI')
  })

  it('is nothing for a word no brand answers to', () => {
    expect(brandCodeFor('MYLATEX', BRANDS)).toBeNull()
    expect(brandCodeFor('HAPPISLEEP', BRANDS)).toBeNull()
    expect(brandCodeFor('  ', BRANDS)).toBeNull()
    expect(brandCodeFor(null, BRANDS)).toBeNull()
    expect(brandCodeFor(undefined, BRANDS)).toBeNull()
  })

  it("puts a brand's own code or name before another brand's sub-brand of the same word", () => {
    const listed = [{ code: 'OLD', name: 'Old', subBrands: ['AKEMI', 'ZANOTTI'] }, ...BRANDS]
    expect(brandCodeFor('AKEMI', listed)).toBe('AKEMI')
    expect(brandCodeFor('zanotti', listed)).toBe('ZANOTTI')
  })
})

describe('parseSubBrands', () => {
  const akemi = { code: 'AKEMI', name: 'Akemi' }
  const others = BRANDS.filter(b => b.code !== 'AKEMI')

  it('keeps each word as the ERP writes a branding: upper case, one space, no blanks or repeats', () => {
    expect(parseSubBrands('happi sleep', akemi, others)).toEqual(['HAPPI SLEEP'])
    expect(parseSubBrands(' HAPPI   SLEEP , happi sleep,, Happi Kids ', akemi, others)).toEqual(['HAPPI SLEEP', 'HAPPI KIDS'])
    expect(parseSubBrands('', akemi, others)).toEqual([])
    expect(parseSubBrands(' , ', akemi, others)).toEqual([])
  })

  it("refuses the brand's own code or name — it answers to those already", () => {
    expect(() => parseSubBrands('HAPPI SLEEP, akemi', akemi, others)).toThrow(/AKEMI is this brand’s own code or name/)
  })

  it("refuses another brand's code, name or sub-brand — one ERP branding, one brand", () => {
    expect(() => parseSubBrands('DUNLOPILLO', akemi, others)).toThrow(/DUNLOPILLO already names Dunlopillo/)
    expect(() => parseSubBrands('zanotti', akemi, others)).toThrow(/ZANOTTI already names Zanotti/)
    expect(() => parseSubBrands('HAPPI SLEEP', { code: 'ZANOTTI', name: 'Zanotti' }, BRANDS.filter(b => b.code !== 'ZANOTTI')))
      .toThrow(/HAPPI SLEEP already names Akemi/)
  })
})
