// Marketing's groups (2026-10-24 — the user, asked what "跟 People 的 title 走" means: "每个 title 就是一组"): a stage, a
// map's lane, a filter and a colour belong to a People title of the Marketing department, written exactly as People
// Management writes it ("GRAPHIC DESIGNER", "SENIOR VIDEOGRAPHER & VIDEO EDITOR"). Marketing keeps no teams of its own
// (the Content / Social Media / Design / Ads / Brand of the handoff are gone). A title's colour and its glyph are read
// from its words — a look only, never a grouping: two titles are two groups, whatever their colour. Pure.

/** A colour (the `--mk-team-*` tokens in globals.css). */
export type MktTone = 'content' | 'social' | 'design' | 'ads' | 'brand' | 'manager' | 'none'
export const TONES: readonly MktTone[] = ['content', 'social', 'design', 'ads', 'brand', 'manager', 'none']

const norm = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

/** The same group: the same title, whatever its case or spacing. */
export const sameGroup = (a: string | null | undefined, b: string | null | undefined) => !!norm(a) && norm(a) === norm(b)

/** A group as it is written — the title, tidied — or '' for none. */
export const groupOf = (title: string | null | undefined) => (title ?? '').trim().replace(/\s+/g, ' ')

/** What a page calls a group: the title as People writes it; none → "—". */
export const groupLabel = (g: string | null | undefined) => groupOf(g) || '—'

/** A title's colour, by its words (the order matters: a SENIOR VIDEOGRAPHER is video before he is senior). */
export function groupTone(title: string | null | undefined): MktTone {
  const t = norm(title)
  if (!t) return 'none'
  if (t.includes('MARKETING MANAGER')) return 'manager'
  if (/VIDEO|CONTENT|PHOTO/.test(t)) return 'content'
  if (/GRAPHIC|DESIGN/.test(t)) return 'design'
  if (t.includes('SOCIAL')) return 'social'
  if (/VISUAL MERCHANDIS|EVENT|BRAND/.test(t)) return 'brand'
  if (/\bADS\b|MARKETING EXECUTIVE|TELEMARKET/.test(t)) return 'ads'
  return 'none'
}

/** A title's glyph on the map's lane, by its words. */
export function groupEmoji(title: string | null | undefined): string {
  const t = norm(title)
  if (!t) return '👤'
  if (t.includes('MARKETING MANAGER')) return '🛡️'
  if (/VIDEO|PHOTO/.test(t)) return '🎬'
  if (t.includes('CONTENT')) return '✍️'
  if (/GRAPHIC|DESIGN/.test(t)) return '🎨'
  if (t.includes('SOCIAL')) return '📣'
  if (/VISUAL MERCHANDIS|EVENT|BRAND/.test(t)) return '✨'
  if (t.includes('TELEMARKET')) return '📞'
  if (/\bADS\b|MARKETING EXECUTIVE/.test(t)) return '📈'
  return '👤'
}

/** Whether a title is one of Marketing's managers (MM / AMM — the user: only they approve stages). */
export const isManagerTitle = (title: string | null | undefined) => norm(title).includes('MARKETING MANAGER')

/** The groups a builder offers: the roster's titles, each once — the managers' last — in People's words, A → Z. */
export function rosterGroups(team: readonly { title: string | null }[]): string[] {
  const seen = new Map<string, string>()
  for (const p of team) {
    const g = groupOf(p.title)
    if (g && !seen.has(norm(g))) seen.set(norm(g), g)
  }
  return [...seen.values()].sort((a, b) => Number(isManagerTitle(a)) - Number(isManagerTitle(b)) || a.localeCompare(b))
}

/** The tint behind somebody's initial, or a group's chip: its tone's ground. */
export const toneBg = (t: MktTone) => `var(--mk-team-${t}-bg)`
