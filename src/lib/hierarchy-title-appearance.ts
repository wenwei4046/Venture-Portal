export type HierarchyTitleTone = 'leader' | 'assistant' | 'senior-specialist' | 'specialist' | 'head' | 'neutral'

export interface HierarchyTitleAppearance {
  label: string
  marker: string
  tone: HierarchyTitleTone
}

const knownTitles: Record<string, Pick<HierarchyTitleAppearance, 'marker' | 'tone'>> = {
  'senior team leader': { marker: 'STL', tone: 'leader' },
  'team leader': { marker: 'TL', tone: 'leader' },
  'senior team assistant': { marker: 'STA', tone: 'assistant' },
  'team assistant': { marker: 'TA', tone: 'assistant' },
  'senior revenue specialist': { marker: 'SRS', tone: 'senior-specialist' },
  'revenue specialist': { marker: 'RS', tone: 'specialist' },
}

/** The membership's title determines its label; pay rank and person never do. */
export function hierarchyTitleAppearance(titleName: string | null | undefined): HierarchyTitleAppearance {
  const label = titleName?.trim() || 'No title'
  if (!titleName?.trim()) return { label, marker: '—', tone: 'neutral' }

  const normalized = label.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  const known = knownTitles[normalized]
  if (known) return { label, ...known }

  const marker = normalized.split(' ').slice(0, 3).map(word => Array.from(word)[0]).join('').toUpperCase()
  const isHead = /^(?:head|(?:(?:managing|executive|regional|group|senior|assistant|associate) )?director)(?:\s|$)/.test(normalized)
  return { label, marker, tone: isHead ? 'head' : 'neutral' }
}
