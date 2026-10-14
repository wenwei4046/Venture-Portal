/**
 * Chat progress (CRM Desktop rev 1, D6), desktop only: every chat's journey New → Follow up → Appointment → Visit →
 * Won / Lost, filtered by time, person or team, My actions and status; a row opens its timeline (newest first) and
 * Open chat. Built from the CRM's event log (crm_events — the kinds PROPOSALS.md B1 adds), its notes (B6), and what the
 * CRM already knows (when the chat came in, its visits).
 */
import type { CrmCustomer } from "@/lib/member/crm-data";
import type { DeskCtx } from "./ctx";
import { initials, teamNameOf } from "./data";
import { DIRECTOR_C, DIRECTOR_TEAM, teamColours } from "./tokens";

const SC: Record<string, [string, string]> = { New: ["#FFF1E6", "#BD4A19"], "Follow up": ["#F1E7DF", "#6B574C"], Appointment: ["#E4EDF8", "#2F5E8C"], Visit: ["#E8F3ED", "#387557"], Won: ["#E8F3ED", "#387557"], Lost: ["#F8E1D8", "#A3371A"] };
const KD: Record<string, [string, string, string]> = {
  move: ["#2F6FB5", "#E4EDF8", "M5 12h14M13 6l6 6-6 6"], assign: ["#2F6FB5", "#E4EDF8", "M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M16 11h6"],
  share: ["#8E4B6E", "#F3E8EF", "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4"],
  reply: ["#387557", "#E8F3ED", "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z"], appt: ["#2F5E8C", "#E4EDF8", "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4"],
  visit: ["#387557", "#E8F3ED", "M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12ZM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"], note: ["#6B574C", "#F1E7DF", "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"],
  status: ["#6B574C", "#F1E7DF", "M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"], won: ["#387557", "#E8F3ED", "M5 12.5l4.5 4.5L19 7.5"],
  lost: ["#A3371A", "#F8E1D8", "M6 6l12 12M18 6 6 18"], remind: ["#A46312", "#FFF0CC", "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"],
};
const ORD = ["New", "Follow up", "Appointment", "Visit", "Won", "Lost"];
const STATUS_OF: Record<string, string> = { new: "New", follow_up: "Follow up", appointment: "Appointment", won: "Won", lost: "Lost" };
export interface CpEvent { at: string; who: string | null; kind: string; text: string; st: string | null; note: string | null; mine: boolean }

/** One chat's journey, oldest first. */
export function journey(ctx: DeskCtx, c: CrmCustomer): CpEvent[] {
  const { data, me, nameOf } = ctx, out: CpEvent[] = [];
  out.push({ at: c.createdAt, who: null, kind: "reply", text: `Came in from ${c.ad}`, st: "New", note: null, mine: false });
  for (const e of data.events.filter(x => x.customerId === c.id)) {
    const k = e.kind as string, to = String(e.data.to ?? e.owner ?? ""), mine = e.actor === me.id;
    const add = (kind: string, text: string, st: string | null = null, note: string | null = null) => out.push({ at: e.at, who: e.actor, kind, text, st, note, mine });
    if (k === "assigned") add("assign", `Assigned the chat to ${nameOf(to)}`);
    else if (k === "moved") add("move", `Moved the chat${e.data.from ? ` from ${nameOf(String(e.data.from))}` : ""} to ${nameOf(to)}`);
    else if (k === "shared") add("share", `Shared the chat with ${nameOf(to)}`);
    else if (k === "first_reply") add("reply", "First reply to the customer", "Follow up");
    else if (k === "appt_booked") add("appt", `Booked a visit · ${String(e.data.when ?? "")}${e.data.room ? ` · ${String(e.data.room)}` : ""}`, "Appointment");
    else if (k === "appt_changed") add("appt", `Changed the visit to ${String(e.data.when ?? "")}`);
    else if (k === "visit") add("visit", `Customer checked in${e.data.room ? ` at ${String(e.data.room)}` : ""}`, "Visit");
    else if (k === "status") add("status", `Back to ${STATUS_OF[String(e.data.to_status)] ?? "follow up"}`, STATUS_OF[String(e.data.to_status)] ?? null);
    else if (k === "won") add("won", `Marked as won${e.data.amount != null ? ` · RM ${Number(e.data.amount).toLocaleString("en-MY")}` : ""}`, "Won");
    else if (k === "lost") add("lost", "Marked as lost", "Lost", e.data.note ? String(e.data.note) : e.data.reason ? String(e.data.reason) : null);
    else if (k === "reminded") add("remind", `Reminded ${nameOf(to)} to reply`);
  }
  for (const n of data.notes?.filter(x => x.customerId === c.id) ?? []) out.push({ at: n.at, who: n.by, kind: "note", text: "Note added", st: null, note: n.text, mine: n.by === me.id });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function chatProgressVM(ctx: DeskCtx, opItem: string) {
  const { ui, set, patch, data, now, me, nameOf, teams } = ctx;
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), DAY = 86_400_000;
  const wkA = T - ((now.getDay() + 6) % 7) * DAY, mA = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const tOf = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; };
  const isoOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const TR = ui.cpT, cF = tOf(ui.cpFrom) ?? mA, cT = tOf(ui.cpTo) ?? T;
  const [d0, d1] = TR === "Today" ? [T, T] : TR === "This week" ? [wkA, wkA + 6 * DAY] : TR === "Custom" ? [Math.min(cF, cT), Math.max(cF, cT)] : [mA, new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime()];
  const rows = data.customers.map(c => { const ev = journey(ctx, c); let cur = "New"; ev.forEach(e => { if (e.st) cur = e.st; });
    if (c.status === "won") cur = "Won"; else if (c.status === "lost") cur = "Lost";
    const sh = data.shares.filter(s => s.customerId === c.id).map(s => s.staffId), was = data.events.filter(e => e.customerId === c.id && e.kind === "moved" && e.data.from).map(e => String(e.data.from));
    return { c, ev, cur, last: ev[ev.length - 1], sh, was }; });
  const teamOf = (pid: string) => teamNameOf(ctx, pid);
  const inv = (r: (typeof rows)[number], p: string) => r.c.assignedTo === p || r.sh.includes(p) || r.was.includes(p);
  const inT = (r: (typeof rows)[number]) => r.ev.some(e => { const t = new Date(e.at).getTime(); return t >= d0 && t < d1 + DAY; });
  const pp = ui.cpP;
  const hasP0 = (r: (typeof rows)[number]) => !pp || (pp.startsWith("team:") ? [r.c.assignedTo, ...r.sh, ...r.was].some(p => !!p && teamOf(p) === pp.slice(5)) : inv(r, pp));
  const myEv = (r: (typeof rows)[number]) => r.ev.filter(e => e.mine && ["assign", "move", "share", "remind"].includes(e.kind));
  const hasP = (r: (typeof rows)[number]) => inT(r) && hasP0(r) && (!ui.cpMine || myEv(r).length > 0);
  const f = ui.cpF;
  const list = rows.filter(r => hasP(r) && (f === "All" || r.cur === f)).sort(ui.cpSort === "Status" ? (a, b) => ORD.indexOf(a.cur) - ORD.indexOf(b.cur) : (a, b) => b.last.at.localeCompare(a.last.at));
  const sel = ui.cpSel ? rows.find(r => r.c.id === ui.cpSel) : undefined;
  const open = !!sel && opItem === "Chat progress" && !ui.awChat;
  const SH: Record<string, string> = { "Follow up": "F/up", Appointment: "Appt", "Won / Lost": "Won/Lost" };
  const dShort = (iso: string) => new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
  const strip = (r: (typeof rows)[number], compact: boolean) => { const firstAt: Record<string, string> = {}; r.ev.forEach(e => { if (e.st && !firstAt[e.st]) firstAt[e.st] = dShort(e.at); });
    if (r.cur === "Won" && !firstAt.Won) firstAt.Won = dShort(r.last.at); if (r.cur === "Lost" && !firstAt.Lost) firstAt.Lost = dShort(r.last.at);
    const end = r.cur === "Lost" ? "Lost" : "Won", st = ["New", "Follow up", "Appointment", "Visit", end], got = st.map(k => !!firstAt[k]);
    return st.map((k, i) => { const on = got[i], isCur = k === r.cur, col = SC[k][1], lb = k === "Won" && !on ? "Won / Lost" : k;
      return { label: compact ? SH[lb] ?? lb : lb, date: firstAt[k] ?? "—", dot: on ? col : "#fff", ring: on ? col : "#DCCBBF", size: isCur ? 14 : 10, lab: on ? "#3F2B22" : "#A8968B", w: isCur ? 700 : 500,
        lL: i === 0 ? "transparent" : on ? "#C9B3A4" : "#EBDDD2", lR: i === 4 ? "transparent" : got[i + 1] ? "#C9B3A4" : "#EBDDD2" }; }); };
  const people = [...new Set(rows.flatMap(r => [r.c.assignedTo, ...r.sh, ...r.was]).filter((x): x is string => !!x))];
  const teamList = [...(ctx.directors.length ? [{ name: DIRECTOR_TEAM, c: DIRECTOR_C }] : []), ...teams.map((t, k) => ({ name: t.name, c: teamColours(k) }))];
  const colourOf = (name: string | null) => teamList.find(t => t.name === name)?.c ?? (["#806B60", "#F5EBE3"] as [string, string]);
  const cmp = open;
  // Inbox's fourth column (v2): the open chat's journey — its five steps, a rail of dots when shut, the timeline.
  const ibR = ui.chat ? rows.find(r => r.c.id === ui.chat) : undefined;
  const ibSteps = ibR ? strip(ibR, true) : ["New", "F/up", "Appt", "Visit", "Won/Lost"].map(l => ({ label: l, date: "—", dot: "#fff", ring: "#DCCBBF", size: 10, lab: "#A8968B", w: 500, lL: "#EBDDD2", lR: "#EBDDD2" }));
  const evRows = (r: (typeof rows)[number], gap: string) => r.ev.slice().reverse().map((e, i, R) => { const k = KD[e.kind] ?? KD.status, showD = !i || dShort(R[i - 1].at) !== dShort(e.at);
    return { date: showD ? dShort(e.at) : "", time: new Date(e.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }), who: e.who ? (e.who === me.id ? "You" : nameOf(e.who)) : "",
      text: e.text, fg: k[0], bg: k[1], d: k[2], hasSt: !!e.st, st: e.st ?? "", stbg: e.st ? SC[e.st][0] : "#fff", stfg: e.st ? SC[e.st][1] : "#000",
      hasNote: !!e.note, note: e.note ?? "", line: i === R.length - 1 ? "transparent" : "#EBDDD2", pt: showD && i ? gap : "0" }; });
  const ibCp = { has: !!ibR, none: !ibR, status: ibR?.cur ?? "", sbg: ibR ? SC[ibR.cur][0] : "#fff", sfg: ibR ? SC[ibR.cur][1] : "#000",
    owner: ibR ? `${ibR.c.assignedTo ? nameOf(ibR.c.assignedTo) : "No one yet"}${ibR.c.assignedTo && teamOf(ibR.c.assignedTo) ? ` · ${teamOf(ibR.c.assignedTo)}` : ""}` : "",
    steps: ibSteps.map((s, i) => ({ ...s, lL: i === 0 ? "transparent" : s.lL, lR: i === 4 ? "transparent" : s.lR })),
    rail: ibSteps.map((s, i) => ({ dot: s.dot, ring: s.ring, size: s.size, tip: `${s.label} · ${s.date}`, gap: i === 4 ? "transparent" : "#EBDDD2" })),
    ev: ibR ? evRows(ibR, "12px") : [] };
  return {
    ibCp,
    cpOpen: open, isCpOp: opItem === "Chat progress",
    cpChips: ["All", ...ORD].map(k => { const on = f === k, pr = rows.filter(hasP), n = k === "All" ? pr.length : pr.filter(r => r.cur === k).length;
      return { label: k, n, bg: on ? "#3F2B22" : "#fff", fg: on ? "#fff" : "#3F2B22", bd: on ? "#3F2B22" : "#E2CFC1", nfg: on ? "#E9DCD2" : "#806B60", pick: () => patch({ cpF: k }) }; }),
    cpTimes: ["Today", "This week", "This month", "Custom"].map(k => { const on = TR === k; return { label: k, bg: on ? "#fff" : "transparent", fg: on ? "#3F2B22" : "#806B60", sh: on ? "0 1px 2px rgba(63,43,34,.12)" : "none", pick: () => patch({ cpT: k }) }; }),
    cpRange: d0 === d1 ? new Date(d0).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : `${dShort(new Date(d0).toISOString())} – ${new Date(d1).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`,
    cpCustom: TR === "Custom", cpFromV: isoOf(Math.min(cF, cT)), cpToV: isoOf(Math.max(cF, cT)),
    setCpFrom: (e: { target: { value: string } }) => patch({ cpFrom: e.target.value }), setCpTo: (e: { target: { value: string } }) => patch({ cpTo: e.target.value }),
    cpSorts: ["Latest update", "Status"].map(k => { const on = ui.cpSort === k; return { label: k, bg: on ? "#fff" : "transparent", fg: on ? "#3F2B22" : "#806B60", sh: on ? "0 1px 2px rgba(63,43,34,.12)" : "none", pick: () => patch({ cpSort: k }) }; }),
    cpEmpty: !list.length, cpMineOn: ui.cpMine, cpMineN: rows.filter(r => myEv(r).length).length, cpMineBg: ui.cpMine ? "#3F2B22" : "#fff", cpMineFg: ui.cpMine ? "#fff" : "#3F2B22",
    cpMineBd: ui.cpMine ? "#3F2B22" : "#E2CFC1", cpMineNfg: ui.cpMine ? "#E9DCD2" : "#806B60", cpMineToggle: () => set(u => ({ ...u, cpMine: !u.cpMine })),
    cpWide: !cmp, cpCtlFlex: cmp ? "1 0 100%" : "0 0 auto", cpChipPad: cmp ? "10px" : "14px",
    cpG: cmp ? "minmax(150px, 1fr) minmax(250px, 1.5fr)" : "minmax(220px, 1.3fr) minmax(400px, 2.8fr) 104px 128px", cpMinW: cmp ? "0" : "900px",
    cpPLabel: pp ? (pp.startsWith("team:") ? pp.slice(5) : nameOf(pp)) : "Everyone", cpPDot: pp ? colourOf(pp.startsWith("team:") ? pp.slice(5) : teamOf(pp))[0] : "#806B60",
    cpPOpen: ui.cpPOpen, cpPToggle: () => set(u => ({ ...u, cpPOpen: !u.cpPOpen })), cpPBd: pp ? "#3F2B22" : "#E2CFC1",
    cpAll: (() => { const on = !pp, n = rows.filter(inT).length; return { n: `${n}${n === 1 ? " chat" : " chats"}`, bg: on ? "#FFF1E6" : "transparent", fg: on ? "#BD4A19" : "#3F2B22", pick: () => patch({ cpP: null, cpPOpen: false }) }; })(),
    cpTeams: teamList.map(t => { const key = `team:${t.name}`, on = pp === key, tn = rows.filter(inT).filter(r => [r.c.assignedTo, ...r.sh, ...r.was].some(p => !!p && teamOf(p) === t.name)).length;
      return { label: t.name, fg: t.c[0], tint: t.c[1], n: `${tn}${tn === 1 ? " chat" : " chats"}`, bg: on ? t.c[1] : "transparent", pick: () => patch({ cpP: key, cpPOpen: false }),
        members: people.filter(p => teamOf(p) === t.name).map(p => { const pon = pp === p, n = rows.filter(r => inT(r) && inv(r, p)).length;
          return { label: nameOf(p), ini: initials(nameOf(p)), fg: t.c[0], tint: t.c[1], n: `${n}${n === 1 ? " chat" : " chats"}`, bg: pon ? t.c[1] : "transparent", w: pon ? 700 : 500, pick: () => patch({ cpP: p, cpPOpen: false }) }; }) }; }),
    cpRows: list.map(r => { const L = r.last, on = ui.cpSel === r.c.id, team = r.c.assignedTo ? teamOf(r.c.assignedTo) : null, tc = colourOf(team), my = myEv(r).slice(-1)[0];
      return { name: r.c.name, ad: r.c.ad, owner: r.c.assignedTo ? nameOf(r.c.assignedTo) : "No one yet", team: team ?? "", hasMine: ui.cpMine && !!my,
        mineTxt: my ? `${my.kind === "assign" ? "You assigned" : my.kind === "move" ? "You moved" : my.kind === "share" ? "You shared" : "You reminded"}${my.text.replace(/^[A-Z][a-z]+ (the chat )?/, " ")} · ${dShort(my.at)}` : "",
        tfg: tc[0], ttint: tc[1], hasSh: !!r.sh.length, shTxt: `Shared with ${r.sh.map(nameOf).join(", ")}`, init: initials(r.c.assignedTo ? nameOf(r.c.assignedTo) : "?"),
        status: r.cur, sbg: SC[r.cur][0], sfg: SC[r.cur][1], last: `${dShort(L.at)} · ${new Date(L.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}`,
        lastWho: L.who ? (L.who === me.id ? "by you" : `by ${nameOf(L.who)}`) : "", steps: strip(r, cmp), bg: on ? "#FFF8F2" : "#fff",
        open: () => patch({ stage: "op", cpSel: r.c.id, awChat: null, sendFor: null, frmOpen: false, cltEdit: null }) }; }),
    cpClose: () => patch({ cpSel: null }), cpOpenChat: () => { if (sel) patch({ awChat: sel.c.id, sendFor: null, stage: "op" }); },
    cpName: sel?.c.name ?? "", cpSub: sel ? `${sel.c.ad} · ${sel.c.assignedTo ? nameOf(sel.c.assignedTo) : "No one yet"}` : "", cpStatus: sel?.cur ?? "",
    cpSbg: sel ? SC[sel.cur][0] : "#fff", cpSfg: sel ? SC[sel.cur][1] : "#000", cpSteps: sel ? strip(sel, false) : [],
    cpEv: sel ? sel.ev.slice().reverse().map((e, i, R) => { const k = KD[e.kind] ?? KD.status, showD = !i || dShort(R[i - 1].at) !== dShort(e.at);
      return { date: showD ? dShort(e.at) : "", time: new Date(e.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }), who: e.who ? (e.who === me.id ? "You" : nameOf(e.who)) : "",
        text: e.text, fg: k[0], bg: k[1], d: k[2], hasSt: !!e.st, st: e.st ?? "", stbg: e.st ? SC[e.st][0] : "#fff", stfg: e.st ? SC[e.st][1] : "#000",
        hasNote: !!e.note, note: e.note ?? "", line: i === R.length - 1 ? "transparent" : "#EBDDD2", pt: showD && i ? "14px" : "0" }; }) : [],
  };
}
