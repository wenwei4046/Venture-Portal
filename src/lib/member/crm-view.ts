/**
 * The CRM held to the Revenue app's view (2026-11-23 — the owner, over the Fair view's Insight and Assignment showing The
 * Conts and Dream Crafter together: "IR 的 view 就只可以看到 IR，DC 就只可以看到 DC，同等的 fair 也只能看到 fair。现在全部绑在一起，
 * 我不要这样"; "assign 广告的时候也是跟着 view 走的"; "包括里面的 showroom、report、close deal 等等，全部都要 isolate 出来"):
 * a view IS a sub-department, and each CRM brand is one sub-department's (crm_brand_sub — The Conts' numbers and Page are
 * IR's, Dream Crafter's DC's; Fair has no number or Page yet, so its CRM is empty). Every screen reads what `inView` hands
 * it — the view's customers and all that hangs on them, its ads, its people — and none offers a brand to pick while a view
 * holds the CRM. Who may READ a brand at all is still the database's (crm_my_brands); this only narrows the screens.
 *
 * Its Management too (the owner: "Management 这边也不是统一的，IR 是 IR，DC 是 DC，包括 setting 等等都要分开"; mig
 * 20261124210000): given the view's sub-department, `inView` hands every screen that one's Settings › General and
 * appointment types, showrooms, forms, cold lead templates and booking link — Fair's own too, before it has a customer.
 */
import { virtualRoomId, type CrmData, type CrmPerson } from "./crm-data";
import { brandOf, type SourceBrand, type SourcePick } from "./crm-source";

/** The brands of the sub-department a view is: IR's The Conts, DC's Dream Crafter, any other (Fair) none. Null — no view. */
export function crmBrandsOfView(subCode: string | null | undefined): SourceBrand[] | null {
  const code = (subCode ?? "").trim().toUpperCase();
  if (!code) return null;
  if (code === "IR") return ["conts"];
  if (code === "DC") return ["dc"];
  return [];
}

/** The brands somebody holds, as the database read them (crm_people's `brands`); none read — no login — is IR's alone. */
export const brandsOfPerson = (p: Pick<CrmPerson, "brands">): SourceBrand[] => p.brands ?? ["conts"];

/** Whether somebody is one of the view's people (anybody, with no view). */
export const personInView = (d: Pick<CrmData, "view">, id: string | null | undefined): boolean => !d.view || (!!id && d.view.people.includes(id));

/** The people a list offers: the view's (everybody, with no view). Names still come from the whole list. */
export const peopleInView = (d: Pick<CrmData, "view" | "people">): CrmPerson[] => (d.view ? d.people.filter(p => d.view!.people.includes(p.id)) : d.people);

/** The teams as the view shows them: each with its people of the view; a team with none of them is not drawn. */
export function teamsInView<T extends { people: CrmPerson[] }>(d: Pick<CrmData, "view">, teams: T[]): T[] {
  if (!d.view) return teams;
  const ids = new Set(d.view.people);
  return teams.map(t => ({ ...t, people: t.people.filter(p => ids.has(p.id)) })).filter(t => t.people.length > 0);
}

/** A brand picked on a screen (Insight's, Assignment's, Reports' tabs) — none while the view holds the CRM to its own. */
export const pickedSource = <T extends string>(d: Pick<CrmData, "view">, pick: T | null | undefined): T | undefined => (d.view ? undefined : pick ?? undefined);

/** Whether a source pick (Ads performance's, Workspace's) is the view's: "All sources", or a channel of one of its brands. */
export function sourcePickInView(d: Pick<CrmData, "view">, pick: SourcePick): boolean {
  if (!d.view) return true;
  if (pick === "all") return true;
  // One brand: its own row says what "All sources" says, so only its channels are offered.
  const [brand, channel] = pick.split(":") as [SourceBrand, string | undefined];
  return d.view.brands.includes(brand) && (!!channel || d.view.brands.length > 1);
}

/**
 * Each ad's brand, in one pass: its leads' number or Page (the most of them), else the Page Meta named for it. An ad of
 * neither is no view's — Meta's messages name the ads of every Page that writes to us (the 2990's sofa ads on another
 * Page, 2026-11-23, which until then counted with IR's).
 */
function adBrands(d: CrmData): Map<string, SourceBrand | null> {
  const n = new Map<string, { conts: number; dc: number }>();
  for (const c of d.customers) {
    if (!c.adId) continue;
    const b = brandOf(c.accountId);
    if (!b) continue;
    const k = n.get(c.adId) ?? { conts: 0, dc: 0 };
    k[b]++;
    n.set(c.adId, k);
  }
  const out = new Map<string, SourceBrand | null>();
  const of = (id: string): SourceBrand | null => {
    const k = n.get(id);
    if (k && (k.conts || k.dc)) return k.dc > k.conts ? "dc" : "conts";
    return brandOf(d.adNames?.[id]?.pageId);
  };
  for (const id of new Set([...n.keys(), ...Object.keys(d.adNames ?? {}), ...d.adRules.map(r => r.adId)])) out.set(id, of(id));
  return out;
}

/** Whose a showroom, form, template or booking link is: its sub-department's, else the CRM's own (IR's, read with none). */
export const subOfRow = (d: Pick<CrmData, "scope">, x: { sub?: string | null }): string | null => x.sub ?? d.scope ?? null;

/** The key a view's new showroom's unsaved draft is kept under: IR's 'new' as before, another sub-department's 'new:<its id>'. */
export function newRoomDraftKey(d: Pick<CrmData, "scope">, sub: string | null | undefined): string {
  return !sub || !d.scope || sub === d.scope ? "new" : `new:${sub}`;
}

/**
 * A sub-department's Management (see the file's head): its own showrooms, forms, templates and booking link, its settings
 * and appointment types. Another's showroom a visit of the view was at keeps its name there — in no list, picker or count.
 */
function managementOf(d: CrmData, sub: string, visits: CrmData["visits"]): Partial<CrmData> {
  const mine = (x: { sub?: string | null }) => subOfRow(d, x) === sub;
  const ownRooms = new Set(d.rooms.filter(r => !r.virtual && mine(r)).map(r => r.id));
  const links = (d.partnerLinks ?? []).filter(mine), linkIds = new Set(links.map(l => l.id));
  const bookings = (d.partnerBookings ?? []).filter(b => ownRooms.has(b.showroomId) || linkIds.has(b.partner));
  const named = new Set([...visits.map(v => v.showroomId), ...bookings.map(b => b.showroomId)]);
  const visitRooms = new Set(visits.map(v => virtualRoomId(v.id)));
  const rooms = d.rooms.flatMap(r => (r.virtual ? (visitRooms.has(r.id) ? [r] : [])
    : ownRooms.has(r.id) ? [r] : named.has(r.id) ? [{ ...r, active: false, virtual: true }] : []));
  const newKey = newRoomDraftKey(d, sub);
  return {
    rooms,
    partnerLinks: links,
    partnerBookings: bookings,
    ...(d.forms ? { forms: d.forms.filter(mine) } : {}),
    ...(d.bookingForms ? { bookingForms: d.bookingForms.filter(mine) } : {}),
    ...(d.templates ? { templates: d.templates.filter(mine) } : {}),
    ...(d.roomDrafts ? { roomDrafts: Object.fromEntries(Object.entries(d.roomDrafts).flatMap(([k, v]) => (k === newKey ? [["new", v]] : ownRooms.has(k) ? [[k, v]] : []))) } : {}),
    settings: d.settingsBySub?.[sub] ?? d.settings,
    apptTypes: d.apptTypesBySub?.[sub] ?? d.apptTypes,
  };
}

/**
 * The CRM's data as a view sees it (see the file's head). No view (`brands` null): the data as it is. `sub`: the view's
 * sub-department, whose Management it reads — none, or before the database names them (no `scope`): every one's.
 */
export function inView(d: CrmData, brands: SourceBrand[] | null, sub?: string | null): CrmData {
  if (!brands) return d;
  const has = (b: SourceBrand | null | undefined) => !!b && brands.includes(b);
  const customers = d.customers.filter(c => has(brandOf(c.accountId)));
  const ids = new Set(customers.map(c => c.id));
  const ads = adBrands(d), keepAd = (id: string | null | undefined) => !!id && has(ads.get(id));
  const people = d.people.filter(p => p.id === d.viewerId || brandsOfPerson(p).some(b => brands.includes(b))).map(p => p.id);
  const inPeople = new Set(people);
  const visits = d.visits.filter(v => ids.has(v.customerId));
  const own = sub && d.scope ? sub : null;
  return {
    ...d,
    view: { brands, people, ...(own ? { sub: own } : {}) },
    customers,
    visits,
    ...(own ? managementOf(d, own, visits) : {}),
    events: d.events.filter(e => ids.has(e.customerId)),
    shares: d.shares.filter(s => ids.has(s.customerId)),
    invites: d.invites.filter(i => ids.has(i.customerId)),
    adRules: d.adRules.filter(r => keepAd(r.adId)),
    ...(d.adNames ? { adNames: Object.fromEntries(Object.entries(d.adNames).filter(([id]) => keepAd(id))) } : {}),
    ...(d.notes ? { notes: d.notes.filter(x => ids.has(x.customerId)) } : {}),
    ...(d.leaves ? { leaves: d.leaves.filter(l => inPeople.has(l.staffId)) } : {}),
    ...(d.lockedStaff ? { lockedStaff: d.lockedStaff.filter(id => inPeople.has(id)) } : {}),
    ...(d.upNextStaff ? { upNextStaff: d.upNextStaff.filter(id => inPeople.has(id)) } : {}),
    ...(d.upNextEvents ? { upNextEvents: d.upNextEvents.filter(e => (!e.ad || keepAd(e.ad)) && (!e.staff || inPeople.has(e.staff))) } : {}),
    ...(d.messengerBlocked ? { messengerBlocked: d.messengerBlocked.filter(id => ids.has(id)) } : {}),
  };
}
