/** What Up next asks of the CRM's own data: who may open it, the people's names and teams, and the ads taking leads. */
import { adStatusOf } from "@/lib/member/crm-ad-running";
import type { CrmData } from "@/lib/member/crm-data";
import { DIRECTOR_COLOUR, teamColour } from "./palette";
import { officeStamp } from "./leave-cal-data";
import { DIRECTOR_KEY, type UpNextAd, type UpNextBook } from "./up-next";

/** The Principal, the Revenue Director and whoever has a downline; a salesperson never (the database refuses them too). */
export const upNextOpen = (d: CrmData, me: string) => d.can.viewAll || d.people.some(p => p.uplineId === me);

/** Leads today per person: each time a customer was given to them today (the journey's `assigned`, Team activity's LEAD GOT). */
export function leadsTodayOf(d: CrmData, now: Date = new Date()): Map<string, number> {
  const today = officeStamp(now).slice(0, 10), n = new Map<string, number>();
  d.events.forEach(e => {
    const to = e.kind === "assigned" ? (e.data as { to?: unknown } | null)?.to : null;
    if (typeof to === "string" && officeStamp(new Date(e.at)).slice(0, 10) === today) n.set(to, (n.get(to) ?? 0) + 1);
  });
  return n;
}

export function upNextBookOf(teams: { id: string; name: string }[], nameOf: (id: string | null | undefined) => string, d: CrmData): UpNextBook {
  let today: Map<string, number> | null = null;
  return {
    todayOf: id => (today ??= leadsTodayOf(d)).get(id) ?? 0,
    nameOf,
    teamOf: key => {
      if (key === DIRECTOR_KEY) return { name: "Revenue Director", dot: DIRECTOR_COLOUR[0] };
      const k = teams.findIndex(t => t.id === key);
      return k < 0 ? { name: nameOf(key), dot: "var(--crm-faint)" } : { name: teams[k].name, dot: teamColour(k)[0] };
    },
    adName: id => d.adNames?.[id]?.name ?? d.customers.find(c => c.adId === id)?.ad ?? `Ad ${id}`,
  };
}

/** All ads, then every ad taking leads now — Ads to teams' list at Running — with its channel. */
export function upNextAdsOf(d: CrmData, now: Date): UpNextAd[] {
  const added = Object.entries(d.adNames ?? {}).filter(([, n]) => n.added).map(([id]) => id);
  const ids = [...new Set([...d.customers.map(c => c.adId).filter((x): x is string => !!x), ...added, ...d.adRules.map(r => r.adId)])];
  const rows = ids.map(id => {
    const cs = d.customers.filter(c => c.adId === id), last = cs.map(c => c.createdAt).sort().at(-1) ?? null;
    return { id, name: d.adNames?.[id]?.name ?? cs[0]?.ad ?? `Ad ${id}`, sub: cs.length ? (cs.some(c => c.channel === "whatsapp") ? "WhatsApp" : "Messenger") : "", status: adStatusOf(d.adNames?.[id], last, now), last };
  }).filter(a => a.status === "Running").sort((a, b) => (b.last ?? "").localeCompare(a.last ?? ""));
  return [{ id: "all", name: "All ads", sub: "" }, ...rows.map(({ id, name, sub }) => ({ id, name, sub }))];
}
