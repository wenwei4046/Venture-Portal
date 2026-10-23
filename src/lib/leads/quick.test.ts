import { describe, expect, it } from 'vitest'
import { cleanShortcut, insertQuick, quickMatches, quickProblem, type QuickReply } from './quick'

const rows: QuickReply[] = [
  { id: '1', brandId: null, shortcut: '/instal', body: '0% for 12 months.', used: 42 },
  { id: '2', brandId: 'b1', shortcut: '/kl', body: 'Our KL showroom.', used: 3 },
  { id: '3', brandId: 'b2', shortcut: '/kl', body: 'Carress KL.', used: 9 },
  { id: '4', brandId: 'b1', shortcut: '/info', body: 'Brand info.', used: 1 },
]

describe('quick replies', () => {
  it('checks the list the way the database does', () => {
    expect(quickProblem(rows)).toBeNull()
    expect(quickProblem([{ brandId: null, shortcut: 'instal', body: 'x' }])).toMatch(/shortcut like/)
    expect(quickProblem([{ brandId: null, shortcut: '/a', body: '  ' }])).toMatch(/shortcut like/)
    expect(quickProblem([{ brandId: 'b1', shortcut: '/a', body: 'x' }, { brandId: 'b1', shortcut: '/a', body: 'y' }])).toMatch(/same shortcut/)
    expect(quickProblem([{ brandId: 'b1', shortcut: '/a', body: 'x' }, { brandId: null, shortcut: '/a', body: 'y' }])).toBeNull()
  })

  it('keeps a shortcut tidy', () => {
    expect(cleanShortcut('Instal ')).toBe('/instal')
    expect(cleanShortcut('/KL-2!')).toBe('/kl-2')
  })

  it('matches the word being typed, the brand’s own first', () => {
    expect(quickMatches('hello', rows, 'b1')).toBeNull()
    expect(quickMatches('see /', rows, 'b1')?.matches.map(r => r.id)).toEqual(['2', '4', '1'])
    expect(quickMatches('/k', rows, 'b2')?.matches.map(r => r.id)).toEqual(['3'])
    expect(quickMatches('a/k', rows, 'b1')).toBeNull()
  })

  it('swaps the typed word for the text', () => {
    expect(insertQuick('Sure! /ins', '/ins', '0% for 12 months.')).toBe('Sure! 0% for 12 months.')
  })
})
