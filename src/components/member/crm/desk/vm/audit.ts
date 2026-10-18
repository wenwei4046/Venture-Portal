/**
 * Audit log (CRM Desktop v2, README › 8; the sidebar's last page, CRM · Manage — it took over rev 1's Settings ›
 * History): every change in three tabs —
 *   Chat flow  — the CRM's journey events (crm_events): a lead assigned or reassigned, a chat moved up, a teammate
 *                invited, a visit booked / changed / cancelled, won and lost, a reminder sent;
 *   Marketing  — Ads to teams: a new ad seen (its first lead), every split saved (audit_changes › crm_ad_assign);
 *   Management — Full time lead allocation, Member work type, Showrooms, Customer form, Cold lead templates, Channels
 *                (audit_changes on their tables).
 * The same rows each page's own Audit log shows (assign-v2.ts), so they never disagree. Today | Last 7 days | This month,
 * a search, Who chips, a table TIME · WHO · WHAT · DETAIL grouped by day with its columns dragged to size.
 */
import type { DeskCtx, HistRow } from "./ctx";
import { arrayDrag } from "./columns";
import { MON } from "./insight";

const DAY = 86_400_000;
const CAT: Record<string, [string, string, string]> = { chat: ["Chat flow", "var(--crm-rust)", "var(--crm-tint-attention)"], marketing: ["Marketing", "var(--crm-ink-soft)", "var(--crm-tint-cold)"], management: ["Management", "var(--crm-ink-soft)", "var(--crm-tint-new)"] };
type E = { cat: "chat" | "marketing" | "management"; at: string; who: string; action: string; target: string; detail: string };
const AREA: Record<string, string> = { crm_fulltime_rules: "Full time days set", crm_staff: "Work type changed", crm_showrooms: "Showroom changed", crm_forms: "Form edited", crm_templates: "Template changed", crm_channels: "Channel changed" };

/** Every change the Audit log knows, newest first. */
export function auditEvents(ctx: DeskCtx): E[] {
  const { data, nameOf } = ctx, out: E[] = [];
  const cust = (id: string) => data.customers.find(c => c.id === id);
  for (const e of data.events) {
    const c = cust(e.customerId), who = e.actor ? nameOf(e.actor) : "System", to = e.data.to ? nameOf(String(e.data.to)) : e.owner ? nameOf(e.owner) : "—", name = c?.name ?? "A customer", k = e.kind as string;
    const from = e.data.from ? nameOf(String(e.data.from)) : null;
    const add = (action: string, target: string, detail: string) => out.push({ cat: "chat", at: e.at, who, action, target, detail });
    if (k === "assigned") add(e.actor ? "Lead reassigned" : "Lead assigned", `${name} → ${to}`, c?.ad ?? "");
    else if (k === "moved") add("Chat moved up", `${name}: ${from ?? "—"} → ${to}`, "Direct upline");
    else if (k === "shared") add("Teammate invited", `${to} joined chat with ${name}`, c?.ad ?? "");
    else if (k === "appt_booked") add("Appointment booked", `${name} · ${String(e.data.when ?? "")}`, String(e.data.room ?? ""));
    else if (k === "appt_changed") add("Appointment changed", `${name} · ${String(e.data.when ?? "")}`, String(e.data.room ?? ""));
    else if (k === "appt_cancelled") add("Appointment cancelled", name, String(e.data.room ?? ""));
    else if (k === "won") add("Marked as won", name, e.data.amount != null ? `RM ${Number(e.data.amount).toLocaleString("en-MY")}` : "");
    else if (k === "lost") add("Marked as lost", name, String(e.data.note ?? e.data.reason ?? ""));
    else if (k === "reminded") add("Reminder sent", `${to} · reply to ${name}`, "");
  }
  // Marketing: an ad's first lead ("New ad found"), then every split saved.
  const firstOf = new Map<string, { at: string; ad: string; ch: string }>();
  for (const c of data.customers) if (c.adId) { const f = firstOf.get(c.adId); if (!f || c.createdAt < f.at) firstOf.set(c.adId, { at: c.createdAt, ad: c.ad, ch: c.channel === "whatsapp" ? "WhatsApp" : "Messenger" }); }
  for (const [id, f] of firstOf) out.push({ cat: "marketing", at: f.at, who: "System", action: "New ad found", target: f.ad, detail: `${f.ch} · ${data.adRules.some(r => r.adId === id) ? "split set" : "no split yet"}` });
  for (const h of ctx.ui.history ?? []) out.push(...histEvent(h));
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

function histEvent(h: HistRow): E[] {
  const change = h.changes.map(x => `${x.field}: ${x.from} → ${x.to}`).join(" · ");
  if (h.table === "crm_ad_assign") {
    const mode = h.row.mode === "even" ? "Evenly" : "By team";
    return [{ cat: "marketing", at: h.at, who: h.who, action: h.op === "DELETE" ? "Split removed" : h.op === "INSERT" ? "Split set" : "Split changed", target: String(h.row.ad_label ?? h.what), detail: change || mode }];
  }
  if (h.table === "crm_staff") {
    const on = !!h.row.full_time;
    if (h.op === "UPDATE" && !h.changes.some(c => c.field === "Full time")) return [];
    return [{ cat: "management", at: h.at, who: h.who, action: "Work type changed", target: h.what, detail: on ? "Part time → Full time" : "Full time → Part time" }];
  }
  const action = AREA[h.table];
  if (!action) return [];
  return [{ cat: "management", at: h.at, who: h.who, action: h.op === "INSERT" ? action.replace(/changed|edited|set/, "added") : h.op === "DELETE" ? action.replace(/changed|edited|set/, "removed") : action,
    target: h.what, detail: change || (h.op === "INSERT" ? "Added" : h.op === "DELETE" ? "Removed" : "") }];
}

export function auditVM(ctx: DeskCtx) {
  const { ui, set, patch, now } = ctx;
  const all = ui.tab === "auditlog" ? auditEvents(ctx) : [];
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lo = ui.auPer === "today" ? T : ui.auPer === "7d" ? T - 6 * DAY : new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const cat = ui.auCat, q = ui.auQ.trim().toLowerCase(), who = ui.auWho;
  const inCat = all.filter(e => e.cat === cat);
  const rows = inCat.filter(e => new Date(e.at).getTime() >= lo && (who === "all" || e.who === who) && (!q || `${e.action} ${e.target} ${e.detail} ${e.who}`.toLowerCase().includes(q)));
  const ppl = [...new Set(inCat.map(e => e.who))];
  const c = CAT[cat];
  const dayLbl = (t: number) => { const d = new Date(t), s = `${d.getDate()} ${MON[d.getMonth()].slice(0, 3)}`; const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return d0 === T ? `Today · ${s}` : d0 === T - DAY ? `Yesterday · ${s}` : s; };
  let prev = "";
  const w0 = ui.auCols ?? [76, 220, 320], mk = arrayDrag(set, "auCols", w0, [60, 120, 140], 600);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  return {
    auTabs: Object.entries(CAT).map(([k, m]) => ({ label: m[0], n: all.filter(e => e.cat === k && new Date(e.at).getTime() >= T - 6 * DAY).length, on: k === cat, off: k !== cat,
      pick: () => patch({ auCat: k as typeof ui.auCat, auWho: "all" }) })),
    auPers: ([["today", "Today"], ["7d", "Last 7 days"], ["month", "This month"]] as const).map(([k, label]) => ({ label, on: k === ui.auPer, off: k !== ui.auPer, pick: () => patch({ auPer: k }) })),
    auWhoOpts: [{ label: "Anyone", on: who === "all", pick: () => patch({ auWho: "all" }) }, ...ppl.map(n => ({ label: n, on: who === n, pick: () => patch({ auWho: n }) }))]
      .map(o => ({ ...o, bg: o.on ? "var(--crm-ink)" : "#fff", fg: o.on ? "#fff" : "var(--crm-ink)", bd: o.on ? "var(--crm-ink)" : "var(--crm-line)" })),
    auQ: ui.auQ, setAuQ: (e: { target: { value: string } }) => patch({ auQ: e.target.value }),
    auStats: [["Changes", String(rows.length), ui.auPer === "today" ? "today" : ui.auPer === "7d" ? "last 7 days" : "this month"], ["People", String(new Set(rows.map(e => e.who)).size), "made a change"],
      ["Last change", rows[0] ? `${dayLbl(new Date(rows[0].at).getTime()).replace(/^(Today|Yesterday) · /, "")} · ${time(rows[0].at)}` : "—", rows[0]?.who ?? ""]].map(([k, v, sub]) => ({ k, v, sub })),
    auRows: rows.map(e => { const d = dayLbl(new Date(e.at).getTime()), showD = d !== prev; prev = d; const sys = e.who === "System" || e.who === "The CRM";
      return { day: showD ? d : "", showDay: showD, time: time(e.at), who: e.who, ini: sys ? "S" : e.who.split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase(),
        avBg: sys ? "var(--crm-field)" : c[2], avFg: sys ? "var(--crm-ink-soft)" : c[1], action: e.action, target: e.target, detail: e.detail }; }),
    auGrid: `${w0[0]}px ${w0[1]}px ${w0[2]}px minmax(160px, 1fr)`,
    auDrag0: mk(0), auDrag1: mk(1), auDrag2: mk(2), auReset: () => patch({ auCols: null }),
    // 4a's Export CSV (2026-10-18): the rows on screen — this filter, this search — as a CSV the browser saves.
    auCount: rows.length,
    auditCsv: () => {
      const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
      const lines = [["When", "Who", "Change", "Area", "Before → after"], ...rows.map(e => [new Date(e.at).toISOString(), e.who, e.action, e.target, e.detail ?? ""])];
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.map(l => l.map(x => esc(String(x))).join(",")).join("\n")], { type: "text/csv" }));
      a.download = "CRM audit log.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
    auEmpty: !rows.length, auHas: rows.length > 0, auClear: () => patch({ auWho: "all", auQ: "" }),
  };
}
