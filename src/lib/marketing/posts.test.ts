import { describe, expect, it } from 'vitest'
import { taskFromRow, type MktTaskPage } from './task'
import { linkPlace, postLinkOk, taskPosts } from './posts'

// 2026-10-24 — ④-2c: a task's posts (the user's answer 15) — each Post day its stages hold once filled, where it stands,
// and whether the viewer marks it: its owner (the task's, the stage's) or the manager. The database's side is
// tests/member-sql/validate-marketing-task-dates.mjs.

const MEI = 's-mei'
const ALI = 's-ali'
function page(me: string | null, status = 'active', posted: Record<string, unknown> = {}): MktTaskPage {
  return taskFromRow({
    today: '2026-11-08',
    me,
    team: [],
    sub: null,
    project: { id: 'p1', trackId: 'MKT-CAR-2611-001-D01', kind: 'deliverable', sub: 'sub', title: 'Image post 1/1', status, owner: MEI, cur: 0, free: [], posted },
    stages: [
      { project: 'p1', idx: 0, name: 'Schedule', dept: 'SOCIAL MEDIA SPECIALIST', owner: ALI, sla: 2, appr: [], status: 'accepted',
        spec: { form: [
          { label: 'Post day', type: 'Date', cal: { kind: 'post', pic: true } },
          { label: 'Reel day', type: 'Date', cal: { kind: 'post', pic: false } },
          { label: 'Shoot day', type: 'Date', cal: { kind: 'shoot', pic: false } },
          { label: 'Draft due', type: 'Date' },
        ] },
        work: { vals: { 'Post day': '2026-11-09', 'Reel day': '2026-11-05', 'Shoot day': '2026-11-02', 'Draft due': '2026-11-01' } } },
      { project: 'p1', idx: 1, name: 'Boost', dept: 'ADS', owner: MEI, sla: 1, appr: [], status: 'planned',
        spec: { form: [{ label: 'Post day', type: 'Date', cal: { kind: 'post', pic: true } }] }, work: { vals: {} } },
    ],
    subtasks: [],
    events: [],
    series: null,
    holidays: [],
  }) as MktTaskPage
}

describe('a task’s posts', () => {
  it('each Post day once filled — never a shoot day or a date off the calendar — by day, where it stands', () => {
    expect(taskPosts(page(ALI), false).map(p => [p.key, p.day, p.state.label, p.state.tone, p.mine])).toEqual([
      ['0:Reel day', '2026-11-05', 'Overdue', 'red', true],
      ['0:Post day', '2026-11-09', 'In production', 'waiting', true],
    ])
    expect(taskPosts(page(ALI, 'done'), false).map(p => p.state.label)).toEqual(['Scheduled', 'Scheduled'])
    const marked = taskPosts(page(ALI, 'done', { '0:Post day': { at: '2026-11-10T02:00:00Z', name: 'Ali', link: 'https://instagram.com/p/abc' } }), false)
    expect(marked.map(p => [p.key, p.state.label, p.posted?.link ?? null])).toEqual([
      ['0:Reel day', 'Scheduled', null], ['0:Post day', 'Posted', 'https://instagram.com/p/abc']])
  })

  it('marked by its owner — the task’s or the stage’s — or the manager; never by somebody else', () => {
    expect(taskPosts(page(MEI), false).every(p => p.mine)).toBe(true) // the task's owner
    expect(taskPosts(page('s-siti'), false).some(p => p.mine)).toBe(false)
    expect(taskPosts(page('s-siti'), true).every(p => p.mine)).toBe(true) // the manager
    expect(taskPosts(page(null), false).some(p => p.mine)).toBe(false)
  })

  it('reads a link as its place, and asks for an https one', () => {
    expect([linkPlace('https://www.instagram.com/p/abc/'), linkPlace('https://fb.com'), linkPlace('not a url')]).toEqual(['instagram.com/p/abc/', 'fb.com', 'not a url'])
    expect(['https://instagram.com/p/abc', ' http://x.my/1 ', 'instagram.com/p/abc', 'ftp://x', 'https://a b', `https://x.my/${'a'.repeat(500)}`].map(postLinkOk))
      .toEqual([true, true, false, false, false, false])
  })
})
