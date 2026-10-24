import { describe, expect, it } from 'vitest'
import {
  attendeesOf, bothWaiting, editedAfterApproval, fillPatch, linkUrl, minutesMissing, productPicksFromRow, productProjectFromRow, productStatus,
  productTrail, requiredTally, sendProblems, stepsOf, unsignedOf, whatsappOk, whatsappUrl, type MinutesEdit, type ProductProjectPage, deliverableRuns, nextRun, runMonth, runsLine, campaignLine, typedCampaign
} from './project'
import { periodWords } from './board'

// 2026-10-23 — a 📦 product project before its work starts (②b-1, `New Project.dc.html` steps 2–4): the page as
// mkt_product_project answers it, what stops the intake minutes going to the PIC, the stepper, the side card's count,
// only what changed for the save, the link and its WhatsApp, the trail in words. The database's side is
// tests/member-sql/validate-marketing-product-projects.mjs.

const FIELDS = [
  { name: 'Project', type: 'Project link', req: true, pic: true, lock: true },
  { name: 'Meeting date', type: 'Date', req: true, pic: true, lock: false },
  { name: 'Attendees', type: 'People', req: true, pic: true, lock: true },
  { name: 'Objective', type: 'Long text', req: true, pic: true, lock: false },
  { name: 'Shots', type: 'Table', req: false, pic: true, lock: false, cols: [{ name: 'Shot', type: 'Text' }] },
  { name: 'Budget note', type: 'Short text', req: false, pic: false, lock: false },
  { name: 'Signatures', type: 'Signature', req: true, pic: true, lock: false },
]
const RULES = { sign: true, pic: true, picAll: false, project: true, file: true, lock: true }

function page(project: Record<string, unknown> = {}, minutes: Record<string, unknown> = {}, trail: object[] = []): ProductProjectPage {
  return productProjectFromRow({
    today: '2026-10-24',
    me: 's-rachel',
    team: [{ id: 's-rachel', full: 'RACHEL TAN' }, { id: 's-siti', first: 'Siti', full: 'SITI AMINAH' }],
    sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: {
      id: 'p1', track: 'MKT-CAR-2610-001', title: 'Carres · Social Media Package A · Oct 2026', status: 'minutes', owner: 's-rachel', ownerName: 'RACHEL',
      pic: 'Kelvin', whatsapp: '+60 12-345 6789', link: null, linkSentAt: null, picReply: null, override: null, createdAt: '2026-10-24T01:00:00Z',
      product: { id: 'pr', version: 2, name: 'Social Media Package A', kind: 'recurring', note: '4 posts' },
      ...project,
    },
    minutes: [{
      id: 'm1', title: 'Kickoff', intake: true, status: 'draft', locked: false, rev: 3,
      vals: { Attendees: ['s-rachel', 's-siti'], 'Meeting date': '2026-10-24', Shots: { rows: [['', '']] } },
      signed: { 's-rachel': { at: '2026-10-24T02:00:00Z' } }, notes: 'Wants red', completedAt: null, completedBy: null, updatedBy: 'RACHEL',
      template: { id: 't1', version: 1, name: 'Kickoff', fields: FIELDS, rules: RULES },
      ...minutes,
    }],
    trail: [...trail, { at: '2026-10-24T01:00:00Z', actor: 'RACHEL', action: 'created', reason: null }],
  }) as ProductProjectPage
}

describe('a product project as the page reads it', () => {
  it('reads the project, its product, its intake minutes and its trail', () => {
    const pp = page()
    expect([pp.project.track, pp.project.status, pp.project.product?.kind, pp.project.product?.version]).toEqual(['MKT-CAR-2610-001', 'minutes', 'recurring', 2])
    const doc = pp.minutes[0]
    expect([doc.intake, doc.rev, doc.status, doc.template.fields.length, doc.template.rules.pic]).toEqual([true, 3, 'draft', 7, true])
    expect(doc.signed).toEqual({ 's-rachel': '2026-10-24T02:00:00Z' })
    expect(doc.vals.Shots).toEqual({ rows: [['', '']] })
    expect(pp.trail.map(e => e.action)).toEqual(['created'])
  })

  it('a team member with no first name is called by the first word of their full name', () => {
    // 2026-10-23: the split read /s+/ (the letter s), so "RACHEL TAN" came out whole and "SITI AMINAH" not at all.
    const pp = page()
    expect(pp.team.map(x => x.first)).toEqual(['RACHEL', 'Siti'])
  })

  it('nothing for a missing project', () => {
    expect(productProjectFromRow(null)).toBeNull()
    expect(productProjectFromRow({ project: { track: 'MKT-X' } })).toBeNull()
  })

  it('reads New Project’s products on sale — each with its list price, offered as the amount (②b-2b)', () => {
    expect(productPicksFromRow([{ id: 'pr', code: 'P-001', name: 'Social Media Package A', kind: 'recurring', version: 2, note: '4 posts', description: '',
      actions: 3, intake: { id: 't1', name: 'Kickoff', version: 1, fields: 7 }, price: 3000 }])).toEqual([{ id: 'pr', code: 'P-001', name: 'Social Media Package A',
      kind: 'recurring', version: 2, note: '4 posts', description: '', actions: 3, intake: { id: 't1', name: 'Kickoff', version: 1, fields: 7 }, price: 3000 }])
    expect(productPicksFromRow([{ id: 'pr', price: '450.50' }, { id: 'p2' }]).map(p => p.price)).toEqual([450.5, null])
  })
})

describe('what stops the intake minutes going to the PIC', () => {
  const doc = page().minutes[0]
  const kelvin = { name: 'Kelvin', whatsapp: '+60 12-345 6789' }

  it('the required fields still empty — never the project link nor the signatures; an empty table is empty', () => {
    expect(minutesMissing(doc.template.fields, doc.vals)).toEqual(['Objective'])
    const req = doc.template.fields.map(f => (f.name === 'Shots' ? { ...f, req: true } : f))
    expect(minutesMissing(req, doc.vals)).toEqual(['Objective', 'Shots'])
    expect(minutesMissing(doc.template.fields, { ...doc.vals, Attendees: [] })).toEqual(['Attendees', 'Objective'])
  })

  it('the attendees are the locked People field; those yet to sign when every attendee signs', () => {
    expect(attendeesOf(doc.template.fields, doc.vals)).toEqual(['s-rachel', 's-siti'])
    expect(unsignedOf(doc)).toEqual(['s-siti'])
    expect(unsignedOf({ ...doc, template: { ...doc.template, rules: { ...RULES, sign: false } } })).toEqual([])
  })

  it('says what is missing, the PIC, their WhatsApp when the link goes to them, and who has not signed', () => {
    const team = page().team
    expect(sendProblems(doc, kelvin, team)).toEqual(['Objective is empty', 'Waiting for Siti to sign'])
    expect(sendProblems(doc, { name: ' ', whatsapp: '12' }, team)).toEqual(['Objective is empty', 'Name the PIC', 'Add the PIC’s WhatsApp', 'Waiting for Siti to sign'])
    const noPic = { ...doc, template: { ...doc.template, rules: { ...RULES, pic: false } } }
    expect(sendProblems(noPic, { name: 'Kelvin', whatsapp: '' }, team)).toEqual(['Objective is empty', 'Waiting for Siti to sign'])
    expect(sendProblems({ ...doc, vals: { ...doc.vals, Objective: 'Walk-ins' }, signed: { 's-rachel': 'x', 's-siti': 'y' } }, kelvin, team)).toEqual([])
  })

  it('a second PIC named is reached on WhatsApp too, when the link goes to them (2026-10-24 — the user’s answer 29)', () => {
    const team = page().team
    const ready = { ...doc, vals: { ...doc.vals, Objective: 'Walk-ins' }, signed: { 's-rachel': 'x', 's-siti': 'y' } }
    expect(sendProblems(ready, { ...kelvin, name2: 'Hana', whatsapp2: '12' }, team)).toEqual(['Add the second PIC’s WhatsApp'])
    expect(sendProblems(ready, { ...kelvin, name2: 'Hana', whatsapp2: '+60 13-222 1111' }, team)).toEqual([])
    expect(sendProblems(ready, { ...kelvin, name2: ' ', whatsapp2: '' }, team)).toEqual([])
    const noPic = { ...ready, template: { ...ready.template, rules: { ...RULES, pic: false } } }
    expect(sendProblems(noPic, { ...kelvin, name2: 'Hana', whatsapp2: '' }, team)).toEqual([])
  })

  it('counts the required: the fields, the PIC’s name, and their WhatsApp when the link goes to them', () => {
    expect(requiredTally(doc, doc.vals, kelvin)).toEqual({ done: 4, total: 5 })
    expect(requiredTally(doc, { ...doc.vals, Objective: 'Walk-ins' }, { name: 'Kelvin', whatsapp: '' })).toEqual({ done: 4, total: 5 })
    const noPic = { ...doc, template: { ...doc.template, rules: { ...RULES, pic: false } } }
    expect(requiredTally(noPic, doc.vals, kelvin)).toEqual({ done: 3, total: 4 })
    expect(requiredTally(doc, doc.vals, { ...kelvin, name2: 'Hana', whatsapp2: '' })).toEqual({ done: 4, total: 6 })
  })

  it('a WhatsApp number is 8 digits or more, written any way', () => {
    expect([whatsappOk('+60 12-345 6789'), whatsappOk('012 3456'), whatsappOk('call me')]).toEqual([true, false, false])
  })
})

describe('the stepper', () => {
  const states = (s: Parameters<typeof stepsOf>[0], pic = true) => stepsOf(s, pic).map(x => x.state)
  it('stands on the minutes, the link, then the PIC’s answer', () => {
    expect(stepsOf('minutes', true).map(x => x.label)).toEqual(['Subsidiary & product', 'Meeting minutes', 'Tracking link', 'PIC response'])
    expect(states('minutes')).toEqual(['done', 'current', 'todo', 'todo'])
    expect(states('waiting_pic')).toEqual(['done', 'done', 'current', 'todo'])
    expect(states('changes')).toEqual(['done', 'done', 'done', 'current'])
    expect(states('approved')).toEqual(['done', 'done', 'done', 'current'])
  })
  it('with no PIC sign-off there is no PIC step, and approved is every step done', () => {
    expect(stepsOf('approved', false).map(x => [x.label, x.state])).toEqual([['Subsidiary & product', 'done'], ['Meeting minutes', 'done'], ['Tracking link', 'done']])
  })
})

describe('where it stands', () => {
  it('in the side card’s words and tones', () => {
    expect((['minutes', 'waiting_pic', 'changes', 'approved'] as const).map(s => productStatus(s))).toEqual([
      { label: 'Draft', tone: 'draft' }, { label: 'Waiting for PIC', tone: 'waiting' }, { label: 'Changes requested', tone: 'red' }, { label: 'Approved', tone: 'done' },
    ])
  })

  it('back with the PIC because something they see changed after they approved', () => {
    const edited = { at: '2026-10-25T03:00:00Z', actor: 'RACHEL', action: 'edited after approval', reason: 'Meeting date' }
    const sent = { at: '2026-10-24T03:00:00Z', actor: 'RACHEL', action: 'link sent', reason: 'Kelvin' }
    expect(editedAfterApproval(page({ status: 'waiting_pic' }, {}, [edited, sent]))).toBe('Meeting date')
    expect(editedAfterApproval(page({ status: 'waiting_pic' }, {}, [{ ...sent, action: 'resent' }, edited, sent]))).toBeNull()
    expect(editedAfterApproval(page({ status: 'approved' }, {}, [edited, sent]))).toBeNull()
  })

  it('the trail in words, newest first, on the office’s clock', () => {
    const pp = page({}, {}, [
      { at: '2026-10-25T12:00:00Z', actor: 'Josiah', action: 'replaced', reason: 'Resigned', data: { role: 'project', rec: 4, swap: 'Rachel → Siti' } },
      { at: '2026-10-25T11:00:00Z', actor: 'Hana Lee (PIC)', action: 'pic approved', reason: 'Kickoff', data: { pic: 2, waiting: 'Kelvin' } },
      { at: '2026-10-25T10:00:00Z', actor: 'Kelvin Tan (PIC)', action: 'pic approved', reason: 'Kickoff' },
      { at: '2026-10-25T09:00:00Z', actor: 'Kelvin (PIC)', action: 'pic changes', reason: 'Add Penang' },
      { at: '2026-10-25T08:00:00Z', actor: 'RACHEL', action: 'resent', reason: 'Kelvin' },
      { at: '2026-10-25T07:00:00Z', actor: 'RACHEL', action: 'started before approval', reason: 'Launch is Monday' },
      { at: '2026-10-25T06:00:00Z', actor: 'RACHEL', action: 'edited after approval', reason: 'Meeting date' },
      { at: '2026-10-24T05:00:00Z', actor: 'RACHEL', action: 'link sent', reason: 'Kelvin' },
      { at: '2026-10-24T04:00:00Z', actor: 'SITI', action: 'signed', reason: 'Kickoff' },
    ])
    expect(productTrail(pp).map(l => `${l.t} ${l.text}`)).toEqual([
      '25 Oct 20:00 Josiah replaced Rachel → Siti as the owner · "Resigned"',
      '25 Oct 19:00 Hana Lee (PIC) approved Kickoff on the link · waiting for Kelvin',
      '25 Oct 18:00 Kelvin Tan (PIC) approved Kickoff on the link',
      '25 Oct 17:00 Kelvin (PIC) asked for changes on the link: "Add Penang"',
      '25 Oct 16:00 RACHEL resent to Kelvin',
      '25 Oct 15:00 RACHEL started before PIC approval: "Launch is Monday"',
      '25 Oct 14:00 RACHEL changed Meeting date after approval · back to the PIC',
      '24 Oct 13:00 RACHEL sent the tracking link to Kelvin',
      '24 Oct 12:00 SITI signed Kickoff',
      '24 Oct 09:00 RACHEL started the project · Social Media Package A v2',
    ])
  })

  // ②b-2f: a recurring product's months.
  it('a recurring product’s months: read, the next run day, its line, its deliverables by month, its trail', () => {
    const pp = productProjectFromRow({ project: { id: 'p', track: 'T', status: 'active', runs: { day: 5, first: '2026-09-01', made: 2, until: null } } })!
    const r = pp.project.runs!
    expect(r).toEqual({ day: 5, first: '2026-09-01', made: 2, until: null })
    expect(productProjectFromRow({ project: { id: 'p', runs: { day: 31, first: '2026-09-01', made: 1 } } })!.project.runs).toBeNull()
    expect([runMonth(r, 1), runMonth(r, 3), nextRun(r), runsLine(r)]).toEqual(['2026-09-01', '2026-11-01', '2026-11-05', 'Every month on the 5th · next 5 Nov 2026'])
    expect([nextRun({ ...r, until: '2026-10-01' }), runsLine({ ...r, until: '2026-10-01' })]).toEqual([null, 'Every month on the 5th · ended Oct 2026'])
    expect(runsLine({ ...r, day: 22, made: 4 })).toBe('Every month on the 22nd · next 22 Jan 2027')
    const del = (id: string, run?: number) => ({ id, trackId: id, title: id, status: 'planning' as const, cur: 0, deliv: { group: '', item: id, n: 1, of: 1, ...(run ? { run } : {}) },
      workflow: null, startsOn: null, dueOn: null, doneAt: null, stages: 1, done: 0, stage: null })
    expect(deliverableRuns([del('D01', 1), del('D02', 2), del('D03', 2), del('D00')], r).map(m => [m.run, m.month, m.list.map(x => x.id)]))
      .toEqual([[2, 'Oct 2026', ['D02', 'D03']], [1, 'Sep 2026', ['D01', 'D00']]])
    pp.trail = [
      { at: '2026-10-05T01:00:00Z', actor: 'Someone', action: 'run made', reason: '', data: { run: 2, month: '2026-10', made: 4, toPlan: 1 } },
      { at: '2026-10-04T01:00:00Z', actor: 'Josiah', action: 'run day', reason: '', data: { from: 1, to: 5 } },
      { at: '2026-09-02T01:00:00Z', actor: 'Josiah', action: 'work started', reason: '', data: { deliverables: 4, runDay: 1 } },
    ]
    expect(productTrail(pp).map(l => l.text)).toEqual([
      "Oct 2026's work made · 4 deliverables · 1 to plan", 'Josiah moved the monthly run to the 5th',
      'Josiah started the work · 4 deliverables · every month on the 1st',
    ])
  })

  // ②b-2b: billing's lines — the month they are for, never the figure (amounts are the manager's, the trail everybody's).
  it('billing’s lines: the amount set, a month confirmed or withdrawn, the project stopped', () => {
    const pp = page()
    pp.trail = [
      { at: '2026-10-24T09:00:00Z', actor: 'Josiah', action: 'stopped', reason: '', data: { until: '2026-10' } },
      { at: '2026-10-24T08:00:00Z', actor: 'Josiah', action: 'billing withdrawn', reason: '', data: { month: '2026-09' } },
      { at: '2026-10-24T07:00:00Z', actor: 'Josiah', action: 'billing confirmed', reason: '', data: { month: '2026-09' } },
      { at: '2026-10-24T06:00:00Z', actor: 'Josiah', action: 'amount set', reason: '', data: null },
    ]
    expect(productTrail(pp).map(l => l.text)).toEqual([
      'Josiah stopped the project · billed to Oct 2026', 'Josiah withdrew the billing for Sep 2026',
      'Josiah confirmed the billing for Sep 2026', 'Josiah set the amount',
    ])
  })
})

describe('the save and the link', () => {
  const saved: MinutesEdit = { vals: { Objective: 'Walk-ins', Attendees: ['a'] }, notes: '', pic: 'Kelvin', whatsapp: '+60 12', pic2: '', whatsapp2: '' }

  it('sends only what changed; a field emptied is cleared; the PIC only on the intake minutes', () => {
    expect(fillPatch(saved, { ...saved }, true)).toBeNull()
    expect(fillPatch(saved, { ...saved, vals: { ...saved.vals, Objective: ' ' }, notes: 'x' }, true)).toEqual({ vals: { Objective: null }, notes: 'x' })
    expect(fillPatch(saved, { ...saved, vals: { Objective: 'Walk-ins' } }, true)).toEqual({ vals: { Attendees: null } })
    expect(fillPatch(saved, { ...saved, pic: 'Kelvin Tan', whatsapp: '+60 13' }, true)).toEqual({ pic: 'Kelvin Tan', whatsapp: '+60 13' })
    expect(fillPatch(saved, { ...saved, pic: 'Kelvin Tan' }, false)).toBeNull()
  })

  it('…and the second PIC, only theirs when only theirs changed', () => {
    expect(fillPatch(saved, { ...saved, pic2: 'Hana' }, true)).toEqual({ pic2: 'Hana' })
    expect(fillPatch({ ...saved, pic2: 'Hana', whatsapp2: '+60 13' }, { ...saved, pic2: '', whatsapp2: '' }, true)).toEqual({ pic2: '', whatsapp2: '' })
    expect(fillPatch(saved, { ...saved, pic2: 'Hana' }, false)).toBeNull()
  })

  it('reads the second PIC, their link and whose the PIC’s answer was', () => {
    const pp = page({ pic2: 'Hana', whatsapp2: '+60 13-222 1111', link: 'a1', link2: 'b2',
      picReply: { decision: 'approved', name: 'Hana Lee', reason: '', at: '2026-10-25T08:00:00Z', pic: 2 } })
    expect([pp.project.pic2, pp.project.whatsapp2, pp.project.link2, pp.project.picReply?.pic]).toEqual(['Hana', '+60 13-222 1111', 'b2', 2])
    const before = page({ picReply: { decision: 'changes', name: 'Kelvin', reason: 'x', at: null } })
    expect([before.project.pic2, before.project.link2, before.project.picReply?.pic]).toEqual(['', null, 1])
  })

  it('the PIC’s link on this site, and WhatsApp with it in the message', () => {
    expect(linkUrl('https://venture.example/', 'abc')).toBe('https://venture.example/t/abc')
    expect(whatsappUrl('+60 12-345 6789', 'Hi Kelvin: https://x/t/abc')).toBe('https://wa.me/60123456789?text=Hi%20Kelvin%3A%20https%3A%2F%2Fx%2Ft%2Fabc')
    expect(whatsappUrl('12', 'x')).toBeNull()
  })
})

describe('the minutes waiting for both PICs (②b-2d-2b, the user’s answer 29)', () => {
  const both = { ...RULES, picAll: true }
  it('says whose approval is in and whom they wait for — only while they wait, with two PICs, the template asking both', () => {
    const pp = (project: Record<string, unknown>, rules = both) => page({ status: 'waiting_pic', pic2: 'Hana', ...project }, { template: { id: 't1', version: 1, name: 'Kickoff', fields: FIELDS, rules } })
    expect(bothWaiting(pp({ picOk: { '1': { name: 'Kelvin Tan', at: null } } }))).toBe('Kelvin Tan approved · waiting for Hana')
    expect(bothWaiting(pp({ picOk: { '2': { name: 'Hana Lee', at: null } } }))).toBe('Hana Lee approved · waiting for Kelvin')
    expect(bothWaiting(pp({ picOk: null }))).toBeNull()
    expect(bothWaiting(pp({ picOk: { '1': { name: 'Kelvin Tan', at: null } } }, RULES))).toBeNull()
    expect(bothWaiting(pp({ pic2: null, picOk: { '1': { name: 'Kelvin Tan', at: null } } }))).toBeNull()
    expect(bothWaiting(pp({ status: 'approved', picOk: { '1': { name: 'Kelvin Tan', at: null } } }))).toBeNull()
  })
})

// 2026-10-24 — ④-2b: a campaign's run period (the user's answer 13) — the intake's *Campaign period* as written and read,
// required until both its days are in, and the product page's line.
describe('a campaign’s run period', () => {
  it('reads the project’s run — both days or none', () => {
    const pp = productProjectFromRow({ project: { id: 'p', track: 'T', status: 'active', campaign: { from: '2026-11-09', until: '2026-11-12' } } })!
    expect(pp.project.campaign).toEqual({ from: '2026-11-09', until: '2026-11-12' })
    expect(productProjectFromRow({ project: { id: 'p', track: 'T', campaign: { from: '2026-11-09', until: null } } })!.project.campaign).toBeNull()
    expect(productProjectFromRow({ project: { id: 'p', track: 'T', campaign: { from: '2026-11-12', until: '2026-11-09' } } })!.project.campaign).toBeNull()
    expect(productProjectFromRow({ project: { id: 'p', track: 'T' } })!.project.campaign).toBeNull()
  })

  it('says it in words: before, live, ran', () => {
    const c = { from: '2026-11-09', until: '2026-11-12' }
    expect(campaignLine(c, '2026-10-24')).toEqual({ text: 'Runs 9 – 12 Nov 2026 · in 16 days', live: false })
    expect(campaignLine(c, '2026-11-08').text).toBe('Runs 9 – 12 Nov 2026 · tomorrow')
    expect(campaignLine(c, '2026-11-10')).toEqual({ text: 'Live · 9 – 12 Nov 2026 · ends 12 Nov', live: true })
    expect(campaignLine(c, '2026-11-12').text).toBe('Live · 9 – 12 Nov 2026 · ends today')
    expect(campaignLine(c, '2026-11-13')).toEqual({ text: 'Ran 9 – 12 Nov 2026', live: false })
    expect([periodWords('2026-11-09', '2026-11-09'), periodWords('2026-11-28', '2026-12-03'), periodWords('2026-12-28', '2027-01-03')])
      .toEqual(['9 Nov 2026', '28 Nov – 3 Dec 2026', '28 Dec 2026 – 3 Jan 2027'])
  })

  it('the run as typed — the header’s, before the save is back', () => {
    const f = [{ key: 'k', name: 'Event days', type: 'Campaign period' as const, req: true, pic: true, lock: false }]
    expect(typedCampaign([], {})).toBeUndefined()
    expect(typedCampaign(f, {})).toBeNull()
    expect(typedCampaign(f, { 'Event days': { from: '2026-11-09', to: '' } })).toBeNull()
    expect(typedCampaign(f, { 'Event days': { from: '2026-11-12', to: '2026-11-09' } })).toBeNull()
    expect(typedCampaign(f, { 'Event days': { from: '2026-11-09', to: '2026-11-12' } })).toEqual({ from: '2026-11-09', until: '2026-11-12' })
  })

  it('as written: required until both days are in; emptied, it is sent as nothing', () => {
    const f = [{ key: 'k', name: 'Campaign period', type: 'Campaign period' as const, req: true, pic: true, lock: false }]
    expect(minutesMissing(f, {})).toEqual(['Campaign period'])
    expect(minutesMissing(f, { 'Campaign period': { from: '2026-11-09', to: '' } })).toEqual(['Campaign period'])
    expect(minutesMissing(f, { 'Campaign period': { from: '2026-11-09', to: '2026-11-12' } })).toEqual([])
    const base: MinutesEdit = { vals: { 'Campaign period': { from: '2026-11-09', to: '2026-11-12' } }, notes: '', pic: '', whatsapp: '', pic2: '', whatsapp2: '' }
    expect(fillPatch(base, { ...base, vals: { 'Campaign period': { from: '2026-11-09', to: '' } } }, true)).toEqual({ vals: { 'Campaign period': { from: '2026-11-09', to: '' } } })
    expect(fillPatch(base, { ...base, vals: { 'Campaign period': { from: '', to: '' } } }, true)).toEqual({ vals: { 'Campaign period': null } })
    // Read back as the database keeps a half one (to: null): '' — the same as typed, so nothing is sent again.
    const read = productProjectFromRow({ project: { id: 'p', track: 'T' }, minutes: [{ id: 'm', intake: true, vals: { 'Campaign period': { from: '2026-11-09', to: null } } }] })!
    expect(read.minutes[0].vals['Campaign period']).toEqual({ from: '2026-11-09', to: '' })
  })
})
