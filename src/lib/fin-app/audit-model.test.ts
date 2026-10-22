import { describe, expect, it } from 'vitest'
import { groupSaves, type AuditChange, type AuditTableLine, type ChangeFilters } from '@/lib/audit/changes'
import { auditFilterWords, auditKeep, auditListHref, auditModel } from './audit-model'

// Profile › Admin › Audit Log in the Finance phone app (2026-10-15, part E3):
// Audit Log › Changes as the desktop reads it — today's saves, the week in a
// word, each save by the office's day with its records and fields a screen of
// its own, a record's history a press away, what the history keeps by area.

const NONE: ChangeFilters = { area: null, table: null, who: null, from: null, to: null, row: null, before: null }

const LINES: AuditTableLine[] = [
  { table_name: 'titles', label: 'Titles', area: 'People', mode: 'all', label_columns: ['name'], reason: null },
  { table_name: 'payment_vouchers', label: 'Payment vouchers', area: 'Payments', mode: 'all', label_columns: ['voucher_no'], reason: null },
  { table_name: 'sku_prices', label: 'SKU prices', area: 'Catalogue', mode: 'people', label_columns: ['sku'], reason: null },
  { table_name: 'erp_sync_events', label: 'ERP feed log', area: 'Revenue', mode: 'none', label_columns: [], reason: 'A log is a record already' },
]

const change = (over: Partial<AuditChange>): AuditChange => ({
  id: 1,
  occurred_at: '2026-10-15T11:02:00Z',
  actor_id: 'u-1',
  actor_name: 'Carrie',
  actor_source: 'portal',
  table_name: 'titles',
  row_key: '0b2fcf67-28ab-4c0b-9ddf-22372b8e740b',
  op: 'UPDATE',
  old_row: { name: 'DIRECTOR', template: 'Director' },
  new_row: { name: 'DIRECTOR', template: 'Ultimate' },
  changed: ['template'],
  masked: null,
  txid: 85572,
  ...over,
})

const ROWS: AuditChange[] = [
  change({ id: 3 }),
  change({ id: 4, table_name: 'payment_vouchers', op: 'INSERT', old_row: null, new_row: { voucher_no: 'HV-PV-0479', amount: 1200, bank_account: null }, changed: null, masked: ['bank_account'], row_key: 'pv-1' }),
  change({ id: 2, txid: 85500, occurred_at: '2026-10-14T16:59:00Z', actor_id: null, actor_name: null, actor_source: 'database', table_name: 'titles', changed: ['template'] }),
]
const byTable = new Map(LINES.map((l) => [l.table_name, l]))
const SAVES = groupSaves(ROWS, byTable, new Map())
const OVERVIEW = { saves_today: 236, changes_week: 4029, people_week: 7, last_at: '2026-10-15T11:17:00Z' }

describe('Audit Log on the phone', () => {
  it('opens on today’s saves and the week, then the latest changes and the areas read', () => {
    const m = auditModel({ overview: OVERVIEW, saves: SAVES, records: ROWS.length, lines: LINES, filters: NONE, rowName: null, filterWords: '' })
    expect(m.hero).toEqual({ value: '236', label: 'Saves today · last 15 Oct 19:17' })
    expect(m.chip).toBe('4029 changes · 7 people · 7 days')
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['Latest changes', '3 records', '2 saves'],
      ['Areas you read', 'Payments · People · Catalogue', '3 of 13'],
    ])
  })

  it('a save is a line by the office’s day — what, who, when — its records and fields its own screen', () => {
    const m = auditModel({ overview: OVERVIEW, saves: SAVES, records: ROWS.length, lines: LINES, filters: NONE, rowName: null, filterWords: '' })
    const days = m.cards[0].groups
    // 16:59 UTC on the 14th is 00:59 on the 15th in the office.
    expect(days.map((d) => [d.title, d.count])).toEqual([['15 Oct 2026', '2 saves']])
    const save = days[0].lines[0]
    expect(save).toMatchObject({ label: 'Titles · DIRECTOR', sub: 'Changed · 2 records · Carrie', value: '19:02' })
    const detail = save.detail!
    expect(detail.title).toBe('Carrie · 15 Oct 19:02')
    expect(detail.groups.map((g) => [g.title, g.count])).toEqual([
      ['Changed · Titles', '1 field'],
      ['Added · Payment vouchers', '2 fields'],
    ])
    // The record, its history a press away; each field before → after.
    expect(detail.groups[0].lines[0]).toMatchObject({ label: 'DIRECTOR', open: { href: '/fin-app/page/audit?table=titles&row=0b2fcf67-28ab-4c0b-9ddf-22372b8e740b&f=saves', label: 'History' } })
    expect(detail.groups[0].lines[1]).toMatchObject({ label: 'Template', sub: 'Director → Ultimate' })
    // An added record: what it held, and the values the reader's title may not see.
    expect(detail.groups[1].lines.map((l) => [l.label, l.sub])).toEqual([
      ['HV-PV-0479', undefined],
      ['Voucher no.', 'HV-PV-0479'],
      ['Amount', '1,200.00'],
      ['1 value hidden from your title', 'Salary, NRIC or bank'],
    ])
  })

  it('what nobody signed in made says how it was made', () => {
    const m = auditModel({ overview: OVERVIEW, saves: SAVES, records: ROWS.length, lines: LINES, filters: NONE, rowName: null, filterWords: '' })
    const all = m.cards[0].groups.flatMap((g) => g.lines)
    expect(all[1]).toMatchObject({ sub: 'Changed · System · database (a migration)', value: '00:59' })
  })

  it('the areas read list what the history keeps, a recorded one opening its changes', () => {
    const m = auditModel({ overview: OVERVIEW, saves: SAVES, records: ROWS.length, lines: LINES, filters: NONE, rowName: null, filterWords: '' })
    const areas = m.cards[1].groups
    expect(areas.map((g) => [g.title, g.count])).toEqual([
      ['Payments', '1 record'],
      ['People', '1 record'],
      ['Revenue', '0 records'],
      ['Catalogue', '1 record'],
    ])
    expect(areas[3].lines[0]).toMatchObject({ label: 'SKU prices', sub: 'People’s changes only', open: { href: '/fin-app/page/audit?table=sku_prices&f=saves', label: 'Changes' } })
    expect(areas[2].lines[0]).toMatchObject({ label: 'ERP feed log', sub: 'Not recorded — A log is a record already', tone: 'muted', open: null })
  })

  it('a record’s history is named by the record; a filter that finds nothing says so', () => {
    const row = auditModel({ overview: OVERVIEW, saves: SAVES.slice(0, 1), records: 1, lines: LINES, filters: { ...NONE, table: 'titles', row: 'x' }, rowName: 'DIRECTOR', filterWords: 'Titles' })
    expect(row.cards[0]).toMatchObject({ label: 'History · DIRECTOR', sub: 'Every change to one Titles' })
    const none = auditModel({ overview: OVERVIEW, saves: [], records: 0, lines: LINES, filters: { ...NONE, who: 'system' }, rowName: null, filterWords: 'System' })
    expect(none.cards[0]).toMatchObject({ label: 'Changes found', sub: 'System · 0 records', value: '0 saves' })
    expect(none.cards[0].groups[0].empty).toBe('No change matches these filters.')
  })

  it('keeps the desktop’s filters as its query', () => {
    expect(auditKeep(NONE)).toBe('')
    expect(auditKeep({ ...NONE, area: 'Payments', who: 'system', from: '2026-10-01' })).toBe('area=Payments&who=system&from=2026-10-01')
    expect(auditKeep({ ...NONE, area: 'Payments', before: 120 }, { before: null })).toBe('area=Payments')
    expect(auditListHref('')).toBe('/fin-app/page/audit?f=saves')
    expect(auditFilterWords({ ...NONE, table: 'titles', who: 'u-1', from: '2026-10-01', to: '2026-10-15' }, LINES, [{ id: 'u-1', name: 'Carrie' }])).toBe(
      'Titles · Carrie · from 1 Oct 2026 · to 15 Oct 2026',
    )
  })
})
