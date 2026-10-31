/**
 * People › Member services › Transport claim's ⋯ — who may claim it (2026-10-20, the user: "在 save button 旁边…做
 * 一个三个点。它是要能够选择什么 title 的人可以 claim 这个 transport。它跟 food claim 一样…什么 title 都可以选").
 *
 * A transport claim is the member's *Submit transport claim* (*Submit claim* until 2026-10-20): Outstation by road, a plane ticket, an Airbnb stay. HR ticks the
 * titles whose holders may send one — the member's seat title in the sub-department claimed for. The database asks
 * the same when a claim is sent (`member_transport_claim_open`); `member_admin_save_transport_claim` checks the list
 * again. Seeded on 2026-10-20 with every Revenue title, so nobody lost the claim on the day.
 *
 * Two ticks a title since 2026-10-31 (the user: "我要加多一个 Air ticket claim 的 column … if the venue is accept for air
 * ticket, then these guys with tick can claim，就算他们没有 tick transport claim，但是其他除了 ticket 以外，他就不能给"):
 * *Transport claim* — Outstation by road and an Airbnb stay — and *Air ticket claim* — the plane ticket to a fair in a
 * region HR flies to. Each its own: a title may hold either, both or neither. Save sends only the boxes HR changed
 * (`transportChanges`), so a second copy of the window saved meanwhile is not undone.
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
  /** Ticked for the transport claim: Outstation by road and an Airbnb stay. */
  titleIds: string[];
  /** Ticked for the air ticket claim: the plane ticket to a fair HR flies to (2026-10-31). */
  airTicketTitleIds: string[];
  /** Every Revenue title, the highest level first. */
  titles: TransportClaimTitle[];
  updatedAt: string | null;
  updatedBy: string | null;
}

/** The window's two columns of boxes, each the titles ticked in the list's order. */
export interface TransportTicks {
  transport: string[];
  airTicket: string[];
}

export type TransportColumn = keyof TransportTicks;

/** One title's boxes HR changed — what a save sends (`member_admin_save_transport_claim(p_changes)`). */
export interface TransportChange {
  titleId: string;
  transport?: boolean;
  airTicket?: boolean;
}

const MAX_TITLES = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const ids = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).filter((id): id is string => typeof id === "string") : []);

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
  const titleIds = ids(r.titleIds);
  return {
    titleIds,
    // An answer from before the air ticket's own tick: the transport tick opened the plane ticket too.
    airTicketTitleIds: Array.isArray(r.airTicketTitleIds) ? ids(r.airTicketTitleIds) : titleIds,
    titles,
    updatedAt: text(r.updatedAt),
    updatedBy: text(r.updatedBy),
  };
}

/** The ticked titles of each column in the list's order — what the window opens on. */
export function transportTicks(s: TransportClaimAdmin): TransportTicks {
  const pick = (list: readonly string[]) => {
    const ticked = new Set(list);
    return s.titles.filter(t => ticked.has(t.id)).map(t => t.id);
  };
  return { transport: pick(s.titleIds), airTicket: pick(s.airTicketTitleIds) };
}

/** Tick or untick a title in one column, keeping the list's order. */
export function toggleTransportTitle(s: TransportClaimAdmin, ticks: TransportTicks, column: TransportColumn, id: string): TransportTicks {
  const on = new Set(ticks[column]);
  if (on.has(id)) on.delete(id);
  else on.add(id);
  return { ...ticks, [column]: s.titles.filter(t => on.has(t.id)).map(t => t.id) };
}

/** The boxes that differ from what the window opened on, a title at a time — all a save sends. */
export function transportChanges(s: TransportClaimAdmin, ticks: TransportTicks): TransportChange[] {
  const was = transportTicks(s);
  const out = new Map<string, TransportChange>();
  for (const column of ["transport", "airTicket"] as const) {
    const before = new Set(was[column]);
    const after = new Set(ticks[column]);
    for (const id of new Set([...before, ...after])) {
      if (before.has(id) === after.has(id)) continue;
      out.set(id, { ...(out.get(id) ?? { titleId: id }), [column]: after.has(id) });
    }
  }
  return [...out.values()].sort((a, b) => a.titleId.localeCompare(b.titleId));
}

/** The ticks differ from what is stored. */
export function transportChanged(s: TransportClaimAdmin, ticks: TransportTicks): boolean {
  return transportChanges(s, ticks).length > 0;
}

/** "7 titles · 2 transport · 4 air ticket" — the ⋯'s tooltip, the window's count and the toast. */
export function transportTally(s: TransportClaimAdmin, ticks: TransportTicks = transportTicks(s)): string {
  return `${s.titles.length} title${s.titles.length === 1 ? "" : "s"} · ${ticks.transport.length} transport · ${ticks.airTicket.length} air ticket`;
}

/** The server's own check of what arrives: one change per title, sixty titles at most, each a tick on or off. */
export function validTransportChanges(v: unknown): v is TransportChange[] {
  if (!Array.isArray(v) || v.length > MAX_TITLES * 2) return false;
  const seen = new Set<string>();
  return v.every(c => {
    const x = c && typeof c === "object" ? (c as Record<string, unknown>) : null;
    if (!x || typeof x.titleId !== "string" || !UUID.test(x.titleId) || seen.has(x.titleId)) return false;
    seen.add(x.titleId);
    const keys = Object.keys(x).filter(k => k !== "titleId");
    return keys.length > 0 && keys.every(k => (k === "transport" || k === "airTicket") && typeof x[k] === "boolean");
  });
}
