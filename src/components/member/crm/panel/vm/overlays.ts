/**
 * What opens over the Control panel (design 1a): the 30-second Undo bar,
 * Send to (an Organic Lead), Move (from Awaiting reply), Awaiting reply
 * itself, View as, Contacts and Notifications.
 */
import type { ChangeEvent, MouseEvent } from "react";
import { urgencyOf } from "../../sales/vm/common";
import { titleOf } from "../../shared/people";
import { contactsVM } from "./inbox";
import { reassign } from "./lead";
import { notifsVM } from "./notifs";
import { ini, LEVELS, pickGroups, stop, type PanelCtx } from "./common";
import { lastChat } from "../../sales/vm/common";

/** Everyone waiting on a reply, by level (Overdue 9 h · Urgent 6 h · Reply soon 3 h), longest wait first. */
export function waitingByLevel(ctx: PanelCtx) {
  const { data, now, nameOf, ui, patch } = ctx;
  const withU = data.customers.map(c => ({ c, u: urgencyOf(c, now) })).filter(x => x.u.level !== "none").sort((a, b) => b.u.waitingMinutes - a.u.waitingMinutes);
  return LEVELS.map(([k, name, c]) => ({ k, name, c,
    items: withU.filter(x => x.u.level === k).map(({ c: cu, u }) => {
      const rec = ui.movedRec[cu.id];
      return { id: cu.id, name: cu.name, ini: ini(cu.name), ad: cu.ad, owner: nameOf(cu.assignedTo), wait: `${Math.floor(u.waitingMinutes / 60)} h`,
        movedTo: rec ? `Moved to ${nameOf(rec.to)}` : "", notMoved: !rec,
        move: (e: MouseEvent) => { e.stopPropagation(); patch({ mvFor: cu.id, mvSel: null }); } };
    }) }));
}

export function overlaysVM(ctx: PanelCtx) {
  const { ui, patch, set, data, nameOf, now } = ctx;

  // Undo: the last send / move, for 30 seconds (the screen counts down).
  const u = ui.undo;
  const undo = {
    undoOn: !!u, undoText: u ? `${u.name} ${u.verb} ${u.to}` : "", undoLeft: u ? `${u.left}s` : "", undoPct: u ? `${(u.left / 30) * 100}%` : "0%",
    undoDo: () => {
      if (!u) return;
      set(x => ({ ...x, undo: null }));
      void ctx.act.sendTo(u.customerId, u.prev).then(ok => { if (ok) set(x => { const m = { ...x.movedRec }; delete m[u.customerId]; return { ...x, movedRec: m }; }); });
    },
    undoClose: () => patch({ undo: null }),
  };

  // Send to: an Organic Lead to anyone who takes enquiries, the HOD first.
  const w = ui.sendFor ? data.customers.find(c => c.id === ui.sendFor) : undefined;
  const sdName = ui.sdSel ? nameOf(ui.sdSel) : "";
  const last = w ? [...w.messages].reverse().find(m => m.from === "lead") : undefined;
  const sd = {
    sdOpen: !!w, sdClose: () => patch({ sendFor: null, sdSel: null }), sdName: w?.name ?? "",
    sdAd: w ? `${w.ad} · ${last ? lastChat(last.at, now) : lastChat(w.createdAt, now)}` : "",
    sdBtnLabel: sdName ? `Confirm · send to ${sdName}` : "Choose a person", sdBtnBg: sdName ? "#BD4A19" : "#D9C7BA", sdBtnCur: sdName ? "pointer" : "default",
    sdConfirm: w && ui.sdSel ? () => void reassign(ctx, w, ui.sdSel!, "send", { sendFor: null, sdSel: null }) : undefined,
    sdGroups: w ? pickGroups(ctx, { sel: ui.sdSel, pick: id => patch({ sdSel: id }) }) : [],
  };

  // Move: a waiting customer to someone else (Awaiting reply).
  const L = ui.mvFor ? data.customers.find(c => c.id === ui.mvFor) : undefined;
  const mvName = ui.mvSel ? nameOf(ui.mvSel) : "";
  const mv = {
    mvOpen: !!L, mvClose: () => patch({ mvFor: null, mvSel: null }), mvName: L?.name ?? "", mvAd: L ? `${L.ad} · now with ${nameOf(L.assignedTo)}` : "",
    mvGroups: L ? pickGroups(ctx, { skip: L.assignedTo, sel: ui.mvSel, pick: id => patch({ mvSel: id }) }) : [],
    mvBtnLabel: mvName ? `Confirm · move to ${mvName}` : "Choose a person", mvBtnBg: mvName ? "#BD4A19" : "#D9C7BA", mvBtnCur: mvName ? "pointer" : "default",
    mvConfirm: L && ui.mvSel ? () => void reassign(ctx, L, ui.mvSel!, "move", { mvFor: null, mvSel: null }) : undefined,
  };

  // Awaiting reply: everyone's waiting customers; tap → their chat; Move hands one on.
  const by = waitingByLevel(ctx), af = ui.attF, tot = by.reduce((n, g) => n + g.items.length, 0);
  const seg = (k: typeof af, label: string, dot: string, n: number) => ({ label, dot, n, pick: () => patch({ attF: k }), bg: af === k ? dot : "#fff", bd: af === k ? dot : "#EBDDD2", fg: af === k ? "#fff" : "#3F2B22", w: af === k ? 650 : 500, nBg: af === k ? "rgba(255,255,255,.22)" : dot, nFg: "#fff" });
  const att = {
    attOpen: ui.att, closeAtt: () => patch({ att: false }),
    attTabs: [seg("all", "All", "#3F2B22", tot), ...by.map(g => seg(g.k, g.name, g.c, g.items.length))],
    attGroups: by.filter(g => (af === "all" || g.k === af) && g.items.length).map(g => ({ ...g, n: g.items.length,
      items: g.items.map(i => ({ ...i, open: () => patch({ att: false, tab: "overview", lead: i.id, pick: "", toast: "" }) })) })),
    attEmpty: !by.some(g => (af === "all" || g.k === af) && g.items.length),
  };

  // View as: anyone's own CRM, by team.
  const q = ui.vaQ.trim().toLowerCase();
  const vaGroups = [
    ...(ctx.directors.length ? [{ name: "Director", people: ctx.directors }] : []),
    ...ctx.teams.map(t => ({ name: t.name, people: t.people })),
  ].map(g => {
    const ps = g.people.filter(p => !q || `${p.name} ${titleOf(p)}`.toLowerCase().includes(q));
    return { name: g.name, n: ps.length, people: ps.map((p, k) => ({ name: p.name, ini: ini(p.name), title: titleOf(p), rule: k ? "1px solid #F3E9E1" : "0", pick: () => { patch({ viewAs: false, vaQ: "" }); ctx.openCrmOf(p.id); } })) };
  }).filter(g => g.n);
  const va = { vaOpen: ui.viewAs, closeViewAs: () => patch({ viewAs: false }), vaQ: ui.vaQ, vaSetQ: (e: ChangeEvent<HTMLInputElement>) => { const v = e.target.value; set(x => ({ ...x, vaQ: v })); }, vaGroups, vaNone: !vaGroups.length };

  const nf = notifsVM(ctx), pc = contactsVM(ctx);
  return { stop, ...undo, ...sd, ...mv, ...att, ...va, ...pc,
    notifOpen: nf.notifOpen, closeNotifs: nf.closeNotifs, readAll: nf.readAll, readAllFg: nf.readAllFg, nfChips: nf.nfChips, nfGroups: nf.nfGroups, nfEmpty: nf.nfEmpty };
}
export type OverlaysVM = ReturnType<typeof overlaysVM>;
