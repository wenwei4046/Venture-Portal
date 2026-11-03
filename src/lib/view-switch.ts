// EVERY VIEW SWITCHER LISTS EVERY VIEW (2026-10-27 — the user, the Principal's top-bar menu beside the Revenue app's
// module menu (four rows) and Marketing's (no Lead View): "我要全部是跟 principal 那种的，它能够显示出来全部的东西 … 它有显示到
// 全部的 view 能够选，跟 module"). ONE list, in the Principal's order, read by every switcher of every face of the one
// app: the portal's bars (HR's, Finance's, the Principal's, Lead View's, the phone's), Marketing's, the Revenue app's
// and the CRM's module menus, and the phones' Switch view (the Revenue app's Profile, the HR app's More, the Finance
// app's Profile). Each draws it its own way — the portal's words in the portal, the apps' shorter names in the apps.
// Pure module — safe to import from client, server, and tests alike.

/** What a row opens: a view (setViewAs's `role`), or `person` — the View as a person… picker. */
export type SwitchTarget = 'principal' | 'finance' | 'hr' | 'marketing' | 'revenue_member' | 'lead' | 'person'

export interface SwitchRow {
  value: SwitchTarget
  /** The portal's words, in its bars' menus. */
  label: string
  /** The apps' words: the module menus and the phones' Switch view. */
  short: string
}

export const SWITCH_VIEWS: readonly SwitchRow[] = [
  { value: 'principal', label: 'Principal', short: 'Principal' },
  { value: 'finance', label: 'Finance view', short: 'Finance' },
  { value: 'hr', label: 'HR view', short: 'HR' },
  { value: 'marketing', label: 'Marketing view', short: 'Marketing' },
  { value: 'revenue_member', label: 'Revenue View', short: 'Revenue team' },
  // Lead View (2026-10-16): Customer Service's inbox — its own pages, not a mask.
  { value: 'lead', label: 'Lead View', short: 'Lead View' },
  { value: 'person', label: 'View as a person…', short: 'View as a person…' },
]

/** A view: any row but View as a person…. */
export type ViewTarget = Exclude<SwitchTarget, 'person'>

/**
 * The Revenue app's switchers — its module menu, the CRM's beside it, Profile's Switch view on a phone — list the views
 * alone: the app views a salesperson with its own View as a team member, and the portal's picker never lists one (the
 * user, 2026-10-27: "view as person, no need in revenue app add on, others can, cause revenue app can use view as team
 * member").
 */
export const REVENUE_APP_VIEWS = SWITCH_VIEWS.filter((v): v is SwitchRow & { value: ViewTarget } => v.value !== 'person')

/** The face of the one app a phone's Switch view is drawn in. */
export type PhoneFace = 'revenue' | 'hr' | 'finance'

/**
 * Where a row opens on a PHONE (lib/one-app.ts), as the phones' Switch view says it under the name: the Principal's
 * own view and Finance's are the Finance app (2026-10-17), HR's the HR app, the Revenue team the Revenue app;
 * Marketing and Lead View keep the portal's phone shell.
 */
export function phoneWhere(value: SwitchTarget, face: PhoneFace): string {
  switch (value) {
    case 'principal':
      return face === 'finance' ? 'This app, with Approvals' : 'The Finance app'
    case 'finance':
      return face === 'finance' ? 'This app' : 'The Finance app'
    case 'hr':
      return face === 'hr' ? 'This app' : 'The HR app'
    case 'revenue_member':
      return face === 'revenue' ? 'This app' : 'The Revenue app'
    case 'marketing':
    case 'lead':
      return 'The portal'
    case 'person':
      return 'Read-only'
  }
}
