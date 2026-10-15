import { describe, expect, it } from 'vitest'
import { previewOf, remindWords } from './files'

describe('a file as the side panel shows it', () => {
  it('a PDF and the pictures every browser draws; the rest is a download', () => {
    expect(previewOf('MC 2 Nov.PDF')).toBe('pdf')
    expect(['a.jpg', 'b.JPEG', 'c.png', 'd.webp', 'e.gif'].map(previewOf)).toEqual(['image', 'image', 'image', 'image', 'image'])
    expect(['f.heic', 'g.docx', 'noext', ''].map(previewOf)).toEqual(['none', 'none', 'none', 'none'])
  })
})

describe('Remind all’s toast (2026-10-15)', () => {
  it('the prototype’s words when everyone not in gets it', () => {
    expect(remindWords({ sent: 3, noLogin: 0, noPhone: 0, recent: 0, asked: 3 })).toBe('Reminder sent to everyone not in')
  })

  it('names who could not get one — no login, or no phone signed up — and who was just reminded', () => {
    expect(remindWords({ sent: 2, noLogin: 1, noPhone: 1, recent: 0, asked: 3 })).toBe('Reminder sent to 1 · 2 can’t get one yet — no app notifications')
    expect(remindWords({ sent: 0, noLogin: 0, noPhone: 0, recent: 2, asked: 2 })).toBe('2 reminded a moment ago')
    expect(remindWords({ sent: 0, noLogin: 4, noPhone: 0, recent: 0, asked: 4 })).toBe('4 can’t get one yet — no app notifications')
  })

  it('nobody left to remind', () => {
    expect(remindWords({ sent: 0, noLogin: 0, noPhone: 0, recent: 0, asked: 0 })).toBe('Everyone is in now')
  })
})
