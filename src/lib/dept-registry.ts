// Dynamic full-department registry (2026-08-24, Phase 2 of "手动加部门 +
// 功能自动链接"). departments now carries segment_key / pool_gl_code /
// billing_mode_key (mig 20260824020000). The five CORE departments stay on
// their hardcoded maps everywhere (zero behavioural drift, including the
// Director→director_office name quirk); this registry supplies the EXTRA
// full departments so every consumer — billing modes, settle pools, report
// segment rails, the inter-billing bridge — learns a newly provisioned
// department without a code change.

export interface DeptRegistryRow {
  id: string
  name: string
  segmentKey: string | null
  poolGlCode: string | null
  billingModeKey: string | null
  isInternal: boolean
}

export const CORE_SEGMENT_KEYS = new Set([
  'marketing',
  'hr',
  'finance',
  'director_office',
  'director',
  'corporate',
  'treasury',
  'unallocated',
])

type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function fetchDeptRegistry(supabase: Db): Promise<DeptRegistryRow[]> {
  const { data } = await supabase
    .from('departments')
    .select('id, name, segment_key, pool_gl_code, billing_mode_key, is_internal')
    .order('created_at')
  return ((data ?? []) as Array<{
    id: string
    name: string
    segment_key: string | null
    pool_gl_code: string | null
    billing_mode_key: string | null
    is_internal: boolean
  }>).map((d) => ({
    id: d.id,
    name: d.name,
    segmentKey: d.segment_key,
    poolGlCode: d.pool_gl_code,
    billingModeKey: d.billing_mode_key,
    isInternal: Boolean(d.is_internal),
  }))
}

/** Full departments BEYOND the five cores — the rows every hardcoded map
 *  needs appended. */
export function extraFullDepts(registry: DeptRegistryRow[]): DeptRegistryRow[] {
  return registry.filter(
    (d) =>
      !d.isInternal &&
      d.segmentKey !== null &&
      !CORE_SEGMENT_KEYS.has(d.segmentKey) &&
      d.billingModeKey !== null,
  )
}

/** billing_mode → gl_segment for the extra departments. */
export function extraBillingModeToSegment(registry: DeptRegistryRow[]): Record<string, string> {
  return Object.fromEntries(
    extraFullDepts(registry).map((d) => [d.billingModeKey as string, d.segmentKey as string]),
  )
}

/** gl_segment → dept_pools pool key ('dept_pool_<segment>') for the extras. */
export function extraSegmentToPool(registry: DeptRegistryRow[]): Record<string, string> {
  return Object.fromEntries(
    extraFullDepts(registry).map((d) => [d.segmentKey as string, `dept_pool_${d.segmentKey}`]),
  )
}

/** billing_mode → pool key for the extras (settle attribution). */
export function extraBillingModeToPool(registry: DeptRegistryRow[]): Record<string, string> {
  return Object.fromEntries(
    extraFullDepts(registry).map((d) => [d.billingModeKey as string, `dept_pool_${d.segmentKey}`]),
  )
}

/** dept NAME → segment for the extras (bridge / payroll tagging). */
export function extraDeptNameToSegment(registry: DeptRegistryRow[]): Record<string, string> {
  return Object.fromEntries(
    extraFullDepts(registry).map((d) => [d.name, d.segmentKey as string]),
  )
}

/** Report segment-rail options for the extras. */
export function extraReportSegments(
  registry: DeptRegistryRow[],
): Array<{ value: string; label: string; dot: string }> {
  return extraFullDepts(registry).map((d) => ({
    value: d.segmentKey as string,
    label: d.name,
    dot: 'bg-info',
  }))
}

/** Billing-mode dropdown options for the extras (invoice/CN modals). */
export function extraBillingModeOptions(
  registry: DeptRegistryRow[],
): Array<{ value: string; label: string }> {
  return extraFullDepts(registry).map((d) => ({
    value: d.billingModeKey as string,
    label: `${d.name} Pool`,
  }))
}

// ── Primed store ─────────────────────────────────────────────────────────────
// Deep pure helpers (segmentForBillingMode, invoicePoolForBillingMode,
// deptNameToSegment…) sit under call chains 30 layers away from a supabase
// client. Instead of threading a registry param through every layer, server
// entry points call primeDeptRegistryFromDb() once and the helpers consult
// this module store as their LAST fallback — cores stay hardcoded-first, an
// unprimed path simply behaves exactly as before (extras fold to Venture).

interface PrimedMaps {
  rows: DeptRegistryRow[]
  modeToSegment: Record<string, string>
  segmentToPool: Record<string, string>
  modeToPool: Record<string, string>
  nameToSegment: Record<string, string>
}

let PRIMED: PrimedMaps = { rows: [], modeToSegment: {}, segmentToPool: {}, modeToPool: {}, nameToSegment: {} }

export function primeDeptRegistry(registry: DeptRegistryRow[]): void {
  PRIMED = {
    rows: registry,
    modeToSegment: extraBillingModeToSegment(registry),
    segmentToPool: extraSegmentToPool(registry),
    modeToPool: extraBillingModeToPool(registry),
    nameToSegment: extraDeptNameToSegment(registry),
  }
}

/** Zero rows is never the truth — a department is never deleted
 *  (`departments_no_delete`) — it is a read RLS answered with nothing (no
 *  session: `departments_all_select` is `auth.uid() IS NOT NULL`) or one that
 *  failed. Priming it would hide every extra department from every request on
 *  the server until the next refresh, so it keeps the registry it has
 *  (2026-10-08: a sign-in landing on a due refresh took IT and Revenue
 *  Department off Dept Pool's bank breakdown — RM 254,269.80 for 507,330.16 —
 *  and left settle attribution folding them into Venture). */
export async function primeDeptRegistryFromDb(supabase: Db): Promise<DeptRegistryRow[]> {
  const registry = await fetchDeptRegistry(supabase)
  if (registry.length > 0) primeDeptRegistry(registry)
  return registry
}

export const primedModeToSegment = (): Record<string, string> => PRIMED.modeToSegment
export const primedSegmentToPool = (): Record<string, string> => PRIMED.segmentToPool
export const primedModeToPool = (): Record<string, string> => PRIMED.modeToPool
export const primedNameToSegment = (): Record<string, string> => PRIMED.nameToSegment
export const primedRegistryRows = (): DeptRegistryRow[] => PRIMED.rows
