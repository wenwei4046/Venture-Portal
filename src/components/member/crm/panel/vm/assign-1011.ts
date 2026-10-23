/**
 * Assignment, rev 1011 (§6): the overview (one card per function, each opening its section alone), Full time lead
 * allocation as days per person taking turns (§6.2), By team's second level — each team Evenly / By % / By max (§6.6) —
 * and Over the limit (leads a full By max team holds). Ported from the prototype (`asx`, `ftx`, `bp`, `hl`); the
 * database deals by the same rules (crm_assign_contact and its TypeScript twin, lib/member/crm-team.ts).
 */
import type { ChangeEvent, FocusEvent, MouseEvent } from "react";
import type { CrmAdRule, CrmCustomer } from "@/lib/member/crm-data";
import { jobTitle } from "../../shared/people";
import { evenShare, ini, stop, type PanelCtx, type Team } from "./common";
import type { assignVM } from "./assign";
import { activeVM, lockedOf, sharedOut } from "../../shared/locked";
import { is100, pctOf, pctShow, pctText, r2 } from "../../shared/pct";
import { DIRECTOR_C, DIRECTOR_SPLIT_KEY, DIRECTOR_TEAM } from "../../desk/vm/tokens";

const WK = ["M", "T", "W", "T", "F", "S", "S"], WKL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], A7 = [0, 1, 2, 3, 4, 5, 6];
type Mode = "even" | "pct" | "cnt";
type SheetVM = { name: string; c: string; sub: string; ok: boolean; total: string; unit: string; modes: { label: string; pick: () => void; w: number }[]; modeLbl: string;
  people: { name: string; ini: string; mine: boolean; range: number; max: number; v: string; slide: (e: ChangeEvent<HTMLInputElement>) => void; set: (e: ChangeEvent<HTMLInputElement>) => void; locked: boolean }[];
  cancel: () => void; apply: (() => void) | undefined };
type CrmRuleIn = Parameters<PanelCtx["act"]["saveAdRule"]>[2];
const dig = (e: ChangeEvent<HTMLInputElement>) => parseInt(String(e.target.value).replace(/\D/g, "")) || 0;

/** Who is ticked on which weekday in a team's Full time days (any old Max / By % value above 0 counts as ticked). */
function ticks(ctx: PanelCtx, tid: string): Record<string, number[]> {
  const r = ctx.data.ftRules.find(x => x.tlId === tid), v: Record<string, number[]> = {};
  if (r) for (const id in r.vals) v[id] = A7.filter(d => (r.vals[id]?.[d] ?? 0) > 0 && r.days.includes(d));
  return v;
}
/** Full time people: anyone switched to full time in Member work type (any role, rev 1011 Profile). */
export const ftPeople = (t: Team, locked?: Set<string>) => t.people.filter(p => p.fullTime && !locked?.has(p.id));
/** The team's full-time people who are locked for now: shown greyed, not editable, their days kept (2026-10-22). */
const ftLocked = (t: Team, locked: Set<string>) => t.people.filter(p => p.fullTime && locked.has(p.id));
const greyDays = () => A7.map(d => ({ t: WK[d], bg: "var(--crm-field)", fg: "var(--crm-faint-2)" }));
const who = (ps: Team["people"], v: Record<string, number[]>, d: number) => ps.filter(p => (v[p.id] ?? []).includes(d)).map(p => p.name);
const lineOf = (names: string[]) => !names.length ? "" : names.length === 1 ? names[0] + " only" : names.join(", ") + " take turns";

export function assignExtraVM(ctx: PanelCtx, asv: ReturnType<typeof assignVM> | undefined) {
  const { ui, patch, data, now, teams, act, nameOf } = ctx;
  const lk = lockedOf(data);
  // 4a (T03): the sections are tabs under the title — Ads to teams first; Work type opens Profile's Member work type.
  const sec = ui.asSec ?? "Ads", go = (k: NonNullable<typeof ui.asSec>) => () => patch({ asSec: k });
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
    onHome: false, inSub: true, back: () => patch({ asSec: null }),
    tabs4: [
      { label: data.can.viewAll ? "Ads to teams" : "Ads to my team", on: sec === "Ads", pick: go("Ads") },
      // Active members, its own tab after Ads (the owner, 2026-10-22). CRM · Manage only, as Work type.
      ...(data.can.manage ? [{ label: "Active", on: sec === "Act" && !ui.ftsOpen, pick: () => patch({ asSec: "Act", ftsOpen: false, actDraft: null }) }] : []),
      { label: "Full time", on: sec === "Ft", pick: go("Ft") },
      ...(data.can.manage ? [{ label: "Work type", on: !!ui.ftsOpen, pick: () => patch({ ftsOpen: true }) }] : []),
    ],
    heldAny: !!heldC.length, openHeld: () => patch({ hlOpen: true }),
    heldTitle: heldC.length + (heldC.length === 1 ? " lead" : " leads") + " over the limit",
    onOrg: sec === "Org", onAds: sec === "Ads", onAw: sec === "Aw", onFt: sec === "Ft", onAct: sec === "Act",
    act: activeVM([
      { name: DIRECTOR_TEAM, color: DIRECTOR_C[0], people: data.people.filter(p => p.role === "hod").sort((a, b) => a.name.localeCompare(b.name)) },
      ...teams.map(t => ({ name: t.name, color: t.c, people: t.people })),
    ], lk, p => jobTitle(p as Team["people"][number]), ui.actDraft, d => patch({ actDraft: d }), act.setLocked, msg => patch({ toast: msg })),
    cards: ([
      // No Organic Leads card (the owner, 2026-10-13: an enquiry from no ad goes straight to the Revenue Director).
      ["Ads", data.can.viewAll ? "Ads to teams" : "Ads to my team", "var(--crm-ink-soft)", "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm14-2a4 4 0 0 1 0 6",
        adIds.length + " ads" + (heldC.length ? " · " + heldC.length + (heldC.length === 1 ? " lead" : " leads") + " over the limit" : unset ? " · " + unset + " on the default (evenly)" : " · all set"), heldC.length],
      // No Awaiting reply card (the owner, 2026-10-13): the Team inbox's Attention is the same list.
      ["Ft", "Full time lead allocation", "var(--crm-brown)", "M8 2v4m8-4v4M3 10h18M5 4h14v17H5V4Zm4 11 2 2 4-4", ftTeams ? ftTeams + " of " + teams.length + " teams set" : "Not set for any team", 0],
    ] as const).map(([k, title, c, icon, sub, n]) => ({ title, c, icon, sub, subFg: "var(--crm-muted)", n, hasN: n > 0, go: go(k) })),
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
    // Round 2 (rev 1011 §8): "Save and apply to all N teams" — off until somebody here has a day ticked.
    applyLabel: "", applyFg: "var(--crm-faint-2)", applyBd: "var(--crm-tint-follow)", applyCur: "default", applyAll: undefined as (() => void) | undefined,
    sum: teams.map(t => {
      const v = ticks(ctx, t.id), ps = ftPeople(t, lk), on = A7.filter(d => who(ps, v, d).length);
      return { name: t.name, mode: on.length ? on.map(d => WKL[d]).join(", ") : "Off · follows Ads to teams", open: () => patch({ ftx: { tid: t.id, v: JSON.parse(JSON.stringify(v)) } }),
        rs: ps.map(p => ({ name: p.name, label: "", tagBg: "transparent", tagFg: "transparent",
          days: A7.map(d => { const o = (v[p.id] ?? []).includes(d); return { t: WK[d], bg: o ? "var(--crm-brown)" : "var(--crm-tint-follow)", fg: o ? "#fff" : "var(--crm-faint-2)" }; }) }))
          .concat(ftLocked(t, lk).map(p => ({ name: p.name, label: "Locked", tagBg: "var(--crm-field)", tagFg: "var(--crm-faint)", days: greyDays() }))) };
    }),
  };
  if (ft && fx) {
    const ps = ftPeople(ft, lk), v = fx.v, setV = (nv: Record<string, number[]>) => patch({ ftx: { ...fx, v: nv } });
    ftx.people = ps.map(p => ({ name: p.name, sub: `${jobTitle(p)} · Full time`, days: A7.map(d => {
      const o = (v[p.id] ?? []).includes(d);
      return { title: WKL[d], icon: o ? "m5 12 5 5 9-10" : "", bg: o ? "var(--crm-brown)" : "#fff", fg: "#fff", bd: o ? "var(--crm-brown)" : "var(--crm-line)",
        toggle: () => { const cur = v[p.id] ?? []; setV({ ...v, [p.id]: o ? cur.filter(x => x !== d) : [...cur, d].sort() }); } };
    }) })).concat(ftLocked(ft, lk).map(p => ({ name: p.name, sub: "Locked · no new leads", days: A7.map(d => ({ title: WKL[d], icon: "", bg: "var(--crm-field)", fg: "#fff", bd: "var(--crm-rule-soft)", toggle: () => {} })) })));
    ftx.week = A7.map((d, k) => { const n = who(ps, v, d); return { day: WKL[d], text: n.length ? lineOf(n) : "Follows Ads to teams", fg: n.length ? "var(--crm-brown)" : "var(--crm-faint)", weight: n.length ? 650 : 500, rule: k ? "1px solid var(--crm-rule-soft)" : "0" }; });
    ftx.clear = () => setV({});
    ftx.save = () => {
      const days = A7.filter(d => who(ps, v, d).length), vals: Record<string, Record<string, number>> = {};
      ps.forEach(p => { vals[p.id] = Object.fromEntries(A7.map(d => [d, (v[p.id] ?? []).includes(d) ? 1 : 0])); });
      // A locked person's days are kept for when they come back (the dealer skips them meanwhile).
      ftLocked(ft, lk).forEach(p => { vals[p.id] = Object.fromEntries(A7.map(d => [d, (v[p.id] ?? []).includes(d) ? 1 : 0])); });
      void act.saveFtRule(ft.id, "turns", days, vals).then(ok => { if (ok) patch({ ftx: null, toast: ft.name + ": full time days saved" }); });
    };
    // …and to every team: this team as edited; in each other team every full-time person gets the day pattern of the first
    // ticked person here. A team with no full-time person is skipped. One crm_save_fulltime per team (the prototype's).
    const pat = ps.map(p => v[p.id] ?? []).find(a => a.length) ?? [];
    ftx.applyLabel = "Save and apply to all " + teams.length + " teams";
    ftx.applyFg = pat.length ? "var(--crm-brown)" : "var(--crm-faint-2)"; ftx.applyBd = pat.length ? "var(--crm-brown)" : "var(--crm-tint-follow)"; ftx.applyCur = pat.length ? "pointer" : "default";
    ftx.applyAll = pat.length ? () => void (async () => {
      for (const t of teams) {
        const tps = ftPeople(t, lk);
        if (!tps.length) continue;
        const vv: Record<string, number[]> = {};
        tps.forEach(p => { vv[p.id] = t.id === ft.id ? (v[p.id] ?? []) : [...pat]; });
        const days = A7.filter(d => who(tps, vv, d).length), vals: Record<string, Record<string, number>> = {};
        tps.forEach(p => { vals[p.id] = Object.fromEntries(A7.map(d => [d, vv[p.id].includes(d) ? 1 : 0])); });
        if (!(await act.saveFtRule(t.id, "turns", days, vals))) return;
      }
      patch({ ftx: null, toast: "Applied to all " + teams.length + " teams · fine-tune any team on its own" });
    })() : undefined;
  }

  // ── By team, inside each team (§6.6): Evenly / By % (default, auto-balancing to 100) / By max (starts at 0).
  const E = ui.adEd, rule: CrmAdRule | undefined = E ? data.adRules.find(r => r.adId === E.id) : undefined;
  const isSp = !!E && (E.mode === "split" || E.mode === "people");
  const B = isSp && E ? (ui.bp && ui.bp.adId === E.id ? ui.bp : { adId: E.id, tm: { ...(rule?.tm ?? {}) }, pv: { ...(rule?.pp ?? {}) }, touch: {} as Record<string, string[]> }) : null;
  const takenOf = (adId: string, pid: string) => data.customers.filter(c => c.adId === adId && c.assignedTo === pid).length;
  const bp = { selAll: (e: FocusEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>) => (e.target as HTMLInputElement).select(), inner: [] as ReturnType<typeof innerOf>[], sheet: null as SheetVM | null };
  let aeSave: { why: string; saveBg: string; save: (() => void) | undefined } | null = null;
  let byTeamRule: CrmRuleIn | null = null;
  function innerOf(t: Team, B0: NonNullable<typeof B>, split: Record<string, number>) {
    const putB = (p: Partial<NonNullable<typeof B>>) => patch({ bp: { ...B0, ...p } });
    const mode: Mode = B0.tm[t.id] ?? "pct", ps = t.people, es = evenShare(ps.length || 1), custom = mode !== "even";
    // A % saved for the team as it was (somebody since joined or left) no longer adds up: it opens as an even share, as
    // a team never set does — it was Save's silent block (the owner, 2026-10-18: "为什么我调整后，save处于灰色？").
    const stored = ps.reduce((x, p) => x + (B0.pv[p.id] ?? 0), 0), touched = (B0.touch[t.id] ?? []).length > 0;
    const whole = t.id === DIRECTOR_SPLIT_KEY ? data.people.filter(p => p.role === "hod") : (teams.find(x => x.id === t.id)?.people ?? []);
    const lockedHere = whole.filter(p => lk.has(p.id)), scaled = mode === "pct" && !touched ? sharedOut(B0.pv, ps.map(p => p.id), lockedHere.length > 0) : null;
    const stale = !scaled && mode === "pct" && !touched && ps.some(p => B0.pv[p.id] != null) && stored !== 100;
    const val = (p: Team["people"][number], k: number) => (scaled ? scaled[p.id] ?? 0 : stale ? es(k) : B0.pv[p.id] ?? (mode === "pct" ? es(k) : 0));
    const sum = ps.reduce((x, p, k) => x + val(p, k), 0);
    // A team with nobody in it has nothing to split.
    const ok = !ps.length || mode === "even" || (mode === "pct" ? is100(sum) : sum > 0);
    const why = ok ? "" : mode === "pct" ? t.name + " adds up to " + pctShow(sum) + "% inside — make it 100%." : t.name + " needs a maximum for at least one person.";
    const setMode = (m: Mode) => { const pv = { ...B0.pv }; ps.forEach((p, k) => { if (m === "even") delete pv[p.id]; else pv[p.id] = m === "pct" ? es(k) : 0; }); putB({ tm: { ...B0.tm, [t.id]: m }, pv, touch: { ...B0.touch, [t.id]: [] } }); };
    const ftr = data.ftRules.find(f => f.tlId === t.id);
    const ftDays = ftr ? [...new Set(Object.entries(ftr.vals).flatMap(([, v]) => Object.entries(v).filter(([, n]) => Number(n) > 0).map(([d]) => Number(d))))].sort((a, b) => a - b) : [];
    return {
      ok, why, ftNote: ftDays.length ? "On " + ftDays.map(x => WKL[x]).join(", ") + " only the Full time people get leads; other days follow this setting." : "",
      name: t.name, c: t.c, pct: pctShow(split[t.id] || 0) + "%", unit: mode === "pct" ? "%" : "max", isEven: !custom, custom,
      evenLine: "In turn among " + ps.map(p => p.name.split(" ")[0]).join(", ") + " · Full time days apply",
      modes: ([["even", "Evenly"], ["pct", "By %"], ["cnt", "By max"]] as const).map(([k, label]) => ({ label, pick: () => { if (mode !== k) setMode(k); },
        bg: mode === k ? "#fff" : "transparent", fg: mode === k ? "var(--crm-ink)" : "var(--crm-muted)", w: mode === k ? 650 : 500, sh: mode === k ? "0 1px 3px rgba(42,22,12,.12)" : "none" })),
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
            const es2 = evenShare(free.length); free.forEach((q, j) => { cur[q.id] = Math.round(left * es2(j)) / 100; });
            const diff = r2(100 - ps.reduce((x, q) => x + cur[q.id], 0)); if (diff && free.length) cur[free[0].id] = r2(cur[free[0].id] + diff);
          } else if (others.length) {
            let diff = r2(100 - ps.reduce((x, q) => x + cur[q.id], 0));
            if (diff > 0) cur[fixed[0].id] = r2(cur[fixed[0].id] + diff); else for (const q of fixed) { if (!diff) break; const cut = Math.min(cur[q.id], -diff); cur[q.id] = r2(cur[q.id] - cut); diff = r2(diff + cut); }
          }
          putB({ pv: { ...B0.pv, ...cur }, touch: { ...B0.touch, [t.id]: [...tch, p.id] }, ty: typed });
        };
        let typed: { id: string; text: string } | null = null;
        const mine = (B0.touch[t.id] ?? []).includes(p.id), max = mode === "pct" ? 100 : Math.max(20, v * 2);
        return { name: p.name, ini: ini(p.name), mine, range: v, max, w: `${Math.min(100, (v / (mode === "pct" ? 100 : Math.max(1, ...ps.map((q, j) => val(q, j))))) * 100)}%`,
          txt: mode === "pct" ? pctShow(v) + "%" : v ? "up to " + v : "none",
          // The box keeps what is typed ("40.") — two decimals for By % (shared/pct.ts); By max is whole leads.
          v: mode === "pct" && B0.ty?.id === p.id ? B0.ty.text : pctShow(v),
          slide: (e: ChangeEvent<HTMLInputElement>) => mode === "pct" ? setPct(+e.target.value) : putB({ pv: { ...B0.pv, [p.id]: +e.target.value } }),
          set: (e: ChangeEvent<HTMLInputElement>) => { if (mode !== "pct") return putB({ pv: { ...B0.pv, [p.id]: dig(e) } }); const tx = pctText(e.target.value); typed = { id: p.id, text: tx }; setPct(pctOf(tx)); },
          note: mode === "cnt" ? (v ? tk + " of " + v + " taken" + (full ? " · full" : "") : "Gets none") : tk + " taken so far", noteFg: full ? "var(--crm-oxblood)" : "var(--crm-muted)", locked: false };
      }).concat(lockedHere.map(p => ({ name: p.name, ini: ini(p.name), mine: false, range: 0, max: 100, w: "0%", txt: "locked", v: "", slide: () => {}, set: () => {}, note: "Locked · no new leads", noteFg: "var(--crm-faint)", locked: true }))),
      // v3 T04 / T04b: the row's line, Adjust split and its sheet.
      id: t.id, modeLbl: mode === "even" ? "Evenly" : mode === "pct" ? "By %" : "By max",
      held: E ? data.customers.filter(c => c.held && c.adId === E.id && c.teamId === t.id && !c.assignedTo).length : 0,
      count: ps.length, total: mode === "pct" ? pctShow(sum) + "%" : String(sum),
      adjust: () => patch({ bpSheet: t.id, bpSnap: B0 }),
      sum: mode === "pct" ? (is100(sum) ? "Adds up to 100%" : "Adds up to " + pctShow(sum) + "%. Make it 100%.") : mode === "cnt" ? (sum ? "Up to " + sum + " leads in this team" : "Set a maximum for at least one person") : "",
      sumFg: ok ? "var(--crm-brown)" : "var(--crm-oxblood)",
    };
  }
  if (B && E && asv?.ae) {
    // The Revenue Director's row too (mig 20261016010000): Save counted the teams alone, so a split giving the director any
    // share never reached 100 and Save stayed grey (the owner, 2026-10-18).
    const T = asv.adTeams ?? teams;
    const split = E.split;
    bp.inner = T.filter(t => (split[t.id] || 0) > 0).map(t => innerOf(t, B, split));
    const tot = T.reduce((x, t) => x + (split[t.id] || 0), 0), ok = is100(tot) && bp.inner.every(x => x.ok);
    const sg = ui.bpSheet ? bp.inner.find(x => x.id === ui.bpSheet) : undefined;
    if (sg) bp.sheet = { ...sg, sub: `${sg.pct} of ${E.label} · ${sg.count} ${sg.count === 1 ? "person" : "people"}`,
      cancel: () => patch({ bp: ui.bpSnap, bpSheet: null, bpSnap: null }), apply: sg.ok ? () => patch({ bpSheet: null, bpSnap: null, bp: ui.bp ? { ...ui.bp, ty: null } : ui.bp }) : undefined };
    const tm: Record<string, Mode> = {}, pv: Record<string, number> = {};
    T.forEach(t => {
      const m: Mode = B.tm[t.id] ?? "pct"; tm[t.id] = m; if (m === "even") return;
      // What is saved is what the editor shows (a stale % is saved as its even share).
      const shown = bp.inner.find(x => x.name === t.name);
      const es = evenShare(t.people.length || 1); t.people.forEach((p, k) => { pv[p.id] = shown ? Number(shown.people[k]?.v ?? 0) : B.pv[p.id] ?? (m === "pct" ? es(k) : 0); });
    });
    // A locked member keeps their saved value for when they are unlocked (the dealer skips them meanwhile).
    lk.forEach(id => { if (pv[id] == null && B.pv[id] != null) pv[id] = B.pv[id]; });
    if (ok) byTeamRule = { mode: "split", split, pm: "pct", pp: pv, tm };
    const why = !is100(tot) ? "The teams add up to " + pctShow(tot) + "% — make it 100%." : bp.inner.find(x => !x.ok)?.why ?? "";
    aeSave = { why, saveBg: ok ? "var(--crm-ink-soft)" : "var(--crm-faint-2)", save: ok ? () => {
      // Saving deals any lead waiting for this ad first, oldest first, inside the team it waits for (the database does it).
      void act.saveAdRule(E.id, E.label, { mode: "split", split, pm: "pct", pp: pv, tm }).then(ok => {
        if (ok) patch({ adEd: null, bp: null, toast: E.label + " saved" + (ok.dealt ? " · " + ok.dealt + " waiting lead" + (ok.dealt === 1 ? "" : "s") + " dealt" : "") });
      });
    } : undefined };
  }

  // Round 2 (rev 1011 §8): "Save and apply to all N ads" — this ad's whole setting (the split, every team's inside mode
  // and values) saved to EVERY ad, each keeping its own name and taken counts; one crm_save_ad_assign per ad, each dealing
  // its own waiting leads. Off while the draft is not valid (the Save rule). An ad left on the default is saved to none.
  const aeApply = { applyLabel: "", applyFg: "var(--crm-faint-2)", applyBd: "var(--crm-tint-cold)", applyCur: "default", applyAll: undefined as (() => void) | undefined };
  if (E && asv?.ae) {
    const mp = new Map<string, string>();
    data.customers.forEach(c => { if (c.adId) mp.set(c.adId, c.ad); });
    data.adRules.forEach(r => mp.set(r.adId, r.label));
    mp.set(E.id, E.label);
    const all = [...mp], okAll = isSp ? !!byTeamRule : !!asv.ae.save;
    const ruleFor = (): CrmRuleIn | null => isSp ? byTeamRule : E.mode === "unset" ? null : { mode: "even", split: { ...E.split }, pm: E.pm, pp: { ...E.pp } };
    Object.assign(aeApply, {
      applyLabel: "Save and apply to all " + all.length + " ads", applyFg: okAll ? "var(--crm-ink-soft)" : "var(--crm-faint-2)", applyBd: okAll ? "var(--crm-ink-soft)" : "var(--crm-tint-cold)", applyCur: okAll ? "pointer" : "default",
      applyAll: okAll ? () => void (async () => {
        const r = ruleFor();
        if (r) for (const [id, label] of all) if (!(await act.saveAdRule(id, label, r))) return;
        patch({ adEd: null, bp: null, toast: "Applied to all " + all.length + " ads · fine-tune any ad on its own" });
      })() : undefined,
    });
  }

  // The ad cards (compact): a legend per team, and "N waiting" when a full By max team holds leads of that ad.
  const adRows = (asv?.adRows ?? []).map(row => {
    const r = data.adRules.find(x => x.label === row.name), tm = r?.tm ?? {}, sp = r && (r.mode === "split" || r.mode === "people") ? r.split : null;
    const leg = sp ? (asv?.adTeams ?? teams).filter(t => (sp[t.id] || 0) > 0).map(t => ({ c: t.c, name: t.name.replace(/^Team /, ""), pct: sp[t.id] + "%", mode: tm[t.id] === "cnt" ? " · max" : tm[t.id] === "even" ? " · evenly" : "" })) : [];
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
          return { name: c.name, rule: k ? "1px solid var(--crm-rule-soft)" : "0", meta: (c.channel === "messenger" ? "Messenger" : "WhatsApp") + " · waiting " + (mins < 60 ? mins + " min" : Math.floor(mins / 60) + " h"),
            chat: () => patch({ lead: c.id, pick: "", toast: "" }), send: () => patch({ sendFor: c.id, sdSel: null }) };
        }) };
    }),
  };
  void nameOf; void ini;
  return { asx, ftx, bp, hl, adRows, aeSave, aeApply };
}
