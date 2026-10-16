/**
 * Assignment (design 1a): Organic Leads (customers no rule placed — send
 * each to someone), Ads to teams (Evenly · By team % · By people, max or %),
 * Awaiting reply by level, and Full time (on chosen weekdays the full-time
 * RS of a team take a daily maximum or a % first; the rest follows the ads).
 * The editors work on a draft; Save writes it (crm_save_ad_assign /
 * crm_save_fulltime) and the database deals the next enquiry by it.
 */
import type { ChangeEvent, FocusEvent } from "react";
import type { CrmAdRule } from "@/lib/member/crm-data";
import type { AdDraft, FtDraft } from "../ui";
import { waitingByLevel } from "./overlays";
import { evenShare, first, ini, periodRange, inRange, type PanelCtx, type Team } from "./common";
import { DIRECTOR_C, DIRECTOR_SPLIT_KEY, DIRECTOR_TEAM } from "../../desk/vm/tokens";

const WK = ["M", "T", "W", "T", "F", "S", "S"], WKL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], ALL7 = [0, 1, 2, 3, 4, 5, 6];
const ROLE: Record<string, string> = { stl: "Senior TL", tl: "Team Lead", ta: "Team Assistant", rs: "Revenue Specialist", hod: "HOD" };
const digits = (e: ChangeEvent<HTMLInputElement>) => parseInt(e.target.value.replace(/\D/g, "")) || 0;
const selAll = (e: FocusEvent<HTMLInputElement>) => e.target.select();
const seg = (cur: string, k: string, label: string, pick: () => void) => ({ label, pick, bg: cur === k ? "#fff" : "transparent", fg: cur === k ? "#3F2B22" : "#806B60", w: cur === k ? 650 : 500, sh: cur === k ? "0 1px 3px rgba(63,43,34,.12)" : "none" });

/**
 * Auto-balance %: set one value and the others share what is left of 100 —
 * in proportion to what they had, or evenly. Values already set (locked) stay
 * put; only the untouched ones absorb the change (all of them, if none is left).
 */
export function balance(ids: string[], cur: Record<string, number>, id: string, n: number, locked: string[] = []): Record<string, number> {
  let others = ids.filter(x => x !== id && !locked.includes(x));
  if (!others.length) others = ids.filter(x => x !== id);
  const fixed = ids.filter(x => x !== id && !others.includes(x)).reduce((s, k) => s + (cur[k] || 0), 0);
  n = Math.max(0, Math.min(100 - fixed, n));
  const rest = 100 - fixed - n, S = others.reduce((s, k) => s + (cur[k] || 0), 0), o = { ...cur, [id]: n };
  if (!others.length) return o;
  const raw = others.map(k => (S > 0 ? ((cur[k] || 0) / S) * rest : rest / others.length)), fl = raw.map(Math.floor);
  let left = rest - fl.reduce((x, y) => x + y, 0);
  raw.map((r, k) => [r - fl[k], k] as const).sort((a, b) => b[0] - a[0]).forEach(([, k]) => { if (left > 0) { fl[k]++; left--; } });
  others.forEach((k, j) => { o[k] = fl[j]; });
  return o;
}
const nextLock = (lock: string[] | undefined, id: string) => [...(lock ?? []).filter(x => x !== id), id];

/** People with a % slider or a max stepper — "By people". */
function mkPeople(teams: Team[], m: "cnt" | "pct", pp: Record<string, number>, target: number, setP0: (id: string | null, n: number | Record<string, number>, lock?: string[]) => void, lock: string[] = [], auto = true) {
  const sum = Object.values(pp).reduce((x, y) => x + y, 0), allIds = teams.flatMap(t => t.people.map(p => p.id));
  const setP = (id: string, n: number) => (m === "pct" && auto ? setP0(null, balance(allIds, pp, id, n, lock), nextLock(lock, id)) : setP0(id, m === "pct" ? Math.min(100, n) : n));
  const ok = m === "cnt" ? sum > 0 : sum === target;
  return {
    groups: teams.map(t => ({ team: t.name, c: t.c, people: t.people.map(p => {
      const n = pp[p.id] || 0;
      return { name: p.name, role: ROLE[p.role] ?? p.role, v: n, vTxt: m === "pct" ? `${n}%` : String(n), nameFg: n > 0 ? "#3F2B22" : "#806B60",
        set: (e: ChangeEvent<HTMLInputElement>) => setP(p.id, +e.target.value), setN: (e: ChangeEvent<HTMLInputElement>) => setP(p.id, Math.min(m === "pct" ? 100 : 999, digits(e))), selAll,
        minus: () => setP(p.id, n - 1), plus: () => setP(p.id, n + 1), minusFg: n > 0 ? "#3F2B22" : "#D9C7BA" };
    }) })),
    ok, note: m === "pct" ? (sum === 100 ? "Adds up to 100%." : `Adds up to ${sum}%. Make it 100%.`) : sum > 0 ? "" : "Set a maximum for at least one person.",
    noteFg: ok ? "#387557" : "#A3371A",
    line: teams.flatMap(t => t.people).filter(p => (pp[p.id] || 0) > 0).map(p => `${first(p.name)} ${m === "pct" ? pp[p.id] + "%" : pp[p.id]}`).join(", "),
  };
}

/** One ad, as the Assignment card and its editor draw it. */
function mkRow(teams: Team[], a: AdDraft, set: (p: Partial<AdDraft>) => void) {
  // rev 1011 §6.6: Evenly · By team only — By people is merged into By team, and an old By people rule opens as By team.
  const cur = (a.mode === "split" || a.mode === "people" ? "split" : "even") as "split" | "even" | "people";
  const total = teams.reduce((x, t) => x + (a.split[t.id] || 0), 0), pm = a.pm, pp = a.pp;
  const P = mkPeople(teams, pm, pp, pm === "pct" ? 100 : a.leads, (id, n, lk) => set({ mode: "people", pp: id === null ? (n as Record<string, number>) : { ...pp, [id]: Math.max(0, n as number) }, ...(lk ? { lockP: lk } : {}) }), a.lockP, false);
  const segs = cur === "split" ? teams.map(t => ({ w: a.split[t.id] || 0, c: t.c, op: 1 }))
    : cur === "people" ? teams.flatMap(t => t.people.filter(p => (pp[p.id] || 0) > 0).map((p, k) => ({ w: pp[p.id], c: t.c, op: 1 - (k % 3) * 0.22 })))
      : a.mode === "even" ? teams.map(t => ({ w: t.people.length, c: t.c, op: 1 })) : [];
  const tw = segs.reduce((x, g) => x + g.w, 0) || 1;
  return {
    name: a.label, page: a.page, leads: a.leads, isSplit: cur === "split", isPeople: cur === "people", isEven: cur === "even",
    tag: cur === "split" ? "By team" : cur === "people" ? (pm === "pct" ? "By people · %" : "By people · max") : a.mode === "even" ? "Evenly" : "Evenly · default",
    // §6.3: an ad with no setting is dealt evenly to every team — "Evenly · default", muted.
    tagBg: a.mode === "unset" ? "#F5EBE3" : "#E6F0EA", tagFg: a.mode === "unset" ? "#806B60" : "#387557",
    modes: [seg(cur, "even", "Evenly", () => set({ mode: "even" })), seg(cur, "split", "By team", () => set({ mode: "split" }))],
    evenN: teams.reduce((x, t) => x + t.people.length, 0),
    evenTeams: teams.map(t => ({ team: t.name, c: t.c, names: t.people.map(p => first(p.name)).join(", "), av: t.people.map((p, k) => ({ ini: ini(p.name), ml: k ? "-8px" : "0" })) })),
    splits: teams.map(t => {
      const v = a.split[t.id] || 0, isL = a.lockT.includes(t.id);
      const put = (n: number) => set({ mode: "split", split: { ...a.split, ...balance(teams.map(x => x.id), a.split, t.id, n, a.lockT) }, lockT: nextLock(a.lockT, t.id) });
      return { team: t.name, c: t.c, v, w: `${v}%`, ppl: `${t.people.length} people`, lockTxt: isL ? "Set" : "Auto", lockBg: isL ? "#3F2B22" : "#EEF3F9", lockFg: isL ? "#fff" : "#806B60",
        set: (e: ChangeEvent<HTMLInputElement>) => put(+e.target.value), setN: (e: ChangeEvent<HTMLInputElement>) => put(digits(e)), selAll,
        minus: () => put(v - 5), plus: () => put(v + 5), minusFg: v > 0 ? "#3F2B22" : "#D9C7BA", plusFg: v < 100 ? "#3F2B22" : "#D9C7BA" };
    }),
    sumOk: total === 100, sumTot: `${total}%`,
    splitReset: () => set({ mode: "split", split: Object.fromEntries(teams.map((t, k) => [t.id, Math.floor(100 / teams.length) + (k < 100 % teams.length ? 1 : 0)])), lockT: [] }),
    sumNote: total === 100 ? "Adds up to 100%" : `Adds up to ${total}% · make it 100%`, sumFg: total === 100 ? "#387557" : "#A3371A", sumBg: total === 100 ? "#E4F1E8" : "#FBE4DE",
    pModes: ([["cnt", "Max per person"], ["pct", "By %"]] as const).map(([k, label]) => ({ label, bg: pm === k ? "#2F6FB5" : "#fff", fg: pm === k ? "#fff" : "#3F2B22", bd: pm === k ? "#2F6FB5" : "#DCE6F2", pick: () => set({ mode: "people", pm: k, pp: {}, lockP: [] }) })),
    pIsPct: pm === "pct", pIsCnt: pm === "cnt", pGroups: P.groups, pSumNote: P.note, pSumFg: P.noteFg,
    resNone: !segs.length,
    resLine: cur === "split" ? teams.filter(t => (a.split[t.id] || 0) > 0).map(t => `${t.name} ${a.split[t.id]}%`).join(" · ") : cur === "people" ? P.line : a.mode === "even" ? "Evenly to everyone" : "",
    bar: segs.map(g => ({ c: g.c, w: `${(g.w / tw) * 100}%`, op: g.op })),
    ok: cur === "split" ? total === 100 : cur === "people" ? P.ok : true,
  };
}

/** Ago, as Organic Leads say it: "12 min ago", "3 h ago", "Tue". */
function ago(iso: string, now: Date) {
  const m = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function assignVM(ctx: PanelCtx) {
  const { ui, set, patch, data, now, teams, act } = ctx;
  const month = periodRange("month", null, now);
  // An ad's split has one more row, the Revenue Director, its people the directors — as the desktop's (the owner, 2026-10-16:
  // "新增了 revenue director 也加入可以获得广告名单"; mig 20261016010000, crm_director_key() = DIRECTOR_SPLIT_KEY).
  const directors = data.people.filter(p => p.role === "hod").sort((a, b) => a.name.localeCompare(b.name));
  const adTeams: Team[] = [...teams, ...(directors.length ? [{ id: DIRECTOR_SPLIT_KEY, tl: directors[0], name: DIRECTOR_TEAM, who: directors.map(d => d.name).join(", "), c: DIRECTOR_C[0], tint: DIRECTOR_C[1], own: DIRECTOR_C[1], people: directors }] : [])];

  // Organic Leads: no rule placed them, so somebody has to.
  // Organic Leads: no team and not held Over the limit (a held lead keeps its team).
  const organic = data.customers.filter(c => !c.assignedTo && !c.teamId && !c.held)
    .map(c => ({ c, at: [...c.messages].reverse().find(m => m.from === "lead")?.at ?? c.createdAt })).sort((a, b) => b.at.localeCompare(a.at));
  const waitList = organic.map(({ c, at }, k) => ({ name: c.name, ad: `${c.ad} · ${c.channel === "messenger" ? "Messenger" : "WhatsApp"}`, when: ago(at, now), rule: k ? "1px solid #F3E9E1" : "0", openSend: () => patch({ sendFor: c.id, sdSel: null }),
    // Tapping the name reads the chat first (and may answer it) before choosing who gets it.
    open: () => patch({ lead: c.id, pick: "", toast: "" }) }));

  // The ads: every ad that brought someone, and every ad with a rule.
  const ruleOf = (id: string) => data.adRules.find(r => r.adId === id);
  const adIds = [...new Set([...data.customers.filter(c => c.adId).map(c => c.adId!), ...data.adRules.map(r => r.adId)])];
  const draftOf = (id: string): AdDraft => {
    const r: CrmAdRule | undefined = ruleOf(id), cs = data.customers.filter(c => c.adId === id);
    const latest = [...cs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const even = Object.fromEntries(adTeams.map((t, k) => [t.id, Math.floor(100 / (adTeams.length || 1)) + (k < 100 % (adTeams.length || 1) ? 1 : 0)]));
    return { id, label: data.adNames?.[id]?.name || r?.label || latest?.ad || id, page: latest?.channel === "messenger" ? "Messenger" : "WhatsApp", leads: cs.filter(c => inRange(c.createdAt, month)).length,
      mode: r?.mode ?? "unset", split: r && Object.keys(r.split).length ? { ...r.split } : even, pm: r?.pm ?? "cnt", pp: { ...(r?.pp ?? {}) }, lockT: [], lockP: [] };
  };
  const ads = adIds.map(draftOf).sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label));
  // By team from the card (rev 1011 §6.6): each team keeps its inside mode; a team never set is By % with an even split.
  const saveAd = (d: AdDraft) => {
    if (d.mode !== "split" && d.mode !== "people") return act.saveAdRule(d.id, d.label, { mode: d.mode === "unset" ? null : d.mode, split: d.split, pm: d.pm, pp: d.pp });
    const tm = { ...(ruleOf(d.id)?.tm ?? {}) }, pp = { ...d.pp };
    adTeams.forEach(t => {
      if (!((d.split[t.id] ?? 0) > 0)) return;
      const m = (tm[t.id] ??= "pct");
      if (m === "pct" && t.people.reduce((s, p) => s + (pp[p.id] ?? 0), 0) !== 100) { const es = evenShare(t.people.length || 1); t.people.forEach((p, k) => { pp[p.id] = es(k); }); }
    });
    return act.saveAdRule(d.id, d.label, { mode: "split", split: d.split, pm: "pct", pp, tm });
  };
  const adRows = ads.map(a => ({
    ...mkRow(adTeams, a, p => void saveAd({ ...a, ...p })),
    edit: () => patch({ adEd: { ...a, split: { ...a.split }, pp: { ...a.pp } } }),
  }));
  const E = ui.adEd;
  const aeRow = E ? mkRow(adTeams, E, p => set(u => (u.adEd ? { ...u, adEd: { ...u.adEd, ...p } } : u))) : null;
  // The ad's name, typed in the editor's title (the owner, 2026-10-16: the chat showed Meta's "Chat with us", not which ad):
  // saved when it loses focus or on Enter (crm_name_ad); empty gives Meta's headline back. CRM · Manage only.
  const headlineOf = (id: string) => data.customers.find(c => c.adId === id && c.adHeadline)?.adHeadline || `Ad ${id}`;
  const savedName = (id: string) => data.adNames?.[id]?.name ?? "";
  const naming = E ? {
    canName: !!data.can.manage, nameDraft: ui.adNameDraft ?? savedName(E.id), headline: headlineOf(E.id),
    onName: (e: { target: { value: string } }) => patch({ adNameDraft: e.target.value }),
    saveName: () => {
      const d = ui.adNameDraft;
      if (d == null || d.trim() === savedName(E.id)) { patch({ adNameDraft: null }); return; }
      void act.nameAd(E.id, d).then(ok => { patch({ adNameDraft: null }); if (ok) set(u => (u.adEd && u.adEd.id === E.id ? { ...u, adEd: { ...u.adEd, label: d.trim() || headlineOf(E.id) } } : u)); });
    },
    nameKey: (e: { key: string; currentTarget: { blur(): void } }) => { if (e.key === "Enter") e.currentTarget.blur(); },
  } : { canName: false, nameDraft: "", headline: "", onName: () => {}, saveName: () => {}, nameKey: () => {} };
  const ae = aeRow && E
    ? { ...aeRow, ...naming, close: () => patch({ adEd: null, adNameDraft: null }), saveBg: aeRow.ok ? "#2F6FB5" : "#C9D6E6", save: aeRow.ok ? () => void saveAd(E).then(ok => { if (ok) patch({ adEd: null }); }) : undefined }
    : { ...mkRow(adTeams, draftOf(""), () => {}), ...naming, close: () => {}, saveBg: "#C9D6E6", save: undefined as (() => void) | undefined };

  // Awaiting reply, on Assignment: counts per level, then every waiting customer.
  const by = waitingByLevel(ctx);
  const asgAttSum = by.map(g => { const on = ui.asgF === g.k; return { name: g.name, n: g.items.length, c: on ? "#fff" : g.c, bg: on ? g.c : "#fff", bd: on ? g.c : "#EEDCE6", pick: () => set(u => ({ ...u, asgF: u.asgF === g.k ? null : g.k })) }; });
  const asgAtt = by.filter(g => !ui.asgF || g.k === ui.asgF).flatMap(g => g.items.map(i => ({ ...i, c: g.c, lv: g.name })))
    .map((i, k) => ({ ...i, rule: k ? "1px solid #EEDCE6" : "0", open: () => patch({ lead: i.id, pick: "", toast: "" }) }));

  // Full time: per team, on chosen weekdays.
  const rsOf = (t: Team) => t.people.filter(p => p.role === "rs" && p.fullTime);
  const zeros = (t: Team) => Object.fromEntries(rsOf(t).map(p => [p.id, Object.fromEntries(ALL7.map(d => [d, 0]))])) as Record<string, Record<number, number>>;
  const cfgOf = (t: Team) => {
    const r = data.ftRules.find(x => x.tlId === t.id);
    if (!r) return { m: "cnt" as const, on: [4, 5, 6], v: zeros(t) };
    const v = zeros(t);
    for (const [id, days] of Object.entries(r.vals)) { v[id] = { ...(v[id] ?? {}) }; for (const [d, n] of Object.entries(days)) v[id][Number(d)] = Number(n) || 0; }
    // The old Max / By % editor reads a "turns" rule as Max (rev 1011 replaced it with assign-1011.ts › ftx).
    return { m: r.mode === "turns" ? "cnt" as const : r.mode, on: [...r.days].sort(), v };
  };
  const dLbl = (ds: number[]) => (!ds.length ? "Off" : ds.length === 7 ? "Every day" : ds.join("") === "01234" ? "Mon – Fri" : ds.join("") === "56" ? "Sat, Sun" : ds.join("") === "456" ? "Fri – Sun" : ds.map(d => WKL[d]).join(", "));
  const ftSum = teams.map(t => {
    const c = cfgOf(t), on = c.on;
    return { name: t.name, mode: on.length ? `${dLbl(on)} · ${c.m === "pct" ? "By %" : "Max"}` : "Off · follows Ads to teams",
      open: () => patch({ ftEd: { tid: t.id, m: c.m, on: [...on], v: JSON.parse(JSON.stringify(c.v)), sel: null, lockD: {} } }),
      rs: rsOf(t).map(p => ({ name: p.name, label: "", tagBg: "transparent", tagFg: "transparent",
        days: ALL7.map(d => { const x = c.v[p.id]?.[d] || 0, o = on.includes(d); return { t: WK[d], bg: o && x > 0 ? "#387557" : o ? "#CFE3D6" : "#EEF3EF", fg: o && x > 0 ? "#fff" : o ? "#2E6B4C" : "#B5C4BA" }; }) })) };
  });
  const fe = feVM(ctx, ui.ftEd, rsOf, dLbl);

  return {
    onAssign: ui.tab === "assign" && !ui.lead,
    hasWaiting: organic.length > 0, waitingN: organic.length, waitList,
    adRows, adEdOpen: !!E, ae,
    asgAttSum, asgAtt, openAtt: () => patch({ att: true }),
    ftSum, ftOpen: !!ui.ftEd, fe,
    // The Team Leader's own page (design 1a's TL view) is the salesperson CRM's; never shown here.
    isTL: false, notTL: true,
    tlAds: [] as { name: string; page: string; leads: number; state: string; line: string; hasLine: boolean; can: boolean; stFg: string; stBg: string; edit?: () => void }[],
  };
}
export type AssignVM = ReturnType<typeof assignVM>;

/** The Full time editor: weekdays, Max or %, and a value per full-time RS per day. */
function feVM(ctx: PanelCtx, E: FtDraft | null, rsOf: (t: Team) => Team["people"], dLbl: (ds: number[]) => string) {
  const { set, patch, teams, act } = ctx;
  const t = E ? teams.find(x => x.id === E.tid) : undefined;
  if (!E || !t) return { name: "", dayChips: [], onLbl: "", modes: [], heads: WK, isPct: false, isCnt: true, hasPeople: false, noPeople: true, people: [], totals: [], totLbl: "", restNote: "",
    hasSel: false, noSel: true, selTitle: "", selRest: "", selV: 0, selTxt: "", set: (_e: ChangeEvent<HTMLInputElement>) => {}, setN: (_e: ChangeEvent<HTMLInputElement>) => {}, selAllInput: selAll,
    minus: () => {}, plus: () => {}, done: () => {}, giveAll: () => {}, giveLbl: "", close: () => {}, saveBg: "#387557", save: () => {} };
  const m = E.m, on = E.on, sel = E.sel, rs = rsOf(t), rsIds = rs.map(p => p.id);
  const setE = (p: Partial<FtDraft>) => set(u => (u.ftEd ? { ...u, ftEd: { ...u.ftEd, ...p } } : u));
  const val = (F: FtDraft, id: string, d: number) => F.v[id]?.[d] || 0;
  const multi = rsIds.length >= 2;
  // % with 2+ full time: a day may not pass 100 — the others shrink, untouched ones first. Less than 100 is fine (the rest follows the ads).
  const applyDays = (F: FtDraft, id: string, ds: number[], n: number) => {
    const v: FtDraft["v"] = {}, L = { ...F.lockD };
    rsIds.forEach(k => { v[k] = { ...(F.v[k] ?? {}) }; });
    ds.filter(d => F.on.includes(d)).forEach(d => {
      if (F.m === "pct" && multi) {
        n = Math.max(0, Math.min(100, n)); v[id][d] = n;
        let over = rsIds.reduce((x, k) => x + (v[k][d] || 0), 0) - 100;
        const lk = L[d] ?? [], pools = [rsIds.filter(k => k !== id && !lk.includes(k)), rsIds.filter(k => k !== id && lk.includes(k))];
        pools.forEach(pool => { while (over > 0) { const live = pool.filter(k => (v[k][d] || 0) > 0); if (!live.length) break; const big = live.sort((a, b) => v[b][d] - v[a][d])[0], cut = Math.min(over, v[big][d]); v[big][d] -= cut; over -= cut; } });
        L[d] = nextLock(L[d], id);
      } else {
        const others = rsIds.filter(k => k !== id).reduce((x, k) => x + (v[k][d] || 0), 0);
        v[id][d] = Math.max(0, Math.min(F.m === "pct" ? 100 - others : 999, n));
      }
    });
    return { v, lockD: L };
  };
  const setVals = (n: number) => { if (sel) set(u => (u.ftEd ? { ...u, ftEd: { ...u.ftEd, ...applyDays(u.ftEd, sel.id, sel.days, n) } } : u)); };
  const giveAll = () => {
    if (!sel) return;
    const v: FtDraft["v"] = {}, L = { ...E.lockD };
    rsIds.forEach(k => { v[k] = { ...(E.v[k] ?? {}) }; });
    sel.days.filter(d => on.includes(d)).forEach(d => { L[d] = [sel.id]; rsIds.forEach(k => { v[k][d] = m === "pct" ? (k === sel.id ? 100 : 0) : k === sel.id ? 999 : v[k][d] || 0; }); });
    setE({ v, lockD: L });
  };
  const sums = ALL7.map(d => rsIds.reduce((x, k) => x + val(E, k, d), 0));
  const selDays = sel ? sel.days.filter(d => on.includes(d)) : [], selV = selDays.length && sel ? val(E, sel.id, selDays[0]) : 0;
  const selName = sel ? rs.find(p => p.id === sel.id)?.name ?? "" : "";
  const blank = () => Object.fromEntries(rsIds.map(id => [id, Object.fromEntries(ALL7.map(d => [d, 0]))])) as FtDraft["v"];
  return {
    name: t.name,
    dayChips: ALL7.map(d => {
      const o = on.includes(d);
      return { t: WKL[d], bg: o ? "#387557" : "#fff", fg: o ? "#fff" : "#806B60", bd: o ? "#387557" : "#D6E6DC",
        pick: () => { const nOn = o ? on.filter(x => x !== d) : [...on, d].sort(), v: FtDraft["v"] = {}; rsIds.forEach(k => { v[k] = { ...(E.v[k] ?? {}), ...(o ? { [d]: 0 } : {}) }; }); setE({ on: nOn, v, sel: null, lockD: { ...E.lockD, [d]: [] } }); } };
    }),
    onLbl: on.length ? dLbl(on) : "No days chosen · all days follow Ads to teams",
    modes: ([["cnt", "Max per person"], ["pct", "By %"]] as const).map(([k, label]) => ({ label, bg: m === k ? "#387557" : "#fff", fg: m === k ? "#fff" : "#3F2B22", bd: m === k ? "#387557" : "#D6E6DC", pick: () => setE({ m: k, v: blank(), sel: null, lockD: {} }) })),
    heads: WK, isPct: m === "pct", isCnt: m === "cnt", hasPeople: rsIds.length > 0, noPeople: !rsIds.length,
    people: rs.map(p => {
      const mine = sel && sel.id === p.id ? sel.days : [];
      return { name: p.name, isSel: !!mine.length, bd: mine.length ? "#387557" : "#D6E6DC",
        allDays: () => setE({ sel: on.length ? { id: p.id, days: [...on] } : null }), allLbl: on.length ? "All on days" : "",
        cells: ALL7.map(d => {
          const o = on.includes(d), x = val(E, p.id, d), sOn = mine.includes(d);
          return { off: !o, txt: "", num: !o ? "—" : m === "cnt" && x >= 999 ? "∞" : String(x), pctMark: o && m === "pct" ? "%" : "", pctW: o && m === "pct" ? "8px" : "0px",
            bg: !o ? "#F2F1EF" : sOn ? "#387557" : x > 0 ? "#E4F1E8" : "#fff", fg: !o ? "#C9BFB7" : sOn ? "#fff" : x > 0 ? "#2E6B4C" : "#806B60", bd: !o ? "#ECE8E4" : sOn ? "#387557" : x > 0 ? "#CFE3D6" : "#D6E6DC",
            focus: (e: FocusEvent<HTMLInputElement>) => { if (!o) { e.target.blur(); return; } e.target.select(); setE({ sel: { id: p.id, days: [d] } }); },
            type: (e: ChangeEvent<HTMLInputElement>) => { if (!o) return; const n = digits(e); set(u => (u.ftEd ? { ...u, ftEd: { ...u.ftEd, ...applyDays(u.ftEd, p.id, [d], n) } } : u)); } };
        }) };
    }),
    totals: ALL7.map(d => { const o = on.includes(d), x = sums[d]; return { t: !o ? "—" : m === "pct" ? `${x}%` : x >= 999 ? "∞" : String(x), fg: !o ? "#C9BFB7" : "#387557" }; }),
    totLbl: m === "pct" ? "Full time share" : "Daily max",
    restNote: m === "pct" ? "Whatever full time doesn't take that day follows Ads to teams." : "After full time reach their max, the rest follows Ads to teams.",
    hasSel: !!selDays.length, noSel: !selDays.length, selTitle: sel ? `${selName} · ${dLbl(selDays)}` : "",
    selRest: selDays.length && m === "pct" ? (sums[selDays[0]] >= 100 ? `Full time takes 100% of ${WKL[selDays[0]]}` : sums[selDays[0]] === 0 ? "Full time 0% · 100% follows Ads to teams" : `Full time ${sums[selDays[0]]}% · ${100 - sums[selDays[0]]}% follows Ads to teams`) : "",
    selV, selTxt: m === "pct" ? `${selV}%` : selV >= 999 ? "∞" : String(selV),
    set: (e: ChangeEvent<HTMLInputElement>) => setVals(+e.target.value), setN: (e: ChangeEvent<HTMLInputElement>) => setVals(digits(e)), selAllInput: selAll,
    minus: () => setVals(selV - 1), plus: () => setVals(selV + 1), done: () => setE({ sel: null }),
    giveAll, giveLbl: m === "pct" ? `Give all leads to ${first(selName)}` : `No limit for ${first(selName)}`,
    close: () => patch({ ftEd: null }), saveBg: "#387557",
    save: () => {
      const vals = Object.fromEntries(Object.entries(E.v).map(([id, ds]) => [id, Object.fromEntries(Object.entries(ds).map(([d, n]) => [String(d), n]))]));
      void act.saveFtRule(E.tid, E.m, E.on, vals).then(ok => { if (ok) patch({ ftEd: null }); });
    },
  };
}
