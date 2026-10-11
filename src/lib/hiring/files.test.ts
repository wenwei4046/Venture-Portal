import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES, contentTypeOf, extLabel, fileRefusal, objectPath, previewKind, resumeOf, safeFileName, startingType } from './files'
import type { HiringFile } from './types'

// The private hiring-files bucket: PDF, Word and images up to 10 MB, each
// under its own folder.
describe('hiring files', () => {
  it('keeps a PDF, a Word document or an image up to 10 MB', () => {
    expect(fileRefusal({ name: 'Daniel_Lee_CV.pdf', size: 1000 })).toBeNull()
    expect(fileRefusal({ name: 'cv.DOCX', size: 1000 })).toBeNull()
    expect(fileRefusal({ name: 'scan.jpeg', size: MAX_FILE_BYTES })).toBeNull()
    expect(fileRefusal({ name: 'cv.zip', size: 1000 })).toBe('A file is a PDF, a Word document or an image.')
    expect(fileRefusal({ name: 'cv.pdf', size: MAX_FILE_BYTES + 1 })).toBe('That file is over 10 MB.')
    expect(fileRefusal({ name: 'cv.pdf', size: 0 })).toBe('Choose a file.')
  })

  it('names the type the bucket expects', () => {
    expect(contentTypeOf('a.pdf')).toBe('application/pdf')
    expect(contentTypeOf('a.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(contentTypeOf('a')).toBeNull()
  })

  it('a stored name is letters, digits, dot, dash and underscore, its extension kept', () => {
    expect(safeFileName('Résumé — Nur Iman (2026).PDF')).toMatch(/^[\w.-]+\.pdf$/)
    expect(safeFileName('Nur Iman (2026).pdf')).toBe('Nur_Iman_2026.pdf')
    expect(safeFileName('../../etc/passwd')).toBe('etc_passwd')
    expect(safeFileName('???.pdf')).toBe('file.pdf')
    expect(safeFileName('x'.repeat(300) + '.pdf')).toHaveLength(114)
  })

  it('a file goes under its own folder', () => {
    expect(objectPath('files', 'u1', 'Daniel Lee CV.pdf')).toBe('files/u1/Daniel_Lee_CV.pdf')
    expect(objectPath('resumes', 'c1', 'Daniel Lee CV.pdf')).toBe('resumes/c1/Daniel_Lee_CV.pdf')
    expect(objectPath('attachments', 'HR-001', 'org.png')).toBe('attachments/HR-001/org.png')
  })

  it('a PDF previews in a frame, an image as it is, Word not at all', () => {
    expect(['a.pdf', 'b.PNG', 'c.webp', 'd.docx', null].map(previewKind)).toEqual(['pdf', 'image', 'image', 'none', 'none'])
    expect([extLabel('a.docx'), extLabel('a.pdf'), extLabel(null)]).toEqual(['DOCX', 'PDF', '—'])
  })

  // Several files each, each with a type (mig 20261011160000).
  const file = (id: string, resume: boolean, addedAt: string): HiringFile => ({ id, typeId: resume ? 'r' : 'ic', type: resume ? 'Résumé' : 'IC', resume, name: id + '.pdf', addedAt, addedBy: 'Grace Lim' })
  const TYPES = [{ id: 'r', name: 'Résumé', builtin: 'resume' as const }, { id: 'ic', name: 'IC', builtin: null }]

  it('the résumé is the newest file of the Résumé type', () => {
    expect(resumeOf([file('ic', false, '2026-10-12T00:00:00Z'), file('old', true, '2026-10-01T00:00:00Z'), file('new', true, '2026-10-10T00:00:00Z')])?.id).toBe('new')
    expect(resumeOf([file('ic', false, '2026-10-12T00:00:00Z')])).toBeNull()
  })

  it('a chosen file starts as the Résumé while the record has none waiting or kept', () => {
    expect(startingType(TYPES, [], [])).toBe('r')
    expect(startingType(TYPES, [file('cv', true, '')], [])).toBe('')
    expect(startingType(TYPES, [file('ic', false, '')], [{ typeId: 'r' }])).toBe('')
    expect(startingType(TYPES, [file('ic', false, '')], [{ typeId: 'ic' }])).toBe('r')
    expect(startingType([{ id: 'ic', name: 'IC', builtin: null }], [], [])).toBe('')
  })
})
