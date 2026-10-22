// Whom the builders' pickers offer (lib/marketing/tasks.ts › builderPeople) and the tint behind each one's initial.

export interface BuilderPerson {
  id: string
  first: string
  /** "Social Media · 2 active" */
  hint: string
  team: string | null
}

export const TEAM_BG: Record<string, string> = {
  manager: 'var(--mk-team-manager-bg)', content: 'var(--mk-team-content-bg)', social: 'var(--mk-team-social-bg)',
  design: 'var(--mk-team-design-bg)', ads: 'var(--mk-team-ads-bg)', brand: 'var(--mk-team-brand-bg)',
}
