/**
 * Insight (design 3b): Month · Week · Day · Range (tap or drag across days).
 * Every figure from the customers and visits themselves:
 *   Appt rate   = leads in the period that booked a visit ÷ leads in the period
 *   Show-up     = showed ÷ visits in the period already due (No shows counted)
 *   Won rate    = visits won ÷ visits showed
 *   Avg. reply  = customer's message → our next reply (auto-replies don't count)
 */
import type { MouseEvent, PointerEvent as RPointerEvent } from "react";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { downlineOf } from "../../shared/people";
import { BORDER, gb, day0, DAY, ini, isCold, lastReal, stop, timeLabel, urgencyOf, type SalesCtx } from "./common";
import { customerFormVM, infoRows, phoneLabel } from "./customer";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function insightVM(ctx: SalesCtx) {
  const { ui, set, patch, data, now, refs, owner, me, nameOf, act } = ctx;
  // No Team | Me (rev 1010 §5.2 replaced by §7.3: team views live on the Team side).
  const mine = ctx.mine;
  const T = day0(now), wk0 = T - ((now.getDay() + 6) % 7) * DAY;
  const per = ui.insPeriod === "range" && !ui.insRange ? "month" : ui.insPeriod;
  const [R0, R1] = per === "day" ? [T, T] : per === "week" ? [wk0, wk0 + 6 * DAY]
    : per === "range" && ui.insRange ? [ui.insRange.a, ui.insRange.b]
      : [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime()];
  const inR = (iso: string) => { const t = day0(new Date(iso)); return t >= R0 && t <= R1; };
  const f = (d: Date) => gb(d, { day: "numeric", month: "short" });

  const ids = new Set(mine.map(c => c.id));
  const leads = mine.filter(c => inR(c.createdAt));
  const visits = data.visits.filter(v => ids.has(v.customerId) && v.state !== "cancelled" && inR(v.start));
  const due = visits.filter(v => v.state !== "booked" || new Date(v.start) <= now);
  const showed = visits.filter(v => v.state === "attended").length, noshow = visits.filter(v => v.state === "no_show").length;
  const upcoming = visits.filter(v => v.state === "booked" && new Date(v.start) > now).length;
  const wonV = visits.filter(v => v.state === "attended" && v.outcome === "won").length;
  const bookedLeads = leads.filter(c => data.visits.some(v => v.customerId === c.id && v.state !== "cancelled")).length;
  const cold = leads.filter(c => isCold(c, now)).length;
  // Customer's message → our next reply, replies made in the period.
  const gaps: number[] = [];
  for (const c of mine) {
    let wait: number | null = null;
    for (const m of c.messages) {
      const t = new Date(m.at).getTime();
      if (m.from === "lead" && wait == null) wait = t;
      if (m.from === "me" && !m.auto && wait != null) { if (inR(m.at)) gaps.push((t - wait) / 60_000); wait = null; }
    }
  }
  const reply = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
  const fmtM = (m: number | null) => m == null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const pct = (a: number, b: number) => b ? `${Math.round(a / b * 100)}%` : "—";
  const warm = leads.filter(c => !isCold(c, now));
  const status: [string, number, string][] = [
    ["New", warm.filter(c => c.status === "new").length, "#2F8FD8"],
    ["Attention", warm.filter(c => urgencyOf(c, now).level !== "none").length, "#A3371A"],
    ["Appointment", warm.filter(c => c.status === "appointment").length, "#BD4A19"],
    ["Cold leads", cold, "#3E5C7A"],
  ];
  const tot = status.reduce((a, s) => a + s[1], 0);

  // Range sheet.
  const sh = ui.insSheet;
  const setS = (p: Partial<NonNullable<typeof ui.insSheet>>) => set(u => (u.insSheet ? { ...u, insSheet: { ...u.insSheet, ...p } } : u));
  const rg = ui.insPeriod === "range" && ui.insRange ? ui.insRange : null;
  let ir = { irTitle: "", irWk: [] as string[], irMonths: [] as { label: string; bg: string; fg: string; border: string; pick: () => void }[], irCells: [] as { t: number; n: number; cur: string; band: string; bandR: string; bg: string; fg: string; weight: number; ring: string; down?: (e: RPointerEvent<HTMLElement>) => void }[],
    irMove: (_: RPointerEvent<HTMLElement>) => {}, irUp: () => {}, irPrev: () => {}, irNext: () => {}, irNextFg: "#806B60", irHint: "", irApplyLabel: "", irApplyBg: "#D9C7BA", irApply: undefined as undefined | (() => void) };
  if (sh) {
    const cm = sh.cm, lo = sh.a == null ? null : Math.min(sh.a, sh.b ?? sh.a), hi = sh.a == null ? null : Math.max(sh.a, sh.b ?? sh.a);
    const f1 = new Date(cm[0], cm[1], 1), lead0 = (f1.getDay() + 6) % 7, rows = Math.ceil((lead0 + new Date(cm[0], cm[1] + 1, 0).getDate()) / 7);
    const atMax = cm[0] === now.getFullYear() && cm[1] === now.getMonth();
    const days = lo == null || hi == null ? 0 : Math.round((hi - lo) / DAY) + 1;
    ir = {
      irTitle: f1.toLocaleDateString("en-GB", { month: "long", year: "numeric" }), irWk: ["M", "T", "W", "T", "F", "S", "S"],
      irMonths: MON.slice(0, now.getMonth() + 1).map((n, m) => { const on = cm[1] === m && cm[0] === now.getFullYear(); return { label: n, bg: on ? "#4E2F20" : "#fff", fg: on ? "#fff" : "#3F2B22", border: on ? "#4E2F20" : "#EBDDD2", pick: () => setS({ cm: [now.getFullYear(), m] }) }; }),
      irCells: Array.from({ length: rows * 7 }, (_, k) => {
        const d = new Date(cm[0], cm[1], 1 - lead0 + k), t = d.getTime(), inM = d.getMonth() === cm[1], fut = t > T, inRg = lo != null && hi != null && t >= lo && t <= hi, end = t === lo || t === hi, col = k % 7;
        return { t, n: d.getDate(), cur: fut ? "not-allowed" : "pointer", band: inRg && lo !== hi ? "#F5EBE3" : "transparent",
          bandR: !inRg || lo === hi ? "0" : t === lo || col === 0 ? (t === hi || col === 6 ? "20px" : "20px 0 0 20px") : t === hi || col === 6 ? "0 20px 20px 0" : "0",
          bg: end ? "#4E2F20" : "transparent", fg: end ? "#fff" : fut ? "#D9C7BA" : inM ? "#3F2B22" : "#C9B5A8", weight: end || t === T ? 700 : 500,
          ring: end && lo !== hi ? "0 0 0 3px #F6B48A" : t === T && !end ? "inset 0 0 0 1.5px #BD4A19" : "none",
          down: fut ? undefined : (e: RPointerEvent<HTMLElement>) => {
            e.preventDefault(); refs.irDrag = true;
            if (lo != null && hi != null && lo !== hi && (t === lo || t === hi)) { setS({ a: t === lo ? hi : lo, b: t, dragged: true }); return; }
            if (sh.a != null && sh.a === sh.b && !sh.dragged && t !== sh.a) setS({ b: t, dragged: false }); else setS({ a: t, b: t, dragged: false });
          } };
      }),
      irMove: (e: RPointerEvent<HTMLElement>) => {
        if (!refs.irDrag) return;
        const el = document.elementFromPoint(e.clientX, e.clientY), t = el ? Number(el.getAttribute("data-t")) : 0;
        if (t && t <= T && t !== sh.b) setS({ b: t, dragged: true });
      },
      irUp: () => { refs.irDrag = false; },
      irPrev: () => setS({ cm: [cm[1] ? cm[0] : cm[0] - 1, (cm[1] + 11) % 12] }),
      irNext: () => { if (!atMax) setS({ cm: [cm[1] === 11 ? cm[0] + 1 : cm[0], (cm[1] + 1) % 12] }); }, irNextFg: atMax ? "#D9C7BA" : "#806B60",
      irHint: lo == null ? "Tap a day, then another day, or drag across days." : days === 1 ? "Tap another day or drag to extend." : `${days} days · drag either end to adjust`,
      irApplyLabel: lo == null || hi == null ? "Pick dates" : "Show " + (lo === hi ? f(new Date(lo)) : `${f(new Date(lo))} – ${f(new Date(hi))}`),
      irApplyBg: lo == null ? "#D9C7BA" : "#BD4A19",
      irApply: lo == null || hi == null ? undefined : () => patch({ insPeriod: "range", insRange: { a: lo, b: hi }, insSheet: null }),
    };
  }

  // Leads / Appointments / Upcoming → a list → Customer info → chat (rev 1010 §5.1).
  const p2 = (n: number) => String(n).padStart(2, "0"), dOnly = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
  const lastAt = (c: CrmCustomer) => lastReal(c)?.at ?? c.createdAt;
  // The sheet's top sits ~10 px under the Leads · Appointments · Upcoming row (measured on open); else 72%.
  const openList = (kind: "leads" | "appts" | "up") => (e: MouseEvent<HTMLElement>) => {
    let h: number | null = null;
    try {
      const row = e.currentTarget.parentElement!, root = e.currentTarget.closest<HTMLElement>("[data-revenue-app]")!;
      h = root.clientHeight - (row.getBoundingClientRect().bottom - root.getBoundingClientRect().top + 10);
    } catch { /* fall back to 72% */ }
    patch({ insList: { kind, h: h && h > 200 ? h + "px" : "72%" }, insInfo: null });
  };
  const kind = ui.insList?.kind ?? "leads";
  const vList = (kind === "up" ? visits.filter(v => v.state === "booked" && new Date(v.start) > now) : visits).slice()
    .sort((a, b) => kind === "up" ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start));
  const byId = new Map(mine.map(c => [c.id, c]));
  const row = (c: CrmCustomer, at: Date, n: number) => ({ name: c.name, ini: ini(c.name), phone: phoneLabel(c.phone) || "—", owner: "", date: dOnly(at), time: timeLabel(at),
    rule: n ? "1px solid #EBDDD2" : "0", open: () => patch({ insInfo: c.id }) });
  const lsRows = kind === "leads"
    ? [...leads].sort((a, b) => lastAt(b).localeCompare(lastAt(a))).map((c, n) => row(c, new Date(lastAt(c)), n))
    : vList.flatMap((v, n) => { const c = byId.get(v.customerId); return c ? [row(c, new Date(v.start), n)] : []; });
  const lsN = kind === "leads" ? leads.length : vList.length;
  const ci = ui.insInfo ? data.customers.find(c => c.id === ui.insInfo) : undefined;
  const list = {
    openLeads: openList("leads"), openAppts: openList("appts"), openUp: openList("up"),
    lsOpen: !!ui.insList, lsH: ui.insList?.h ?? "72%", lsClose: () => patch({ insList: null }),
    lsTitle: (kind === "leads" ? "Leads" : kind === "appts" ? "Appointments" : "Upcoming") + " · " + (per === "month" ? now.toLocaleDateString("en-GB", { month: "long" }) : per === "week" ? "This week" : per === "day" ? "Today" : (R0 === R1 ? f(new Date(R0)) : f(new Date(R0)) + " – " + f(new Date(R1)))),
    lsCount: kind === "leads" ? lsN + (lsN === 1 ? " lead" : " leads") : lsN + (lsN === 1 ? " appointment" : " appointments"),
    lsEmpty: !lsN, lsHasRows: !!lsN,
    lsEmptyText: kind === "leads" ? "No leads in this period." : kind === "appts" ? "No appointments in this period." : "No upcoming appointments.",
    lsRows,
    // Customer info over the list: ‹ back to the list; the backdrop closes both.
    ctOpen: !!ci, ctClose: () => patch({ insInfo: null, insList: null }), ctBack: () => patch({ insInfo: null }), ctName: ci?.name ?? "", ctIni: ci ? ini(ci.name) : "",
    ctRows: ci ? infoRows(ci) : [],
    ctChat: () => { if (!ci) return; set(u => ({ ...u, tab: "inbox", chat: ci.id, insInfo: null, insList: null, hist: [...u.hist, u.tab].slice(-20) })); act.openChat(ci.id); },
    ctEdit: () => { if (ci) set(u => ({ ...u, cform: { customerId: ci.id, edit: true }, insInfo: null })); },
  };

  return {
    ...list, ...customerFormVM(ctx), // stop comes with the customer form
    pRange: per === "day" ? "Today · " + gb(now, { weekday: "short", day: "numeric", month: "short" })
      : per === "range" ? "Custom · " + (R0 === R1 ? f(new Date(R0)) : `${f(new Date(R0))} – ${f(new Date(R1))}`)
        : per === "week" ? `This week · ${f(new Date(wk0))} – ${f(new Date(wk0 + 6 * DAY))}`
          : "This month · " + now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    rgLabel: rg ? (rg.a === rg.b ? f(new Date(rg.a)) : `${f(new Date(rg.a))} – ${f(new Date(rg.b))}`) : "Range",
    rgBg: rg ? "#3F2B22" : "#fff", rgFg: rg ? "#fff" : "#3F2B22", rgBd: rg ? "#3F2B22" : "#EBDDD2",
    openRange: () => patch({ insSheet: { cm: rg ? [new Date(rg.a).getFullYear(), new Date(rg.a).getMonth()] : [now.getFullYear(), now.getMonth()], a: rg ? rg.a : null, b: rg ? rg.b : null } }),
    pPeriods: ([["month", "Month"], ["week", "Week"], ["day", "Day"]] as const).map(([k, label]) => ({
      label, pick: () => patch({ insPeriod: k }), bg: per === k ? "#fff" : "transparent", fg: per === k ? "#3F2B22" : "#806B60", weight: per === k ? 650 : 500, shadow: per === k ? "0 1px 3px rgba(63,43,34,.12)" : "none",
    })),
    pHero: {
      rate: pct(Math.min(bookedLeads, leads.length), leads.length), rateNote: `${Math.min(bookedLeads, leads.length)} of ${leads.length} leads booked`,
      show: pct(showed, due.length), showNote: due.length ? `${showed} of ${due.length} came${noshow ? ` · ${noshow} no show` : ""}` : "None due yet",
      won: pct(wonV, showed), wonNote: showed ? `${wonV} of ${showed} visits won` : "No visits yet",
      leads: leads.length, appts: visits.length, up: upcoming,
      reply: fmtM(reply), replyNote: gaps.length ? `across ${gaps.length} replies` : "No replies yet", replyFg: reply != null && reply > 60 ? "#F6B48A" : "#FFFFFF",
    },
    pStatus: status.map(([label, n, c]) => ({ label, n, c, w: `${tot ? n / tot * 100 : 0}%` })),
    irOpen: !!sh, irClose: () => patch({ insSheet: null }),
    ...ir,
    _border: BORDER,
  };
}
export type InsightVM = ReturnType<typeof insightVM>;
