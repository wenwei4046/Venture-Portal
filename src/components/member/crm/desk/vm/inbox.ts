/**
 * Inbox (CRM Desktop rev 1, C1–C3): every chat, filtered by the Everyone picker (people and whole teams, several at
 * once) and the status chips; a chat opens docked beside the list. Also the team / person pane Insight opens, Customer
 * info, Assign to, and CRM alerts. The rows are the phone's (data.ts › chatRows); writes are the phone's actions.
 */
import { notifsVM } from "../../panel/vm/notifs";
import { infoRows } from "../../sales/vm/customer";
import { urgencyOf } from "../../sales/vm/common";
import type { DeskCtx } from "./ctx";
import { chatRows, initials, teamNameOf, type ChatRow } from "./data";
import { panelLike } from "./frame";
import { insightRange } from "./insight";
import { numbersOf, pct } from "../../panel/vm/common";
import { AV, DIRECTOR_C, DIRECTOR_TEAM, ST, teamColours } from "./tokens";

const chip = (key: string) => ST[key] ?? ST["Follow up"];

export function inboxVM(ctx: DeskCtx) {
  const { ui, set, patch, data, teams, W, now } = ctx;
  const all = chatRows(ctx).filter(x => x.c.assignedTo || x.c.teamId || x.key);
  const whoSel = ui.whoSel;
  const match1 = (w: string, x: ChatRow) => w.startsWith("team:") ? (x.team === w.slice(5) || (x.teamId === w.slice(5))) : x.ownerId === w;
  const match = (x: ChatRow) => !whoSel.length || whoSel.some(w => match1(w, x));
  const shown = all.filter(match);
  const F: [string, (x: ChatRow) => boolean][] = [
    ["All", () => true], ["Needs a reply", x => ["Overdue", "Urgent", "Reply soon", "New"].includes(x.key)], ["Follow up", x => x.key === "Follow up"],
    ["Appointment", x => x.key === "Appointment"], ["Won", x => x.key === "Won"], ["Lost", x => x.key === "Lost"],
  ];
  const fSel = F.find(f => f[0] === ui.inbF) ?? F[0];
  const list = shown.filter(fSel[1]);
  const short = (l: string) => (W >= 1440 ? l : l.replace("Needs a reply", "Reply").replace("Appointment", "Appt").replace("Follow up", "Follow"));
  const filters = F.map(([label, f]) => { const on = label === fSel[0];
    return { label: short(`${label} ${shown.filter(f).length}`), bg: on ? "#3F2B22" : "#fff", fg: on ? "#fff" : "#3F2B22", bd: on ? "#3F2B22" : "#EBDDD2", pick: () => patch({ inbF: label }) }; });
  const chats = list.map((x, i) => { const c = chip(x.key);
    return { ini: x.ini, name: x.name, time: x.time, ad: x.ad, msg: x.msg, owner: x.owner, status: x.status, stBg: c[0], stFg: c[1], avBg: AV[i % 5],
      rowBg: ui.pane === "docked" && ui.chat === x.id ? "#FFF1E6" : "#fff",
      open: () => patch({ pane: "docked", kind: "chat", chat: x.id, fromTeam: false, menu: false }) }; });

  // Everyone: people grouped by team in team colours, whole teams, several at once (C1).
  const opt = (label: string, val: string | null, n: number, grp: [string, string] | null, av: [string, string] | null) => {
    const sel = val ? whoSel.includes(val) : !whoSel.length;
    return { head: false, sel, unsel: !sel, label, n, hasN: n > 0, noN: n === 0, isGroup: !!grp, isPerson: !grp, isAll: !!grp && !val, isTeam: !!grp && !!val,
      letter: val?.startsWith("team:") ? label.replace(/^Team /, "").slice(0, 1) : "", tint: grp ? grp[0] : "", color: grp ? grp[1] : "", ini: initials(label),
      avBg: av ? av[0] : "#F5EBE3", avFg: av ? av[1] : "#4E2F20",
      pick: () => set(u => ({ ...u, whoSel: !val ? [] : u.whoSel.includes(val) ? u.whoSel.filter(x => x !== val) : [...u.whoSel, val] })) };
  };
  type Opt = ReturnType<typeof opt> | { head: true; sel: false; unsel: false; label: string; color: string };
  const whoOpts: Opt[] = [opt("Everyone", null, all.length, ["#F5EBE3", "#806B60"], null)];
  for (const d of ctx.directors) whoOpts.push(opt(d.name, d.id, all.filter(x => x.ownerId === d.id).length, null, [DIRECTOR_C[1], DIRECTOR_C[0]]));
  teams.forEach((t, k) => {
    const [ink, tint] = teamColours(k);
    whoOpts.push({ head: true, sel: false, unsel: false, label: t.name.toUpperCase(), color: ink });
    whoOpts.push(opt("Whole team", `team:${t.id}`, all.filter(x => x.team === t.name || x.teamId === t.id).length, [tint, ink], null));
    t.people.forEach((p, i) => whoOpts.push(opt(p.name, p.id, all.filter(x => x.ownerId === p.id).length, null, i === 0 ? [ink, "#FFFFFF"] : [tint, ink])));
  });
  const whoName = (w: string) => w.startsWith("team:") ? teams.find(t => t.id === w.slice(5))?.name ?? "" : ctx.nameOf(w);
  const whoChips = whoSel.map(w => { const team = w.startsWith("team:"), k = teams.findIndex(t => t.id === w.slice(5)), tc = team ? teamColours(k) : null;
    const label = whoName(w);
    return { label, ini: team ? label.replace(/^Team /, "").slice(0, 1) : initials(label), bg: tc ? tc[0] : "#FFF0E4", fg: tc ? "#fff" : "#BD4A19", tint: tc ? tc[1] : "#F7F0EA", ink: tc ? tc[0] : "#3F2B22",
      remove: () => set(u => ({ ...u, whoSel: u.whoSel.filter(x => x !== w) })) }; });

  return {
    kList: ui.tab === "inbox", chats, filters, showWho: true, whoOpen: ui.whoOpen, toggleWho: () => set(u => ({ ...u, whoOpen: !u.whoOpen })),
    whoLabel: !whoSel.length ? "Everyone" : whoSel.length === 1 ? whoName(whoSel[0]) : `${whoName(whoSel[0])} +${whoSel.length - 1}`,
    whoAvs: !whoSel.length ? [{ ini: "ALL", bg: "#F5EBE3", fg: "#806B60" }] : [{ ini: String(whoSel.length), bg: "#BD4A19", fg: "#fff" }],
    whoChips, whoCount: `${shown.length} chats`, whoClear: () => patch({ whoSel: [] }), whoOpts,
  };
}

/** The team / person pane Insight opens (B3): a team's people with their figures, then a person's leads. */
export function teamPaneVM(ctx: DeskCtx) {
  const { ui, patch, data, teams, now } = ctx;
  const { r } = insightRange(ctx);
  const isDir = ui.team === DIRECTOR_TEAM, t = teams.find(x => x.id === ui.team);
  const people = isDir ? ctx.directors : t?.people ?? [];
  const rows = chatRows(ctx);
  const person = ui.person ? people.find(p => p.id === ui.person) : undefined;
  return {
    teamName: isDir ? DIRECTOR_TEAM : t?.name ?? "", teamPeople: !ui.person, personChats: !!ui.person,
    people: people.map(p => { const m = numbersOf(data.customers.filter(c => c.assignedTo === p.id), data.visits, r, now);
      return { name: p.name, leads: m.leads, appt: pct(m.booked, m.leads), show: pct(m.came, m.due), ini: initials(p.name),
        chats: `${m.leads} ${m.leads === 1 ? "lead" : "leads"}`, open: () => patch({ person: p.id }) }; }),
    pChats: rows.filter(x => x.ownerId === ui.person).map(x => { const c = chip(x.key);
      return { ini: x.ini, name: x.name, time: x.time, ad: x.ad, msg: x.msg, status: x.status, stBg: c[0], stFg: c[1], open: () => patch({ kind: "chat", chat: x.id, fromTeam: true }) }; }),
    pNoChats: !!ui.person && !rows.some(x => x.ownerId === ui.person), backToTeam: () => patch({ person: null }),
    chatFromTeam: ui.kind === "chat" && ui.pane === "overlay" && ui.fromTeam && !!ui.person,
    backPersonLabel: `${person?.name ?? ""} · their leads`, backToPerson: () => patch({ kind: "team", fromTeam: false }),
    teamHead: { title: person?.name ?? (isDir ? DIRECTOR_TEAM : t?.name ?? ""), sub: person ? `${isDir ? DIRECTOR_TEAM : t?.name ?? ""} · their leads` : `${isDir ? "Own customers" : t?.who ?? ""} · its people this period` },
  };
}

/** Customer info (B1 / E2): the phone's rows (sales/vm/customer.ts), then Open chat. */
export function infoVM(ctx: DeskCtx) {
  const { ui, patch, data } = ctx;
  const visit = ui.visit ? data.visits.find(v => v.id === ui.visit) : undefined;
  const id = ui.infoId ?? visit?.customerId ?? null;
  const c = id ? data.customers.find(x => x.id === id) : undefined;
  const rows = c ? infoRows(c).map(r => [r.k, r.v] as [string, string]) : [];
  // The prototype's order: …, Status, then the visit (Visit, Showroom), the Salesperson, then the customer's details.
  const next = c ? data.visits.filter(v => v.customerId === c.id && v.state !== "cancelled").sort((a, b) => b.start.localeCompare(a.start))[0] : undefined;
  const vis = visit ?? next;
  const mid: [string, string][] = c ? [
    ["Visit", vis ? `${new Date(vis.start).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}, ${new Date(vis.start).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}` : "—"],
    ["Showroom", vis ? data.rooms.find(r => r.id === vis.showroomId)?.name ?? "—" : "—"],
    ["Salesperson", c.assignedTo ? ctx.nameOf(c.assignedTo) : "—"],
  ] : [];
  const at = rows.findIndex(r => r[0] === "Status") + 1;
  const all: [string, string][] = c ? [...rows.slice(0, at), ...mid, ...rows.slice(at)] : [];
  return {
    ci: { name: c?.name ?? "", ini: initials(c?.name ?? "?"), rows: all.map(([k, val], i) => ({ k, v: val || "—", bt: i ? "1px solid #F1E7DF" : "0", w: !val || val === "—" ? 400 : 650, c: !val || val === "—" ? "#A08E82" : "#3F2B22" })) },
    infoChat: ui.kind === "info" && !!c, openInfoChat: () => { if (c) patch({ kind: "chat", chat: c.id, fromInfo: true }); },
    infoHead: { title: "Customer info", sub: c ? (visit ? `${c.name} · visit ${new Date(visit.start).toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : c.name) : "" },
  };
}

/** Assign to (C3): people grouped by team in team colours, name + team. Sends through crm_send_to (30 s Undo). */
export function assignVM(ctx: DeskCtx) {
  const { ui, patch, set, teams, data } = ctx;
  const cid = ui.chat;
  const groups = [
    ...(ctx.directors.length ? [{ label: DIRECTOR_TEAM.toUpperCase(), color: DIRECTOR_C[0], people: ctx.directors.map(d => ({ id: d.id, name: d.name, sub: DIRECTOR_TEAM })) }] : []),
    ...teams.map((t, k) => ({ label: t.name.toUpperCase(), color: teamColours(k)[0], people: t.people.map(p => ({ id: p.id, name: p.name, sub: t.name })) })),
  ];
  return {
    showAssign: data.can.manage, showMove: false, menuOpen: ui.menu, menuBtnBg: ui.menu ? "#FFF1E6" : "#fff",
    toggleMenu: () => set(u => ({ ...u, menu: !u.menu })), closeMenu: () => patch({ menu: false }),
    openAssign: () => patch({ menu: false, kind: "assign" }), backToChat: () => patch({ kind: "chat" }),
    openInfo: () => { if (cid) patch({ menu: false, kind: "info", infoId: cid, visit: null }); },
    openBook: () => { if (cid) patch({ menu: false, kind: "book" }); },
    assignGroups: groups.map(g => ({ label: g.label, color: g.color, people: g.people.map(p => ({ name: p.name, ini: initials(p.name), sub: p.sub,
      pick: () => { if (!cid) return; void sendTo(ctx, cid, p.id, "Sent").then(() => patch({ kind: "chat" })); } })) })),
  };
}

/** Send a customer to somebody (crm_send_to), with the 30 s Undo the phone panel has. */
export async function sendTo(ctx: DeskCtx, customerId: string, staffId: string, verb: "Sent" | "Moved") {
  const c = ctx.data.customers.find(x => x.id === customerId), prev = c?.assignedTo ?? null;
  const ok = await ctx.act.sendTo(customerId, staffId);
  if (!ok) return false;
  ctx.patch({ toast: `${verb} ${c?.name ?? "customer"} to ${ctx.nameOf(staffId)}`, undo: { kind: "send", customerId, prev, until: Date.now() + 30_000 } });
  return true;
}

/** CRM alerts (the header's button, frame 1d): Move · Share · Won · Lost · Overdue 9 h+, newest first. */
export function alertsVM(ctx: DeskCtx) {
  const n = notifsVM(panelLike(ctx));
  const ev = ctx.data.events.slice(0, 30).map(e => {
    const c = ctx.data.customers.find(x => x.id === e.customerId);
    const kind = e.kind === "won" ? "Won" : e.kind === "lost" ? "Lost" : e.kind === "moved" ? "Move" : e.kind === "shared" ? "Share" : "";
    const color = e.kind === "won" ? "#387557" : e.kind === "lost" ? "#806B60" : e.kind === "moved" ? "#8E4B6E" : "#2F6FB5";
    const who = e.actor ? ctx.nameOf(e.actor) : "";
    return kind ? { kind, color, at: e.at, time: new Date(e.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }),
      title: `${c?.name ?? "A customer"} · ${kind === "Move" ? "moved" : kind === "Share" ? "shared" : kind}`, sub: `${who}${c ? ` · ${c.ad}` : ""}`, id: e.customerId } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  const overdue = ctx.data.customers.filter(c => { const u = urgencyOf(c, ctx.now); return u.level === "overdue" && u.waitingMinutes >= 9 * 60; })
    .map(c => ({ kind: "Overdue 9 h+", color: "#A3371A", at: c.lastCustomerAt ?? c.createdAt, time: "", title: `${c.name} · ${urgencyOf(c, ctx.now).label}`,
      sub: `${c.assignedTo ? ctx.nameOf(c.assignedTo) : "No one yet"} · ${teamNameOf(ctx, c.assignedTo) ?? ""}`, id: c.id }));
  const alerts = [...overdue, ...ev].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40)
    .map(a => ({ kind: a.kind, color: a.color, time: a.time || new Date(a.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }), title: a.title, sub: a.sub,
      open: () => ctx.patch({ tab: "inbox", pane: "docked", kind: "chat", chat: a.id }) }));
  return { alerts, alertsUnread: Number(n.notifUnread) || 0 };
}
