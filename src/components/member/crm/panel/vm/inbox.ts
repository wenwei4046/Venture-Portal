/**
 * Inbox (design 1a): every member's chats on one status board — New · Needs a
 * reply · Follow up · Appointment · Won · Lost — filtered by team (Director,
 * each team) and then by member. A chat opens in its owner's own CRM, where
 * the Principal / Director can answer. Contacts is the same people A–Z.
 */
import type { ChangeEvent, MouseEvent, PointerEvent } from "react";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { CHANNEL, STATUS_LABEL, isCold, lastChat, lastReal, urgencyOf } from "../../sales/vm/common";
import { visitShort, waitOf } from "../../sales/vm/inbox";
import type { PanelUi } from "../ui";
import { phoneLabel, telHref } from "../../sales/vm/customer";
import { first, ini, NO_SEAT, seatOf, type PanelCtx } from "./common";

const UC = { urgent: "var(--crm-brown)", soon: "var(--crm-muted)", overdue: "var(--crm-oxblood)", none: "var(--crm-muted)" } as const;

/**
 * A card's long press, or a swipe to the left, opens Send to — assigning that customer (user 2026-10-13: "咨詢名單進來，按
 * 久久跳出功能鍵（可assign）, inbox的咨詢左滑也能assign"). Only for whoever may assign (CRM · Manage). One gesture at a
 * time, held here; the tap that ends a gesture does not also open the chat.
 */
const g: { x: number; y: number; t?: ReturnType<typeof setTimeout>; done?: number } = { x: 0, y: 0 };
function gestures(ctx: PanelCtx, c: CrmCustomer) {
  if (!ctx.data.can.manage) return { down: undefined, move: undefined, up: undefined, cancel: undefined, guard: undefined, noMenu: undefined };
  const assign = () => { clearTimeout(g.t); g.done = Date.now(); navigator.vibrate?.(10); ctx.patch({ sendFor: c.id, sdSel: null }); };
  return {
    down: (e: PointerEvent<HTMLElement>) => { g.x = e.clientX; g.y = e.clientY; g.done = undefined; clearTimeout(g.t); g.t = setTimeout(assign, 500); },
    move: (e: PointerEvent<HTMLElement>) => {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(g.t);
      if (!g.done && dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) assign();
    },
    up: () => clearTimeout(g.t),
    cancel: () => clearTimeout(g.t),
    guard: (e: MouseEvent<HTMLElement>) => { if (g.done && Date.now() - g.done < 600) { e.stopPropagation(); e.preventDefault(); } },
    noMenu: (e: MouseEvent<HTMLElement>) => e.preventDefault(),
  };
}

/** One chat as the panel lists it: who has it, its state, its last line. */
function chatRow(ctx: PanelCtx, c: CrmCustomer) {
  const { now, nameOf } = ctx, u = urgencyOf(c, now), seat = (c.assignedTo ? seatOf(ctx, c.assignedTo) : c.teamId ? seatOf(ctx, c.teamId) : null) ?? NO_SEAT;
  // A chat blocked on Facebook waits on nobody: never Attention, its card says so.
  const blocked = isFbBlocked(c, ctx.data), last = lastReal(c), needs = !blocked && u.level !== "none";
  const state = blocked ? FB_BLOCKED : needs ? u.label : STATUS_LABEL[c.status];
  return {
    c, seat, needs, name: c.name, ini: ini(c.name), ad: c.ad, state, uc: blocked ? "var(--crm-muted)" : UC[u.level],
    // 4a (T02): the customer's tint; a lead waiting for a team in oxblood.
    avBg: avatarTint(c.name)[0], avFg: avatarTint(c.name)[1], toAssign: !c.assignedTo,
    who: c.assignedTo ? nameOf(c.assignedTo) : `${seat.name || "Team"} · to assign`, wc: seat.c, ownBg: seat.own,
    preview: last ? (last.from === "me" ? "You: " : "") + (last.text || mediaWord(last)) : "", at: last ? lastChat(last.at, now) : "",
    // Its unread messages on the card, so the Inbox badge's number can be found (the owner, 2026-10-14: "inbox 2 是誰？").
    unread: c.unread ? String(c.unread) : "",
    stBg: blocked ? "var(--crm-field)" : u.level === "overdue" ? "var(--crm-tint-attention)" : u.level === "urgent" ? "var(--crm-tint-appt)" : u.level === "soon" ? "var(--crm-field)" : "transparent", hasSt: !!state,
    // rev 1011 §1.1: a chat opens here, as the Principal / Director, whoever has it (as Calendar and Awaiting reply do);
    // acting as a salesperson is Profile › View as only.
    open: () => ctx.patch({ lead: c.id, pick: "", toast: "" }),
    ...gestures(ctx, c),
  };
}

export { isNewChat } from "../../shared/new-chat";
import { mediaWord } from "../../shared/chat-media";
import { isNewChat } from "../../shared/new-chat";
import { STATUS, avatarTint } from "../../shared/palette";
import { saidInChat } from "../../shared/chat-search";
import { FB_BLOCKED, FB_BLOCKED_CATEGORY, isFbBlocked } from "../../shared/fb-blocked";

/** The chats the panel shows: everyone's, and those waiting in a team. Organic Leads are Assignment's. */
const listed = (ctx: PanelCtx) => ctx.data.customers.filter(c => c.assignedTo || c.teamId);

export function inboxVM(ctx: PanelCtx) {
  const { ui, set, me } = ctx;
  const all = listed(ctx).map(c => chatRow(ctx, c)).sort((a, b) => (lastReal(b.c)?.at ?? b.c.createdAt).localeCompare(lastReal(a.c)?.at ?? a.c.createdAt));
  const f = ui.inbTeam, who = ui.inbWho;
  const list = all.filter(r => (!f || r.seat.id === f) && (!who || r.c.assignedTo === who));
  // The Director's own customers are "Director" to the Principal; to the Director they are theirs (My CRM).
  const chipDefs: [string, string, string][] = [["", "All", "transparent"], ...(me.role === "hod" ? [] : ctx.directors.length ? [["hod", "Director", "var(--crm-brown)"] as [string, string, string]] : []), ...ctx.teams.map(t => [t.id, t.name, t.c] as [string, string, string])];
  const tSel = f && f !== "hod" ? ctx.teams.find(t => t.id === f) : null;
  const need = list.filter(r => r.needs);
  // The same categories as everybody's Mine inbox, in its order (the owner, 2026-10-14: "只要在 mine 有的，team 也要有"):
  // a Cold lead (the window shut, we wrote last) is its own column and nowhere else, as in Mine.
  // Blocked on Facebook (2026-11-08): its own column, after Cold leads, and nowhere else (shared/fb-blocked.ts).
  const col = (r: typeof all[number]) => (isFbBlocked(r.c, ctx.data) ? "blocked" : isCold(r.c, ctx.now) ? "cold" : isNewChat(r.c) ? "new" : r.needs ? "need" : r.c.status === "appointment" ? "appt" : r.c.status === "won" ? "won" : r.c.status === "lost" ? "lost" : "fup");
  return {
    onInbox: ui.tab === "inbox" && !ui.lead,
    inbSummary: `${list.length} chats · ${need.length} need attention`,
    inbHasChips: chipDefs.length > 1,
    inbChips: chipDefs.map(([id, label, dot]) => ({ label, dot, on: f === id, n: all.filter(r => !id || r.seat.id === id).length,
      bg: f === id ? "var(--crm-rust)" : "#fff", fg: f === id ? "#fff" : "var(--crm-ink)", bd: f === id ? "var(--crm-rust)" : "var(--crm-rule)", pick: () => set(u => ({ ...u, inbTeam: id, inbWho: "" })) })),
    inbHasWho: !!tSel,
    inbWhoChips: tSel ? [["", "Everyone"], ...tSel.people.map(p => [p.id, first(p.name)])].map(([id, label]) => {
      const on = who === id;
      return { label, on, n: all.filter(r => r.seat.id === f && (!id || r.c.assignedTo === id)).length, bg: on ? "var(--crm-ink)" : "transparent", fg: on ? "#fff" : "var(--crm-muted)", bd: on ? "var(--crm-ink)" : "var(--crm-line)", pick: () => set(u => ({ ...u, inbWho: id })) };
    }) : [],
    // One dropdown for whose chats (the owner, 2026-11-09: "inbox 中的人员，做筛选" — the team chips ran off the screen and the
    // people showed only after a team was picked): All, then each team (the Director's first) and its people, with counts.
    inbWhoMenu: (() => {
      const groups = chipDefs.filter(([id]) => id).map(([id, label, dot]) => {
        const people = id === "hod" ? ctx.directors : ctx.teams.find(t => t.id === id)?.people ?? [];
        return { key: id, label, dot, n: all.filter(r => r.seat.id === id).length, on: f === id && !who, pick: () => set(u => ({ ...u, inbTeam: id, inbWho: "" })),
          people: people.map(p => ({ key: p.id, label: p.name, n: all.filter(r => r.c.assignedTo === p.id).length, on: who === p.id, pick: () => set(u => ({ ...u, inbTeam: id, inbWho: p.id })) })) };
      });
      const g = groups.find(x => x.key === f), p = g?.people.find(x => x.key === who);
      return { label: p ? p.label : g ? g.label : "All", dot: g ? g.dot : "var(--crm-ink)", n: list.length,
        all: { n: all.length, on: !f && !who, pick: () => set(u => ({ ...u, inbTeam: "", inbWho: "" })) }, groups };
    })(),
    // All first, and where the board opens (the owner, 2026-11-09: "All 要能看完全部的咨询" — it opened on New alone).
    inbCols: withAll(list, ui.inbCol ?? 0, i => set(u => ({ ...u, inbCol: i })), (([["new", "New"], ["need", "Attention"], ["fup", "Follow up"], ["appt", "Appointment"], ["won", "Won"], ["lost", "Lost"], ["cold", "Cold leads"], ["blocked", FB_BLOCKED_CATEGORY]] as const).map(([k, t]) => [k, t, STATUS[t].dot, STATUS[t].tint] as const))
      .map(([k, title, c, bg], i) => { const rows = list.filter(r => col(r) === k); return { title, c, bg, n: rows.length, rows, empty: !rows.length, on: (ui.inbCol ?? 0) === i + 1, hot: k === "need",
        // The chip above the board slides it to this column.
        jump: () => { set(u => ({ ...u, inbCol: i + 1 })); const b = document.querySelector<HTMLElement>("[data-inb-board]"), el = b?.children[0] as HTMLElement | undefined; if (b && el) b.scrollTo({ left: el.offsetLeft - b.offsetLeft - 20, behavior: "smooth" }); } }; })),
    openPc: () => set(u => ({ ...u, pcOpen: true })),
    t2: teamListVM(ctx, all, chipDefs, col),
  };
}
export type InboxVM = ReturnType<typeof inboxVM>;

type Row = ReturnType<typeof chatRow>;
/** The Team inbox's statuses, in Mine's order (MINE AND TEAM SHOW THE SAME CATEGORIES, 2026-10-14). */
const CATS = ([["new", "New"], ["need", "Attention"], ["fup", "Follow up"], ["appt", "Appointment"], ["won", "Won"], ["lost", "Lost"], ["cold", "Cold leads"], ["blocked", FB_BLOCKED_CATEGORY]] as const)
  .map(([k, t]) => ({ k, t, dot: STATUS[t].dot }));

/**
 * v4 · the Team inbox (frame 2d, notes/17; filters exactly frame 2c / 2c·2): People and Status are multi-select — a team
 * picked is the whole team unless some of its people are picked too, then only those; each pick is a removable tag; "N
 * chats of M"; the filter sheet (2c·2) edits a draft and "Show N chats" applies it. The list is cards in the 10b layout,
 * newest first; a card's status shows only while more than one status is in view (Status = All, or two or more picked).
 * Search opens in place of the two buttons, as Mine's. The earlier whose-chats pick (inbTeam / inbWho — Insight's person
 * still opens the Inbox on them) reads as a People pick until the filters are next changed.
 */
export function teamListVM(ctx: PanelCtx, all: Row[], chipDefs: [string, string, string][], col: (r: Row) => string) {
  const { ui, set, now, data } = ctx;
  const sel: string[] = ui.inbWho ? [`person:${ui.inbWho}`] : ui.inbTeam ? [`team:${ui.inbTeam}`] : ui.inbPeople ?? [];
  const st = ui.inbSt ?? [];
  const q = (ui.inbQ ?? "").trim().toLowerCase();
  const teamDefs = chipDefs.filter(([id]) => id).map(([id, label, dot]) => ({ id, label, dot, people: id === "hod" ? ctx.directors : ctx.teams.find(t => t.id === id)?.people ?? [] }));
  const teamOfPerson = (pid: string) => teamDefs.find(t => t.people.some(p => p.id === pid));
  /** Does a chat belong to this People pick? */
  const inPeople = (pick: string[]) => {
    const teams = pick.filter(k => k.startsWith("team:")).map(k => k.slice(5)), people = pick.filter(k => k.startsWith("person:")).map(k => k.slice(7));
    return (r: Row) => {
      if (!pick.length) return true;
      if (teams.includes(r.seat.id)) {
        const mine = people.filter(p => teamOfPerson(p)?.id === r.seat.id);
        return !mine.length || mine.includes(r.c.assignedTo ?? "");
      }
      return people.includes(r.c.assignedTo ?? "");
    };
  };
  const inSt = (pick: string[]) => (r: Row) => !pick.length || pick.includes(col(r));
  const said = (r: Row) => !q || `${r.name} ${r.preview} ${r.c.ad} ${r.who}`.toLowerCase().includes(q) || !!saidInChat(r.c, q);
  const list = all.filter(r => inPeople(sel)(r) && inSt(st)(r) && said(r));
  const write = (people: string[], status: string[]) => set(u => ({ ...u, inbTeam: "", inbWho: "", inbPeople: people, inbSt: status }));
  const labelsOf = (c: CrmCustomer) => (data.customerLabels?.[c.id] ?? []).map(id => data.labels?.find(l => l.id === id)).filter((l): l is NonNullable<typeof l> => !!l);
  const stMany = st.length !== 1;
  const catOf = (k: string) => CATS.find(x => x.k === k)!;

  // The tags under the buttons: teams, then people (their team's dot), then statuses (a square).
  const nameOfPerson = (pid: string) => teamDefs.flatMap(t => t.people).find(p => p.id === pid)?.name ?? ctx.nameOf(pid);
  const tags = [
    ...sel.map(k => {
      const team = k.startsWith("team:"), id = k.slice(team ? 5 : 7), t = team ? teamDefs.find(x => x.id === id) : teamOfPerson(id);
      // Removing a team takes its people with it.
      const drop = team ? sel.filter(x => x !== k && !(x.startsWith("person:") && teamOfPerson(x.slice(7))?.id === id)) : sel.filter(x => x !== k);
      return { key: k, label: team ? t?.label ?? "Team" : nameOfPerson(id), dot: t?.dot ?? "var(--crm-muted)", square: false, remove: () => write(drop, st) };
    }),
    ...st.map(k => ({ key: `st:${k}`, label: catOf(k).t, dot: catOf(k).dot, square: true, remove: () => write(sel, st.filter(x => x !== k)) })),
  ];

  // The 2c·2 sheet: a draft of both picks, applied by "Show N chats".
  const sh = ui.inbSheet ?? null;
  const putSheet = (p: Partial<NonNullable<PanelUi["inbSheet"]>>) => set(u => ({ ...u, inbSheet: u.inbSheet ? { ...u.inbSheet, ...p } : u.inbSheet }));
  const dp = sh?.people ?? [], ds = sh?.st ?? [];
  const toggle = (arr: string[], k: string) => (arr.includes(k) ? arr.filter(x => x !== k) : [...arr, k]);
  const draftN = all.filter(r => inPeople(dp)(r) && inSt(ds)(r) && said(r)).length;
  const sheet = sh ? {
    at: sh.at,
    teams: [
      { key: "", label: "Everyone", dot: !dp.length ? "var(--crm-rust)" : "var(--crm-faint-2)", n: all.length, on: !dp.length, toggle: () => putSheet({ people: [] }) },
      ...teamDefs.map(t => {
        const k = `team:${t.id}`, on = dp.includes(k);
        return { key: k, label: t.label, dot: t.dot, n: all.filter(r => r.seat.id === t.id).length, on,
          toggle: () => putSheet({ people: on ? dp.filter(x => x !== k && !(x.startsWith("person:") && teamOfPerson(x.slice(7))?.id === t.id)) : [...dp, k] }) };
      }),
    ],
    // Each team picked lists its people: All (the whole team) or some of them.
    members: teamDefs.filter(t => dp.includes(`team:${t.id}`)).map(t => {
      const picked = t.people.filter(p => dp.includes(`person:${p.id}`));
      return { key: t.id, title: `${t.label} · people`, chips: [
        { key: "", label: "All", n: all.filter(r => r.seat.id === t.id).length, on: !picked.length, toggle: () => putSheet({ people: dp.filter(x => !(x.startsWith("person:") && teamOfPerson(x.slice(7))?.id === t.id)) }) },
        ...t.people.map(p => ({ key: p.id, label: p.name, n: all.filter(r => r.c.assignedTo === p.id).length, on: dp.includes(`person:${p.id}`), toggle: () => putSheet({ people: toggle(dp, `person:${p.id}`) }) })),
      ] };
    }),
    statuses: CATS.map(x => ({ key: x.k, label: x.t, dot: x.dot, n: all.filter(r => col(r) === x.k).length, hot: x.k === "need", on: ds.includes(x.k), toggle: () => putSheet({ st: toggle(ds, x.k) }) })),
    clear: () => putSheet({ people: [], st: [] }),
    cancel: () => set(u => ({ ...u, inbSheet: null })),
    applyLabel: `Show ${draftN} chat${draftN === 1 ? "" : "s"}`,
    apply: () => set(u => ({ ...u, inbTeam: "", inbWho: "", inbPeople: dp, inbSt: ds, inbSheet: null })),
  } : null;
  const open = (at: "people" | "status") => () => set(u => ({ ...u, inbSheet: { at, people: sel, st } }));
  const nP = sel.length, nS = st.length;

  return {
    peopleN: nP, statusN: nS, openPeople: open("people"), openStatus: open("status"),
    tags, count: `${list.length} chat${list.length === 1 ? "" : "s"}`, of: `of ${all.length}`, canClear: !!(nP || nS),
    clearAll: () => write([], []),
    searchOpen: !!ui.inbSearch || !!ui.inbQ, q: ui.inbQ ?? "",
    openSearch: () => set(u => ({ ...u, inbSearch: true })), cancelSearch: () => set(u => ({ ...u, inbSearch: false, inbQ: "" })),
    setQ: (e: ChangeEvent<HTMLInputElement>) => { const v = e.target.value; set(u => ({ ...u, inbQ: v })); }, clearQ: () => set(u => ({ ...u, inbQ: "" })),
    sheet,
    empty: !list.length,
    cards: list.map(r => {
      const u = urgencyOf(r.c, now), cold = isCold(r.c, now), blocked = isFbBlocked(r.c, data), k = col(r), unread = !!r.c.unread;
      return {
        id: r.c.id, name: r.name, ini: r.ini, avBg: r.avBg, avFg: r.avFg,
        chanFg: CHANNEL[r.c.channel].fg, chanIc: (r.c.channel === "whatsapp" ? "phone" : "message-circle") as "phone" | "message-circle", chanName: CHANNEL[r.c.channel].name,
        nameW: unread ? 600 : 500, nameC: cold ? "var(--crm-muted)" : "var(--crm-ink)",
        at: r.at, whenC: unread ? "var(--crm-rust)" : "var(--crm-faint)",
        ...waitOf(u, !cold && !blocked),
        tags: labelsOf(r.c).map(l => ({ t: l.name, c: l.color })),
        who: r.who, wc: r.wc, toAssign: r.toAssign, ad: r.c.ad,
        stShow: stMany, st: catOf(k).t, stDot: catOf(k).dot,
        preview: r.preview, unread: r.unread, cold, visit: visitShort(data.visits, r.c.id, now),
        open: r.open, down: r.down, move: r.move, up: r.up, cancel: r.cancel, guard: r.guard, noMenu: r.noMenu,
      };
    }),
  };
}

/** "All" before the statuses: every chat the filters above leave, newest first as each status lists them. */
function withAll<R, C extends { rows: R[]; on: boolean }>(rows: R[], at: number, pick: (i: number) => void, cols: C[]) {
  const all = { ...cols[0], title: "All", c: "var(--crm-ink)", bg: "var(--crm-field)", n: rows.length, rows, empty: !rows.length, on: at === 0, hot: false, jump: () => pick(0) } as C;
  return [all, ...cols];
}

/** Contacts (from the Inbox): everyone's customers A–Z under letter heads; a row opens the chat in its owner's CRM. */
export function contactsVM(ctx: PanelCtx) {
  const { ui, set } = ctx, q = ui.pcQ.trim().toLowerCase();
  const rows = listed(ctx).map(c => chatRow(ctx, c)).filter(r => !q || r.name.toLowerCase().includes(q) || r.who.toLowerCase().includes(q) || !!saidInChat(r.c, q)).sort((a, b) => a.name.localeCompare(b.name));
  return {
    pcOpen: ui.pcOpen, pcQ: ui.pcQ, pcEmpty: !rows.length,
    closePc: () => set(u => ({ ...u, pcOpen: false, pcQ: "" })), setPcQ: (e: ChangeEvent<HTMLInputElement>) => { const v = e.target.value; set(u => ({ ...u, pcQ: v })); },
    pcRows: rows.map((r, k) => {
      const L = (r.name[0] ?? "#").toUpperCase(), prev = k ? (rows[k - 1].name[0] ?? "#").toUpperCase() : "";
      return { head: L !== prev ? L : "", hasHead: L !== prev, name: r.name, ini: r.ini, phone: phoneLabel(r.c.phone) || "—", tel: telHref(r.c.phone),
        status: r.needs ? "Follow up" : STATUS_LABEL[r.c.status], who: r.who, wc: r.wc, ownBg: r.ownBg, rule: L !== prev ? "0" : "1px solid var(--crm-rule-soft)",
        open: () => { set(u => ({ ...u, pcOpen: false })); r.open(); } };
    }),
  };
}
