/**
 * People › Member services › Transport claim's ⋯ — who may claim it (2026-10-20, the user: "在 save button 旁边…做
 * 一个三个点。它是要能够选择什么 title 的人可以 claim 这个 transport。它跟 food claim 一样…什么 title 都可以选").
 *
 * A transport claim is the member's *Submit transport claim* (*Submit claim* until 2026-10-20): Outstation by road, a plane ticket, an Airbnb stay. HR ticks the
 * titles whose holders may send one — the member's seat title in the sub-department claimed for. The database asks
 * the same when a claim is sent (`member_transport_claim_open`); `member_admin_save_transport_claim` checks the list
 * again. Seeded on 2026-10-20 with every Revenue title, so nobody lost the claim on the day.
 */

export interface TransportClaimTitle {
  id: string;
  name: string;
  /** The title's level (People › Hierarchy › Levels), for the list's order and its second column. */
  level: string | null;
  /** How many hold a seat on it today, in any sub-department. */
  people: number;
  active: boolean;
}

export interface TransportClaimAdmin {
  titleIds: string[];
  /** Every Revenue title, the highest level first. */
  titles: TransportClaimTitle[];
  updatedAt: string | null;
  updatedBy: string | null;
}

const MAX_TITLES = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function readTransportClaimAdmin(raw: unknown): TransportClaimAdmin | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.titles)) return null;
  const titles = (r.titles as unknown[]).flatMap(t => {
    const x = t && typeof t === "object" ? (t as Record<string, unknown>) : null;
    return x && typeof x.id === "string" && typeof x.name === "string"
      ? [{ id: x.id, name: x.name, level: text(x.level), people: Math.max(0, Math.trunc(Number(x.people) || 0)), active: x.active !== false }]
      : [];
  });
  return {
    titleIds: Array.isArray(r.titleIds) ? (r.titleIds as unknown[]).filter((id): id is string => typeof id === "string") : [],
    titles,
    updatedAt: text(r.updatedAt),
    updatedBy: text(r.updatedBy),
  };
}

/** The ticked titles in the list's order — what the window opens on. */
export function transportTicks(s: TransportClaimAdmin): string[] {
  const ticked = new Set(s.titleIds);
  return s.titles.filter(t => ticked.has(t.id)).map(t => t.id);
}

/** Tick or untick a title, keeping the list's order. */
export function toggleTransportTitle(s: TransportClaimAdmin, ticks: readonly string[], id: string): string[] {
  const on = new Set(ticks);
  if (on.has(id)) on.delete(id);
  else on.add(id);
  return s.titles.filter(t => on.has(t.id)).map(t => t.id);
}

/** What a save sends: each title once, in a stable order. */
export function transportToSave(ticks: readonly string[]): string[] {
  return [...new Set(ticks)].sort();
}

/** The ticks differ from what is stored. */
export function transportChanged(s: TransportClaimAdmin, ticks: readonly string[]): boolean {
  return transportToSave(transportTicks(s)).join() !== transportToSave(ticks).join();
}

/** "3 of 7 titles" — the ⋯'s tooltip and the window's count. */
export function transportTally(s: TransportClaimAdmin, ticks: readonly string[] = transportTicks(s)): string {
  return `${ticks.length} of ${s.titles.length} title${s.titles.length === 1 ? "" : "s"}`;
}

/** The server's own check of what arrives. */
export function validTransportTitles(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= MAX_TITLES && v.every(id => typeof id === "string" && UUID.test(id));
}
