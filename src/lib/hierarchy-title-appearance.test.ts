import { describe, expect, it } from 'vitest'
import { hierarchyTitleAppearance } from './hierarchy-title-appearance'

describe('hierarchy title appearance', () => {
  it('gives every revenue title a distinct readable marker, including senior titles', () => {
    const titles = ['Senior Team Leader', 'Team Leader', 'Senior Team Assistant', 'Team Assistant', 'Senior Revenue Specialist', 'Revenue Specialist']
    const appearances = titles.map(hierarchyTitleAppearance)
    expect(appearances.map(value => value.marker)).toEqual(['STL', 'TL', 'STA', 'TA', 'SRS', 'RS'])
    expect(appearances.map(value => value.label)).toEqual(titles)
    expect(appearances.map(value => value.tone)).toEqual(['leader', 'leader', 'assistant', 'assistant', 'senior-specialist', 'specialist'])
  })

  it('normalizes known title names for styling without rewriting the displayed title', () => {
    expect(hierarchyTitleAppearance('  TEAM_Leader  ')).toEqual({ label: 'TEAM_Leader', marker: 'TL', tone: 'leader' })
    expect(hierarchyTitleAppearance('Senior   Team-Assistant').marker).toBe('STA')
  })

  it('recognizes department heads and directors while keeping their actual title', () => {
    expect(hierarchyTitleAppearance('Head of IR')).toEqual({ label: 'Head of IR', marker: 'HOI', tone: 'head' })
    expect(hierarchyTitleAppearance('Managing Director')).toEqual({ label: 'Managing Director', marker: 'MD', tone: 'head' })
    expect(hierarchyTitleAppearance('Director').tone).toBe('head')
  })

  it('keeps an unfamiliar title readable and neutral instead of guessing its seniority', () => {
    expect(hierarchyTitleAppearance('Relationship Specialist')).toEqual({ label: 'Relationship Specialist', marker: 'RS', tone: 'neutral' })
    expect(hierarchyTitleAppearance('Assistant to the Director').tone).toBe('neutral')
    expect(hierarchyTitleAppearance('Technical Consultant, Revenue')).toEqual({ label: 'Technical Consultant, Revenue', marker: 'TCR', tone: 'neutral' })
  })

  it('shows an explicit no-title label for missing and blank titles', () => {
    for (const title of [null, undefined, '', '   ']) {
      expect(hierarchyTitleAppearance(title)).toEqual({ label: 'No title', marker: '—', tone: 'neutral' })
    }
  })
})
