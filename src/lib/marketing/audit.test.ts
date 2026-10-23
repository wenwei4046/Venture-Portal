import { describe, expect, it } from 'vitest'
import {
  auditChips, auditCount, auditGroups, auditRows, NO_AUDIT_FILTER, passesAudit, projectLogFromRow, toggleAudit,
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
