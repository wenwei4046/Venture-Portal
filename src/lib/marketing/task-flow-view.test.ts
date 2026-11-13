import { describe, expect, it } from 'vitest'
import { fixtureTask, NOW, P } from './task-flow-fixture'
import {
  bannerView, deadlineOf, dur, fieldDisplay, focusOf, focusSections, headerView, mayFill, missingOf, missingToast, modalPeople,
  nextUpView, panelView, picView, projected, sectionState, stripView, tableNote,
} from './task-flow-view'

// 2026-11-13 — the task page's top as each viewer sees it (Workflow Builder 2a handoff › Task Flow.dc.html), on the
// prototype's own task: the Red Truck reel at Edit, Ali a day late.

describe('the header', () => {
  it('says how late, who has it, how long, when it is due, the deadline', () => {
    const h = headerView(fixtureTask(), NOW)
    expect(h.status).toEqual({ label: '1 day overdue', tone: 'red' })
    expect(h.nowWith.name).toBe('Ali')
    expect(h.inStage).toBe('5d 5h')
    expect([h.stageDue, h.stageDueRed]).toEqual(['11 Nov · 1d overdue', true])
    expect([h.deadline, h.deadlineRed]).toEqual(['16 Nov', false])
  })
  it('waiting for approval; on track; done; at risk', () => {
    const t = fixtureTask()
    const ontime = { ...t, stages: t.stages.map((s, i) => (i === 2 ? { ...s, dueOn: '2026-11-13' } : s)) }
    expect(headerView(ontime, NOW).status.label).toBe('On track')
    expect(headerView({ ...ontime, at: { ...ontime.at, level: 0 } }, NOW).status.label).toBe('Waiting for approval')
    expect(headerView({ ...t, at: { ...t.at, done: true } }, NOW).status).toEqual({ label: 'Done', tone: 'done' })
    expect(headerView({ ...t, promise: 6 }, NOW).deadline).toBe('10 Nov · at risk')
  })
  it('the deadline is the start plus the promise in working days, or the task’s own day', () => {
    expect(deadlineOf({ startOn: '2026-11-02', promise: 10 })).toBe('2026-11-16')
    expect(deadlineOf({ startOn: '2026-11-02', promise: 10, deadline: '2026-11-20' })).toBe('2026-11-20')
  })
  it('projects the stages to come from today, never from a day gone', () => {
    expect(projected(fixtureTask(), NOW).slice(2)).toEqual(['2026-11-11', '2026-11-13', '2026-11-16'])
  })
  it('a duration in days and hours', () => {
    expect([dur(3 * 36e5), dur(26 * 36e5), dur(0)]).toEqual(['3h', '1d 2h', '1h'])
  })
})

describe('the strip and the focus', () => {
  it('a card a stage: done ✓, the one now red when late, later its days; YOU on the viewer’s', () => {
    const cards = stripView(fixtureTask(), P.ali, 2, NOW)
    expect(cards.map(c => [c.mark, c.state, c.mini])).toEqual([['✓', 'done', '✓'], ['✓', 'done', '2d late'], ['3', 'cur', '5d 5h'], ['4', 'later', '1d'], ['5', 'later', '1d']])
    expect(cards[2].late).toBe(true)
    expect(cards.filter(c => c.you).map(c => c.name)).toEqual(['Edit', 'Final'])
    expect(cards[3]).toMatchObject({ who: '🔓 Ali picks', open: true })
    expect(cards.map(c => c.focused)).toEqual([false, false, true, false, false])
  })
  it('the focus starts on the viewer’s own stage', () => {
    const t = fixtureTask()
    expect(focusOf(t, P.ali)).toBe(2)
    expect(focusOf(t, P.daniel)).toBe(4)
    expect(focusOf(t, P.mei)).toBe(0)
    expect(focusOf(t, 'nobody')).toBe(2)
  })
})

describe('the focused stage’s panel', () => {
  it('done: Took and On time / late; now: In stage and Due; later: Planned and Expected by', () => {
    const t = fixtureTask()
    expect(panelView(t, 0, false, NOW)).toMatchObject({ timeK: 'Took', timeV: '2d 2h', dueK: 'Due 4 Nov', dueV: 'On time', dueTone: 'ok' })
    expect(panelView(t, 1, false, NOW)).toMatchObject({ dueV: '2d late', dueTone: 'red' })
    expect(panelView(t, 2, true, NOW)).toMatchObject({ timeK: 'In stage', dueV: '11 Nov · 1d overdue', canReassign: true, line: 'late' })
    expect(panelView(t, 4, false, NOW)).toMatchObject({ timeK: 'Planned', timeV: '1d', dueK: 'Expected by', dueV: '16 Nov', canReassign: false })
  })
  it('its levels: "L1 · all", a ✓ for each approval in, … for those it waits for', () => {
    const t = fixtureTask({ at: { cur: 4, level: 0, ok: { [P.rachel]: 'now' }, done: false } })
    const g = panelView(t, 4, false, NOW).gates
    expect(g[0]).toMatchObject({ rule: 'all', tone: 'active' })
    expect(g[0].people.map(p => p.text)).toEqual(['Rachel ✓', 'Daniel …'])
    expect(g[1]).toMatchObject({ rule: '', tone: 'later' })
    expect(g[1].people[0].text).toBe('🔗 PIC')
    expect(panelView(fixtureTask(), 0, false, NOW).gates[0].tone).toBe('passed')
  })
})

describe('the banner', () => {
  it('the doer: fill in, then submit — red when late', () => {
    const b = bannerView(fixtureTask(), P.ali, false, NOW, 2)
    expect(b).toMatchObject({ tone: 'late', icon: '⏰', title: 'Your turn · Edit · 1d overdue', text: 'Fill 2 required fields below, then submit.' })
    expect(b.actions.map(a => a.label)).toEqual(['Submit Edit'])
    expect(bannerView(fixtureTask(), P.ali, false, NOW, 0).text).toBe('Everything required is filled. When you submit, you pick who does Thumbnail.')
  })
  it('the approver: any or all, Request changes / Approve', () => {
    const t = fixtureTask({ at: { cur: 4, level: 0, ok: {}, done: false } })
    const b = bannerView(t, P.daniel, false, NOW, 0)
    expect([b.title, b.text]).toEqual(['Your approval · Final', 'Ali submitted it. Everyone on this level must approve.'])
    expect(b.actions.map(a => a.key)).toEqual(['changes', 'approve'])
  })
  it('the manager: now with whom for how long — or asked to reassign when the overdue rule says so', () => {
    const t = fixtureTask()
    const b = bannerView(t, P.rachel, true, NOW, 0)
    expect(b.title).toBe('You manage this task · now with Ali')
    expect(b.actions.map(a => a.label)).toEqual(['⇄ Reassign current', '🔔 Nudge'])
    const r = bannerView({ ...t, overdue: { ...t.overdue, action: 'reassign' } }, P.rachel, true, NOW, 0)
    expect(r.title).toBe('Edit is 1d overdue · reassign it?')
    expect(r.actions.map(a => a.label)).toEqual(['🔔 Nudge', '⇄ Reassign now'])
  })
  it('up next, finished, not on it, done', () => {
    const t = fixtureTask()
    expect(bannerView(t, P.daniel, false, NOW, 0).title).toBe('You’re up in 2 stages · Final')
    expect(bannerView(t, P.siti, false, NOW, 0).title).toBe('You’re up next · Thumbnail')
    expect(bannerView(t, P.kit, false, NOW, 0).title).toBe('You finished Shoot')
    expect(bannerView(t, 'x', false, NOW, 0).title).toBe('You’re not on this task')
    const done = bannerView({ ...t, at: { cur: 4, level: -1, ok: {}, done: true }, doneAt: '2026-11-13T10:00:00+08:00' }, P.ali, false, NOW, 0)
    expect([done.tone, done.text, done.actions[0].label]).toEqual(['done', 'Finished 13 Nov, before the 16 Nov deadline.', 'Replay celebration'])
  })
})

describe('what the focused stage fills in', () => {
  it('only its sections: its own, and a table with a column of its', () => {
    expect(focusSections(fixtureTask(), 2).map(s => s.title)).toEqual(['Shot list', 'Edit'])
    expect(focusSections(fixtureTask(), 3)).toEqual([])
  })
  it('only the doer, before submit, fills in the stage now', () => {
    const t = fixtureTask()
    expect([mayFill(t, P.ali, 2), mayFill(t, P.ali, 4), mayFill(t, P.rachel, 2)]).toEqual([true, false, false])
    expect(mayFill({ ...t, at: { ...t.at, level: 0 } }, P.ali, 2)).toBe(false)
  })
  it('what is missing at submit: required fields, a required column empty on any row', () => {
    const miss = missingOf(fixtureTask())
    expect(miss.map(m => m.label)).toEqual(['Shot list · Clip link', 'Draft video'])
    expect(missingToast(miss)).toBe('Fill 2 required fields first: Shot list · Clip link, Draft video')
    expect(missingOf(fixtureTask(), id => id === 'f-draft').map(m => m.id)).toEqual(['f-shots:c2'])
    const filled = fixtureTask({ values: { 'f-draft': 'https://x' }, rows: { 'f-shots': [{ id: 'r', added: false, cells: { c2: 'https://c' } }] } })
    expect(missingOf(filled)).toEqual([])
    expect(missingOf(fixtureTask({ rows: { 'f-shots': [] }, values: { 'f-draft': 'x' } })).map(m => m.id)).toEqual(['f-shots:c2'])
  })
  it('a section’s state and a field read only', () => {
    const t = fixtureTask()
    const [, tbl, edit, fin] = t.sections
    expect(sectionState(t, edit, P.ali)).toMatchObject({ text: 'Your turn · fill in', mine: true })
    expect(sectionState(t, edit, P.rachel).text).toBe('With Ali')
    expect(sectionState(t, t.sections[0], P.rachel).text).toBe('✓ Done')
    expect(sectionState(t, fin, P.rachel).text).toBe('Later · Final')
    expect(sectionState(t, tbl, P.rachel).text).toBe('With Ali')
    expect(fieldDisplay(t, t.sections[0].fields[0])).toEqual({ text: 'Truck arrives', filled: true })
    expect(fieldDisplay(t, fin.fields[0])).toEqual({ text: 'Filled at Final', filled: false })
    expect(tableNote(t, tbl.fields[0], true)).toBe('2 rows · you fill the highlighted columns')
    expect(tableNote(t, tbl.fields[0], false)).toBe('2 rows · columns are filled at Script, Shoot, Edit')
  })
})

describe('Next up, the modal, the PIC', () => {
  it('next up: the 🔓 pick, the approvers, everybody on an all-level', () => {
    expect(nextUpView(fixtureTask(), NOW).title).toBe('Ali picks who does Thumbnail')
    const t = fixtureTask({ at: { cur: 4, level: -1, ok: {}, done: false } })
    expect(nextUpView(t, NOW)).toMatchObject({ title: 'Rachel & Daniel approve Final', sub: 'Level 1 of 2 · all must approve' })
    expect(nextUpView({ ...t, at: { cur: 4, level: 0, ok: { [P.rachel]: 'x' }, done: false } }, NOW).title).toBe('Waiting for Daniel')
    expect(nextUpView({ ...t, at: { ...t.at, done: true } }, NOW).title).toBe('Nothing left')
  })
  it('the modal: the shortlist for a handoff, everybody else to reassign — load red at 5', () => {
    const t = fixtureTask()
    expect(modalPeople(t, 3, 'pick').map(p => p.name)).toEqual(['Siti', 'Hafiz'])
    const all = modalPeople(t, 2, 'reassign', P.rachel)
    expect(all.find(p => p.name === 'Ali')?.current).toBe(true)
    expect(all.find(p => p.name === 'Hafiz')?.busy).toBe(true)
    expect(all.some(p => p.name === 'Rachel')).toBe(false)
  })
  it('the PIC: the stage’s words, the steps, only what they may see — Coming soon where empty', () => {
    const v = picView(fixtureTask(), NOW)
    expect([v.title, v.answer, v.eta]).toEqual(['Content team is editing', false, 'Expected by 16 Nov'])
    expect(v.steps.map(s => s.state)).toEqual(['done', 'done', 'cur', 'next', 'next'])
    const tbl = v.secs.find(s => s.title === 'Shot list')
    expect(tbl?.table?.cols).toEqual(['Scene'])
    const edit = v.secs.find(s => s.title === 'Edit')
    expect(edit?.fields.map(f => [f.name, f.text])).toEqual([['Draft video', 'Coming soon'], ['Shoot date', 'Coming soon']])
    const asked = picView(fixtureTask({ at: { cur: 4, level: 1, ok: {}, done: false } }), NOW)
    expect([asked.title, asked.answer]).toEqual(['Your approval is needed', true])
  })
})
