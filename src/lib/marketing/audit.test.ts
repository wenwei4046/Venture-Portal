import { describe, expect, it } from 'vitest'
import {
  actionCell, auditChips, auditCount, auditCsv, auditExportHref, auditExportOf, auditFileName, auditFilterOf, auditGroups, auditQuery, auditRows,
  correctionOk, NO_AUDIT_FILTER, passesAudit, pdfText, projectLogFromRow, toggleAudit,
} from './audit'

// 2026-10-23 — ④-3: a project's formal log (`Audit Trail.dc.html`), from mkt_project_log.

const task = projectLogFromRow({
  track: 'TSK-CAR-2610-001', title: 'Price update', kind: 'quick',
  rows: [
    { id: 1, at: '2026-10-20T02:02:00Z', actor: 'SIA', action: 'created', data: { kind: 'quick', stages: 2 } },
    { id: 2, at: '2026-10-20T02:02:00Z', actor: 'SIA', action: 'opened', stage: 0, stageName: 'First draft', fromTo: 'Mei' },
    { id: 3, at: '2026-10-20T06:30:00Z', actor: 'Mei', action: 'accepted', stage: 0, stageName: 'First draft' },
    { id: 4, at: '2026-10-21T09:45:00Z', actor: 'Mei', action: 'submitted', stage: 0, stageName: 'First draft', fromTo: 'SIA', version: 'v1' },
    { id: 5, at: '2026-10-22T01:10:00Z', actor: 'SIA', action: 'changes', stage: 0, stageName: 'First draft', fromTo: 'Mei', reason: 'Logo too small', version: 'v1' },
    { id: 6, at: '2026-10-22T03:00:00Z', actor: 'SIA', action: 'nudged', stage: 0, stageName: 'First draft', fromTo: 'Mei' },
  ],
})!

const product = projectLogFromRow({
  track: 'MKT-CAR-2610-007', title: 'Year-End Video', kind: 'product',
  rows: [
    { id: 10, at: '2026-10-20T02:00:00Z', actor: 'Rachel', action: 'created', data: { product: 'Video Package', version: 2 } },
    { id: 11, at: '2026-10-20T03:00:00Z', actor: 'Rachel', action: 'signed', reason: 'Kick-off minutes' },
    { id: 12, at: '2026-10-20T03:05:00Z', actor: 'Rachel', action: 'link sent', reason: 'Kelvin' },
    { id: 13, at: '2026-10-21T07:00:00Z', actor: 'Kelvin (PIC)', action: 'pic changes', reason: 'Make the chair bigger' },
    { id: 14, at: '2026-10-21T08:00:00Z', actor: 'Rachel', action: 'edited after approval', reason: 'Scope, Budget' },
    { id: 15, at: '2026-10-22T07:00:00Z', actor: 'Kelvin (PIC)', action: 'pic approved', reason: 'Kick-off minutes' },
  ],
})!

const line = (r: ReturnType<typeof auditRows>[number]) => [r.no, r.time, r.actor, r.action, r.tone, r.stage, r.fromTo, r.reason, r.version].join(' | ')

describe('a project’s formal log', () => {
  it('numbers a task’s records oldest first, in the handoff’s columns — the office’s time', () => {
    expect(auditRows(task).map(line)).toEqual([
      '1 | 20 Oct 10:02 | SIA | Task created | grey | — | — | — | —',
      '2 | 20 Oct 10:02 | SIA | Stage opened | grey | First draft | → Mei | — | —',
      '3 | 20 Oct 14:30 | Mei | Accepted | grey | First draft | — | — | —',
      '4 | 21 Oct 17:45 | Mei | Submitted | amber | First draft | Mei → SIA | — | First draft v1',
      '5 | 22 Oct 09:10 | SIA | Changes requested | red | First draft | → Mei | "Logo too small" | First draft v1',
      '6 | 22 Oct 11:00 | SIA | Nudged | grey | First draft | → Mei | — | —',
    ])
  })

  it('puts a product project’s names and minutes in their own columns', () => {
    expect(auditRows(product).map(line)).toEqual([
      '1 | 20 Oct 10:00 | Rachel | Project started | grey | — | — | — | Video Package v2',
      '2 | 20 Oct 11:00 | Rachel | Minutes signed | grey | — | — | — | Kick-off minutes',
      '3 | 20 Oct 11:05 | Rachel | Link sent to PIC | amber | — | → Kelvin (PIC) | — | —',
      '4 | 21 Oct 15:00 | Kelvin (PIC) | Changes requested via link | red | — | — | "Make the chair bigger" | —',
      '5 | 21 Oct 16:00 | Rachel | Edited after approval | grey | — | — | Scope, Budget | —',
      '6 | 22 Oct 15:00 | Kelvin (PIC) | PIC approved via link | green | — | — | — | Kick-off minutes',
    ])
  })

  it('a person replaced (④-5): amber, its from → to as it is, the reason quoted', () => {
    const log = projectLogFromRow({ track: 'TSK-CAR-2610-002', title: 'Banner', kind: 'quick', rows: [
      { id: 20, at: '2026-10-24T03:40:00Z', actor: 'Josiah', action: 'replaced', stage: 0, stageName: 'Draft', fromTo: 'Siti → Hafiz', reason: 'Resigned',
        data: { role: 'owner', rec: 1 } }] })!
    expect(auditRows(log).map(line)).toEqual(['1 | 24 Oct 11:40 | Josiah | Replaced | amber | Draft | Siti → Hafiz | "Resigned" | —'])
  })

  it('billing’s lines (②b-2b): its words, the month in the Version column — never a figure', () => {
    const log = projectLogFromRow({ track: 'MKT-CAR-2610-007', title: 'Social media', kind: 'product', rows: [
      { id: 30, at: '2026-10-24T02:00:00Z', actor: 'Josiah', action: 'amount set' },
      { id: 31, at: '2026-10-24T03:00:00Z', actor: 'Josiah', action: 'billing confirmed', data: { month: '2026-10' } },
      { id: 32, at: '2026-10-24T04:00:00Z', actor: 'Josiah', action: 'billing withdrawn', data: { month: '2026-10' } },
      { id: 33, at: '2026-10-24T05:00:00Z', actor: 'Josiah', action: 'stopped', data: { until: '2026-10' } },
    ] })!
    expect(auditRows(log).map(line)).toEqual([
      '1 | 24 Oct 10:00 | Josiah | Amount set | grey | — | — | — | —',
      '2 | 24 Oct 11:00 | Josiah | Billing confirmed | green | — | — | — | Oct 2026',
      '3 | 24 Oct 12:00 | Josiah | Billing withdrawn | amber | — | — | — | Oct 2026',
      '4 | 24 Oct 13:00 | Josiah | Stopped | amber | — | — | — | Oct 2026',
    ])
  })

  it('a recurring product’s months (②b-2f): made, its day moved, a plan carried — the month in the Version column', () => {
    const log = projectLogFromRow({ track: 'MKT-CAR-2610-007', title: 'Social media', kind: 'product', rows: [
      { id: 40, at: '2026-11-05T01:00:00Z', actor: 'Someone', action: 'run made', data: { run: 2, month: '2026-11', made: 4, toPlan: 0 } },
      { id: 41, at: '2026-11-06T01:00:00Z', actor: 'Josiah', action: 'run day', data: { from: 5, to: 10 } },
      { id: 42, at: '2026-11-05T01:00:00Z', actor: 'Someone', action: 'carried', data: { from: 'MKT-CAR-2610-007-D01', start: '2026-11-05' } },
    ] })!
    expect(auditRows(log).map(r => [r.action, r.version])).toEqual([
      ['Monthly run made', 'Nov 2026'], ['Run day changed', '—'], ['Plan carried', '—']])
  })

  it('paused and resumed (②b-2g): the month it goes on from in the Version column, the months left out in Reason', () => {
    const log = projectLogFromRow({ track: 'MKT-CAR-2610-007', title: 'Social media', kind: 'product', rows: [
      { id: 50, at: '2026-11-02T01:00:00Z', actor: 'Josiah', action: 'runs paused', data: null },
      { id: 51, at: '2026-12-08T01:00:00Z', actor: 'Josiah', action: 'runs resumed', data: { from: '2026-12', left: 1 } },
      { id: 52, at: '2026-12-09T01:00:00Z', actor: 'Josiah', action: 'runs resumed', data: { from: '2027-01', left: 0 } },
    ] })!
    expect(auditRows(log).map(r => [r.action, r.reason, r.version])).toEqual([
      ['Monthly runs paused', '—', '—'], ['Monthly runs resumed', '1 month left out', 'Dec 2026'], ['Monthly runs resumed', '—', 'Jan 2027']])
  })

  it('a campaign’s period (④-2b): its days — or taken off — in the Reason column', () => {
    const log = projectLogFromRow({ track: 'MKT-CAR-2610-007', title: 'Truck event', kind: 'product', rows: [
      { id: 50, at: '2026-10-24T01:00:00Z', actor: 'Josiah', action: 'campaign period', data: { from: '2026-11-09', until: '2026-11-12' } },
      { id: 51, at: '2026-10-24T02:00:00Z', actor: 'Josiah', action: 'campaign period', data: { from: null, until: null } },
    ] })!
    expect(auditRows(log).map(r => [r.action, r.reason])).toEqual([['Campaign period', '9 – 12 Nov 2026'], ['Campaign period', 'Taken off']])
  })

  it('filters by person, action and stage — each value as first named, counted over the whole log', () => {
    const rows = auditRows(task)
    const groups = auditGroups(rows, NO_AUDIT_FILTER)
    expect(groups.map(g => `${g.title}: ${g.opts.map(o => `${o.value} ${o.n}`).join(', ')}`)).toEqual([
      'By person: SIA 4, Mei 2',
      'By action: Task created 1, Stage opened 1, Accepted 1, Submitted 1, Changes requested 1, Nudged 1',
      'By stage: — 1, First draft 5',
    ])
    let f = toggleAudit(NO_AUDIT_FILTER, 'person', 'SIA')
    f = toggleAudit(f, 'stage', 'First draft')
    const shown = rows.filter(r => passesAudit(r, f))
    expect(shown.map(r => r.no)).toEqual([2, 5, 6])
    expect(auditCount(shown.length, rows.length)).toBe('3 of 6 records')
    expect(auditChips(f)).toEqual([{ key: 'person', group: 'Person', value: 'SIA' }, { key: 'stage', group: 'Stage', value: 'First draft' }])
    expect(auditGroups(rows, f)[0].opts.find(o => o.value === 'SIA')?.on).toBe(true)
    expect(toggleAudit(f, 'person', 'SIA').person).toEqual([])
    expect(auditCount(1, 1)).toBe('1 of 1 record')
  })

  it('reads nothing for no such project, and skips what is not a record', () => {
    expect(projectLogFromRow(null)).toBeNull()
    expect(projectLogFromRow({ track: 'X', kind: 'odd', rows: [1, { id: 2, action: 'accepted' }] })).toMatchObject({ kind: 'quick', rows: [{ id: 2 }] })
  })
})

describe('a post’s mark on the formal log (④-2c)', () => {
  it('Marked posted, green, its field and link; taken back, its field', () => {
    const log = projectLogFromRow({ track: 'MKT-CAR-2611-001-D01', title: 'Image post', kind: 'deliverable', rows: [
      { id: 60, at: '2026-11-10T02:00:00Z', actor: 'Ali', action: 'posted', stage: 0, stageName: 'Schedule', data: { field: 'Post day', link: 'https://x.my/1' } },
      { id: 61, at: '2026-11-10T03:00:00Z', actor: 'Ali', action: 'unposted', stage: 0, stageName: 'Schedule', data: { field: 'Post day' } },
    ] })!
    expect(auditRows(log).map(r => [r.action, r.tone, r.stage, r.reason])).toEqual([
      ['Marked posted', 'green', 'Schedule', 'Post day · https://x.my/1'], ['Posted mark taken back', 'grey', 'Schedule', 'Post day']])
  })
})

describe('a record corrected, and the log exported (④-3b — the user’s answers 18, 19, 21)', () => {
  const corrected = projectLogFromRow({ track: 'TSK-CAR-2610-001', title: 'Price update', kind: 'quick', rows: [
    ...task.rows,
    { id: 7, at: '2026-10-22T04:00:00Z', actor: 'SIA', action: 'correction', stage: 0, stageName: 'First draft', reason: 'Sent on 21 Oct at 18:45', corrects: 4 },
    { id: 8, at: '2026-10-22T05:00:00Z', actor: 'SIA', action: 'correction', stage: 0, stageName: 'First draft', reason: 'At 18:50, the scan says', corrects: 7 },
    { id: 9, at: '2026-10-22T06:00:00Z', actor: 'SIA', action: 'correction', reason: 'Of a record not on this log', corrects: 999 },
  ] })!

  it('a correction: its words quoted, the number of the record it corrects; the record the numbers of its corrections', () => {
    const rows = auditRows(corrected)
    expect(rows.map(r => [r.no, r.action, r.reason, r.corrects, r.correctedIn])).toEqual([
      [1, 'Task created', '—', null, []], [2, 'Stage opened', '—', null, []], [3, 'Accepted', '—', null, []],
      [4, 'Submitted', '—', null, [7]], [5, 'Changes requested', '"Logo too small"', null, []], [6, 'Nudged', '—', null, []],
      [7, 'Correction', '"Sent on 21 Oct at 18:45"', 4, [8]], [8, 'Correction', '"At 18:50, the scan says"', 7, []],
      [9, 'Correction', '"Of a record not on this log"', null, []],
    ])
    expect([rows[6].id, rows[6].stage, actionCell(rows[6]), actionCell(rows[3])]).toEqual([7, 'First draft', 'Correction (correction of #4)', 'Submitted'])
    expect([correctionOk('    '), correctionOk('typo'), correctionOk(' Wrong day '), correctionOk('x'.repeat(500)), correctionOk('x'.repeat(501))])
      .toEqual([false, false, true, true, false])
  })

  it('the filter in the address and back — an export is of the rows shown', () => {
    const f = { person: ['Mei', 'SIA'], action: ['Submitted'], stage: [] }
    expect(auditQuery(f)).toBe('person=Mei&person=SIA&action=Submitted')
    expect(auditFilterOf(new URLSearchParams(auditQuery(f)))).toEqual(f)
    expect(auditFilterOf(new URLSearchParams('person=&stage=First+draft&x=1'))).toEqual({ person: [], action: [], stage: ['First draft'] })
    expect(auditExportHref('p 1', 'table', f)).toBe('/marketing/projects/p%201/log?format=table&person=Mei&person=SIA&action=Submitted')
    expect(auditExportHref('p1', 'csv', NO_AUDIT_FILTER)).toBe('/marketing/projects/p1/log?format=csv')
    expect([auditExportOf('table'), auditExportOf('csv'), auditExportOf('pdf'), auditExportOf(null), auditExportOf('xls')]).toEqual(['table', 'csv', 'pdf', 'pdf', 'pdf'])
    expect([auditFileName('TSK-CAR-2610-001', 'pdf'), auditFileName('TSK-CAR-2610-001', 'table'), auditFileName('TSK-CAR-2610-001', 'csv'), auditFileName('', 'csv')])
      .toEqual(['TSK-CAR-2610-001_audit.pdf', 'TSK-CAR-2610-001_audit_table.pdf', 'TSK-CAR-2610-001_audit.csv', 'project_audit.csv'])
  })

  it('the CSV: the table’s columns, each time whole, a correction with its record — a formula never a formula', () => {
    const rows = auditRows(corrected).filter(r => [4, 5, 7].includes(r.no))
    const odd = { ...rows[0], no: 10, actor: '=HYPERLINK("x")', reason: 'A, "quoted" line' }
    expect(auditCsv([...rows, odd], at => `W${at.slice(0, 10)}`)).toBe([
      '#,Time,Actor,Action,From → To,Reason,Version',
      '4,W2026-10-21,Mei,Submitted,Mei → SIA,—,First draft v1',
      '5,W2026-10-22,SIA,Changes requested,→ Mei,"""Logo too small""",First draft v1',
      '7,W2026-10-22,SIA,Correction (correction of #4),—,"""Sent on 21 Oct at 18:45""",—',
      `10,W2026-10-21,"'=HYPERLINK(""x"")",Submitted,Mei → SIA,"A, ""quoted"" line",First draft v1`,
      '',
    ].join('\r\n'))
  })

  it('a PDF’s words in what its Helvetica draws: an arrow as ->, anything else outside it a ?', () => {
    expect(pdfText('Mei → SIA · “Logo” — 50% … ✓ 李 😀\nnext')).toBe('Mei -> SIA · “Logo” — 50% … ? ? ?\nnext')
  })
})

// 2026-10-25 — ④-4c (the user's answer 23): a project opened from another says from which; the other, to which.
describe('opened from another project', () => {
  it('From → To: from the project it was opened from; on that one’s log, to the new one', () => {
    const rows = auditRows(projectLogFromRow({
      track: 'TSK-CAR-2610-009', title: 'Teaser', kind: 'quick',
      rows: [
        { id: 1, at: '2026-10-25T02:00:00Z', actor: 'Mei', action: 'created', data: { kind: 'quick', stages: 2, from: 'MKT-CAR-2610-008' } },
        { id: 2, at: '2026-10-25T03:00:00Z', actor: 'Mei', action: 'opened project', data: { id: 'p9', track: 'TSK-CAR-2610-010', title: 'Resize' } },
        { id: 3, at: '2026-10-25T04:00:00Z', actor: 'Mei', action: 'opened project', data: { id: 'p10', track: 'TSK-CAR-2610-011' } },
        { id: 4, at: '2026-10-25T05:00:00Z', actor: 'Mei', action: 'opened project', data: null },
      ],
    })!)
    expect(rows.map(r => `${r.action} · ${r.fromTo} · ${r.reason} · ${r.version}`)).toEqual([
      'Task created · MKT-CAR-2610-008 → · — · —',
      'Project opened from it · → TSK-CAR-2610-010 · Resize · — · —',
      'Project opened from it · → TSK-CAR-2610-011 · — · —',
      'Project opened from it · — · — · —',
    ])
    expect(auditRows(task)[0].fromTo).toBe('—')
  })
})
