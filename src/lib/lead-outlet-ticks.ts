/**
 * Lead View's outlets per person (2026-11-19 — the owner: "在people permission 做这个功能，去设置那个staff 能看到哪个outlet 的讯息，
 * 和他们的广告成效", then "好，照你建议的做"): in a person's permission window, under Lead View's rows, a pill per outlet grouped
 * by brand and *All outlets*. None ticked = every outlet (everybody, today); ticked = only those outlets' chats, leads,
 * Insight and showroom visits — and no chat that has no outlet. Lead View · Manage always sees every outlet. The database
 * decides (`lead_my_outlets()`, mig 20261119200000); this draws and sends the list (`user_lead_outlets`).
 */

export interface OutletChoice { id: string; name: string; brandId: string; brand: string }

/** `person_lead_outlets(p_user)`: every live outlet and the person's ticks. */
export interface PersonOutlets { outlets: OutletChoice[]; ticked: string[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The Lead View rows the pills sit under — the first of these whose View is ticked carries them. */
export const OUTLET_TABS = ['lead.inbox', 'lead.leads', 'lead.insight'] as const

export const OUTLET_HINT = 'Their Lead View shows only these outlets’ chats, leads, Insight and showroom visits. None ticked = every outlet.'

/** The answer → what the window draws (anything it does not know is dropped). */
export function personOutletsFromJson(json: unknown): PersonOutlets {
  const j = (json && typeof json === 'object' ? json : {}) as { outlets?: unknown; ticked?: unknown }
  const outlets = Array.isArray(j.outlets)
    ? j.outlets.filter((o): o is OutletChoice => !!o && typeof o === 'object' && UUID.test(String((o as OutletChoice).id)))
        .map(o => ({ id: o.id, name: String(o.name ?? ''), brandId: String(o.brandId ?? ''), brand: String(o.brand ?? '') }))
    : []
  const known = new Set(outlets.map(o => o.id))
  const ticked = Array.isArray(j.ticked) ? j.ticked.filter((x): x is string => typeof x === 'string' && known.has(x)) : []
  return { outlets, ticked: sortedIds(ticked) }
}

/** The outlets by brand, in the order the database gave them. */
export function byBrand(outlets: readonly OutletChoice[]): Array<{ brandId: string; brand: string; outlets: OutletChoice[] }> {
  const groups: Array<{ brandId: string; brand: string; outlets: OutletChoice[] }> = []
  for (const o of outlets) {
    const g = groups.find(x => x.brandId === o.brandId)
    if (g) g.outlets.push(o)
    else groups.push({ brandId: o.brandId, brand: o.brand, outlets: [o] })
  }
  return groups
}

/** A pill pressed: on → off, off → on. */
export function toggleOutlet(ticked: readonly string[], id: string): string[] {
  return sortedIds(ticked.includes(id) ? ticked.filter(x => x !== id) : [...ticked, id])
}

export function sortedIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

export function sameOutletTicks(a: readonly string[], b: readonly string[]): boolean {
  const x = sortedIds(a), y = sortedIds(b)
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** What a Server Action takes: distinct outlet ids, 200 at most. */
export function isOutletIdList(x: unknown): x is string[] {
  return Array.isArray(x) && x.length <= 200 && x.every(v => typeof v === 'string' && UUID.test(v)) && new Set(x).size === x.length
}

/** The words under the pills: what they see. */
export function outletScopeWords(p: PersonOutlets, ticked: readonly string[]): string {
  if (!ticked.length) return 'All outlets'
  const names = p.outlets.filter(o => ticked.includes(o.id)).map(o => o.name)
  return names.length ? `Only ${names.join(', ')}` : 'All outlets'
}
