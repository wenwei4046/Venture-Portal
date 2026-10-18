/**
 * Contacts (CRM Desktop v2, README › 3): the customers, analysed by what Customer info holds. Filters by Customer
 * info (a dropdown per field, with counts; Name, phone and Requirement are search-only), the active filters as chips,
 * four figures, a chart grouped by one field (click a row to filter by it), and the table — Contact always, the other
 * columns picked from the + menu, sorted ↑ / ↓ / off, dragged to size; a row opens the chat in Inbox with Customer info.
 * Its fields ARE the Customer form's (vm/form.ts): a question added there is a column here, and a Choice question a
 * filter and a chart grouping too; a removed one leaves. The figures are the CRM's own customers, all of them.
 */
import type { CrmCustomer } from "@/lib/member/crm-data";
import type { DeskCtx } from "./ctx";
import { chatRows, initials } from "./data";
import { budgetOf, formV2, SIZES, type FormFieldV2 } from "./form";
import { mapDrag } from "./columns";
import { CHANNEL, STATUS_LABEL, lastReal, timeLabel } from "../../sales/vm/common";
import { mediaWord } from "../../shared/chat-media";
import { answerOf } from "./form";
import { phoneLabel } from "../../sales/vm/customer";
import { adHref, adKindLabel } from "../../shared/AdLink";

const DAY = 86_400_000;
const BUDGET: [string, number, number][] = [["Under RM 5k", 0, 5000], ["RM 5k – 10k", 5000, 10000], ["RM 10k – 20k", 10000, 20000], ["RM 20k +", 20000, 1e12]];
const COLS = ["var(--crm-rust)", "var(--crm-ink-soft)", "var(--crm-ink-soft)", "var(--crm-brown)", "var(--crm-brown)", "var(--crm-ink-soft)", "var(--crm-orange)"];
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

/** One customer as Contacts reads it: every field's answer, the buckets the filters use. */
type Row = Record<string, string | null> & { id: string; name: string; phone: string; ini: string; budgetN: string | null; filled: string | null };

export function peopleVM(ctx: DeskCtx) {
  const { ui, set, patch, data, now, nameOf } = ctx;
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), wkA = T - ((now.getDay() + 6) % 7) * DAY;
  const secs = formV2(data);
  const field = (id: string) => secs.flatMap(s => s.fields).find(f => f.id === id);
  const own = secs.flatMap(s => s.fields.map(f => [s.label, f] as [string, FormFieldV2])).filter(([, f]) => f.kind === "own");
  const statusOf = (key: string) => (["Overdue", "Urgent", "Reply soon"].includes(key) ? "Overdue" : key);
  const status = new Map(chatRows(ctx).map(r => [r.id, statusOf(r.key)]));
  const visitOf = (c: CrmCustomer) => data.visits.filter(v => v.customerId === c.id && v.state !== "cancelled").sort((a, b) => b.start.localeCompare(a.start))[0];
  const rows0: Row[] = data.customers.map(c => {
    const v = visitOf(c), b = budgetOf(c), t = new Date(c.createdAt).getTime();
    const last = c.messages.length ? new Date(c.messages[c.messages.length - 1].at).getTime() : t;
    const r: Row = {
      id: c.id, name: c.name, phone: phoneLabel(c.phone) || "—", ini: initials(c.name),
      type: c.details.type || null, size: c.details.size || null, loc: c.details.loc || null, req: c.details.req || null,
      budget: b != null ? (BUDGET.find(x => b >= x[1] && b < x[2]) ?? BUDGET[3])[0] : null, budgetN: b != null ? String(b) : null,
      plat: CHANNEL[c.channel].name, ad: c.ad || null, status: status.get(c.id) ?? null, sp: c.assignedTo ? nameOf(c.assignedTo) : null,
      visit: v ? (v.state === "attended" ? "Showed up" : "Booked") : "No visit", showroom: v ? data.rooms.find(x => x.id === v.showroomId)?.name ?? "None" : "None",
      first: t >= wkA ? "This week" : t >= wkA - 7 * DAY ? "Last 2 weeks" : "Earlier", last: last >= T ? "Today" : last >= wkA ? "This week" : "Earlier",
      filled: c.details.type || c.details.size || c.details.loc || c.details.req || c.details.budget ? "1" : null,
    };
    for (const [, f] of own) r[f.id] = c.extra?.[f.id] || null;
    return r;
  });
  const lbl = (id: string, fallback: string) => (field(id)?.label ?? fallback).replace(/ \(RM\)$/, "");
  const uniq = (k: string) => [...new Set(rows0.map(d => d[k]).filter((x): x is string => !!x))].sort();
  const typeOpts = field("type")?.opts.split(",").map(x => x.trim()).filter(Boolean) ?? ["Condo", "Landed"];
  const sizeOpts = field("size")?.opts.split(",").map(x => x.trim()).filter(Boolean) ?? SIZES;
  // The filters: the form's property questions it still has, then each Choice question of its own, then lead / visit / contact.
  const KEYS: Record<string, [string, string[], string]> = {
    ...(field("type") ? { type: [lbl("type", "Property type"), typeOpts, "PROPERTY"] as [string, string[], string] } : {}),
    ...(field("size") ? { size: [lbl("size", "Unit size"), sizeOpts, "PROPERTY"] as [string, string[], string] } : {}),
    ...(field("budget") ? { budget: [lbl("budget", "Budget"), BUDGET.map(x => x[0]), "PROPERTY"] as [string, string[], string] } : {}),
    ...(field("loc") ? { loc: [lbl("loc", "Unit location"), uniq("loc"), "PROPERTY"] as [string, string[], string] } : {}),
    ...Object.fromEntries(own.filter(([, f]) => f.type === "Choice").map(([g, f]) => [f.id, [f.label, f.opts.split(",").map(x => x.trim()).filter(Boolean), g]])),
    plat: ["Platform", ["WhatsApp", "Messenger"], "LEAD"], ad: ["Ad", uniq("ad"), "LEAD"],
    status: ["Status", ["New", "Overdue", "Follow up", "Appointment", "Won", "Lost", "Cold"], "LEAD"], sp: ["Salesperson", uniq("sp"), "LEAD"],
    visit: ["Visit", ["Showed up", "Booked", "No visit"], "VISIT"], showroom: ["Showroom", [...data.rooms.filter(r => r.active).map(r => r.name), "None"], "VISIT"],
    first: ["First contact", ["This week", "Last 2 weeks", "Earlier"], "CONTACT"], last: ["Last chat", ["Today", "This week", "Earlier"], "CONTACT"],
  };
  const F = ui.ppF, by = KEYS[ui.ppBy] ? ui.ppBy : Object.keys(KEYS)[0], q = ui.ppQ.trim().toLowerCase();
  const rows = rows0.filter(d => Object.entries(F).every(([k, v]) => !v || !KEYS[k] || d[k] === v) && (!q || `${d.name} ${d.phone} ${d.req ?? ""}`.toLowerCase().includes(q)));
  const tot = rows.length, filled = rows.filter(d => d.filled).length;
  const vals = KEYS[by][1], counts = vals.map(v => rows.filter(d => d[by] === v).length), none = rows.filter(d => !d[by]).length;
  const propKey = KEYS[by][2] === "PROPERTY" || own.some(([, f]) => f.id === by);
  const mx = Math.max(1, ...counts, none);
  const bars = [...vals.map((v, i) => ({ label: v, n: counts[i], pct: pct(counts[i], tot), w: Math.round((counts[i] / mx) * 100), color: COLS[i % COLS.length], on: F[by] === v,
    pick: () => set(u => ({ ...u, ppF: { ...u.ppF, [by]: u.ppF[by] === v ? null : v }, ppPg: 0 })) })),
  ...(propKey ? [{ label: "Not filled yet", n: none, pct: pct(none, tot), w: Math.round((none / mx) * 100), color: "var(--crm-line)", on: false, pick: () => {} }] : [])]
    .map(b => ({ ...b, fw: b.on ? 700 : 600, bg: b.on ? "var(--crm-cream)" : "transparent" }));
  const two = typeOpts.slice(0, 2), aN = rows.filter(d => d.type === two[0]).length, bN = rows.filter(d => d.type === two[1]).length;
  const bs = rows.map(d => Number(d.budgetN)).filter(n => n > 0).sort((x, y) => x - y), med = bs.length ? bs[Math.floor(bs.length / 2)] : 0;
  const chips = Object.entries(F).filter(([k, v]) => v && KEYS[k]).map(([k, v]) => ({ label: `${KEYS[k][0]}: ${v}`, clear: () => set(u => ({ ...u, ppF: { ...u.ppF, [k]: null }, ppPg: 0 })) }));
  const sel = (k: string) => { const open = ui.ppOpen === k, cur = F[k] || null;
    const base = rows0.filter(d => Object.entries(F).every(([k2, v]) => k2 === k || !v || !KEYS[k2] || d[k2] === v));
    const put = (val: string | null) => set(u => ({ ...u, ppF: { ...u.ppF, [k]: val }, ppOpen: null, ppPg: 0 }));
    return { label: KEYS[k][0], value: cur || "Any", open, bd: open || cur ? "var(--crm-rust)" : "var(--crm-line)", bg: cur ? "var(--crm-cream)" : "#fff",
      toggle: () => patch({ ppOpen: open ? null : k }), close: () => patch({ ppOpen: null }),
      opts: [{ v: "Any", n: base.length, on: !cur, pick: () => put(null) }, ...KEYS[k][1].map(v => ({ v, n: base.filter(d => d[k] === v).length, on: cur === v, pick: () => put(v) }))]
        .map(o => ({ ...o, bg: o.on ? "var(--crm-cream)" : "transparent", w: o.on ? 650 : 500, chk: o.on ? "var(--crm-rust)" : "transparent" })) }; };
  // The table's columns: every field of Customer info but the Contact itself (README: 13 with the design's form).
  const LBL: Record<string, string> = { type: lbl("type", "Property type"), size: lbl("size", "Unit size"), budget: lbl("budget", "Budget"), loc: lbl("loc", "Unit location"), req: lbl("req", "Requirement"),
    plat: "Platform", ad: "Ad", status: "Status", sp: "Salesperson", visit: "Visit", showroom: "Showroom", first: "First contact", last: "Last chat",
    ...Object.fromEntries(own.map(([, f]) => [f.id, f.label])) };
  const GRP: Record<string, string> = { type: "Property", size: "Property", budget: "Property", loc: "Property", req: "Property", plat: "Lead", ad: "Lead", status: "Lead", sp: "Lead", visit: "Visit", showroom: "Visit", first: "Contact", last: "Contact",
    ...Object.fromEntries(own.map(([g, f]) => [f.id, g.charAt(0) + g.slice(1).toLowerCase()])) };
  const ALL = [...["type", "size", "budget", "loc", "req"].filter(k => !!field(k)), ...own.map(([, f]) => f.id), "plat", "ad", "status", "sp", "visit", "showroom", "first", "last"];
  const DEF = ["type", "size", "budget", "loc", "req"].filter(k => ALL.includes(k));
  const vis = (ui.ppVis ?? DEF).filter(k => ALL.includes(k));
  const so = ui.ppSort, CW = ui.ppCW, dw = (k: string) => CW[k] || ({ req: 200, ad: 200, contact: 220 } as Record<string, number>)[k] || 130;
  const sk = (k: string) => (k === "budget" ? "budgetN" : k);
  const ord: Record<string, string[]> = { type: typeOpts, size: sizeOpts };
  const val = (d: Row, k: string) => { const v = d[k]; if (v == null) return null; if (k === "budgetN") return Number(v); return ord[k] ? ord[k].indexOf(v) : v; };
  const sorted = !so.k ? rows : [...rows].sort((x, y) => { const a2 = val(x, so.k!), b2 = val(y, so.k!); if (a2 == null && b2 == null) return 0; if (a2 == null) return 1; if (b2 == null) return -1;
    return (typeof a2 === "string" ? a2.localeCompare(String(b2)) : (a2 as number) - (b2 as number)) * so.dir; });
  // Shown a page at a time, 10 · 20 · 50 a page (the owner, 2026-10-15: "做一個 show 10, 20, 50 的選單", the list ran on
  // down the page on a big screen); filtering or searching goes back to the first page.
  const per = [10, 20, 50].includes(ui.ppPer) ? ui.ppPer : 10, pages = Math.max(1, Math.ceil(sorted.length / per)), pg = Math.min(Math.max(0, ui.ppPg), pages - 1);
  const shown = sorted.slice(pg * per, pg * per + per);
  const toggleSort = (k: string) => set(u => { const c = u.ppSort; return { ...u, ppSort: c.k === k ? (c.dir > 0 ? { k, dir: -1 } : { k: null, dir: 1 }) : { k, dir: 1 } }; });
  return {
    ppStats: [["Contacts", String(tot), "match these filters"], [`${two[0] ?? "Condo"} · ${two[1] ?? "Landed"}`, `${aN} · ${bN}`, `${pct(aN, aN + bN)} · ${pct(bN, aN + bN)} of filled`],
      ["Median budget", med ? `RM ${med.toLocaleString("en-MY")}` : "—", `${bs.length} gave a budget`], ["Property info filled", pct(filled, tot), `${filled} of ${tot} in Customer info`]].map(([k, v, sub]) => ({ k, v, sub })),
    ppBys: Object.entries(KEYS).filter(([k]) => ["type", "size", "budget", "loc", "status", "plat", "visit", "showroom"].includes(k) || own.some(([, f]) => f.id === k && f.type === "Choice"))
      .map(([k, [label]]) => ({ label, on: k === by, off: k !== by, pick: () => patch({ ppBy: k }) })),
    ppChartTitle: `By ${KEYS[by][0].toLowerCase()}`, ppBars: bars, ppStack: bars.filter(b => b.n).map(b => ({ color: b.color, n: b.n })),
    ppSelGroups: [["PROPERTY", "PROPERTY"], ["LEAD", "LEAD"], ["VISIT", "VISIT"], ["CONTACT", "CONTACT"]].map(([label, g]) => ({ label, sels: Object.keys(KEYS).filter(k => KEYS[k][2] === g).map(sel) })).filter(g => g.sels.length),
    ppChips: chips, ppHasChips: chips.length > 0, ppClear: () => patch({ ppF: {}, ppQ: "", ppPg: 0 }),
    ppQ: ui.ppQ, setPpQ: (e: { target: { value: string } }) => patch({ ppQ: e.target.value, ppPg: 0 }),
    ppGrid: `${dw("contact")}px ${vis.map(k => `${dw(k)}px`).join(" ")} minmax(36px, 1fr)`, ppDragC: mapDrag(set, "ppCW", dw("contact"), "contact", 80, 480), ppReset: () => patch({ ppCW: {} }),
    ppHead: vis.map(k => ({ label: LBL[k].toUpperCase(), arrow: so.k === sk(k) ? (so.dir > 0 ? "↑" : "↓") : "↕", fg: so.k === sk(k) ? "var(--crm-ink)" : "var(--crm-muted)",
      drag: mapDrag(set, "ppCW", dw(k), k, 80, 480), pick: () => toggleSort(sk(k)), remove: () => set(u => ({ ...u, ppVis: (u.ppVis ?? DEF).filter(x => x !== k) })) })),
    ppSortCols0: [{ arrow: so.k === "name" ? (so.dir > 0 ? "↑" : "↓") : "↕", fg: so.k === "name" ? "var(--crm-ink)" : "var(--crm-muted)", pick: () => toggleSort("name") }],
    ppAddOpen: ui.ppAdd, ppAddToggle: () => patch({ ppAdd: !ui.ppAdd }), ppAddClose: () => patch({ ppAdd: false }),
    ppAddOpts: ALL.map(k => { const on = vis.includes(k); return { label: LBL[k], grp: GRP[k], chk: on ? "var(--crm-rust)" : "transparent", bd: on ? "var(--crm-rust)" : "var(--crm-line)", bg: on ? "var(--crm-cream)" : "transparent",
      toggle: () => set(u => { const cur = (u.ppVis ?? DEF).filter(x => ALL.includes(x)); return { ...u, ppVis: cur.includes(k) ? cur.filter(x => x !== k) : ALL.filter(x => cur.includes(x) || x === k) }; }) }; }),
    ppRows: shown.map(d => ({ ini: d.ini, name: d.name, phone: d.phone,
      cells: vis.map(k => { const raw = k === "budget" ? (d.budgetN ? `RM ${Number(d.budgetN).toLocaleString("en-MY")}` : null) : d[k]; const v = raw || "—";
        if (k === "type") { const isB = d.type && d.type === typeOpts[1]; return { pill: true, plain: false, v, bg: isB ? "var(--crm-tint-attention)" : d.type ? "var(--crm-tint-cold)" : "var(--crm-field)", fg: isB ? "var(--crm-rust)" : d.type ? "var(--crm-ink-soft)" : "var(--crm-faint)" }; }
        return { pill: false, plain: true, v, bg: "transparent", fg: raw ? "var(--crm-ink)" : "var(--crm-faint)" }; }),
      // A row opens the customer in the side panel when the page is wide enough to show it (the owner, 2026-10-15: "右邊的
      // 畫面有點空" → 1); else, as before, the chat in Inbox with Customer info beside it.
      on: ui.ppSel === d.id, rowBg: ui.ppSel === d.id ? "var(--crm-cream)" : "#fff",
      open: () => patch({ ppSel: ui.ppSel === d.id && ui.rail ? null : d.id, rail: true }),
      openChat: () => patch({ tab: "inbox", ibListW: null, ibInfoW: null, ibCpW: null, ibCp: null, pane: "docked", kind: "chat", chat: d.id, fromTeam: false, inbF: "All", whoSel: [] }) })),
    ppEmpty: !rows.length, ppHas: rows.length > 0,
    ppPagerOn: rows.length > 0, ppPager: { range: `${pg * per + 1}–${pg * per + shown.length} of ${sorted.length}`, page: `Page ${pg + 1} of ${pages}`,
      sizes: [10, 20, 50].map(n => ({ n, on: n === per, pick: () => patch({ ppPer: n, ppPg: 0 }) })),
      prevOff: pg === 0, nextOff: pg >= pages - 1, prev: () => patch({ ppPg: pg - 1 }), next: () => patch({ ppPg: pg + 1 }) },
    // The chart card: folded to its title and what it says until opened; open, a pie with each value's share beside the
    // rows that filter (the owner, 2026-10-15: "分析圖表，類似截圖，默認收起").
    ppRail: true, ppFoldable: true, ppChartOpen: ui.ppChart, ppChartToggle: () => patch({ ppChart: !ui.ppChart }), ppChev: ui.ppChart ? "rotate(180deg)" : "none", ppChartBtn: ui.ppChart ? "Hide chart" : "Show chart",
    ppChartSum: (() => { const top = bars.filter(b => b.n && b.label !== "Not filled yet").sort((a, b) => b.n - a.n)[0]; return top ? `Most: ${top.label} · ${top.n} of ${tot} (${top.pct})` : `${tot} contacts`; })(),
    ppPie: pieSlices(bars.filter(b => b.n).map(b => ({ label: b.label, n: b.n, color: b.color })), tot), ppPieHas: bars.some(b => b.n),
    ppSide: sideVM(ctx, ui.ppSel, rows.filter(d => !d.filled).map(d => d.id)),
  };
}


/** A pie's slices as SVG paths, each with its share written inside when it is big enough (the screenshot's look). */
export function pieSlices(parts: { label: string; n: number; color: string }[], tot: number, r = 100) {
  const sum = parts.reduce((a, p) => a + p.n, 0) || 1;
  let a0 = -Math.PI / 2;
  return parts.map(p => {
    const a = (p.n / sum) * Math.PI * 2, a1 = a0 + a, mid = a0 + a / 2;
    const pt = (t: number) => `${(r + r * Math.cos(t)).toFixed(2)} ${(r + r * Math.sin(t)).toFixed(2)}`;
    const d = p.n === sum ? `M ${r} 0 A ${r} ${r} 0 1 1 ${r - 0.01} 0 Z` : `M ${r} ${r} L ${pt(a0)} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${pt(a1)} Z`;
    const out = { label: p.label, color: p.color, d, pct: `${((p.n / (tot || sum)) * 100).toFixed(1)}%`, showPct: p.n / sum >= 0.06,
      x: p.n === sum ? String(r) : (r + r * 0.62 * Math.cos(mid)).toFixed(1), y: p.n === sum ? String(r) : (r + r * 0.62 * Math.sin(mid)).toFixed(1) };
    a0 = a1;
    return out;
  });
}

/** Contacts' side panel: the picked customer — or, with nobody picked, those whose property info is still empty. */
function sideVM(ctx: DeskCtx, id: string | null, missing: string[]) {
  const { data, patch, nameOf, now } = ctx;
  const c = id ? data.customers.find(x => x.id === id) : undefined;
  const openChat = (cid: string) => patch({ tab: "inbox", ibListW: null, ibInfoW: null, ibCpW: null, ibCp: null, pane: "docked", kind: "chat", chat: cid, fromTeam: false, inbF: "All", whoSel: [] });
  const edit = (cid: string) => patch({ tab: "inbox", pane: "docked", kind: "form", chat: cid, cform: null, fromTeam: false, inbF: "All", whoSel: [] });
  const todo = missing.map(mid => data.customers.find(x => x.id === mid)).filter((x): x is CrmCustomer => !!x)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30)
    .map(x => ({ id: x.id, ini: initials(x.name), name: x.name, sub: [CHANNEL[x.channel].name, x.assignedTo ? nameOf(x.assignedTo) : "No one yet"].join(" · "),
      pick: () => patch({ ppSel: x.id }), fill: (e: { stopPropagation(): void }) => { e.stopPropagation(); edit(x.id); } }));
  const todoTitle = missing.length ? `Property info missing · ${missing.length}` : "Every contact here has property info";
  const empty = { has: false as boolean, todo, todoTitle, hasTodo: todo.length > 0, ini: "", name: "", phone: "", ch: "", ad: "", adUrl: null as string | null, status: "", owner: "", visit: "", lastAt: "",
    groups: [] as { label: string; rows: { k: string; v: string }[] }[], msgs: [] as { who: string; text: string; at: string; mine: boolean }[], hasMsgs: false,
    openChat: () => {}, edit: () => {}, close: () => {} };
  if (!c) return empty;
  const visit = data.visits.filter(v => v.customerId === c.id && v.state === "booked" && v.start >= now.toISOString()).sort((a, b) => a.start.localeCompare(b.start))[0];
  const msgs = c.messages.filter(m => !m.auto).slice(-3).map(m => ({ who: m.from === "me" ? "You" : c.name.split(" ")[0], text: m.text || mediaWord(m),
    at: timeLabel(new Date(m.at)), mine: m.from === "me" }));
  const last = lastReal(c);
  return { ...empty, has: true,
    ini: initials(c.name), name: c.name, phone: phoneLabel(c.phone) || "—", ch: CHANNEL[c.channel].name, ad: c.adId ? `${adKindLabel(c)} · ${c.ad}` : c.ad || "No ad", adUrl: adHref(c.adUrl),
    status: STATUS_LABEL[c.status], owner: c.assignedTo ? nameOf(c.assignedTo) : "No one yet",
    visit: visit ? `${new Date(visit.start).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}, ${timeLabel(new Date(visit.start))} · ${data.rooms.find(r => r.id === visit.showroomId)?.name ?? ""}` : "",
    lastAt: last ? new Date(last.at).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—",
    groups: formV2(data).filter(s => s.key !== "contact" && s.key !== "lead").map(s => ({ label: s.label, rows: s.fields.map(f => ({ k: f.label.replace(/ \(RM\)$/, ""), v: answerOf(data, c, f, nameOf) })) })),
    msgs, hasMsgs: msgs.length > 0,
    openChat: () => openChat(c.id), edit: () => edit(c.id), close: () => patch({ ppSel: null }) };
}
