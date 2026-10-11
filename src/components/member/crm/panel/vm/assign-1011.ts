/**
 * Assignment, rev 1011 (§6): the overview (one card per function, each opening its section alone), Full time lead
 * allocation as days per person taking turns (§6.2), By team's second level — each team Evenly / By % / By max (§6.6) —
 * and Over the limit (leads a full By max team holds). Ported from the prototype (`asx`, `ftx`, `bp`, `hl`); the
 * database deals by the same rules (crm_assign_contact and its TypeScript twin, lib/member/crm-team.ts).
 */
import type { ChangeEvent, FocusEvent, MouseEvent } from "react";
import type { CrmAdRule, CrmCustomer } from "@/lib/member/crm-data";
import { jobTitle } from "../../shared/people";
import { ini, stop, type PanelCtx, type Team } from "./common";
import type { assignVM } from "./assign";

const WK = ["M", "T", "W", "T", "F", "S", "S"], WKL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], A7 = [0, 1, 2, 3, 4, 5, 6];
type Mode = "even" | "pct" | "cnt";

/** n ways, as even as whole numbers go (the remainder to the first ones). */
const evenShare = (n: number) => { const b = Math.floor(100 / n), r = 100 - b * n; return (k: number) => b + (k < r ? 1 : 0); };
const dig = (e: ChangeEvent<HTMLInputElement>) => parseInt(String(e.target.value).replace(/\D/g, "")) || 0;

/** Who is ticked on which weekday in a team's Full time days (any old Max / By % value above 0 counts as ticked). */
function ticks(ctx: PanelCtx, tid: string): Record<string, number[]> {
  const r = ctx.data.ftRules.find(x => x.tlId === tid), v: Record<string, number[]> = {};
  if (r) for (const id in r.vals) v[id] = A7.filter(d => (r.vals[id]?.[d] ?? 0) > 0 && r.days.includes(d));
  return v;
}
/** Full time people: anyone switched to full time in Member work type (any role, rev 1011 Profile). */
export const ftPeople = (t: Team) => t.people.filter(p => p.fullTime);
const who = (ps: Team["people"], v: Record<string, number[]>, d: number) => ps.filter(p => (v[p.id] ?? []).includes(d)).map(p => p.name);
const lineOf = (names: string[]) => !names.length ? "" : names.length === 1 ? names[0] + " only" : names.join(", ") + " take turns";

export function assignExtraVM(ctx: PanelCtx, asv: ReturnType<typeof assignVM> | undefined) {
  const { ui, patch, data, now, teams, act, nameOf } = ctx;
  const sec = ui.asSec, go = (k: NonNullable<typeof sec>) => () => patch({ asSec: k });
  const urgent = (c: CrmCustomer) => {
    const last = [...c.messages].reverse().find(m => !m.auto);
    return !!last && last.from === "lead";
  };
  // ── Over the limit: held by a full By max team, nobody yet.
  const heldC = data.customers.filter(c => c.held && !c.assignedTo);
  const heldAds = [...new Set(heldC.map(c => c.ad))];
  const orgN = data.customers.filter(c => !c.assignedTo && !c.teamId && !c.held).length;
  const adIds = [...new Set(data.customers.map(c => c.adId).filter((x): x is string => !!x))];
  const setIds = new Set(data.adRules.map(r => r.adId)), unset = adIds.filter(a => !setIds.has(a)).length;
  const waiting = asv ? asv.asgAttSum.reduce((n, g) => n + g.n, 0) : data.customers.filter(urgent).length;
  const overdue = asv ? (asv.asgAttSum.find(g => g.name === "Overdue")?.n ?? 0) : 0;
  const ftTeams = teams.filter(t => Object.values(ticks(ctx, t.id)).some(d => d.length)).length;

  const asx = {
    onHome: !sec, inSub: !!sec, back: () => patch({ asSec: null }),
    heldAny: !!heldC.length, openHeld: () => patch({ hlOpen: true }),
    heldTitle: heldC.length + (heldC.length === 1 ? " lead" : " leads") + " over the limit",
    onOrg: sec === "Org", onAds: sec === "Ads", onAw: sec === "Aw", onFt: sec === "Ft",
    cards: ([
      ["Org", "Organic Leads", "#BD4A19", "M4 5h16v11H9l-5 4V5Zm4 4h8M8 12h5", orgN ? orgN + " to send" : "Nothing waiting", orgN],
      ["Ads", data.can.viewAll ? "Ads to teams" : "Ads to my team", "#2F6FB5", "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm14-2a4 4 0 0 1 0 6",
        adIds.length + " ads" + (heldC.length ? " · " + heldC.length + (heldC.length === 1 ? " lead" : " leads") + " over the limit" : unset ? " · " + unset + " on the default (evenly)" : " · all set"), heldC.length],
      ["Aw", "Awaiting reply", "#8E4B6E", "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", waiting ? waiting + " need a reply" + (overdue ? " · " + overdue + " overdue" : "") : "Everyone is answered", waiting],
      ["Ft", "Full time lead allocation", "#387557", "M8 2v4m8-4v4M3 10h18M5 4h14v17H5V4Zm4 11 2 2 4-4", ftTeams ? ftTeams + " of " + teams.length + " teams set" : "Not set for any team", 0],
    ] as const).map(([k, title, c, icon, sub, n]) => ({ title, c, icon, sub, subFg: "#806B60", n, hasN: n > 0, go: go(k) })),
    held: heldAds.map(ad => {
      const cs = heldC.filter(c => c.ad === ad), r = data.adRules.find(x => x.label === ad);
      const full = r?.tm ? teams.filter(t => r.tm![t.id] === "cnt" && (r.split[t.id] || 0) > 0).map(t => t.name) : [];
      return { ad, n: cs.length, names: cs.map(c => c.name).join(", "), full: full.length ? full.join(", ") + (full.length === 1 ? " is" : " are") + " full (By max)" : "Waiting for a limit",
        edit: () => asv?.adRows.find(x => x.name === ad)?.edit() };
    }),
  };

  // ── Full time lead allocation: per person, the days they take; one ticked gets the day, two or more take turns.
  const fx = ui.ftx, ft = fx ? teams.find(t => t.id === fx.tid) : undefined;
  const ftx = {
    open: !!ft, close: () => patch({ ftx: null }), name: ft?.name ?? "", heads: WK,
    people: [] as { name: string; sub: string; days: { title: string; icon: string; bg: string; fg: string; bd: string; toggle: () => void }[] }[],
    week: [] as { day: string; text: string; fg: string; weight: number; rule: string }[],
    clear: () => {}, save: () => {},
    sum: teams.map(t => {
      const v = ticks(ctx, t.id), ps = ftPeople(t), on = A7.filter(d => who(ps, v, d).length);
      return { name: t.name, mode: on.length ? on.map(d => WKL[d]).join(", ") : "Off · follows Ads to teams", open: () => patch({ ftx: { tid: t.id, v: JSON.parse(JSON.stringify(v)) } }),
        rs: ps.map(p => ({ name: p.name, label: "", tagBg: "transparent", tagFg: "transparent",
          days: A7.map(d => { const o = (v[p.id] ?? []).includes(d); return { t: WK[d], bg: o ? "#387557" : "#EEF3EF", fg: o ? "#fff" : "#B5C4BA" }; }) })) };
    }),
  };
  if (ft && fx) {
    const ps = ftPeople(ft), v = fx.v, setV = (nv: Record<string, number[]>) => patch({ ftx: { ...fx, v: nv } });
    ftx.people = ps.map(p => ({ name: p.name, sub: `${jobTitle(p)} · Full time`, days: A7.map(d => {
      const o = (v[p.id] ?? []).includes(d);
      return { title: WKL[d], icon: o ? "m5 12 5 5 9-10" : "", bg: o ? "#387557" : "#fff", fg: "#fff", bd: o ? "#387557" : "#D9C7BA",
        toggle: () => { const cur = v[p.id] ?? []; setV({ ...v, [p.id]: o ? cur.filter(x => x !== d) : [...cur, d].sort() }); } };
    }) }));
    ftx.week = A7.map((d, k) => { const n = who(ps, v, d); return { day: WKL[d], text: n.length ? lineOf(n) : "Follows Ads to teams", fg: n.length ? "#2E6B4C" : "#A8968B", weight: n.length ? 650 : 500, rule: k ? "1px solid #F3E9E1" : "0" }; });
    ftx.clear = () => setV({});
    ftx.save = () => {
      const days = A7.filter(d => who(ps, v, d).length), vals: Record<string, Record<string, number>> = {};
      ps.forEach(p => { vals[p.id] = Object.fromEntries(A7.map(d => [d, (v[p.id] ?? []).includes(d) ? 1 : 0])); });
      void act.saveFtRule(ft.id, "turns", days, vals).then(ok => { if (ok) patch({ ftx: null, toast: ft.name + ": full time days saved" }); });
    };
  }

  // ── By team, inside each team (§6.6): Evenly / By % (default, auto-balancing to 100) / By max (starts at 0).
  const E = ui.adEd, rule: CrmAdRule | undefined = E ? data.adRules.find(r => r.adId === E.id) : undefined;
  const isSp = !!E && (E.mode === "split" || E.mode === "people");
  const B = isSp && E ? (ui.bp && ui.bp.adId === E.id ? ui.bp : { adId: E.id, tm: { ...(rule?.tm ?? {}) }, pv: { ...(rule?.pp ?? {}) }, touch: {} as Record<string, string[]> }) : null;
  const takenOf = (adId: string, pid: string) => data.customers.filter(c => c.adId === adId && c.assignedTo === pid).length;
  const bp = { selAll: (e: FocusEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>) => (e.target as HTMLInputElement).select(), inner: [] as ReturnType<typeof innerOf>[] };
  let aeSave: { saveBg: string; save: (() => void) | undefined } | null = null;
  function innerOf(t: Team, B0: NonNullable<typeof B>, split: Record<string, number>) {
    const putB = (p: Partial<NonNullable<typeof B>>) => patch({ bp: { ...B0, ...p } });
    const mode: Mode = B0.tm[t.id] ?? "pct", ps = t.people, es = evenShare(ps.length || 1), custom = mode !== "even";
    const val = (p: Team["people"][number], k: number) => B0.pv[p.id] ?? (mode === "pct" ? es(k) : 0);
    const sum = ps.reduce((x, p, k) => x + val(p, k), 0);
    const ok = mode === "even" || (mode === "pct" ? sum === 100 : sum > 0);
    const setMode = (m: Mode) => { const pv = { ...B0.pv }; ps.forEach((p, k) => { if (m === "even") delete pv[p.id]; else pv[p.id] = m === "pct" ? es(k) : 0; }); putB({ tm: { ...B0.tm, [t.id]: m }, pv, touch: { ...B0.touch, [t.id]: [] } }); };
    const ftr = data.ftRules.find(f => f.tlId === t.id);
    const ftDays = ftr ? [...new Set(Object.entries(ftr.vals).flatMap(([, v]) => Object.entries(v).filter(([, n]) => Number(n) > 0).map(([d]) => Number(d))))].sort((a, b) => a - b) : [];
    return {
      ok, ftNote: ftDays.length ? "On " + ftDays.map(x => WKL[x]).join(", ") + " only the Full time people get leads; other days follow this setting." : "",
      name: t.name, c: t.c, pct: (split[t.id] || 0) + "%", unit: mode === "pct" ? "%" : "max", isEven: !custom, custom,
      evenLine: "In turn among " + ps.map(p => p.name.split(" ")[0]).join(", ") + " · Full time days apply",
      modes: ([["even", "Evenly"], ["pct", "By %"], ["cnt", "By max"]] as const).map(([k, label]) => ({ label, pick: () => { if (mode !== k) setMode(k); },
        bg: mode === k ? "#fff" : "transparent", fg: mode === k ? "#3F2B22" : "#806B60", w: mode === k ? 650 : 500, sh: mode === k ? "0 1px 3px rgba(63,43,34,.12)" : "none" })),
      people: ps.map((p, k) => {
        const v = val(p, k), tk = E ? takenOf(E.id, p.id) : 0, full = mode === "cnt" && v > 0 && tk >= v;
        // By %: typing one person's % spreads the rest evenly over those not yet edited (always 100); edited people keep
        // their value; once all are edited the difference comes from the others in edit order (none below 0).
        const setPct = (n0: number) => {
          const n = Math.max(0, Math.min(100, n0)), tch = (B0.touch[t.id] ?? []).filter(x => x !== p.id), others = ps.filter(q => q.id !== p.id);
          const cur: Record<string, number> = {}; ps.forEach((q, j) => { cur[q.id] = val(q, j); }); cur[p.id] = n;
          const free = others.filter(q => !tch.includes(q.id)), fixed = others.filter(q => tch.includes(q.id)), fixedSum = fixed.reduce((x, q) => x + cur[q.id], 0);
          if (free.length) {
            let left = 100 - n - fixedSum;
            if (left < 0) { let over = -left; for (const q of fixed) { const cut = Math.min(cur[q.id], over); cur[q.id] -= cut; over -= cut; } left = 0; }
            const es2 = evenShare(free.length); free.forEach((q, j) => { cur[q.id] = Math.round(left * es2(j) / 100); });
            const diff = 100 - ps.reduce((x, q) => x + cur[q.id], 0); if (diff && free.length) cur[free[0].id] += diff;
          } else if (others.length) {
            let diff = 100 - ps.reduce((x, q) => x + cur[q.id], 0);
            if (diff > 0) cur[fixed[0].id] += diff; else for (const q of fixed) { if (!diff) break; const cut = Math.min(cur[q.id], -diff); cur[q.id] -= cut; diff += cut; }
          }
          putB({ pv: { ...B0.pv, ...cur }, touch: { ...B0.touch, [t.id]: [...tch, p.id] } });
        };
        return { name: p.name, v: String(v), set: (e: ChangeEvent<HTMLInputElement>) => mode === "pct" ? setPct(dig(e)) : putB({ pv: { ...B0.pv, [p.id]: dig(e) } }),
          note: mode === "cnt" ? (v ? tk + " of " + v + " taken" + (full ? " · full" : "") : "Gets none") : tk + " taken so far", noteFg: full ? "#A3371A" : "#806B60" };
      }),
      sum: mode === "pct" ? (sum === 100 ? "Adds up to 100%" : "Adds up to " + sum + "%. Make it 100%.") : mode === "cnt" ? (sum ? "Up to " + sum + " leads in this team" : "Set a maximum for at least one person") : "",
      sumFg: ok ? "#387557" : "#A3371A",
    };
  }
  if (B && E && asv?.ae) {
    const split = E.split;
    bp.inner = teams.filter(t => (split[t.id] || 0) > 0).map(t => innerOf(t, B, split));
    const tot = teams.reduce((x, t) => x + (split[t.id] || 0), 0), ok = tot === 100 && bp.inner.every(x => x.ok);
    aeSave = { saveBg: ok ? "#2F6FB5" : "#C9D6E6", save: ok ? () => {
      const tm: Record<string, Mode> = {}, pv: Record<string, number> = {};
      teams.forEach(t => {
        const m: Mode = B.tm[t.id] ?? "pct"; tm[t.id] = m; if (m === "even") return;
        const es = evenShare(t.people.length || 1); t.people.forEach((p, k) => { pv[p.id] = B.pv[p.id] ?? (m === "pct" ? es(k) : 0); });
      });
      // Saving deals any lead waiting for this ad first, oldest first, inside the team it waits for (the database does it).
      void act.saveAdRule(E.id, E.label, { mode: "split", split, pm: "pct", pp: pv, tm }).then(ok => {
        if (ok) patch({ adEd: null, bp: null, toast: E.label + " saved" });
      });
    } : undefined };
  }

  // The ad cards (compact): a legend per team, and "N waiting" when a full By max team holds leads of that ad.
  const adRows = (asv?.adRows ?? []).map(row => {
    const r = data.adRules.find(x => x.label === row.name), tm = r?.tm ?? {}, sp = r && (r.mode === "split" || r.mode === "people") ? r.split : null;
    const leg = sp ? teams.filter(t => (sp[t.id] || 0) > 0).map(t => ({ c: t.c, name: t.name.replace(/^Team /, ""), pct: sp[t.id] + "%", mode: tm[t.id] === "cnt" ? " · max" : tm[t.id] === "even" ? " · evenly" : "" })) : [];
    const hn = heldC.filter(c => c.ad === row.name).length;
    return { ...row, held: hn > 0, heldTxt: hn + " waiting", hasLeg: !!leg.length, leg, tag: row.tag === "Evenly · default" ? "Not set · evenly" : row.tag };
  });

  // The Over the limit page: one card per ad, each waiting customer with chat and Send to.
  const hlAds = [...new Set(heldC.map(c => c.ad))];
  const hl = {
    open: !!ui.hlOpen && !ui.lead, back: () => patch({ hlOpen: false }), close: () => patch({ hlOpen: false }), empty: !heldC.length, stop,
    sub: heldC.length ? heldC.length + (heldC.length === 1 ? " lead" : " leads") + " · " + hlAds.length + (hlAds.length === 1 ? " ad" : " ads") : "Nothing waiting",
    groups: hlAds.map(ad => {
      const cs = heldC.filter(c => c.ad === ad).sort((x, y) => x.createdAt.localeCompare(y.createdAt)), r = data.adRules.find(x => x.label === ad), tmm = r?.tm ?? {};
      const full = teams.filter(t => tmm[t.id] === "cnt" && cs.some(c => c.heldTeam === t.id)).map(t => t.name);
      return { ad, full: (full.length ? full.join(", ") + " full · " : "") + cs.length + " waiting",
        edit: () => { patch({ hlOpen: false }); const row = asv?.adRows.find(x => x.name === ad); if (row) setTimeout(() => row.edit(), 0); },
        rows: cs.map((c, k) => {
          const lastIn = [...c.messages].reverse().find(m => m.from === "lead"), at = new Date((lastIn ?? c.messages[0])?.at ?? c.createdAt), mins = Math.round((now.getTime() - at.getTime()) / 6e4);
          return { name: c.name, rule: k ? "1px solid #F3E9E1" : "0", meta: (c.channel === "messenger" ? "Messenger" : "WhatsApp") + " · waiting " + (mins < 60 ? mins + " min" : Math.floor(mins / 60) + " h"),
            chat: () => patch({ lead: c.id, pick: "", toast: "" }), send: () => patch({ sendFor: c.id, sdSel: null }) };
        }) };
    }),
  };
  void nameOf; void ini;
  return { asx, ftx, bp, hl, adRows, aeSave };
}
