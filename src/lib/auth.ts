import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User, UserRole } from '@/types'
import { VIEW_AS_COOKIE, VIEW_AS_PERSON_COOKIE, honouredViewAs, viewAsPersonId, type ViewSurface } from '@/lib/view-as'
import { can, type Permission } from '@/lib/permissions'
import { canSeePayrollPayouts } from '@/lib/roles'
import { actionsFromJson, actionsFromKeys, canDo, type FunctionKey } from '@/lib/permission-actions'
import { approvableTypes, canSeeApprovals } from '@/lib/approval-domains'
import { isSensitiveField, type Action, type Scope } from '@/lib/permission-matrix'
import { sensitiveFromKeys } from '@/lib/sensitive'
import { actionsOnPage, actionsOnPages, closedBoxes, opensPage, storedTabsFrom, userTabs, type PageRoute } from '@/lib/page-tabs'
import { reachFromJson } from '@/lib/sub-department-reach'

// Per-request dedup. Middleware, layout, and Server Actions all converge
// on getUser(); wrapping with React.cache() collapses the Supabase calls
// (JWT verification + users row + permissions) into one set per HTTP request.
// Keyed by surface, so a request reads the caller once for the surface it is
// answered on (the two never meet in one request).
const loadUser = cache(async (surface: ViewSurface): Promise<User | null> => {
  const supabase = await createClient()
  // Who is calling, from the JWT's own claims. `getClaims()` verifies the
  // token's signature locally against the project's cached public keys (the
  // tokens are ES256, asymmetric) where `getUser()` asked the auth server on
  // every request — three times per Server Action: the middleware, the action
  // and its render (2026-09-11). Everything about the PERSON is still read
  // fresh below, so a deactivated account or a changed title takes effect on
  // the next request exactly as before.
  const { data: verified } = await supabase.auth.getClaims()
  const authUserId = verified?.claims.sub
  if (!authUserId) return null

  // View-as mask (unified portal 2026-07-16): a Principal may flip the
  // app-layer role via the TopBar switcher. Every gate and role-driven UI
  // follows the masked role — since 2026-10-11 only the member app's Revenue
  // View masks; HR's and Finance's views are lenses (below). auth.uid() (RLS, audit authorship) stays the
  // Principal — which is why the masked permissions have to be looked up here
  // rather than taken from current_permissions(), whose answer is about the
  // real account. The cookie is read first so that lookup shares the round
  // trip below instead of being a third one behind it (2026-09-11); it is
  // honoured only for an account that holds `view_switch` (Ultimate full
  // access, 2026-10-08 — it was the Principal role) — and the Revenue View
  // only in the member app (lib/view-as.ts, 2026-09-27).
  const jar = await cookies()
  const viewAs = honouredViewAs(jar.get(VIEW_AS_COOKIE)?.value, surface)
  // View as a person (2026-10-11): on the portal only. Asked beside the rest —
  // the function refuses an account that may not switch views.
  const person = surface === 'portal' ? viewAsPersonId(jar.get(VIEW_AS_PERSON_COOKIE)?.value) : null

  const [{ data }, { data: perms }, { data: acts }, { data: fields }, { data: stored }, { data: reached }, masked, viewed] = await Promise.all([
    supabase.from('users').select('*').eq('id', authUserId).single(),
    // Resolved in the database because that is where the answer lives: an
    // explicit per-person row, then the holder's title, then their role's
    // defaults. RLS derives its scopes from the same set, so the page and its
    // queries cannot disagree.
    supabase.rpc('current_permissions'),
    // What they may DO and how far (2026-10-08, PR2): their template's cells,
    // or their keys as actions — lib/permission-actions.ts. postdates
    // database.types.ts.
    (supabase as unknown as { rpc: (fn: string) => PromiseLike<{ data: unknown }> }).rpc('current_actions'),
    // Which of salary amounts, NRIC / IC and bank accounts they may see
    // (2026-10-09, PR4) — the same answer the database's readers give.
    (supabase as unknown as { rpc: (fn: string) => PromiseLike<{ data: unknown }> }).rpc('current_sensitive_fields'),
    // Which tabs their template ticks, and their own boxes (2026-10-11, 8b) —
    // null without a template: then their cells and keys give their tabs.
    (supabase as unknown as { rpc: (fn: string) => PromiseLike<{ data: unknown }> }).rpc('current_tabs'),
    // Which of the Revenue Department's sub-departments they reach, area by area (2026-10-16) —
    // what they handle, every one when they handle none, their own ticks over it; the CRM asks the same.
    (supabase as unknown as { rpc: (fn: string) => PromiseLike<{ data: unknown }> }).rpc('my_sub_department_reach'),
    // Only the member app's Revenue View still borrows a role's keys; HR's and
    // Finance's views are lenses over the account's own (below).
    viewAs === 'revenue_member'
      ? supabase.from('role_default_permissions').select('permission_key').eq('role', viewAs)
      : null,
    // What the database answers AS that person: their keys, actions, sensitive
    // fields and tabs (view_as_person, mig 20261011050000).
    person
      ? (supabase as unknown as { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: unknown }> })
          .rpc('view_as_person', { p_user: person })
      : null,
  ])

  const row = data as (Omit<User, 'permissions'> | null)
  if (!row || !row.is_active) return null

  const user: User = {
    ...row,
    permissions: (perms as string[] | null) ?? [],
    actions: actionsFromJson(acts),
    sensitive: (Array.isArray(fields) ? fields : []).filter(isSensitiveField),
    // Not read (an error) → no sub-department at all: fail closed.
    reach: reachFromJson(reached),
  }
  user.tabs = userTabs(storedTabsFrom(stored), user.actions, user.permissions)
  user.closed = closedBoxes(storedTabsFrom(stored))
  // Switching views is its own permission since 2026-10-08: Ultimate full
  // access has it, Full access is everything else without it. Read off the
  // REAL account's keys — a masked session keeps it, so it can switch back.
  const canSwitchView = user.permissions.includes('view_switch')

  // Viewing as a person: the portal is theirs — their kind, department, keys,
  // actions, tabs and sensitive fields — and read-only (the server client
  // writes nothing while the cookie is set). The switcher stays, to stop.
  if (canSwitchView && viewed && !viewed.error && viewed.data) {
    const them = viewed.data as {
      id: string; name: string; email: string; role: UserRole; department_id: string | null
      permissions: string[] | null; actions: unknown; sensitive: string[] | null; tabs: unknown; reach?: unknown
    }
    const permissions = them.permissions ?? []
    const actions = actionsFromJson(them.actions)
    return {
      ...user,
      id: them.id,
      name: them.name,
      email: them.email,
      role: them.role,
      department_id: them.department_id ?? undefined,
      permissions,
      actions,
      sensitive: (them.sensitive ?? []).filter(isSensitiveField),
      tabs: userTabs(storedTabsFrom(them.tabs), actions, permissions),
      closed: closedBoxes(storedTabsFrom(them.tabs)),
      reach: reachFromJson(them.reach),
      actualRole: user.role,
      canSwitchView,
      viewingAs: { id: them.id, name: them.name },
    }
  }

  // HR's and Finance's views are LENSES (2026-10-11, the user: "switch view is
  // still can be edit, full access means = ultimate access"): that view's
  // shell, sidebar and Overview over the account's own keys, actions, tabs and
  // sensitive fields — it edits as it does in its own view. To see the portal
  // exactly as somebody else does is View as a person, read-only.
  if (canSwitchView && (viewAs === 'hr' || viewAs === 'finance' || viewAs === 'marketing')) {
    return { ...user, role: viewAs, actualRole: user.role, canSwitchView, lens: viewAs }
  }

  if (canSwitchView && viewAs && masked) {
    const maskedKeys = (masked.data ?? []).map(r => (r as { permission_key: string }).permission_key)
    const maskedActions = actionsFromKeys(maskedKeys)
    return {
      ...user,
      role: viewAs,
      actualRole: user.role,
      canSwitchView,
      permissions: maskedKeys,
      actions: maskedActions,
      tabs: userTabs(null, maskedActions, maskedKeys),
      closed: [],
      // The page masks as the viewed role would see it; the database still
      // answers for the real account, so lib/private-fields.ts masks again.
      sensitive: sensitiveFromKeys(maskedKeys, viewAs),
    }
  }

  return { ...user, canSwitchView }
})

/** The caller, anywhere but the member app: the portal, `/`, print pages. */
export function getUser(): Promise<User | null> {
  return loadUser('portal')
}

/**
 * The caller as the member app sees them — the one surface where a Principal's
 * Revenue View applies. Everything under `(member)` and `lib/member` asks here.
 */
export function getMemberUser(): Promise<User | null> {
  return loadUser('member')
}

/**
 * The account as it is — no view mask, whatever the portal was left in. Only
 * the Product List asks (lib/member/product-access.ts): the Revenue app shows a
 * Principal as the Principal in every view, so an HR or Finance view left on in
 * the portal must not quietly take the Product List away there (2026-10-08).
 */
export function getAccountUser(): Promise<User | null> {
  return loadUser('account')
}

export async function requireAuth(): Promise<User> {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }
  return user
}

/**
 * The gate every page and Server Action stands behind.
 *
 * Several keys means OR — a few surfaces are legitimately reachable from two
 * directions (the payroll bank-transfer file belongs to whoever runs payroll
 * and to whoever pays it out).
 *
 * Redirects rather than throws, so somebody who has simply lost a permission
 * lands on the dashboard instead of an error page.
 */
export async function requirePermission(...keys: Permission[]): Promise<User> {
  const user = await requireAuth()
  if (!can(user, ...keys)) {
    redirect('/dashboard')
  }
  return user
}

/**
 * The tab a page belongs to (2026-10-11, HR revamp 8b): View on any tab
 * lib/page-tabs.ts lists for the route. Asked ON TOP of the page's own gate —
 * a tab can close a page, never open one.
 */
export async function requirePage(route: PageRoute): Promise<User> {
  const user = await requireAuth()
  if (!opensPage(user.tabs, route)) {
    redirect('/dashboard')
  }
  // Its writes follow this page's own tabs' boxes (2026-10-11, the user: "yes
  // separate by tab"): the request's account is narrowed IN PLACE — getUser is
  // cached per request, so every canDo after this on the page (each button,
  // each form page's requireAction) asks the narrowed actions.
  if (user.closed?.length && !NARROWED.has(user)) {
    user.actions = actionsOnPage(user.actions ?? {}, user.closed, route)
    NARROWED.add(user)
  }
  return user
}

/** Accounts already narrowed to the page this request draws (requirePage). */
const NARROWED = new WeakSet<User>()

/**
 * The account a write acts as, on the page it belongs to (2026-10-11, the
 * user's answer C — "现在就做完整的"): narrowed to that page's tabs' boxes
 * (`actionsOnPage`). The page is NAMED IN CODE at every gate, never read off
 * the request: a Referer is whatever the sender writes, so a hand-made request
 * once chose the page it was narrowed by. A form page already narrowed by
 * requirePage keeps it. Only an account somebody unticked a box for is ever
 * narrowed.
 */
async function actingUser(pages: WritePages): Promise<User> {
  const user = await requireAuth()
  if (!user.closed?.length || NARROWED.has(user)) return user
  return { ...user, actions: actionsOnPages(user.actions ?? {}, user.closed, typeof pages === 'string' ? [pages] : pages) }
}

/**
 * The pages a write's buttons are on: one, or each page that offers it — then
 * it counts while any of them keeps it (`actionsOnPages`). Exactly the pages
 * whose screens use the action (write-pages.test.ts holds every gate to it).
 */
export type WritePages = PageRoute | readonly PageRoute[]

/**
 * The gate a WRITE stands behind (2026-10-08, PR2; its page since 2026-10-11):
 * the page it belongs to, and the action it is, at least this far —
 * `requireActionOn('/payments', 'treasury', 'create')`, `requireActionOn('/claims',
 * 'claims', 'approve', 'dept')`. Holding the
 * function's page (its module key) is part of it (canDo).
 *
 * Redirects like requirePermission: the button that calls it is not drawn for
 * somebody who may not, so reaching here without the action is a stale page or
 * a hand-made request, and the dashboard is the honest answer to either.
 */
export async function requireActionOn(page: WritePages, fn: FunctionKey, action: Action, scope: Scope = 'all'): Promise<User> {
  const user = await actingUser(page)
  if (!canDo(user, fn, action, scope)) {
    redirect('/dashboard')
  }
  return user
}

/**
 * requireActionOn answered instead of redirected (2026-10-15): the same
 * narrowing to the page's boxes, for a write that rides along with another
 * only when the account may — Attendance's Month close sends the month to
 * payroll only for an account holding HR Costing · Edit on Payroll.
 */
export async function mayActOn(page: WritePages, fn: FunctionKey, action: Action, scope: Scope = 'all'): Promise<boolean> {
  return canDo(await actingUser(page), fn, action, scope)
}

/** requireActionOn for a write reachable as either of two actions. Several pairs means OR. */
export async function requireAnyActionOn(page: WritePages, ...wants: Array<[FunctionKey, Action] | [FunctionKey, Action, Scope]>): Promise<User> {
  const user = await actingUser(page)
  if (!wants.some(([fn, action, scope]) => canDo(user, fn, action, scope ?? 'all'))) {
    redirect('/dashboard')
  }
  return user
}

/**
 * The approval queue's decisions (2026-10-09, PR2b): anybody whose Approve
 * reaches some kind of request — the queue's own, or a domain's (Treasury,
 * HR Costing, Director Salary; lib/approval-domains.ts). Each request is then
 * asked about on its own, as the database's approver_may() asks.
 */
export async function requireApproverOn(page: WritePages): Promise<User> {
  const user = await actingUser(page)
  if (approvableTypes(user).length === 0) {
    redirect('/dashboard')
  }
  return user
}

/** The approval queue's pages: whoever may see it (Approvals · View) or decide anything in it. */
export async function requireApprovalQueue(): Promise<User> {
  const user = await requireAuth()
  if (!canSeeApprovals(user)) {
    redirect('/dashboard')
  }
  return user
}

/**
 * requirePermission, for a surface that is about what one named person is
 * paid: Payroll Requests, the payroll bank file, the Invoice Pool. Treasury
 * reaches those only with Payroll payouts on top (2026-10-02 — see
 * canSeePayrollPayouts in lib/roles.ts).
 */
export async function requirePayrollPayouts(...keys: Permission[]): Promise<User> {
  const user = await requirePermission(...keys)
  if (!canSeePayrollPayouts(user)) {
    redirect('/dashboard')
  }
  return user
}

/** requireAnyActionOn, for a write about what one named person is paid (requirePayrollPayouts). */
export async function requirePayrollPayoutsActionOn(
  page: WritePages,
  ...wants: Array<[FunctionKey, Action] | [FunctionKey, Action, Scope]>
): Promise<User> {
  const user = await requireAnyActionOn(page, ...wants)
  if (!canSeePayrollPayouts(user)) {
    redirect('/dashboard')
  }
  return user
}
