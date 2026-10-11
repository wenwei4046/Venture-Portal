/**
 * Inbox (design 1a): every member's chats on one status board — Needs a
 * reply · Follow up · Appointment · Won · Lost — filtered by team (Director,
 * each team) and then by member. A chat opens in its owner's own CRM, where
 * the Principal / Director can answer. Contacts is the same people A–Z.
 */
import type { ChangeEvent } from "react";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { STATUS_LABEL, lastChat, lastReal, urgencyOf } from "../../sales/vm/common";
import { phoneLabel, telHref } from "../../sales/vm/customer";
import { first, ini, NO_SEAT, seatOf, type PanelCtx } from "./common";

const UC = { urgent: "#A46312", soon: "#806B60", overdue: "#A3371A", none: "#806B60" } as const;

/** One chat as the panel lists it: who has it, its state, its last line. */
function chatRow(ctx: PanelCtx, c: CrmCustomer) {
  const { now, nameOf } = ctx, u = urgencyOf(c, now), seat = (c.assignedTo ? seatOf(ctx, c.assignedTo) : c.teamId ? seatOf(ctx, c.teamId) : null) ?? NO_SEAT;
  const last = lastReal(c), needs = u.level !== "none";
  const state = needs ? u.label : STATUS_LABEL[c.status];
  return {
    c, seat, needs, name: c.name, ini: ini(c.name), ad: c.ad, state, uc: UC[u.level],
    who: c.assignedTo ? nameOf(c.assignedTo) : `${seat.name || "Team"} · to assign`, wc: seat.c, ownBg: seat.own,
    preview: last ? (last.from === "me" ? "You: " : "") + (last.text || "Attachment") : "", at: last ? lastChat(last.at, now) : "",
    stBg: u.level === "overdue" ? "#FBE4DE" : u.level === "urgent" ? "#FBF1E3" : u.level === "soon" ? "#F5EEE9" : "transparent", hasSt: !!state,
    // rev 1011 §1.1: a chat opens here, as the Principal / Director, whoever has it (as Calendar and Awaiting reply do);
    // acting as a salesperson is Profile › View as only.
    open: () => ctx.patch({ lead: c.id, pick: "", toast: "" }),
  };
}

/** The chats the panel shows: everyone's, and those waiting in a team. Organic Leads are Assignment's. */
const listed = (ctx: PanelCtx) => ctx.data.customers.filter(c => c.assignedTo || c.teamId);

export function inboxVM(ctx: PanelCtx) {
  const { ui, set, me } = ctx;
  const all = listed(ctx).map(c => chatRow(ctx, c)).sort((a, b) => (lastReal(b.c)?.at ?? b.c.createdAt).localeCompare(lastReal(a.c)?.at ?? a.c.createdAt));
  const f = ui.inbTeam, who = ui.inbWho;
  const list = all.filter(r => (!f || r.seat.id === f) && (!who || r.c.assignedTo === who));
  // The Director's own customers are "Director" to the Principal; to the Director they are theirs (My CRM).
  const chipDefs: [string, string, string][] = [["", "All", "transparent"], ...(me.role === "hod" ? [] : ctx.directors.length ? [["hod", "Director", "#387557"] as [string, string, string]] : []), ...ctx.teams.map(t => [t.id, t.name, t.c] as [string, string, string])];
  const tSel = f && f !== "hod" ? ctx.teams.find(t => t.id === f) : null;
  const need = list.filter(r => r.needs);
  const col = (r: typeof all[number]) => (r.needs ? "need" : r.c.status === "appointment" ? "appt" : r.c.status === "won" ? "won" : r.c.status === "lost" ? "lost" : "fup");
  return {
    onInbox: ui.tab === "inbox" && !ui.lead,
    inbSummary: `${list.length} chats · ${need.length} need a reply`,
    inbHasChips: chipDefs.length > 1,
    inbChips: chipDefs.map(([id, label, dot]) => ({ label, dot, n: all.filter(r => !id || r.seat.id === id).length,
      bg: f === id ? "#BD4A19" : "#fff", fg: f === id ? "#fff" : "#3F2B22", bd: f === id ? "#BD4A19" : "#EBDDD2", pick: () => set(u => ({ ...u, inbTeam: id, inbWho: "" })) })),
    inbHasWho: !!tSel,
    inbWhoChips: tSel ? [["", "Everyone"], ...tSel.people.map(p => [p.id, first(p.name)])].map(([id, label]) => {
      const on = who === id;
      return { label, n: all.filter(r => r.seat.id === f && (!id || r.c.assignedTo === id)).length, bg: on ? "#3F2B22" : "transparent", fg: on ? "#fff" : "#806B60", bd: on ? "#3F2B22" : "#E2CFC1", pick: () => set(u => ({ ...u, inbWho: id })) };
    }) : [],
    inbCols: ([["need", "Needs a reply", "#A3371A", "#FBE4DE"], ["fup", "Follow up", "#A46312", "#FBF1E3"], ["appt", "Appointment", "#387557", "#E4F1E8"], ["won", "Won", "#2F6FB5", "#E4EDF8"], ["lost", "Lost", "#806B60", "#F2EDE9"]] as const)
      .map(([k, title, c, bg]) => { const rows = list.filter(r => col(r) === k); return { title, c, bg, n: rows.length, rows, empty: !rows.length }; }),
    openPc: () => set(u => ({ ...u, pcOpen: true })),
  };
}
export type InboxVM = ReturnType<typeof inboxVM>;

/** Contacts (from the Inbox): everyone's customers A–Z under letter heads; a row opens the chat in its owner's CRM. */
export function contactsVM(ctx: PanelCtx) {
  const { ui, set } = ctx, q = ui.pcQ.trim().toLowerCase();
  const rows = listed(ctx).map(c => chatRow(ctx, c)).filter(r => !q || r.name.toLowerCase().includes(q) || r.who.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  return {
    pcOpen: ui.pcOpen, pcQ: ui.pcQ, pcEmpty: !rows.length,
    closePc: () => set(u => ({ ...u, pcOpen: false, pcQ: "" })), setPcQ: (e: ChangeEvent<HTMLInputElement>) => { const v = e.target.value; set(u => ({ ...u, pcQ: v })); },
    pcRows: rows.map((r, k) => {
      const L = (r.name[0] ?? "#").toUpperCase(), prev = k ? (rows[k - 1].name[0] ?? "#").toUpperCase() : "";
      return { head: L !== prev ? L : "", hasHead: L !== prev, name: r.name, ini: r.ini, phone: phoneLabel(r.c.phone) || "—", tel: telHref(r.c.phone),
        status: r.needs ? "Follow up" : STATUS_LABEL[r.c.status], who: r.who, wc: r.wc, ownBg: r.ownBg, rule: L !== prev ? "0" : "1px solid #F3E9E1",
        open: () => { set(u => ({ ...u, pcOpen: false })); r.open(); } };
    }),
  };
}
