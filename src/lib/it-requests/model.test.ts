import { describe, expect, it } from 'vitest'
import {
  deviceLabel, fileSize, fileTag, isImage, itDay, itWhen, itContentType, itFileRefusal, itObjectPath, itRequestFromRow, itRequestsFromRow,
  noteProblem, submitProblem,
} from './model'

// IT support (2026-10-20): what a request is as the app reads it, and what the app refuses before sending — the
// database's own words and limits (mig 20261021020100, tests/member-sql/validate-it-requests.mjs).

const ROW = {
  id: 'r1', ref: 'IT-0001', category: 'bug', title: 'Quote page freezes', details: 'Tap + twice', status: 'in_progress', app: 'revenue',
  device: 'iPhone · iOS 18.1 · Safari', createdAt: '2026-10-20T14:00:00Z', updatedAt: '2026-10-20T15:00:00Z', statusAt: '2026-10-20T15:00:00Z',
  statusByName: 'PETER', senderName: 'CHEA HUAN', senderTitle: 'Team Leader', mine: true,
  files: [{ id: 'f1', noteId: null, name: 'shot.png', contentType: 'image/png', size: 1234, at: '2026-10-20T14:00:00Z' }, { bad: true }],
  notes: [{ id: 'n1', side: 'it', authorName: 'PETER', body: 'Looking', statusFrom: 'new', statusTo: 'in_progress', at: '2026-10-20T15:00:00Z', mine: false }],
}

describe('reading requests', () => {
  it('reads one as the database answers it', () => {
    const r = itRequestFromRow(ROW)!
    expect([r.ref, r.category, r.status, r.senderName, r.senderTitle, r.mine, r.statusByName]).toEqual(['IT-0001', 'bug', 'in_progress', 'CHEA HUAN', 'Team Leader', true, 'PETER'])
    expect(r.files).toEqual([{ id: 'f1', noteId: null, name: 'shot.png', contentType: 'image/png', size: 1234, at: '2026-10-20T14:00:00Z' }])
    expect(r.notes[0]).toMatchObject({ side: 'it', statusFrom: 'new', statusTo: 'in_progress', mine: false })
  })

  it('drops what it cannot read', () => {
    expect(itRequestFromRow({ ...ROW, status: 'done' })).toBeNull()
    expect(itRequestFromRow({ ...ROW, category: 'question' })).toBeNull()
    expect(itRequestsFromRow([ROW, null, 'x', { ...ROW, id: '' }]).map(r => r.id)).toEqual(['r1'])
    expect(itRequestsFromRow(null)).toEqual([])
  })
})

describe('what is refused before it is sent', () => {
  it('a request: a category, a title of 120, details of 5,000, ten files', () => {
    const ok = { category: 'bug', title: 'Broken', details: '', files: 0 }
    expect(submitProblem(ok)).toBeNull()
    expect(submitProblem({ ...ok, category: 'x' })).toMatch(/bug, a new feature or a suggestion/)
    expect(submitProblem({ ...ok, title: '   ' })).toBe('Add a title.')
    expect(submitProblem({ ...ok, title: 'x'.repeat(121) })).toMatch(/120 characters/)
    expect(submitProblem({ ...ok, title: ` ${'x'.repeat(120)} ` })).toBeNull()
    expect(submitProblem({ ...ok, details: 'y'.repeat(5001) })).toMatch(/5,000/)
    expect(submitProblem({ ...ok, files: 11 })).toMatch(/up to 10 files/)
  })

  it('a note: words, a file or a new status — the same status moves nothing', () => {
    expect(noteProblem({ body: ' ', files: 0, status: null, current: 'new' })).toMatch(/Write a note/)
    expect(noteProblem({ body: '', files: 0, status: 'new', current: 'new' })).toMatch(/Write a note/)
    expect(noteProblem({ body: '', files: 0, status: 'fixed', current: 'new' })).toBeNull()
    expect(noteProblem({ body: '', files: 1, status: null, current: 'new' })).toBeNull()
    expect(noteProblem({ body: 'z'.repeat(3001), files: 0, status: null, current: 'new' })).toMatch(/3,000/)
  })
})

describe('files', () => {
  it('goes up as the bucket takes it: the browser’s type, else its name’s', () => {
    expect(itContentType('shot.png', 'image/png')).toBe('image/png')
    expect(itContentType('IMG_0001.HEIC', '')).toBe('image/heic')
    expect(itContentType('logs.zip', 'application/x-zip-compressed')).toBe('application/x-zip-compressed')
    expect(itContentType('backup.7z', '')).toBe('application/x-7z-compressed')
    expect(itContentType('notes.txt', 'text/plain;charset=utf-8')).toBe('text/plain')
    expect(itContentType('virus.exe', 'application/x-msdownload')).toBeNull()
    expect(itContentType('page.html', 'text/html')).toBeNull()
  })

  it('refuses what the bucket would, in words', () => {
    expect(itFileRefusal({ name: 'a.png', size: 10, type: 'image/png' })).toBeNull()
    expect(itFileRefusal({ name: 'a.exe', size: 10, type: '' })).toMatch(/a picture, a video/)
    expect(itFileRefusal({ name: 'a.png', size: 0, type: 'image/png' })).toMatch(/empty/)
    expect(itFileRefusal({ name: 'recording.mp4', size: 2 * 1024 * 1024 * 1024, type: 'video/mp4' })).toBeNull()
    expect(itFileRefusal({ name: 'big.mp4', size: 2 * 1024 * 1024 * 1024 + 1, type: 'video/mp4' })).toMatch(/over 2 GB/)
  })

  it('is kept in the uploader’s own folder under a safe name', () => {
    expect(itObjectPath('u1', 'Screen Shot 2026-10-20 at 10.00.png', 'k1')).toBe('u1/k1/Screen_Shot_2026-10-20_at_10.00.png')
    expect(itObjectPath('u1', '../../etc/passwd', 'k2')).toBe('u1/k2/etc_passwd')
    expect(itObjectPath('u1', '截图.png', 'k3')).toBe('u1/k3/png')
  })

  it('reads as a tile and a size', () => {
    expect([fileTag('shot.png', null), fileTag('x', 'application/pdf'), fileSize(900), fileSize(3.4 * 1024 * 1024), fileSize(null)])
      .toEqual(['PNG', 'PDF', '1 KB', '3.4 MB', ''])
    expect([isImage('image/png'), isImage('image/heic'), isImage('application/pdf')]).toEqual([true, false, false])
  })
})

describe('when', () => {
  it('reads a moment on the office’s calendar (UTC+8), not the machine’s', () => {
    expect(itDay('2026-10-20T17:30:00Z')).toBe('21 Oct')
    expect(itWhen('2026-10-20T06:32:00Z')).toBe('20 Oct · 14:32')
    expect(itDay('')).toBe('')
  })
})

describe('the device it was sent from', () => {
  it('says the phone, its system, the browser, the app and the screen', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
    expect(deviceLabel(iphone, { standalone: true, width: 390, height: 844 })).toBe('iPhone · iOS 18.1 · Safari · app · 390×844')
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
    expect(deviceLabel(android)).toBe('Android 14 · Chrome')
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0'))
      .toBe('Windows · Edge')
    expect(deviceLabel('')).toBe('Unknown device')
  })
})
