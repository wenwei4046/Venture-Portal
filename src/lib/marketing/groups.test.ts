import { describe, expect, it } from 'vitest'
import { groupEmoji, groupLabel, groupOf, groupTone, isManagerTitle, rosterGroups, sameGroup } from './groups'

// 2026-10-24 — the user, asked what a stage's group is: "每个 title 就是一组". Marketing's groups are People's titles,
// written as People Management writes them; a colour and a glyph are read from a title's words, never a grouping.

describe('Marketing’s groups — People’s titles', () => {
  it('is a title, tidied: two spellings of one title are one group, two titles two', () => {
    expect(groupOf('  GRAPHIC   DESIGNER ')).toBe('GRAPHIC DESIGNER')
    expect(sameGroup('Graphic Designer', 'GRAPHIC  DESIGNER')).toBe(true)
    expect(sameGroup('GRAPHIC DESIGNER', 'SENIOR GRAPHIC DESIGNER')).toBe(false)
    expect(sameGroup('', '')).toBe(false) // none is nobody's group
    expect(groupLabel('')).toBe('—')
    expect(groupLabel(' VIDEOGRAPHER ')).toBe('VIDEOGRAPHER')
  })

  it('colours a title by its words', () => {
    expect([
      'MARKETING MANAGER', 'ASSISTANT MARKETING MANAGER', 'SENIOR VIDEOGRAPHER & VIDEO EDITOR', 'CONTENT CREATOR', 'GRAPHIC DESIGNER',
      'SOCIAL MEDIA SPECIALIST', 'VISUAL MERCHANDISER', 'EVENT EXECUTIVE', 'SENIOR MARKETING EXECUTIVE', 'TELEMARKETER', 'INTERN', '', null,
    ].map(groupTone)).toEqual(['manager', 'manager', 'content', 'content', 'design', 'social', 'brand', 'brand', 'ads', 'ads', 'none', 'none', 'none'])
    expect(['SENIOR VIDEOGRAPHER & VIDEO EDITOR', 'CONTENT CREATOR', 'GRAPHIC DESIGNER', 'TELEMARKETER', 'MARKETING MANAGER', null].map(groupEmoji))
      .toEqual(['🎬', '✍️', '🎨', '📞', '🛡️', '👤'])
  })

  it('knows Marketing’s managers — they alone approve a stage', () => {
    expect(isManagerTitle('Assistant Marketing Manager')).toBe(true)
    expect(isManagerTitle('SENIOR MARKETING EXECUTIVE')).toBe(false)
    expect(isManagerTitle(null)).toBe(false)
  })

  it('offers the roster’s titles once each, A → Z, the managers last', () => {
    expect(rosterGroups([
      { title: 'MARKETING MANAGER' }, { title: 'GRAPHIC DESIGNER' }, { title: 'graphic  designer' }, { title: null },
      { title: 'ASSISTANT MARKETING MANAGER' }, { title: 'CONTENT CREATOR' }, { title: '  ' },
    ])).toEqual(['CONTENT CREATOR', 'GRAPHIC DESIGNER', 'ASSISTANT MARKETING MANAGER', 'MARKETING MANAGER'])
  })
})
