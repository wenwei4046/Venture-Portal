// Lead View AI Agent improvement pack A, B, C (2026-11-19): the folder outline the agent reads, which files it reads
// (the same plan on the server and on AI Agent › Knowledge), and the Data Center's notes.
import { describe, expect, it } from 'vitest'
import type { DataFile } from './agent'
import type { FileQuestion } from './agent-memory'
import { agentFiles, folderPath, isNote, knowledgeOutline, noteFileName, noteProblem, NOTE_MAX, readPlan, type DataFolder } from './data-center'

const file = (id: string, over: Partial<DataFile> = {}): DataFile => ({
  id, brandId: 'b1', category: '', kind: 'file', name: `${id}.pdf`, path: `files/x/${id}.pdf`, url: null, mime: 'application/pdf', sizeBytes: 1000, ver: 1,
  validFrom: null, validUntil: null, status: 'active', updatedByName: '', updatedAt: '2026-11-19T02:00:00Z', usedBy: [], folderId: null, ...over,
})
const jpg = (id: string, over: Partial<DataFile> = {}) => file(id, { name: `${id}.jpg`, mime: 'image/jpeg', ...over })
const txt = (id: string, over: Partial<DataFile> = {}) => file(id, { name: `${id}.txt`, mime: 'text/plain', ...over })
const folder = (id: string, parentId: string | null, name: string, brandId: string | null = 'b1'): DataFolder => ({ id, brandId, parentId, name, color: null, updatedAt: '' })
// 2990s › sofa › chiller › push back, and sofa › sitter (empty), and Shared › showrooms.
const folders = [folder('sofa', null, 'sofa'), folder('chill', 'sofa', 'chiller'), folder('pb', 'chill', 'push back'), folder('sit', 'sofa', 'sitter'), folder('sh', null, 'showrooms', null)]

describe('folderPath', () => {
  it('names the folders from the top down, under the brand', () => {
    expect(folderPath({ folderId: 'pb', brandId: 'b1' }, folders)).toBe('sofa › chiller › push back')
    expect(folderPath({ folderId: null, brandId: 'b1' }, folders)).toBe('')
    expect(folderPath({ folderId: 'sh', brandId: null }, folders)).toBe('Shared › showrooms')
  })
})

describe('readPlan — which files the agent reads', () => {
  it('reads notes first, then PDFs, then pictures, six at most; says why the rest are not read', () => {
    const files = [jpg('p1'), jpg('p2'), file('cat'), jpg('p3'), txt('note'), jpg('p4'), jpg('p5'), jpg('p6')]
    const plan = readPlan(files)
    expect(plan.filter(p => p.state === 'read').map(p => p.file.id)).toEqual(['note', 'cat', 'p1', 'p2', 'p3', 'p4'])
    expect(plan.filter(p => p.state === 'over-limit').map(p => p.file.id)).toEqual(['p5', 'p6'])
  })
  it('keeps the 10 MB and 24 MB limits, and names what it cannot read', () => {
    const plan = readPlan([file('big', { sizeBytes: 11e6 }), file('a', { sizeBytes: 9e6 }), file('b', { sizeBytes: 9e6 }), file('c', { sizeBytes: 9e6 }), file('x', { name: 'x.xlsx', mime: 'application/vnd.ms-excel' }), file('l', { kind: 'link', url: 'https://a.my' })])
    const st = Object.fromEntries(plan.map(p => [p.file.id, p.state]))
    expect(st).toEqual({ big: 'too-big', a: 'read', b: 'read', c: 'over-limit', x: 'cannot-read', l: 'link' })
  })
  it('the screen and the server read the same picks the same way', () => {
    const files = [file('m1', { folderId: 'pb' }), file('m2', { folderId: 'pb', status: 'paused' }), file('old', { folderId: 'pb', validUntil: '2026-11-01' }), file('s', { folderId: 'sofa' })]
    const got = agentFiles([{ kind: 'folder', ref: 'pb', paused: false }], files, folders, '2026-11-19').map(f => f.id).sort()
    expect(got).toEqual(['m1', 's'])
    expect(agentFiles([{ kind: 'folder', ref: 'pb', paused: true }], files, folders, '2026-11-19')).toEqual([])
  })
})

describe('knowledgeOutline — the folders the agent sees', () => {
  const qs: FileQuestion[] = [
    { kind: 'folder', ref: 'chill', question: 'chiller?', instruction: 'Ask push back or slide out first.', custom: true },
    { kind: 'file', ref: 'm1', question: 'price?', instruction: 'Quote the promo price.', custom: true },
  ]
  const files = [file('m1', { name: 'Model A.pdf', folderId: 'pb', category: 'Products & prices' }), jpg('ph', { folderId: 'pb' }), file('s', { name: 'Sofa list.pdf', folderId: 'sofa' })]
  const out = knowledgeOutline([{ file: files[0], state: 'read' }, { file: files[1], state: 'read' }, { file: files[2], state: 'over-limit' }], folders, qs)
  it('lays the files out by folder path, with card id, category and how it was read', () => {
    expect(out).toContain('## sofa › chiller › push back')
    expect(out).toContain('- Model A.pdf (file-m1 · Products & prices · attached)')
    expect(out).toContain('- ph.jpg (file-ph · picture, attached)')
    expect(out).toContain('## sofa\n')
    expect(out).toContain('- Sofa list.pdf (file-s · NOT read this time')
  })
  it('puts a folder’s instruction under the folders below it and a file’s under the file', () => {
    expect(out).toMatch(/## sofa › chiller › push back\nHow to answer about this folder:\n {2}- When asked "chiller\?": Ask push back or slide out first\./)
    expect(out).toContain('- Model A.pdf (file-m1 · Products & prices · attached)\n  - When asked "price?": Quote the promo price.')
  })
  it('never shows an empty folder', () => {
    expect(out).not.toContain('sitter')
    expect(knowledgeOutline([], folders, qs)).toBe('')
  })
})

describe('notes', () => {
  it('names the file', () => {
    expect(noteFileName('  Chiller models  ')).toBe('Chiller models.txt')
    expect(noteFileName('a/b: c?')).toBe('a b c.txt')
    expect(noteFileName('Prices.md')).toBe('Prices.md')
  })
  it('knows a note from a CSV or a PDF', () => {
    expect(isNote(txt('n'))).toBe(true)
    expect(isNote(file('c', { name: 'c.csv', mime: 'text/plain' }))).toBe(false)
    expect(isNote(file('p'))).toBe(false)
  })
  it('asks for a name and words, and keeps to the limit', () => {
    expect(noteProblem('', 'x')).toMatch(/name/)
    expect(noteProblem('a', '  ')).toMatch(/Write/)
    expect(noteProblem('a', 'x'.repeat(NOTE_MAX))).toBe('')
    expect(noteProblem('a', 'x'.repeat(NOTE_MAX + 1))).toMatch(/20,000/)
  })
})
