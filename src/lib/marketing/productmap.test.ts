import { describe, expect, it } from 'vitest'
import { productProjectFromRow, type ProductProjectPage } from './project'
import { DELIV_LANE, productMap, type ProductMapEvent } from './productmap'
import { mapRows, replayAt } from './taskmap'

// 2026-10-25 — ④-4d: a product project's map (the user's answers 22, 23 — "Map and Audit trail on every project", "the
// intake is drawn on the map"): Created, the intake minutes, the PIC's approval on the link, the work started, its
// deliverables — drawn from the product page and its trail (the formal log's once read).

const RACHEL = 's-rachel'
const SITI = 's-siti'
const ev = (at: string, actor: string, action: string, more: Partial<ProductMapEvent> = {}): ProductMapEvent => ({ at, actor, action, reason: null, ...more })
const CREATED = ev('2026-10-20T01:00:00Z', 'Rachel', 'created', { data: { product: 'Post pack', version: 2 } })
const SENT = ev('2026-10-21T02:00:00Z', 'Rachel', 'link sent', { reason: 'Kelvin' })
const CHANGES = ev('2026-10-21T06:00:00Z', 'Kelvin (PIC)', 'pic changes', { reason: 'Add Penang' })
const RESENT = ev('2026-10-22T02:00:00Z', 'Rachel', 'resent', { reason: 'Kelvin' })
const APPROVED = ev('2026-10-22T05:00:00Z', 'Kelvin Tan (PIC)', 'pic approved', { reason: 'Kickoff' })
const STARTED = ev('2026-10-23T01:00:00Z', 'Rachel', 'work started', { data: { deliverables: 2 } })

function page(project: Record<string, unknown>, trail: ProductMapEvent[], more: Record<string, unknown> = {}): ProductProjectPage {
  return productProjectFromRow({
    today: '2026-10-26',
    me: RACHEL,
    team: [{ id: RACHEL, first: 'Rachel', full: 'RACHEL TAN', title: 'MARKETING MANAGER' }, { id: SITI, first: 'Siti', full: 'SITI AMINAH', title: 'GRAPHIC DESIGNER' }],
    sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: {
      id: 'p1', track: 'MKT-CAR-2610-007', title: 'Carres · Post pack · Oct 2026', status: 'minutes', owner: RACHEL, ownerName: 'Rachel', pic: 'Kelvin',
      link: null, linkSentAt: null, picReply: null, override: null, createdAt: '2026-10-20T01:00:00Z',
      product: { id: 'pr', version: 2, name: 'Post pack', kind: 'one', note: '' },
      ...project,
    },
    minutes: [{ id: 'm1', title: 'Kickoff', intake: true, status: 'draft', rev: 1, vals: {}, signed: {},
      template: { id: 't1', version: 1, name: 'Kickoff', fields: [], rules: { sign: true, pic: true, project: true, file: true, lock: true } }, ...(more.minutes as object ?? {}) }],
    // The page's trail is newest first.
    trail: [...trail].reverse(),
    deliverables: more.deliverables ?? [],
  }) as ProductProjectPage
}
const rows = (m: ReturnType<typeof productMap>) => m.nodes.map(n => `${n.id} ${n.lane}@${n.col} ${n.tone}${n.current ? ' HERE' : ''} · ${n.full} · ${n.person} · ${n.date}${n.tag ? ` · ${n.tag}` : ''} | ${n.handoff} | ${n.status}`)
const lines = (m: ReturnType<typeof productMap>) => m.edges.map(e => `${e.key} ${e.kind}${e.label ? ` "${e.label}"` : ''}`)
const D = (id: string, n: number, more: Record<string, unknown> = {}) => ({
  id, trackId: `MKT-CAR-2610-007-D0${n}`, title: `Image post ${n}/2`, status: 'active', cur: 0, workflow: 'Image post · Standard', deliv: { group: 'Graphic design', item: 'Image post', n, of: 2 },
  startsOn: '2026-10-23', dueOn: '2026-10-27', stages: 2, done: 0, stage: { idx: 0, name: 'Design', status: 'accepted', owner: SITI, dueOn: '2026-10-27' }, ...more,
})

describe('a product project’s map — its intake', () => {
  it('while its minutes are written: Created, the minutes here, the PIC’s approval and the work ahead', () => {
    const m = productMap(page({}, [CREATED]))
    expect(m.lanes.map(l => `${l.emoji} ${l.name}`)).toEqual(['🛡️ Approvals', '🛡️ MARKETING MANAGER'])
    expect(rows(m)).toEqual([
      'start MARKETING MANAGER@0 done · Created by Rachel · Rachel · 20 Oct | Post pack v2 | Done',
      'min MARKETING MANAGER@1 waiting HERE · Meeting minutes · Kickoff · Rachel ·  | Intake meeting | Writing · now here',
      'pic appr@2 draft · Kelvin approves the minutes · Kelvin ·  | PIC via link | Planned',
      'work MARKETING MANAGER@3 draft · Plan assignments · Rachel ·  | Plan assignments | Planned',
    ])
    expect(lines(m)).toEqual(['start>min solid', 'min>pic future', 'pic>work future'])
    expect(m.edges[0].meta).toEqual({ t: '20 Oct 09:00', who: 'Rachel → Rachel', what: 'Rachel started the project · Post pack v2', reason: '' })
  })

  it('sent to the PIC: the gate waits for them; sent back: the minutes red, a red line back, then approved', () => {
    const waiting = productMap(page({ status: 'waiting_pic', linkSentAt: SENT.at }, [CREATED, SENT]))
    expect(rows(waiting).slice(1, 3)).toEqual([
      'min MARKETING MANAGER@1 done · Meeting minutes · Kickoff · Rachel · 21 Oct | Intake meeting | Done',
      'pic appr@2 waiting HERE · Kelvin approves the minutes · Kelvin · Since 21 Oct | PIC via link | Waiting for Kelvin',
    ])
    expect(lines(waiting)).toEqual(['start>min solid', 'min>pic solid', 'pic>work future'])

    const back = productMap(page({ status: 'changes', linkSentAt: SENT.at }, [CREATED, SENT, CHANGES]))
    expect(rows(back)[1]).toBe('min MARKETING MANAGER@1 red HERE · Meeting minutes · Kickoff · Rachel ·  · returned ×1 | Intake meeting | Changes requested')
    expect(back.edges.find(e => e.kind === 'return')).toEqual({ key: 'pic>min~back', from: 'pic', to: 'min', kind: 'return', label: 'returned ×1',
      meta: { t: '21 Oct 14:00', who: 'Kelvin (PIC) → Rachel', what: 'Kelvin (PIC) asked for changes on the link: "Add Penang"', reason: 'Add Penang' } })

    const ok = productMap(page({ status: 'approved', linkSentAt: RESENT.at, picReply: { decision: 'approved', name: 'Kelvin Tan', at: APPROVED.at } },
      [CREATED, SENT, CHANGES, RESENT, APPROVED]))
    expect(rows(ok).slice(2)).toEqual([
      'pic appr@2 done · Kelvin approves the minutes · Kelvin · 22 Oct | PIC via link | Approved',
      'work MARKETING MANAGER@3 waiting HERE · Plan assignments · Rachel ·  | Plan assignments | Plan assignments · now here',
    ])
    expect(lines(ok)).toEqual(['start>min solid', 'min>pic solid', 'pic>work solid', 'pic>min~back return "returned ×1"'])
    expect(ok.stations.pic.audit.map(a => a.e)).toEqual([
      'Rachel sent the tracking link to Kelvin', 'Kelvin (PIC) asked for changes on the link: "Add Penang"', 'Rachel resent to Kelvin', 'Kelvin Tan (PIC) approved Kickoff on the link',
    ])
    expect(ok.stations.min.facts).toEqual([['Track ID', 'MKT-CAR-2610-007'], ['Person', 'Rachel'], ['Handoff', 'Intake meeting'], ['Completed', '22 Oct'], ['Approval', '🔗 Kelvin']])
  })

  it('replays the trail record by record: the minutes, the link, back, again, approved', () => {
    const ok = productMap(page({ status: 'approved', linkSentAt: RESENT.at, picReply: { decision: 'approved', name: 'Kelvin Tan', at: APPROVED.at } },
      [CREATED, SENT, CHANGES, RESENT, APPROVED]))
    expect(ok.steps.map(s => `${s.at} [${s.edges.join(' ')}]`)).toEqual([
      'min [start>min]', 'pic [min>pic]', 'min [pic>min~back]', 'pic [min>pic]', 'work [pic>work]',
    ])
    expect([...replayAt(ok, 3).seen].sort()).toEqual(['min', 'pic', 'start'])
  })

  it('without the PIC’s sign-off: no gate — the minutes completed, the work next', () => {
    const m = productMap(page({ status: 'approved' }, [CREATED, ev('2026-10-21T02:00:00Z', 'Rachel', 'minutes completed', { reason: 'Kickoff' })],
      { minutes: { status: 'completed', completedAt: '2026-10-21T02:00:00Z', template: { id: 't1', version: 1, name: 'Kickoff', fields: [], rules: { sign: true, pic: false } } } }))
    expect(m.lanes.map(l => l.name)).toEqual(['MARKETING MANAGER'])
    expect(m.nodes.map(n => n.id)).toEqual(['start', 'min', 'work'])
    expect(lines(m)).toEqual(['start>min solid', 'min>work solid'])
    expect(m.steps.map(s => s.edges.join(' '))).toEqual(['start>min', 'min>work'])
    expect(m.stations.min.facts[4]).toEqual(['Approval', '— No PIC sign-off'])
  })

  it('started before the PIC approved: the line round the gate, dashed and said so', () => {
    const override = { by: 'Rachel', at: '2026-10-22T01:00:00Z', reason: 'Launch is Monday' }
    const m = productMap(page({ status: 'active', linkSentAt: SENT.at, override }, [CREATED, SENT, ev(override.at, 'Rachel', 'started before approval', { reason: 'Launch is Monday' }), STARTED],
      { deliverables: [D('d1', 1)] }))
    expect(rows(m)[2]).toBe('pic appr@2 draft · Kelvin approves the minutes · Kelvin ·  | PIC via link | Started before approval')
    expect(lines(m).slice(0, 3)).toEqual(['start>min solid', 'min>pic solid', 'pic>work dashed "started before approval"'])
  })
})

describe('a product project’s map — its work', () => {
  const started = (more: Record<string, unknown> = {}, deliverables = [D('d1', 1), D('d2', 2, { status: 'planning', stage: null, dueOn: null })]) =>
    productMap(page({ status: 'active', linkSentAt: SENT.at, picReply: { decision: 'approved', name: 'Kelvin Tan', at: APPROVED.at }, ...more },
      [CREATED, SENT, APPROVED, STARTED], { deliverables }))

  it('its deliverables in a lane of their own, a line down to each, each opening its own page', () => {
    const m = started()
    expect(m.lanes.map(l => `${l.id} ${l.emoji} ${l.name}`)).toEqual(['appr 🛡️ Approvals', 'MARKETING MANAGER 🛡️ MARKETING MANAGER', `${DELIV_LANE} 📦 Deliverables`])
    expect(rows(m).slice(3)).toEqual([
      'work MARKETING MANAGER@3 done · Work started by Rachel · Rachel · 23 Oct | Plan assignments | 2 deliverables',
      `dd1 ${DELIV_LANE}@4 waiting · MKT-CAR-2610-007-D01 · Image post 1/2 · Siti · Due 27 Oct · Deliverable | Image post · Standard | Stage 1 of 2 · Design · Siti`,
      `dd2 ${DELIV_LANE}@5 draft · MKT-CAR-2610-007-D02 · Image post 2/2 · — ·  · Deliverable | Image post · Standard | Not planned`,
    ])
    expect(m.edges.filter(e => e.from === 'work' && e.to.startsWith('d')).map(e => `${e.key} ${e.kind} ${e.drop}`)).toEqual(['work>dd1 solid true', 'work>dd2 solid true'])
    expect(m.stations.dd1).toEqual({
      facts: [['Track ID', 'MKT-CAR-2610-007-D01'], ['Person', 'Siti'], ['Handoff', 'Image post · Standard'], ['Deadline', '27 Oct'], ['Stage', '1 of 2 · Design']],
      files: [], versions: [], audit: [], open: { href: '/marketing/projects/MKT-CAR-2610-007-D01', label: 'Open MKT-CAR-2610-007-D01' },
    })
    expect(m.steps.at(-1)).toMatchObject({ at: 'work', edges: ['work>dd1', 'work>dd2'] })
    expect(mapRows(m).map(r => r.no)).toEqual(['01', '02', '03', '04', '05', '06'])
  })

  it('one not planned yet has no stage under way (the walk: its first stage read as one)', () => {
    expect(started({}, [D('d1', 1, { status: 'planning' })]).stations.dd1.facts[4]).toEqual(['Stage', '—'])
  })

  it('a recurring project: its line says its months, its latest month’s deliverables drawn', () => {
    const m = started({ runs: { day: 5, first: '2026-10-01', made: 2, until: null } }, [
      D('d1', 1, { deliv: { group: 'Graphic design', item: 'Image post', n: 1, of: 1, run: 1 }, status: 'done', doneAt: '2026-10-25T03:00:00Z', stage: null }),
      D('d2', 1, { trackId: 'MKT-CAR-2610-007-D02', deliv: { group: 'Graphic design', item: 'Image post', n: 1, of: 1, run: 2 } }),
    ])
    expect(m.nodes.map(n => n.id)).toEqual(['start', 'min', 'pic', 'work', 'dd2'])
    expect(m.nodes[3].status).toBe('Every month on the 5th · next 5 Dec 2026')
  })

  it('a recurring project’s Replay: the latest month’s line made by its own run, not by the first month’s start (a review’s find)', () => {
    const p = page({ status: 'active', linkSentAt: SENT.at, picReply: { decision: 'approved', name: 'Kelvin Tan', at: APPROVED.at },
      runs: { day: 5, first: '2026-10-01', made: 2, until: null } }, [CREATED, SENT, APPROVED], { deliverables: [
      D('d2', 1, { trackId: 'MKT-CAR-2610-007-D02', deliv: { group: 'Graphic design', item: 'Image post', n: 1, of: 1, run: 2 } }),
    ] })
    const m = productMap(p, [CREATED, SENT, APPROVED, STARTED, ev('2026-11-05T01:00:00Z', 'Someone', 'run made', { data: { run: 2, month: '2026-11', made: 1 } })])
    expect(m.steps.slice(-2).map(s => `${s.text} [${s.edges.join(' ')}]`)).toEqual([
      'Rachel started the work · 2 deliverables []', "Nov 2026's work made · 1 deliverable [work>dd2]",
    ])
  })

  it('with both PICs signing off, one in: the gate says whom it still waits for (a review’s find)', () => {
    const m = productMap(page({ status: 'waiting_pic', linkSentAt: SENT.at, pic2: 'Mary', picOk: { sent: 1, 1: { name: 'Kelvin Tan', at: '2026-10-21T05:00:00Z' } } },
      [CREATED, SENT, ev('2026-10-21T05:00:00Z', 'Kelvin Tan (PIC)', 'pic approved', { reason: 'Kickoff', data: { waiting: 'Mary' } })],
      { minutes: { template: { id: 't1', version: 1, name: 'Kickoff', fields: [], rules: { sign: true, pic: true, picAll: true } } } }))
    expect(m.nodes.find(n => n.id === 'pic')).toMatchObject({ person: 'Kelvin and Mary', full: 'Kelvin and Mary approves the minutes', status: 'Kelvin Tan approved · waiting for Mary' })
    expect(m.steps.at(-1)).toMatchObject({ at: 'pic', edges: [] })
  })

  it('opened from another project (④-4c): its station first', () => {
    const m = started({ source: { id: 'p0', trackId: 'TSK-CAR-2610-004', title: 'Banner for the fair', kind: 'quick', status: 'done', owner: 'Mei' } })
    expect(rows(m).slice(0, 2)).toEqual([
      'src MARKETING MANAGER@0 done · TSK-CAR-2610-004 · Banner for the fair · Mei ·  · Opened from | Quick task | Done',
      'start MARKETING MANAGER@1 done · Created by Rachel · Rachel · 20 Oct | Opened from TSK-CAR-2610-004 | Done',
    ])
    expect(m.edges[0]).toMatchObject({ key: 'src>start', kind: 'solid', label: null })
    expect(m.stations.src.open).toEqual({ href: '/marketing/projects/TSK-CAR-2610-004', label: 'Open TSK-CAR-2610-004' })
  })

  it('drawn from the formal log once read — every record, oldest first — and the project’s own records on Created', () => {
    const p = page({ status: 'approved', linkSentAt: SENT.at, picReply: { decision: 'approved', name: 'Kelvin Tan', at: APPROVED.at } }, [APPROVED])
    // The page's trail is its newest 40: here only the approval.
    expect(productMap(p).steps.length).toBe(1)
    const full = productMap(p, [CREATED, ev('2026-10-20T02:00:00Z', 'Rachel', 'amount set'), SENT, APPROVED])
    expect(full.steps.map(s => s.text)).toEqual([
      'Rachel started the project · Post pack v2', 'Rachel set the amount', 'Rachel sent the tracking link to Kelvin', 'Kelvin Tan (PIC) approved Kickoff on the link',
    ])
    expect(full.stations.start.audit.map(a => a.e)).toEqual(['Rachel started the project · Post pack v2', 'Rachel set the amount'])
  })
})
