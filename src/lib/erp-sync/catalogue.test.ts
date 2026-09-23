import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { POOLS } from '../catalogue/pricing'
import {
  CATALOGUE_MAX_ROWS,
  CATALOGUE_SECTIONS,
  MAINTENANCE_POOL_KEYS,
  MONEY_KEYS,
  parseCatalogueDelivery,
  stripMoney,
} from './catalogue'

/**
 * The catalogue receiver's parser (POST /api/erp/v1/products, contract §9 v2).
 * ITEMS ONLY: no row may carry a price or a cost past it — the ingest RPC
 * strips money again with catalogue_strip_money, and the two lists are pinned
 * to each other below. A delivery the portal cannot read is refused (the route
 * answers 422 with this reason) rather than vanishing into a 200.
 */

const migration = (file: string) => readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8')
const MIRROR_SQL = migration('20260924020000_erp_catalogue_mirror.sql')
/** 20260924030000 redefines ingest_erp_catalogue; this is the live definition. */
const INGEST_SQL = (() => {
  const sql = migration('20260924030000_catalogue_costs_the_margin.sql')
  const at = sql.indexOf('CREATE OR REPLACE FUNCTION ingest_erp_catalogue')
  return sql.slice(at, sql.indexOf('$fn$;', at))
})()

function parsed(body: unknown) {
  const r = parseCatalogueDelivery(body)
  if (!r.ok) throw new Error(`expected a delivery, got a refusal: ${r.error}`)
  return r
}

function refused(body: unknown): string {
  const r = parseCatalogueDelivery(body)
  if (r.ok) throw new Error('expected a refusal')
  return r.error
}

/** A row carrying every money key the ERP could send, beside its own fields. */
function withMoney(row: Record<string, unknown>): Record<string, unknown> {
  return { ...Object.fromEntries(MONEY_KEYS.map(k => [k, 12345])), ...row }
}

describe('stripMoney — catalogue_strip_money', () => {
  it('removes every money key and keeps everything else', () => {
    const row = { id: 'mfg-1', code: 'AK-ULTIMATE MATT (K)', name: 'Akemi Ultimate', status: 'ACTIVE' }
    expect(stripMoney(withMoney(row))).toEqual(row)
  })

  it('keeps what only looks like money: a fabric’s price TIER is not a price', () => {
    const row = { price_tier: 'PRICE_1', sofa_price_tier: 'PRICE_2', bedframe_price_tier: 'PRICE_3', priced: true, prices_note: 'x' }
    expect(stripMoney(row)).toEqual(row)
  })

  it('reaches the top level only, as `jsonb - text[]` does', () => {
    // A nested money key is out of reach of both twins; the ERP's export
    // allowlists its columns, and allowed_options carries values only.
    const row = { id: 'm1', allowed_options: { specials: [{ value: 'A', priceSen: 500 }] } }
    expect(stripMoney(row)).toEqual(row)
  })

  it('does not touch the row it was given', () => {
    const row = withMoney({ id: 'mfg-1' })
    stripMoney(row)
    expect(Object.keys(row)).toHaveLength(MONEY_KEYS.length + 1)
  })

  it('MONEY_KEYS is exactly the list catalogue_strip_money removes', () => {
    const at = MIRROR_SQL.indexOf('CREATE OR REPLACE FUNCTION catalogue_strip_money')
    const open = MIRROR_SQL.indexOf('ARRAY[', at) + 'ARRAY['.length
    const sqlKeys = [...MIRROR_SQL.slice(open, MIRROR_SQL.indexOf(']', open)).matchAll(/'([^']+)'/g)].map(m => m[1])
    expect(sqlKeys).toHaveLength(MONEY_KEYS.length)
    expect([...MONEY_KEYS].sort()).toEqual([...sqlKeys].sort())
  })
})

describe('parseCatalogueDelivery — the envelope', () => {
  it.each<[unknown]>([[null], [undefined], [[]], ['{"products":[]}'], [42], [true]])('refuses a body that is %j', body => {
    expect(refused(body)).toBe('delivery must be an object')
  })

  it('reads a whole delivery into what ingest_erp_catalogue is given', () => {
    const r = parsed({
      companyId: 1,
      full: true,
      snapshotAt: '2026-09-24T02:00:00Z',
      products: [{ id: 'mfg-1', code: '8030-1A(LHF)', category: 'SOFA', cost_price_sen: 50000 }],
      models: [{ id: '3c1c9c1e-0000-4000-8000-000000000012', model_code: '8030', allowed_options: { sizes: ['30'] } }],
      maintenance: { effective_from: '2026-09-01', pools: { sofaSizes: ['30', { value: '35', active: false, priceSen: 0 }] } },
      specials: [{ id: 's1', code: 'Nylon Fabric', categories: ['SOFA'], price_sen: 8000 }],
      fabrics: [{ id: 'f1', fabric_code: 'BO315-01', sofa_price_tier: 'PRICE_2', price_sen: 1200 }],
      combos: [{ id: 'c1', base_model: '8030', modules: [['1A(LHF)']], heights: ['30'], prices_by_height: { '30': 320000 } }],
    })
    expect(r.delivery).toEqual({
      companyId: 1,
      full: true,
      snapshotAt: '2026-09-24T02:00:00Z',
      products: [{ id: 'mfg-1', code: '8030-1A(LHF)', category: 'SOFA' }],
      models: [{ id: '3c1c9c1e-0000-4000-8000-000000000012', model_code: '8030', allowed_options: { sizes: ['30'] } }],
      maintenance: {
        effective_from: '2026-09-01',
        pools: {
          sofaSizes: [
            { value: '30', active: true },
            { value: '35', active: false },
          ],
        },
      },
      specials: [{ id: 's1', code: 'Nylon Fabric', categories: ['SOFA'] }],
      fabrics: [{ id: 'f1', fabric_code: 'BO315-01', sofa_price_tier: 'PRICE_2' }],
      combos: [{ id: 'c1', base_model: '8030', modules: [['1A(LHF)']], heights: ['30'] }],
    })
    expect(r.counts).toEqual({
      sent: { products: 1, models: 1, specials: 1, fabrics: 1, combos: 1, maintenance: 2 },
      unreadable: 0,
    })
  })

  it('companyId defaults to 1', () => {
    expect(parsed({ products: [] }).delivery.companyId).toBe(1)
  })

  it('reads companyId, else company_id; numeric text is a number', () => {
    expect(parsed({ companyId: 3, products: [] }).delivery.companyId).toBe(3)
    expect(parsed({ company_id: '2', products: [] }).delivery.companyId).toBe(2)
    expect(parsed({ companyId: 4, company_id: 5, products: [] }).delivery.companyId).toBe(4)
    expect(parsed({ companyId: null, company_id: 6, products: [] }).delivery.companyId).toBe(6)
  })

  it.each<[unknown]>([[0], [-1], [1.5], ['abc'], [''], ['1.5'], [{}]])('refuses companyId %j', companyId => {
    expect(refused({ companyId, products: [] })).toBe('companyId must be a positive integer')
  })

  it('checks the company before anything else', () => {
    expect(refused({ companyId: 0, products: 'not rows' })).toBe('companyId must be a positive integer')
  })

  it('`full` only when it is literally true', () => {
    expect(parsed({ full: true, products: [] }).delivery.full).toBe(true)
    for (const full of ['true', 1, 'yes', false, null, undefined]) {
      expect(parsed({ full, products: [] }).delivery.full).toBe(false)
    }
  })

  it('snapshotAt is kept when it is text', () => {
    expect(parsed({ snapshotAt: '2026-09-24T02:00:00Z', products: [] }).delivery.snapshotAt).toBe('2026-09-24T02:00:00Z')
    expect(parsed({ snapshotAt: 1758679200, products: [] }).delivery.snapshotAt).toBeNull()
    expect(parsed({ products: [] }).delivery.snapshotAt).toBeNull()
  })

  it('refuses a delivery that carries no section at all', () => {
    const reason = 'delivery carried no catalogue section (products, models, maintenance, specials, fabrics, combos)'
    expect(refused({})).toBe(reason)
    expect(refused({ companyId: 1, full: true, snapshotAt: '2026-09-24T02:00:00Z' })).toBe(reason)
    // null is "not sent", the same as leaving the key out
    expect(refused({ products: null, models: undefined, maintenance: null })).toBe(reason)
  })

  it.each([...CATALOGUE_SECTIONS])('refuses a %s section that is not a list', section => {
    expect(refused({ [section]: { id: 'x' } })).toBe(`${section} must be an array`)
  })

  it('an EMPTY section is carried — and the ingest never retires anything on one', () => {
    const r = parsed({ full: true, products: [] })
    expect(r.delivery.products).toEqual([])
    expect(r.counts).toEqual({ sent: { products: 0 }, unreadable: 0 })
  })

  it('a section left out stays out, so the portal leaves that part of the mirror alone', () => {
    const r = parsed({ models: [{ id: 'm1' }] })
    expect(r.delivery).not.toHaveProperty('products')
    expect(r.delivery).not.toHaveProperty('maintenance')
    expect(r.delivery.models).toEqual([{ id: 'm1' }])
  })

  it('CATALOGUE_SECTIONS are exactly the array sections ingest_erp_catalogue reads', () => {
    const sqlSections = [...INGEST_SQL.matchAll(/jsonb_typeof\(p_batch->'(\w+)'\) = 'array'/g)].map(m => m[1])
    expect([...sqlSections].sort()).toEqual([...CATALOGUE_SECTIONS].sort())
  })
})

describe('parseCatalogueDelivery — rows', () => {
  it('strips every money key from every row of every section', () => {
    const body = Object.fromEntries(
      CATALOGUE_SECTIONS.map(s => [s, [withMoney({ id: `${s}-1` }), withMoney({ id: `${s}-2`, code: 'X' })]]),
    )
    const r = parsed(body)
    for (const section of CATALOGUE_SECTIONS) {
      expect(r.delivery[section]).toEqual([{ id: `${section}-1` }, { id: `${section}-2`, code: 'X' }])
    }
  })

  it('passes the rest of a row through verbatim — the ERP’s own snake_case columns', () => {
    const product = {
      id: 'mfg-8030-1a',
      code: '8030-1A(LHF)',
      name: 'SOFFIO 1A LHF',
      description: null,
      category: 'SOFA',
      model_id: '3c1c9c1e-0000-4000-8000-000000000012',
      base_model: '8030',
      size_code: null,
      branding: 'ZANOTTI',
      status: 'ACTIVE',
      updated_at: '2026-09-20T08:00:00Z',
    }
    const r = parsed({ products: [{ ...product, cost_price_sen: 50000, base_price_sen: 70000, sell_price_sen: 90000 }] })
    expect(r.delivery.products).toEqual([product])
  })

  it('a combo keeps its seat heights and loses every price grid', () => {
    const r = parsed({
      combos: [
        {
          id: 'c1',
          base_model: '8030',
          modules: [['2A(LHF)', '2A(RHF)'], ['L(LHF)', 'L(RHF)']],
          tier: null,
          label: '2+L',
          heights: ['24', '30'],
          effective_from: '2026-01-01',
          prices_by_height: { '24': 300000, '30': 320000 },
          selling_prices_by_height: { '30': 450000 },
          pwp_prices_by_height: { '30': 400000 },
        },
      ],
    })
    expect(r.delivery.combos).toEqual([
      {
        id: 'c1',
        base_model: '8030',
        modules: [['2A(LHF)', '2A(RHF)'], ['L(LHF)', 'L(RHF)']],
        tier: null,
        label: '2+L',
        heights: ['24', '30'],
        effective_from: '2026-01-01',
      },
    ])
  })

  it('drops a row that is not an object and counts it as unreadable', () => {
    const r = parsed({ products: [{ id: 'a' }, null, 'b', 7, [], { id: 'c' }] })
    expect(r.delivery.products).toEqual([{ id: 'a' }, { id: 'c' }])
    expect(r.counts).toEqual({ sent: { products: 6 }, unreadable: 4 })
  })

  it('adds unreadable rows up across sections', () => {
    const r = parsed({ products: [null], models: ['x', { id: 'm' }], fabrics: [] })
    expect(r.counts).toEqual({ sent: { products: 1, models: 2, fabrics: 0 }, unreadable: 2 })
  })
})

describe('parseCatalogueDelivery — maintenance', () => {
  it('keeps each entry’s value and active flag, nothing else', () => {
    const r = parsed({
      maintenance: {
        effective_from: '2026-09-01',
        pools: {
          divanHeights: [
            '8"',
            { value: ' 10" ', active: false, priceSen: 4000, sellingPriceSen: 9999, costSen: 3000 },
            { value: '12"', priceSen: 500 },
            { value: '14"', active: true },
          ],
        },
      },
    })
    expect(r.delivery.maintenance).toEqual({
      effective_from: '2026-09-01',
      pools: {
        divanHeights: [
          { value: '8"', active: true },
          { value: '10"', active: false },
          { value: '12"', active: true },
          { value: '14"', active: true },
        ],
      },
    })
  })

  it('drops a blank entry, or one whose value is not text — but counts it as sent', () => {
    const r = parsed({ maintenance: { pools: { gaps: ['', '  ', { value: '' }, { value: '   ' }, null, {}, '12"'] } } })
    expect(r.delivery.maintenance?.pools.gaps).toEqual([{ value: '12"', active: true }])
    expect(r.counts.sent.maintenance).toBe(7)
  })

  it('mirrors only the Bedframe and Sofa pools the user asked for', () => {
    // Not the "Products Maintenance" pools (sizes, compartments, brandings), and
    // not the config's own specials pools: specials arrive as their own section.
    const r = parsed({
      maintenance: {
        pools: {
          sofaSizes: ['30'],
          bedframeSizes: ['K'],
          mattressSizes: ['Q'],
          compartments: ['1A(LHF)'],
          brandings: ['AKEMI'],
          specials: [{ value: 'Right Drawer', priceSen: 5000 }],
          sofaSpecials: [{ value: 'Nylon Fabric', priceSen: 8000 }],
        },
      },
    })
    expect(Object.keys(r.delivery.maintenance?.pools ?? {})).toEqual(['sofaSizes'])
    expect(r.counts.sent.maintenance).toBe(1)
  })

  it('a pool that is not a list is skipped, not refused', () => {
    const r = parsed({ maintenance: { pools: { gaps: '12"', legHeights: ['4"'] } } })
    expect(r.delivery.maintenance?.pools).toEqual({ legHeights: [{ value: '4"', active: true }] })
  })

  it('effective_from is kept when it is text', () => {
    expect(parsed({ maintenance: { effective_from: 20260901, pools: {} } }).delivery.maintenance?.effective_from).toBeNull()
  })

  it('maintenance alone is a delivery', () => {
    const r = parsed({ maintenance: { pools: { gaps: ['12"', '14"'] } } })
    expect(r.counts).toEqual({ sent: { maintenance: 2 }, unreadable: 0 })
  })

  it('maintenance without pools is still carried, and changes nothing', () => {
    expect(parsed({ maintenance: {} }).delivery.maintenance).toEqual({ effective_from: null, pools: {} })
  })

  it.each<[unknown]>([['pools'], [[]], [{ pools: [] }], [{ pools: null }], [{ pools: 'gaps' }]])('refuses maintenance %j', maintenance => {
    expect(refused({ maintenance })).toBe('maintenance must be {effective_from, pools: {…}}')
  })

  it('MAINTENANCE_POOL_KEYS are exactly the ERP keys ingest_erp_catalogue maps, each onto a mirrored pool', () => {
    const values = INGEST_SQL.slice(INGEST_SQL.indexOf('(VALUES'), INGEST_SQL.indexOf('AS m(erp_key, pool)'))
    const pairs = [...values.matchAll(/\('([A-Za-z]+)',\s*'([a-z_]+)'\)/g)].map(m => ({ erpKey: m[1], pool: m[2] }))
    expect(pairs.map(p => p.erpKey).sort()).toEqual([...MAINTENANCE_POOL_KEYS].sort())
    for (const p of pairs) expect(POOLS).toContain(p.pool)
  })
})

describe('parseCatalogueDelivery — the row cap', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `mfg-${i}` }))

  it('is 20,000', () => {
    expect(CATALOGUE_MAX_ROWS).toBe(20_000)
  })

  it('takes exactly CATALOGUE_MAX_ROWS rows', () => {
    expect(parsed({ products: rows(CATALOGUE_MAX_ROWS) }).counts.sent.products).toBe(CATALOGUE_MAX_ROWS)
  })

  it('refuses one more, counted across sections', () => {
    expect(refused({ products: rows(CATALOGUE_MAX_ROWS - 1), models: rows(2) })).toBe('delivery carries 20001 rows; the cap is 20000')
  })

  it('counts unreadable rows and maintenance entries toward it', () => {
    const body = { products: new Array<null>(CATALOGUE_MAX_ROWS - 1).fill(null), maintenance: { pools: { gaps: ['12"', '14"'] } } }
    expect(refused(body)).toBe('delivery carries 20001 rows; the cap is 20000')
  })
})

// Found by the twin audit (2026-09-24): the parser now reads a delivery the way
// the ingest's own SQL would.
describe('the audit fixes', () => {
  it('reads a pool entry’s active flag the way Postgres casts it, and keeps numeric values', () => {
    const r = parseCatalogueDelivery({
      maintenance: {
        effective_from: '2026-09-17',
        pools: {
          sofaSizes: [24, '26', { value: 28, active: 'false' }, { value: '30', active: 0 }, { value: '32', active: 'yes' }],
        },
      },
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.delivery.maintenance?.pools.sofaSizes).toEqual([
      { value: '24', active: true },
      { value: '26', active: true },
      { value: '28', active: false },
      { value: '30', active: false },
      { value: '32', active: true },
    ])
  })

  it('never forwards a fabric’s stock or usage', () => {
    const r = parseCatalogueDelivery({ fabrics: [{ id: 'f1', fabric_code: 'PC151-01', soh_sen: 12000, shortage_sen: 3 }] })
    if (!r.ok) throw new Error(r.error)
    expect(r.delivery.fabrics?.[0]).toEqual({ id: 'f1', fabric_code: 'PC151-01' })
  })

  it('refuses a companyId that is not a whole number', () => {
    expect(parseCatalogueDelivery({ companyId: true, products: [] }).ok).toBe(false)
    expect(parseCatalogueDelivery({ companyId: '2', products: [] })).toMatchObject({ ok: true, delivery: { companyId: 2 } })
  })
})
