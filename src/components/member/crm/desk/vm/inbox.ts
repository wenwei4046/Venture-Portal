/**
 * Inbox (CRM Desktop rev 1, C1–C3): every chat, filtered by the Everyone picker (people and whole teams, several at
 * once) and the status chips; a chat opens docked beside the list. Also the team / person pane Insight opens, Customer
 * info, Assign to, and CRM alerts. The rows are the phone's (data.ts › chatRows); writes are the phone's actions.
 */
import { panelNotifs, type PanelNotif } from "../../panel/vm/notifs";
import { infoRows } from "../../sales/vm/customer";
import { CHANNEL, STATUS_LABEL, lastReal, urgencyOf } from "../../sales/vm/common";
import { mediaWord } from "../../shared/chat-media";
import type { DeskCtx } from "./ctx";
import { chatRows, initials, teamNameOf, type ChatRow } from "./data";
import { panelLike } from "./frame";
import { insightRange } from "./insight";
import { numbersOf, pct } from "../../panel/vm/common";
import { DIRECTOR_C, DIRECTOR_TEAM, ST, teamColours } from "./tokens";
import { avatarTint } from "../../shared/palette";
import { adHref } from "../../shared/AdLink";
import { isNewChat } from "../../shared/new-chat";
import { jobTitle, personOf } from "../../shared/people";

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
    return { label: short(`${label} ${shown.filter(f).length}`), bg: on ? "var(--crm-ink)" : "#fff", fg: on ? "#fff" : "var(--crm-ink)", bd: on ? "var(--crm-ink)" : "var(--crm-rule)", pick: () => patch({ inbF: label }) }; });
  // One's own marks on a chat (the ⋮ menu, README › To build): pinned first, then by the last message as before.
  const pref = (id: string) => data.prefs[id];
  const ordered = [...list].sort((a, b) => Number(!!pref(b.id)?.pinned) - Number(!!pref(a.id)?.pinned));
  const chats = ordered.map(x => { const c = chip(x.key), p = pref(x.id), n = x.c.unread, dot = !n && !!p?.markedUnread;
    return { ini: x.ini, name: x.name, time: x.time, ad: x.ad, msg: x.msg, owner: x.owner, status: x.status, stBg: c[0], stFg: c[1], avBg: avatarTint(x.name)[0], avFg: avatarTint(x.name)[1],
      rowBg: ui.pane === "docked" && ui.chat === x.id ? "var(--crm-tint-attention)" : "#fff",
      pinned: !!p?.pinned, muted: !!p?.muted, unreadN: n > 0 ? (n > 99 ? "99+" : String(n)) : "", unreadDot: dot,
      timeFg: n > 0 || dot ? "var(--crm-rust)" : "var(--crm-faint)", timeW: n > 0 || dot ? 650 : undefined,
      canSend: false, send: () => {}, sendBg: "#fff",
      open: () => patch({ pane: "docked", kind: "chat", chat: x.id, fromTeam: false, menu: false, msgMenu: null, replyTo: null, attachOpen: false, emo: null }) }; });

  // Everyone: people grouped by team in team colours, whole teams, several at once (C1).
  const opt = (label: string, val: string | null, n: number, grp: [string, string] | null, av: [string, string] | null) => {
    const sel = val ? whoSel.includes(val) : !whoSel.length;
    return { head: false, sel, unsel: !sel, label, n, hasN: n > 0, noN: n === 0, isGroup: !!grp, isPerson: !grp, isAll: !!grp && !val, isTeam: !!grp && !!val,
      letter: val?.startsWith("team:") ? label.replace(/^Team /, "").slice(0, 1) : "", tint: grp ? grp[0] : "", color: grp ? grp[1] : "", ini: initials(label),
      avBg: av ? av[0] : "var(--crm-field)", avFg: av ? av[1] : "var(--crm-ink)",
      pick: () => set(u => ({ ...u, whoSel: !val ? [] : u.whoSel.includes(val) ? u.whoSel.filter(x => x !== val) : [...u.whoSel, val] })) };
  };
  type Opt = ReturnType<typeof opt> | { head: true; sel: false; unsel: false; label: string; color: string };
  const whoOpts: Opt[] = [opt("Everyone", null, all.length, ["var(--crm-field)", "var(--crm-muted)"], null)];
  for (const d of ctx.directors) whoOpts.push(opt(d.name, d.id, all.filter(x => x.ownerId === d.id).length, null, [DIRECTOR_C[1], DIRECTOR_C[0]]));
  teams.forEach((t, k) => {
    const [ink, tint] = teamColours(k);
    whoOpts.push({ head: true, sel: false, unsel: false, label: t.name.toUpperCase(), color: ink });
    whoOpts.push(opt("Whole team", `team:${t.id}`, all.filter(x => x.team === t.name || x.teamId === t.id).length, [tint, ink], null));
    t.people.forEach((p, i) => whoOpts.push(opt(p.name, p.id, all.filter(x => x.ownerId === p.id).length, null, i === 0 ? [ink, "var(--crm-page)"] : [tint, ink])));
  });
  const whoName = (w: string) => w.startsWith("team:") ? teams.find(t => t.id === w.slice(5))?.name ?? "" : ctx.nameOf(w);
  const whoChips = whoSel.map(w => { const team = w.startsWith("team:"), k = teams.findIndex(t => t.id === w.slice(5)), tc = team ? teamColours(k) : null;
    const label = whoName(w);
    return { label, ini: team ? label.replace(/^Team /, "").slice(0, 1) : initials(label), bg: tc ? tc[0] : "var(--crm-tint-attention)", fg: tc ? "#fff" : "var(--crm-rust)", tint: tc ? tc[1] : "var(--crm-field)", ink: tc ? tc[0] : "var(--crm-ink)",
      remove: () => set(u => ({ ...u, whoSel: u.whoSel.filter(x => x !== w) })) }; });

  return {
    kList: ui.tab === "inbox", chats, filters, showWho: true,
    // 4a's Inbox list (frame 02): Everyone ▾, search, the eight status tabs Mine and Team share, the rows.
    list4: (() => {
      const isCold = (x: ChatRow) => x.key === "Cold";
      const T4: [string, (x: ChatRow) => boolean, boolean][] = [
        ["All", () => true, false], ["New", x => !isCold(x) && isNewChat(x.c), false], ["Attention", x => ["Overdue", "Urgent", "Reply soon"].includes(x.key), true],
        ["Follow up", x => x.key === "Follow up", false], ["Appointment", x => x.key === "Appointment", false], ["Won", x => x.key === "Won", false],
        ["Lost", x => x.key === "Lost", false], ["Cold leads", isCold, false]];
      const cur = T4.find(t => t[0] === ui.inbF) ?? T4[0];
      const q = (ui.ibQ ?? "").trim().toLowerCase();
      const hit = (x: ChatRow) => !q || x.name.toLowerCase().includes(q) || x.msg.toLowerCase().includes(q) || (x.ad ?? "").toLowerCase().includes(q);
      const rows = [...shown.filter(cur[1]).filter(hit)].sort((a, b) => Number(!!pref(b.id)?.pinned) - Number(!!pref(a.id)?.pinned));
      const DAY_MS = 86400000, fmtVisit = (t: Date) => `${t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
      return {
        q: ui.ibQ ?? "", setQ: (e: { target: { value: string } }) => patch({ ibQ: e.target.value }),
        tabs: T4.map(([label, f, hot]) => ({ label, count: shown.filter(f).length, on: label === cur[0], hot, pick: () => patch({ inbF: label }) })),
        rows: rows.map(x => {
          const p = pref(x.id), n = x.c.unread, dot = !n && !!p?.markedUnread, [avBg, avFg] = avatarTint(x.name);
          const u = urgencyOf(x.c, now), visit = data.visits.filter(v => v.customerId === x.id && v.state === "booked" && new Date(v.start) >= now).sort((a, b) => a.start.localeCompare(b.start))[0];
          const lastIn = x.c.lastCustomerAt ? new Date(x.c.lastCustomerAt).getTime() : null;
          const note = u.level !== "none" ? { text: u.label, kind: u.level === "soon" ? "warm" : "hot" }
            : visit ? { text: `Visit · ${fmtVisit(new Date(visit.start))}`, kind: "calm" }
              : isCold(x) && lastIn ? { text: `Cold · ${Math.max(1, Math.floor((now.getTime() - lastIn) / DAY_MS))} d`, kind: "mute" } : null;
          const sel = ui.pane === "docked" && ui.chat === x.id;
          return { id: x.id, name: x.name, ini: x.ini, avBg, avFg, ch: x.c.channel, ad: x.ad, msg: x.msg, time: x.time, unread: n > 0 ? (n > 99 ? "99+" : String(n)) : "", dot,
            hot: n > 0 || dot, owner: x.owner, pinned: !!p?.pinned, muted: !!p?.muted, sel,
            note: note?.text ?? "", noteColor: !note ? "" : note.kind === "hot" ? "var(--crm-oxblood)" : note.kind === "warm" ? "var(--crm-ink)" : note.kind === "calm" ? "var(--crm-ink-soft)" : "var(--crm-faint)",
            noteWeight: note?.kind === "hot" ? 600 : 500, noteIcon: !note ? null : note.kind === "calm" ? "calendar" : note.kind === "hot" && u.level === "overdue" ? "triangle-alert" : "clock",
            open: () => patch({ pane: "docked", kind: "chat", chat: x.id, fromTeam: false, menu: false, msgMenu: null, replyTo: null, attachOpen: false, emo: null }) };
        }),
      };
    })(),
    // v2 keeps the Action tab's markup (Organic leads); there is no such tab since 2026-10-13.
    isAction: false, notAction: true, actN: 0, actEmpty: false, whoOpen: ui.whoOpen, toggleWho: () => set(u => ({ ...u, whoOpen: !u.whoOpen })),
    whoLabel: !whoSel.length ? "Everyone" : whoSel.length === 1 ? whoName(whoSel[0]) : `${whoName(whoSel[0])} +${whoSel.length - 1}`,
    whoAvs: !whoSel.length ? [{ ini: "ALL", bg: "var(--crm-field)", fg: "var(--crm-muted)" }] : [{ ini: String(whoSel.length), bg: "var(--crm-rust)", fg: "#fff" }],
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
    ci: { name: c?.name ?? "", ini: initials(c?.name ?? "?"), rows: all.map(([k, val], i) => ({ k, v: val || "—", href: k === "Ad" ? adHref(c?.adUrl) : null, bt: i ? "1px solid var(--crm-field)" : "0", w: !val || val === "—" ? 400 : 650, c: !val || val === "—" ? "var(--crm-faint)" : "var(--crm-ink)" })) },
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
    showAssign: data.can.manage, showMove: false, menuOpen: ui.menu, menuBtnBg: ui.menu ? "var(--crm-tint-attention)" : "#fff",
    toggleMenu: () => set(u => ({ ...u, menu: !u.menu })), closeMenu: () => patch({ menu: false }),
    openAssign: () => patch({ menu: false, kind: "assign" }), backToChat: () => patch({ kind: "chat" }),
    openInfo: () => { if (cid) patch({ menu: false, kind: "info", infoId: cid, visit: null }); },
    openBook: () => { if (cid) patch({ menu: false, kind: "book" }); },
    assignGroups: groups.map(g => ({ label: g.label, color: g.color, people: g.people.map(p => ({ name: p.name, ini: initials(p.name), sub: p.sub,
      pick: () => { if (!cid) return; void sendTo(ctx, cid, p.id, "Sent").then(() => patch({ kind: "chat" })); } })) })),
  };
}

/** Send a customer to somebody (crm_send_to), with the 30 s Undo the phone panel has. Never "Moved": that is a request. */
export async function sendTo(ctx: DeskCtx, customerId: string, staffId: string, verb: "Sent" | "Assigned") {
  const c = ctx.data.customers.find(x => x.id === customerId), prev = c?.assignedTo ?? null;
  const ok = await ctx.act.sendTo(customerId, staffId);
  if (!ok) return false;
  ctx.patch({ toast: `${verb} ${c?.name ?? "customer"} to ${ctx.nameOf(staffId)}`, undo: { kind: "send", customerId, prev, until: Date.now() + 30_000 } });
  return true;
}

/**
 * CRM alerts (the header's button, frame 1d): Move · Share · Won · Lost · Overdue 9 h+, newest first — the panel's own
 * notifications (`panelNotifs`), so an alert read here is read on the phone and on Settings › Notifications too
 * (crm_read_notifs). The owner, 2026-10-15: a tap opens its chat, each says more (who did what, the customer's channel,
 * ad, status, owner and last words), and Mark as read — the design drew the rows alone with a fixed "Unread 4 | Read".
 */
export function alertsVM(ctx: DeskCtx) {
  const { data, patch, now } = ctx, pc = panelLike(ctx), act = pc.act;
  const all = panelNotifs(pc);
  const isRead = (n: PanelNotif) => data.notifRead.includes(n.key) || (!!data.notifsSeenAt && n.at <= data.notifsSeenAt);
  const unread = all.filter(n => !isRead(n)), read = all.filter(isRead);
  // All · Unread · Read, on All (the owner, 2026-10-16: "Notification 要有一個 all，看過的要能看回去").
  const tab = ctx.ui.alR ?? "all", list = (tab === "read" ? read : tab === "unread" ? unread : all).slice(0, 60);
  const today = new Date(now).toDateString();
  const when = (iso: string) => { const d = new Date(iso), t = d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
    return d.toDateString() === today ? t : `${d.toLocaleDateString("en-MY", { day: "numeric", month: "short" })}, ${t}`; };
  const KIND: Record<PanelNotif["kind"], [string, string]> = { assign: ["Assign", "var(--crm-muted)"], move: ["Move", "var(--crm-ink-soft)"], share: ["Share", "var(--crm-ink-soft)"], won: ["Won", "var(--crm-brown)"], lost: ["Lost", "var(--crm-muted)"], overdue: ["Overdue 9 h+", "var(--crm-oxblood)"] };
  const rows = list.map(n => {
    const c = n.customerId ? data.customers.find(x => x.id === n.customerId) : undefined, unr = !isRead(n), [kind, color] = KIND[n.kind];
    const last = c ? lastReal(c) : undefined;
    const open = () => { if (unr) act.readNotifs([n.key]); if (c) patch({ tab: "inbox", pane: "docked", kind: "chat", chat: c.id, fromTeam: false, menu: false, msgMenu: null, replyTo: null, attachOpen: false, emo: null }); };
    return { key: n.key, kind, color, time: when(n.at), unread: unr, bg: unr ? "var(--crm-page)" : "#fff", dot: unr ? color : "var(--crm-rule)",
      title: c?.name ?? n.lead,
      line: n.kind === "overdue" ? `Waiting ${Math.floor(urgencyOf(c ?? ({} as never), now).waitingMinutes / 60) || 9} h for ${n.lead === "a reply" ? "a reply" : `${n.lead}'s reply`}`
        : [n.who, n.text.replace(/ ·$/, ""), n.tail.trim()].filter(Boolean).join(" "),
      extra: n.extra,
      sub: c ? [CHANNEL[c.channel].name, c.ad, STATUS_LABEL[c.status], c.assignedTo ? ctx.nameOf(c.assignedTo) : "No one yet"].filter(Boolean).join(" · ") : "",
      quote: last ? `${last.from === "me" ? "You: " : ""}${last.text || mediaWord(last)}` : "", hasQuote: !!last,
      canOpen: !!c, open,
      markRead: unr ? (e?: { stopPropagation(): void }) => { e?.stopPropagation(); act.readNotifs([n.key]); } : null };
  });
  // Invitations to me (2026-10-23 — a Move is a request on the computer too, so whoever it asks answers it here): Mine ›
  // Notifications' own cards (sales/vm/notifs.ts), Accept · Decline through crm_answer_invite. Unread until answered,
  // never under Read; once answered the database's event (moved / declined, shared / declined) is the alert.
  const invites = (tab === "read" ? [] : data.invites.filter(i => i.to === ctx.me.id && i.state === "pending"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(i => {
      const from = ctx.nameOf(i.from), c = data.customers.find(x => x.id === i.customerId), [kind, color] = KIND[i.kind];
      return { key: i.id, kind, color, time: when(i.createdAt),
        title: i.kind === "share" ? `${from} invited you to a chat` : `${from} wants to move a lead to you`,
        sub: [i.customerName || c?.name, c ? CHANNEL[c.channel].name : ""].filter(Boolean).join(" · "),
        accept: () => void act.answerInvite(i.id, true), decline: () => void act.answerInvite(i.id, false) };
    });
  const waiting = data.invites.filter(i => i.to === ctx.me.id && i.state === "pending").length;
  return {
    alerts: rows, alertsUnread: unread.length + waiting,
    alertsP: { rows, tab, invites,
      tabs: ([["all", "All", all.length + waiting], ["unread", "Unread", unread.length + waiting], ["read", "Read", read.length]] as const).map(([k, label, nn]) => ({ label: nn ? `${label} ${nn}` : label, on: tab === k, pick: () => patch({ alR: k }) })),
      markAll: unread.length ? () => act.readNotifs(unread.map(n => n.key), true) : null,
      empty: tab === "read" ? "Nothing read yet" : tab === "unread" ? "No unread alerts · you're all caught up" : "No alerts yet" },
  };
}

/** CRM alerts' badge: the alerts not read yet (rev 1 drew the design's sample 7; v2 first counted every alert). */
export const alertsUnreadN = (ctx: DeskCtx) => alertsVM(ctx).alertsUnread;

/**
 * Whose direct superior a Move asks — crm_invite's own rule: whoever has the customer, when one may move another's
 * (Edit · All); oneself for one's own, or one nobody has yet.
 */
export const moveHolder = (ctx: DeskCtx, c: DeskCtx["data"]["customers"][number] | undefined) =>
  c?.assignedTo && c.assignedTo !== ctx.me.id && ctx.data.can.editAll ? c.assignedTo : ctx.me.id;

/**
 * The chat's ⋮ menu (CRM Desktop v2, README › ⋮ menu), three groups: Assign to (CRM · Manage) · Move · Share | Customer
 * info · Appointment · Starred messages | Mark as unread / read · Mute / Unmute · Pin / Unpin chat — the last three are
 * one's own marks on the chat (crm_contact_prefs, the phone's swipe actions), shown on Inbox's row, each with a toast.
 * Move / Share (README › Move / Share rules): Move is the phone's (2026-10-23 — the owner: "桌面版的 move follow 和
 * 手机版，本质上他们是同一套规则的 by right 是要一样的"; it moved the customer at once through crm_send_to until then): a
 * REQUEST to the direct superior of whoever has the customer — one's own (or one nobody has yet): one's own superior;
 * somebody else's, which Edit · All may move: theirs, as crm_invite asks — and nothing changes hands until they Accept
 * (CRM alerts' Invitations here, Notifications on the phone). Nobody above — the Principal's own — "You're the top
 * level", Invite your team. Share invites within one's own chain — above, same level, below, never another team; for
 * the Principal and the Director that is everybody (the database's Edit · All, crm_invite).
 */
export function chatMenuVM(ctx: DeskCtx, chat: { starCount: number; starredOpen(): void }) {
  const { ui, patch, data, me, act, nameOf, teams } = ctx;
  const c = ui.chat ? data.customers.find(x => x.id === ui.chat) : undefined;
  const pref = c ? data.prefs[c.id] : undefined;
  const unread = !!c && (!!pref?.markedUnread || c.unread > 0), muted = !!pref?.muted, pinned = !!pref?.pinned;
  const flag = (p: Partial<{ markedUnread: boolean; muted: boolean; pinned: boolean }>, msg: string) => { if (!c) return; patch({ menu: false, toast: msg }); void act.setPref(c.id, p); };
  const top = me.role === "boss";
  // Whom a Move asks: the superior of whoever has the customer, never oneself.
  const holder = moveHolder(ctx, c);
  const up = personOf(personOf(holder, data.people)?.uplineId, data.people);
  const upTo = up && up.id !== me.id ? up : undefined;
  const items: [string, string, string, () => void, string, boolean][] = [
    ...(data.can.manage ? [["Assign to", "var(--crm-ink-soft)", "M7 17 3 13l4-4M3 13h14M17 7l4 4-4 4M21 11H7", () => patch({ menu: false, kind: "assign" }), "", false] as [string, string, string, () => void, string, boolean]] : []),
    // Move only when there is somebody to hand over to, as on the phone — the Principal keeps the design's top-level page.
    ...(upTo || top ? [["Move", "var(--crm-rust)", "M12 19V5M5 12l7-7 7 7", () => patch({ menu: false, kind: "move" }), "", false] as [string, string, string, () => void, string, boolean]] : []),
    ["Share", "var(--crm-brown)", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6", () => patch({ menu: false, kind: "share" }), "", false],
    ["Customer info", "var(--crm-brown)", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0", () => { if (c) patch({ menu: false, kind: "info", infoId: c.id, visit: null }); }, "", true],
    ["Appointment", "var(--crm-ink-soft)", "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14", () => { if (c) patch({ menu: false, kind: "book", book: null }); }, "", false],
    ["Starred messages", "var(--crm-brown)", "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z", () => { patch({ menu: false }); chat.starredOpen(); }, `${chat.starCount} in this chat`, false],
    [unread ? "Mark as read" : "Mark as unread", "var(--crm-ink-soft)", "M21 12a9 9 0 1 1-9-9M19 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
      () => { if (!c) return; if (unread) { flag({ markedUnread: false }, "Marked as read"); if (c.assignedTo === me.id) act.openChat(c.id); } else flag({ markedUnread: true }, "Marked as unread"); }, "", true],
    [muted ? "Unmute" : "Mute notifications", "var(--crm-ink-soft)", muted ? "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" : "M18 8a6 6 0 0 0-9.3-5M6 8c0 7-3 7-3 9h14M10 21h4M2 2l20 20",
      () => flag({ muted: !muted }, muted ? "Notifications on" : "Muted · no alerts for this chat"), muted ? "Muted" : "", false],
    [pinned ? "Unpin chat" : "Pin chat", "var(--crm-muted)", "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z", () => flag({ pinned: !pinned }, pinned ? "Unpinned" : "Pinned to the top of Inbox"), "", false],
  ];
  const chatMenuItems = items.map(([label, col, d, run, sub, sep]) => ({ label, c: col, d, run, sub: sub || null, sep }));

  // Move / Share's people.
  const kind = ui.kind, cn = c?.name ?? "";
  const boss = data.people.find(p => p.role === "boss");
  const done = c ? new Set([...data.shares.filter(s => s.customerId === c.id).map(s => s.staffId),
    ...data.invites.filter(i => i.customerId === c.id && i.state === "pending" && i.kind === kind).map(i => i.to)]) : new Set<string>();
  type P = { id: string; name: string; sub: string };
  const stls = data.people.filter(p => p.role === "stl").map(p => ({ id: p.id, name: p.name, sub: "Senior TL" }));
  const teamGroups = teams.map((t, k) => [t.name.toUpperCase(), teamColours(k)[0], t.people.map(p => ({ id: p.id, name: p.name, sub: t.name }))] as [string, string, P[]]);
  const src: [string, string, P[]][] = kind === "move"
    ? (upTo ? [[holder === me.id ? "YOUR DIRECT UPLINE" : `${nameOf(holder).toUpperCase()}'S DIRECT UPLINE`, "var(--crm-ink)", [{ id: upTo.id, name: upTo.name, sub: jobTitle(upTo) }]]] : [])
    : top ? [["REVENUE DIRECTOR", "var(--crm-ink)", ctx.directors.map(d => ({ id: d.id, name: d.name, sub: "Revenue Director" }))], ["SENIOR TL", "var(--crm-muted)", stls], ...teamGroups]
      : [["ABOVE YOU", "var(--crm-ink)", boss ? [{ id: boss.id, name: boss.name, sub: "Top level" }] : []], ["SAME LEVEL", "var(--crm-rust)", ctx.directors.filter(d => d.id !== me.id).map(d => ({ id: d.id, name: d.name, sub: "Revenue Director" }))],
        ["BELOW YOU", "var(--crm-brown)", [...stls, ...teamGroups.flatMap(g => g[2])]]];
  const btn = kind === "move" ? "Request" : top ? "Invite" : "Share";
  const pickGroups = src.map(([label, color, ps]) => [label, color, ps.filter(p => p.id !== me.id && p.id !== c?.assignedTo)] as [string, string, P[]]).filter(g => g[2].length)
    .map(([label, color, ps]) => ({ label, color, people: ps.map(p => { const on = done.has(p.id);
      return { name: p.name, sub: p.sub, ini: initials(p.name), btn: on ? (kind === "move" ? "Requested" : top ? "Invited" : "Shared") : btn, bc: on ? "var(--crm-brown)" : "var(--crm-rust)",
        pick: () => {
          if (on || !c) return;
          // A request, as the phone's (crm_invite): the customer stays where it is until they Accept — so no Undo.
          if (kind === "move") { void act.invite("move", c.id, p.id).then(ok => { if (ok) patch({ kind: "chat", toast: `Move request sent to ${p.name}` }); }); return; }
          void act.invite("share", c.id, p.id).then(ok => { if (ok) patch({ toast: top ? `Invited ${p.name} into the chat with ${cn}` : `Shared ${cn} with ${p.name}` }); });
        } }; }) }));
  return {
    chatMenuItems,
    kTopMove: kind === "move" && !upTo, kPick: (kind === "move" && !!upTo) || kind === "share", pickBtn: btn, pickGroups,
    shareFromTop: () => patch({ kind: "share" }),
  };
}
