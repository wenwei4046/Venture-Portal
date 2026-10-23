// Whom the builders' pickers offer (lib/marketing/tasks.ts › builderPeople) and the tint behind each one's initial — the
// colour of their group, a People title (lib/marketing/groups.ts, 2026-10-24).

import { groupTone, type MktTone } from '@/lib/marketing/groups'
import type { PickPerson } from '@/lib/marketing/tasks'

export type BuilderPerson = PickPerson

export const TONE_BG: Record<MktTone, string> = {
  manager: 'var(--mk-team-manager-bg)', content: 'var(--mk-team-content-bg)', social: 'var(--mk-team-social-bg)',
  design: 'var(--mk-team-design-bg)', ads: 'var(--mk-team-ads-bg)', brand: 'var(--mk-team-brand-bg)', none: 'var(--mk-team-none-bg)',
}

/** The tint behind somebody's initial: their group's. */
export const personBg = (p: { group: string } | undefined) => TONE_BG[groupTone(p?.group)]
