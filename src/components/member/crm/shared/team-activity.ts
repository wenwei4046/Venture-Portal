/**
 * Team activity (docs/design_handoff_crm/designs/CRM Team Activity.dc.html, README Part B §1): per person, the leads they
 * got in the period, their average first reply, who is still waiting (and the longest wait), appointments and show-ups.
 * The prototype's renderVals() with the same names, on real data:
 *   - a LEAD GOT is one time a customer was given to somebody (crm_events `assigned`) inside the period; the next time the
 *     same customer is given to somebody else ends it — "Handed away" for the one who had it, "from NAME" for the next;
 *   - FIRST REPLY is the first message of ours, not an auto-reply, after the lead was got and before it was handed on;
 *   - WAITING is a lead still with them that has no first reply yet, measured to now, coloured by the CRM's own reply
 *     lines (Settings › General: 3 h Reply soon · 6 h Urgent · 9 h Overdue);
 *   - Appt / Show-up: a visit booked for the customer after it was got / one marked Came;
 *   - who is out of today's turn and why: the people book's answer, the same facts the dealer reads.
 */
import type { CrmCustomer, CrmData, CrmEvent } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { C } from "./palette";
import type { PeopleBook } from "./people-book";
import { addDays, dowOf } from "./people-book";
import { officeStamp } from "./leave-cal-data";

export interface AssignedRow { contact_id: string; actor: string | null; data: { to?: string | null; from?: string | null } | null; at: string }
export type Period = "Today" | "Week" | "Month" | "Custom";
export interface ActivityUi {
  team: string; who: string | null; menu: boolean; per: Period; from: string; to: string;
  open: Record<string, boolean>; lead: { id: string; key: string } | null; sort: { k: SortKey; d: 1 | -1 } | null;
  pMenu: boolean; pOpen: Record<string, boolean>; pLead: { id: string; key: string } | null;
  /** The ad shown ("all", an ad's id, or "none" = leads from no ad) — the owner, 2026-11-09: "加入可以筛选广告". */
  ad?: string;
}
type SortKey = "leads" | "avg" | "waitMax" | "appt" | "show";

export const fmt = (m: number | null) => (m == null ? "—" : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const hm = (stamp: string) => stamp.slice(11, 16);
const mins = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
const COLS = "240px repeat(5,minmax(0,1fr))";

/** One lead got: a stint of one customer with one person. */
export interface Stint {
  key: string; who: string; customer: CrmCustomer; got: string; gotAt: string; by: string | null; from: string | null;
  end: string | null; to: string | null; movedBy: string | null; reply: number | null; replyAt: string | null;
  appt: boolean; apptAt: string | null; apptWhen: string | null; show: boolean; showAt: string | null;
}

/** The period's first and last office day. */
export function periodDays(ui: Pick<ActivityUi, "per" | "from" | "to">, today: string): { a: string; b: string } {
  if (ui.per === "Today") return { a: today, b: today };
  if (ui.per === "Week") return { a: addDays(today, -dowOf(today)), b: today };
  if (ui.per === "Month") return { a: `${today.slice(0, 7)}-01`, b: today };
  return { a: ui.from <= ui.to ? ui.from : ui.to, b: ui.from <= ui.to ? ui.to : ui.from };
}
/** The instant the period starts (the office's midnight). */
export const periodStartIso = (day: string) => `${day}T00:00:00+08:00`;

export function stintsOf(d: CrmData, rows: AssignedRow[], range: { a: string; b: string }, nowIso: string): Stint[] {
  const byContact = new Map<string, AssignedRow[]>();
  rows.forEach(r => { const l = byContact.get(r.contact_id) ?? []; l.push(r); byContact.set(r.contact_id, l); });
  const cust = new Map(d.customers.map(c => [c.id, c]));
  const visitsOf = new Map<string, CrmData["visits"]>();
  d.visits.forEach(v => { const l = visitsOf.get(v.customerId) ?? []; l.push(v); visitsOf.set(v.customerId, l); });
  const booked = new Map<string, CrmEvent[]>();
  d.events.filter(e => e.kind === "appt_booked").forEach(e => { const l = booked.get(e.customerId) ?? []; l.push(e); booked.set(e.customerId, l); });
  const out: Stint[] = [];
  byContact.forEach((list, id) => {
    const c = cust.get(id); if (!c) return;
    list.sort((x, y) => x.at.localeCompare(y.at));
    list.forEach((r, i) => {
      const who = r.data?.to; if (!who) return;
      const got = officeStamp(r.at), day = got.slice(0, 10);
      if (day < range.a || day > range.b) return;
      const next = list.slice(i + 1).find(n => n.data?.to && n.data.to !== who) ?? null;
      const end = next?.at ?? null;
      const first = c.messages.find(m => m.from === "me" && !m.auto && m.status !== "sending" && m.at >= r.at && (!end || m.at < end));
      const vs = (visitsOf.get(id) ?? []).filter(v => v.state !== "cancelled" && v.start >= r.at);
      const bk = (booked.get(id) ?? []).find(e => e.at >= r.at && (!end || e.at < end));
      const came = vs.find(v => v.state === "attended");
      out.push({
        key: `${id}@${r.at}`, who, customer: c, got, gotAt: r.at, by: r.actor, from: r.data?.from ?? null,
        end, to: next?.data?.to ?? null, movedBy: next?.actor ?? null,
        reply: first ? mins(r.at, first.at) : null, replyAt: first?.at ?? null,
        appt: !!vs.length || !!bk, apptAt: bk?.at ?? null, apptWhen: vs[0]?.start ?? null, show: !!came, showAt: came?.start ?? null,
      });
    });
  });
  void nowIso;
  return out.sort((a, b) => a.gotAt.localeCompare(b.gotAt));
}

export interface ActivityIn {
  data: CrmData; book: PeopleBook; rows: AssignedRow[] | null; now: Date; ui: ActivityUi;
  set(p: Partial<ActivityUi> | ((u: ActivityUi) => Partial<ActivityUi>)): void;
  nameOf(id: string | null | undefined): string; roleOf(id: string): string; openChat(customerId: string): void;
}

export function activityVM(x: ActivityIn) {
  const { data: d, book, ui: st, set } = x;
  const nowIso = x.now.toISOString(), nowStamp = officeStamp(x.now), today = nowStamp.slice(0, 10);
  const S = d.settings ?? DEFAULT_CRM_SETTINGS;
  const LV = (m: number): [string, string] => m >= S.replyOverdueH * 60 ? ["Overdue", C.oxblood] : m >= S.replyUrgentH * 60 ? ["Urgent", C.rust] : m >= S.replySoonH * 60 ? ["Reply soon", C.warn] : ["", C.ink];
  const ST: Record<string, [string, string]> = { "Handed away": [C.disabled, C.faint], Appointment: [C.green, C.greenDark], "Follow up": [C.amber, "var(--crm-leave-annual-text)"], New: [C.rust, C.oxblood] };
  const range = periodDays(st, today);
  const stints0 = x.rows ? stintsOf(d, x.rows, range, nowIso) : [];
  // One ad, or all of them (the owner, 2026-11-09: "加入可以筛选广告，这样我才能看到总体，或单独的广告分配"): every figure,
  // row and lead below is that ad's. The choices are the ads the period's leads came from, the most leads first.
  const adOf = (s: Stint) => s.customer.adId || "none";
  const adSel = st.ad && st.ad !== "all" ? st.ad : "all";
  const stints = adSel === "all" ? stints0 : stints0.filter(s => adOf(s) === adSel);
  const adN = new Map<string, number>(); stints0.forEach(s => adN.set(adOf(s), (adN.get(adOf(s)) ?? 0) + 1));
  if (adSel !== "all" && !adN.has(adSel)) adN.set(adSel, 0);
  const adName = (id: string) => id === "none" ? "No ad" : d.adNames?.[id]?.name ?? stints0.find(s => s.customer.adId === id)?.customer.ad ?? `Ad ${id}`;
  const ads = [{ value: "all", label: `All ads · ${stints0.length}` },
    ...[...adN].sort((a, b) => (a[0] === "none" ? 1 : b[0] === "none" ? -1 : b[1] - a[1])).map(([id, n]) => ({ value: id, label: `${adName(id)} · ${n}` }))];
  const byWho = new Map<string, Stint[]>();
  stints.forEach(s => { const l = byWho.get(s.who) ?? []; l.push(s); byWho.set(s.who, l); });
  const statusOf = (s: Stint) => (s.end ? "Handed away" : s.appt ? "Appointment" : s.customer.status === "follow_up" ? "Follow up" : s.customer.status === "appointment" ? "Appointment" : "New");
  const waitOf = (s: Stint) => (s.reply == null && !s.end ? mins(s.gotAt, nowIso) : null);
  const stat = (id: string) => {
    const ls = byWho.get(id) ?? [], rep = ls.filter(l => l.reply != null), w = ls.map(waitOf).filter((m): m is number => m != null);
    return { leads: ls.length, avg: rep.length ? Math.round(rep.reduce((a, l) => a + (l.reply ?? 0), 0) / rep.length) : null,
      waitN: w.length, waitMax: w.length ? Math.max(...w) : 0, appt: ls.filter(l => l.appt).length, show: ls.filter(l => l.show).length };
  };
  const teams = book.groups;
  const groups = (openKey: "open" | "pOpen", leadKey: "lead" | "pLead") => {
    const sortKey = st.sort?.k ?? null, dir = st.sort?.d ?? 1, sel = st[leadKey];
    return teams.filter(t => st.team === "all" || t.key === st.team).map(t => {
      const rows = t.people.filter(p => !st.who || p.id === st.who).map(p => ({ id: p.id, s: stat(p.id) }));
      if (sortKey) rows.sort((a, b) => ((a.s[sortKey] ?? -1) - (b.s[sortKey] ?? -1)) * dir);
      return { name: t.name, dot: t.dot, rows: rows.map(({ id, s }) => {
        const turn = book.turn(id, nowStamp), on = turn.on, open = !!st[openKey][id] || st.who === id, wl = LV(s.waitMax);
        const list = (byWho.get(id) ?? []).slice().reverse().map(l => {
          const w = waitOf(l), status = statusOf(l), SS = ST[status];
          return { key: l.key, repT: w == null ? fmt(l.reply) : "", waitT: w != null ? fmt(w) : "", got: hm(l.got), name: l.customer.name,
            reply: w != null ? `waiting ${fmt(w)}` : `${fmt(l.reply)} reply`, rc: w != null ? (LV(w)[0] ? LV(w)[1] : "var(--crm-leave-annual-text)") : C.ink,
            go: () => set({ [leadKey]: { id, key: l.key } }), bg: sel && sel.key === l.key ? C.field : "transparent",
            status: w != null ? "" : status, sFg: SS[1] };
        });
        return { id, rowFg: on || s.leads ? C.ink : "var(--crm-disabled)", waitTxt: s.waitN ? (s.waitMax >= 60 ? `${Math.floor(s.waitMax / 60)}h${String(s.waitMax % 60).padStart(2, "0")}` : `${s.waitMax}m`) : "—",
          tdot: t.dot, name: book.person(id)?.name ?? x.nameOf(id), nameFg: on ? C.ink : C.faint, turn: turn.why, off: !on, op: on || s.leads ? 1 : 0.55,
          leads: s.leads, avg: fmt(s.avg), avgFg: LV(s.avg || 0)[1], waitOn: s.waitN > 0, waitOff: s.waitN === 0, wait: fmt(s.waitMax), waitFg: wl[1],
          appt: s.appt, show: s.show, open, rot: open ? "90deg" : "0deg", bg: "transparent", none: !list.length,
          toggle: () => set(u => ({ [openKey]: { ...u[openKey], [id]: !u[openKey][id] } })), list };
      }) };
    });
  };
  const drawer = (lead: { id: string; key: string } | null, close: () => void) => {
    const l = lead ? stints.find(s => s.key === lead.key) : undefined;
    if (!l) return { open: false, close, name: "", ad: "", facts: [] as { k: string; v: string; c: string }[], events: [] as { key: string; t: string; title: string; sub: string; dot: string; c: string; top: string; bot: string }[], openChat: () => {} };
    const who = x.nameOf(l.who), w = waitOf(l);
    const ev: { t: string; title: string; sub: string; dot: string; c?: string }[] = [
      { t: hm(l.got), title: l.from ? `Moved to ${who}` : `Got by ${who}`, sub: l.from ? `from ${x.nameOf(l.from)}${l.by ? ` · by ${x.nameOf(l.by)}` : ""}` : `${l.customer.ad || "No ad"} · ${l.by ? `by ${x.nameOf(l.by)}` : "auto"}`, dot: C.ink },
    ];
    if (l.reply == null && !l.end) { const lv = LV(w ?? 0); ev.push({ t: hm(nowStamp), title: `No reply · ${fmt(w)}`, sub: lv[0] || "still waiting", dot: lv[0] ? lv[1] : C.amber, c: lv[0] ? lv[1] : C.ink }); }
    else if (l.reply != null && l.replyAt) ev.push({ t: hm(officeStamp(l.replyAt)), title: `First reply · ${fmt(l.reply)}`, sub: who, dot: C.green });
    if (l.end && l.to) ev.push({ t: hm(officeStamp(l.end)), title: `Moved to ${x.nameOf(l.to)}`, sub: l.movedBy ? `by ${x.nameOf(l.movedBy)}` : "auto", dot: C.ink });
    if (l.appt) {
      const when = l.apptWhen ? officeStamp(l.apptWhen) : null;
      ev.push({ t: l.apptAt ? hm(officeStamp(l.apptAt)) : when ? hm(when) : "", title: "Appointment booked", sub: when ? new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" }).format(new Date(l.apptWhen!)).replace(",", "") : "", dot: C.green });
    }
    if (l.show && l.showAt) ev.push({ t: hm(officeStamp(l.showAt)), title: "Showed up", sub: "", dot: C.green });
    return { open: true, close, name: l.customer.name, ad: l.from ? `from ${x.nameOf(l.from)}` : (l.customer.ad || "No ad"),
      facts: [{ k: "Got", v: hm(l.got), c: C.ink }, { k: "First reply", v: w != null ? `waiting ${fmt(w)}` : fmt(l.reply), c: w != null && LV(w)[0] ? LV(w)[1] : C.ink }, { k: "Now with", v: l.to ? x.nameOf(l.to) : who, c: C.ink }],
      events: ev.map((e, i) => ({ key: `${i}`, c: C.ink, ...e, top: i ? C.rule : "transparent", bot: i < ev.length - 1 ? C.rule : "transparent" })),
      openChat: () => { close(); x.openChat(l.customer.id); } };
  };

  const ids = teams.filter(t => st.team === "all" || t.key === st.team).flatMap(t => t.people.map(p => p.id)).filter(id => !st.who || id === st.who).filter((id, i, a) => a.indexOf(id) === i);
  const all = ids.map(stat), sum = (k: "leads" | "waitN" | "appt" | "show") => all.reduce((a, s) => a + s[k], 0);
  const repAll = ids.flatMap(id => (byWho.get(id) ?? []).filter(l => l.reply != null).map(l => l.reply ?? 0));
  const lateAll = all.some(s => LV(s.waitMax)[0]);
  const sortKey = st.sort?.k ?? null, dir = st.sort?.d ?? 1;
  const H: [string, SortKey | null, string?][] = [["", null, "flex-start"], ["Leads", "leads"], ["Avg reply", "avg"], ["Waiting", "waitMax"], ["Appt", "appt"], ["Show-up", "show"]];
  const seg = (on: boolean) => ({ bg: on ? "#fff" : "transparent", fg: on ? C.ink : C.muted, sh: on ? "0 1px 2px rgba(42,22,12,.12)" : "none" });
  const pick = (team: string, who: string | null) => () => set({ team, who, menu: false, pMenu: false });
  const T = teams.find(t => t.key === st.team);
  const whoTeam = st.who ? book.teamOf(st.who) : null;
  const sel = st.who ? { label: x.nameOf(st.who), role: x.roleOf(st.who), dot: whoTeam?.dot ?? "" } : T ? { label: T.name, role: "", dot: T.dot } : { label: "Everyone", role: "", dot: "" };
  const row = (o: Partial<MenuRow> & { key: string; label: string; go: () => void }): MenuRow => ({ h: "34px", ph: "44px", pl: "10px", w: 400, bt: "transparent", role: "", dot: "", bg: "transparent", ...o });
  const menu: MenuRow[] = [row({ key: "all", label: "Everyone", w: 500, bg: !T && !st.who ? C.field : "transparent", go: pick("all", null) })];
  teams.forEach(t => {
    menu.push(row({ key: `t${t.key}`, label: t.name, dot: t.dot, w: 600, bt: C.rule2, h: "38px", ph: "48px", bg: st.team === t.key && !st.who ? C.field : "transparent", go: pick(t.key, null) }));
    t.people.forEach(p => menu.push(row({ key: `p${t.key}${p.id}`, label: p.name, role: x.roleOf(p.id), pl: "25px", bg: st.who === p.id ? C.field : "transparent", go: pick("all", p.id) })));
  });
  const tiles = ([["Leads", String(sum("leads"))], ["Avg reply", fmt(repAll.length ? Math.round(repAll.reduce((a, b) => a + b, 0) / repAll.length) : null)], ["Waiting", String(sum("waitN"))], ["Appt", String(sum("appt"))], ["Show-up", String(sum("show"))]] as const)
    .map(([k, v], i) => ({ k, v, bl: i ? C.heroLine : "transparent", c: k === "Waiting" && lateAll ? C.rust : C.ink }));
  const pGroups = groups("pOpen", "pLead");
  return {
    clock: hm(nowStamp), loading: !x.rows,
    selLabel: sel.label, selRole: sel.role, selDot: sel.dot, menu, menuOpen: st.menu, toggleMenu: () => set(u => ({ menu: !u.menu })), closeMenu: () => set({ menu: false }),
    pMenuOpen: st.pMenu, pOpenMenu: () => set({ pMenu: true }), pCloseMenu: () => set({ pMenu: false }),
    periods: (["Today", "Week", "Month", "Custom"] as const).map(l => ({ label: l, ...seg(st.per === l), go: () => set({ per: l }) })),
    isCustom: st.per === "Custom", cFrom: st.from, cTo: st.to,
    /** The first lead ever, for the picker's All time. */
    allFrom: d.customers.reduce((m, c) => Math.min(m, new Date(c.createdAt).getTime() || m), Date.now()),
    setFrom: (e: { target: { value: string } }) => { const v = e.target.value; if (v) set(u => ({ from: v, to: u.to < v ? v : u.to })); },
    setTo: (e: { target: { value: string } }) => { const v = e.target.value; if (v) set({ to: v }); },
    tiles, cols: COLS, pTiles: tiles.map(t => ({ ...t, k: t.k === "Show-up" ? "Came" : t.k })),
    ads, adVal: adSel, adOn: adSel !== "all", setAd: (e: { target: { value: string } }) => set({ ad: e.target.value }),
    perVal: st.per, setPer: (e: { target: { value: string } }) => set({ per: e.target.value as Period }),
    heads: H.map(([label, k, just]) => { const on = !!k && sortKey === k; return { label, just: just ?? "flex-end", fg: on ? C.ink : C.faint, arrow: on ? (dir > 0 ? "↑" : "↓") : "",
      sort: () => { if (k) set(u => ({ sort: u.sort && u.sort.k === k ? (u.sort.d < 0 ? null : { k, d: -1 }) : { k, d: 1 } })); } }; }),
    groups: groups("open", "lead"), pRows: pGroups.flatMap(g => g.rows),
    dOpen: !!st.lead, dClose: () => set({ lead: null }), d: drawer(st.lead, () => set({ lead: null })),
    pd: drawer(st.pLead, () => set({ pLead: null })),
    range,
  };
}
interface MenuRow { key: string; label: string; go: () => void; h: string; ph: string; pl: string; w: number; bt: string; role: string; dot: string; bg: string }
export type ActivityVM = ReturnType<typeof activityVM>;
