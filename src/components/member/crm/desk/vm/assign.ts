/**
 * Assignment (CRM Desktop rev 1, D1–D6), CRM · Manage only: Organic Leads (Send to), Ads to teams (cards by delivery
 * status, the split editor — Evenly / By team, inside each team Evenly / By % / By max — saved through the phone's own
 * crm_save_ad_assign, "Save and apply to all N ads"), Awaiting reply (Remind, Assign, the chat), Full time lead
 * allocation (days per person, taking turns — crm_save_fulltime 'turns') and Chat progress. Ported from the prototype;
 * the dealer is the database's (crm_assign_contact), unchanged.
 */
import type { CrmAdRule } from "@/lib/member/crm-data";
import { urgencyOf } from "../../sales/vm/common";
import type { DeskCtx } from "./ctx";
import { first, initials, shortName, teamNameOf } from "./data";
import { sendTo } from "./inbox";
import { DAY_NAMES, DAYS, DIRECTOR_C, DIRECTOR_SPLIT_KEY, DIRECTOR_TEAM, ST_META, teamColours } from "./tokens";

const ago = (iso: string, now: Date) => { const m = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
const chName = (ch: string) => (ch === "whatsapp" ? "WhatsApp" : "Messenger");
type InMode = "evenly" | "pct" | "max";
const toDb = (m: InMode): "even" | "pct" | "cnt" => (m === "evenly" ? "even" : m === "max" ? "cnt" : "pct");
const fromDb = (m: "even" | "pct" | "cnt" | undefined): InMode => (m === "even" ? "evenly" : m === "cnt" ? "max" : "pct");

export function assignPageVM(ctx: DeskCtx, opItem: string) {
  const { ui, set, patch, data, now, teams } = ctx;
  const sheetOpen = ui.stage !== "menu";
  const T = teams.map((t, k) => ({ id: t.id, name: t.name, color: teamColours(k)[0], tint: teamColours(k)[1], people: t.people }));
  // An ad's split has one more row, the Revenue Director, its people the directors (the owner, 2026-10-16; mig 20261016010000).
  const TA = [...T, ...(ctx.directors.length ? [{ id: DIRECTOR_SPLIT_KEY, name: DIRECTOR_TEAM, color: DIRECTOR_C[0], tint: DIRECTOR_C[1], people: ctx.directors }] : [])];

  // ── Organic Leads and Awaiting reply: the rows, Send to / Assign, Remind (D1 / D4).
  const organic = data.customers.filter(c => !c.assignedTo && !c.teamId && !c.held).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const waits = data.customers.filter(c => urgencyOf(c, now).level !== "none").sort((a, b) => urgencyOf(b, now).waitingMinutes - urgencyOf(a, now).waitingMinutes);
  const reminded = new Set(data.events.filter(e => (e.kind as string) === "reminded" && now.getTime() - new Date(e.at).getTime() < DAY_MS).map(e => e.customerId));
  const opRows = opItem === "Organic Leads" ? organic.map(c => ({
    t: c.name, s: `${c.ad} · ${chName(c.channel)} · ${ago(c.createdAt, now)}`, right: null as string | null, btn: "Send to" as string | null, rc: "#3F2B22",
    btn2: null as string | null, act2: (e: { stopPropagation(): void }) => e.stopPropagation(), btnBg: ui.sendFor === c.id ? "#FFF1E6" : "#fff",
    act: (e: { stopPropagation(): void }) => { e.stopPropagation(); patch({ sendFor: c.id, stage: "op" }); }, note: null as string | null, noteColor: "#A46312", go: false,
    bg: "#fff", cur: "default", open: () => {},
  })) : opItem === "Awaiting reply" ? waits.map(c => { const u = urgencyOf(c, now), was = reminded.has(c.id);
    return { t: c.name, s: `${c.ad} · ${c.assignedTo ? ctx.nameOf(c.assignedTo) : "No one yet"}`, right: u.label as string | null, btn: "Assign" as string | null,
      rc: u.level === "overdue" ? "#A3371A" : u.level === "urgent" ? "#A46312" : "#806B60",
      btn2: (was ? "Reminded" : "Remind") as string | null,
      act2: (e: { stopPropagation(): void }) => { e.stopPropagation(); if (!was) void remind(ctx, c.id); },
      btnBg: ui.sendFor === c.id ? "#FFF1E6" : "#fff",
      act: (e: { stopPropagation(): void }) => { e.stopPropagation(); patch({ sendFor: c.id, stage: "op" }); }, note: null as string | null, noteColor: "#A46312", go: false,
      bg: "#fff", cur: "pointer", open: () => patch({ awChat: c.id, sendFor: null, stage: "op" }) }; }) : [];

  // Send to: people by team, in team colours (D1 / C3).
  const sf = ui.sendFor ? data.customers.find(c => c.id === ui.sendFor) : undefined;
  const sendGroups = [
    ...(ctx.directors.length ? [{ label: DIRECTOR_TEAM.toUpperCase(), color: DIRECTOR_C[0], tint: DIRECTOR_C[1], people: ctx.directors }] : []),
    ...T.map(t => ({ label: t.name.toUpperCase(), color: t.color, tint: t.tint, people: t.people })),
  ].map(g => ({ label: g.label, color: g.color, people: g.people.map((p, i) => ({ name: p.name, ini: initials(p.name), sub: g.label.charAt(0) + g.label.slice(1).toLowerCase(),
    bg: i === 0 ? g.color : g.tint, fg: i === 0 ? "#fff" : g.color,
    pick: () => { if (sf) void sendTo(ctx, sf.id, p.id, opItem === "Awaiting reply" ? "Moved" : "Sent").then(ok => { if (ok) patch({ sendFor: null, awChat: null }); }); } })) }));

  // The Awaiting reply chat (D4): the same chat as Inbox, with Assign to / Customer info / Send reminder.
  const awC = ui.awChat ? data.customers.find(c => c.id === ui.awChat) : undefined;
  const awOpen = sheetOpen && (opItem === "Awaiting reply" || opItem === "Chat progress") && !!awC && !ui.sendFor;
  const lastMsg = awC ? [...awC.messages].reverse().find(m => !m.auto) : undefined;
  const remindEv = awC ? data.events.filter(e => (e.kind as string) === "reminded" && e.customerId === awC.id).sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;
  const aw = awC ? {
    name: awC.name, ini: initials(awC.name), ad: awC.ad, owner: `${awC.assignedTo ? ctx.nameOf(awC.assignedTo) : "No one yet"}'s customer`,
    status: urgencyOf(awC, now).label, msg: lastMsg?.text ?? "", out: lastMsg?.from === "me", inn: lastMsg?.from !== "me",
    time: "Today", clock: lastMsg ? new Date(lastMsg.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }) : "",
    reply: `Reply to ${first(awC.name)}…`,
    remindLog: remindEv ? `${remindEv.actor ? ctx.nameOf(remindEv.actor) : "Principal"} sent ${awC.assignedTo ? ctx.nameOf(awC.assignedTo) : "the salesperson"} a reminder to reply · ${new Date(remindEv.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}` : "",
    reminded: !!remindEv, notReminded: !remindEv,
  } : { name: "", ini: "", ad: "", owner: "", status: "", msg: "", out: false, inn: false, time: "", clock: "", reply: "", remindLog: "", reminded: false, notReminded: true };

  // ── Ads to teams (D2 / D3).
  const adIds = [...new Set(data.customers.map(c => c.adId).filter((x): x is string => !!x))];
  const adOf = (id: string) => { const cs = data.customers.filter(c => c.adId === id); return { id, label: cs[0]?.ad ?? `Ad ${id}`, leads: cs.length, wa: cs.some(c => c.channel === "whatsapp") }; };
  const ads = adIds.map(adOf).sort((a, b) => b.leads - a.leads);
  const statusOf = (_id: string): string | null => null; // Meta's delivery status (waits for the Meta connection, PROPOSALS.md C).
  const adSt = ui.adSt;
  const shownAds = ads.filter(a => adSt === "all" || statusOf(a.id) === adSt);
  const ruleOf = (id: string): CrmAdRule | undefined => data.adRules.find(r => r.adId === id);
  const segsOf = (r: CrmAdRule | undefined) => r && (r.mode === "split" || r.mode === "people") ? TA.filter(t => (r.split[t.id] ?? 0) > 0).map(t => {
    const m = fromDb(r.tm?.[t.id]), mem = t.people, val = (pid: string) => r.pp[pid] ?? 0;
    const detail = m === "pct" ? mem.map(p => `${shortName(p.name, mem.map(x => x.name))} ${val(p.id)}%`).join(" · ") : m === "max" ? mem.map(p => `${shortName(p.name, mem.map(x => x.name))} ${val(p.id)}`).join(" · ") : "";
    return { color: t.color, pct: r.split[t.id], label: `${t.name.replace(/^Team /, "")} ${r.split[t.id]}%${m === "max" ? ` · max ${mem.reduce((s, p) => s + val(p.id), 0)}` : m === "pct" ? " · by %" : " · evenly"}`, detail: detail || null };
  }) : [];
  // An ad with 3+ leads and not one visit booked is flagged (v2: "No appointments"; its cost per lead is Meta's, not known yet).
  const noAppt = (a: { id: string; leads: number }) => a.leads >= 3 && !data.visits.some(v => v.state !== "cancelled" && data.customers.some(c => c.id === v.customerId && c.adId === a.id));
  const adCards = shownAds.map(a => { const r = ruleOf(a.id), sel = ui.ad === a.id, st = statusOf(a.id), segs = segsOf(r);
    return { name: a.label, channel: a.wa ? "WhatsApp" : "Messenger", leads: String(a.leads), chBg: a.wa ? "#E8F3ED" : "#E4EDF8", chFg: a.wa ? "#387557" : "#2F6FB5",
      segs, set: !!r && r.mode !== null, unset: !r, status: st ?? "—", stColor: st ? ST_META[st][1] : "#C9B8AC", stTint: st ? ST_META[st][3] : "#F5EBE3",
      tag: null as string | null, noTag: true, tagBg: "#F5EBE3", tagFg: "#6B574C",
      mode: r ? (r.mode === "even" ? `Evenly · each team 1/${TA.length || 1}` : "By team") : "Not set · evenly by default", cta: r ? "Edit split" : "Set up",
      bd: sel ? "#BD4A19" : "#EBDDD2", ring: sel ? "0 0 0 3px #FFF0E4" : "none",
      // v2's list row: the split as a bar (faint while on the default), its note, the leads, a flag when something is off.
      rowBg: sel ? "#FFF5EC" : "#fff",
      segs2: (r && r.mode === "split" ? TA.filter(t => (r.split[t.id] ?? 0) > 0).map(t => ({ color: t.color, pct: r.split[t.id], op: 1, label: t.name.replace(/^Team /, ""), pctS: `${r.split[t.id]}%` }))
        : TA.map(t => ({ color: t.color, pct: Math.round(100 / (TA.length || 1)), op: r ? 1 : 0.4, label: t.name.replace(/^Team /, ""), pctS: `${Math.round(100 / (TA.length || 1))}%` }))),
      splitNote: r ? (r.mode === "even" ? "Evenly · each team an equal share" : "Custom split") : "Evenly by default", noteC: "#806B60",
      metricV: String(a.leads), metricL: "leads",
      flag: noAppt(a) ? "No appointments" : null as string | null, hasFlag: noAppt(a),
      open: () => { const rule = ruleOf(a.id);
        set(u => ({ ...u, ad: a.id, stage: "op", adMode: rule?.mode === "even" ? "evenly" : "team",
          tm: Object.fromEntries(TA.map(t => [t.id, fromDb(rule?.tm?.[t.id])])), mv: rule ? Object.fromEntries(Object.entries(rule.pp).map(([pid, n]) => [pid, n])) : {},
          split: rule && rule.mode !== "even" ? { ...rule.split } : null })); } }; });
  const stN = (k: string) => (k === "all" ? ads.length : ads.filter(a => statusOf(a.id) === k).length);
  const stCur = { label: ST_META[adSt][0], color: ST_META[adSt][1], tint: ST_META[adSt][3], ink: ST_META[adSt][4], n: stN(adSt) };
  const stOpts = (["Running", "Paused", "Pending", "all"] as const).map(k => ({ label: ST_META[k][0], color: ST_META[k][1], hint: ST_META[k][2], n: stN(k), tint: ST_META[k][3], ink: ST_META[k][4],
    bg: k === adSt ? ST_META[k][3] : "transparent", fg: ST_META[k][4], pick: () => patch({ adSt: k, stOpen: false }) }));

  // The split editor (D3): Evenly / By team; the team split auto-balances to 100; inside each team Evenly / By % / By max.
  const ad = ui.ad ? ads.find(a => a.id === ui.ad) : undefined;
  const adOpen = sheetOpen && opItem === "Ads to teams" && !!ad;
  const mode = ui.adMode, tm = ui.tm, mv = ui.mv;
  const evenSplit = () => { const n = TA.length || 1, base = Math.floor(100 / n); return Object.fromEntries(TA.map((t, i) => [t.id, base + (i < 100 - base * n ? 1 : 0)])); };
  const pctDefault = ui.split ?? (TA.length === 3 ? Object.fromEntries(TA.map((t, i) => [t.id, [50, 30, 20][i]])) : evenSplit());
  const setSplit = (id: string, raw: string) => {
    const v = Math.max(0, Math.min(100, (parseInt(String(raw).replace(/\D/g, ""), 10) || 0)));
    const others = TA.map(x => x.id).filter(n => n !== id), rest = others.reduce((a2, n) => a2 + (pctDefault[n] ?? 0), 0);
    const out: Record<string, number> = { [id]: v }; let left = 100 - v;
    others.forEach((n, i) => { const share = i === others.length - 1 ? left : rest ? Math.round(((100 - v) * (pctDefault[n] ?? 0)) / rest) : Math.round((100 - v) / others.length); out[n] = share; left -= share; });
    patch({ split: out });
  };
  const takenOf = (pid: string) => (ad ? data.customers.filter(c => c.adId === ad.id && c.assignedTo === pid).length : 0);
  const inModeOf = (id: string): InMode => tm[id] ?? "pct";
  const valOf = (t: (typeof T)[number], m: InMode, pid: string, k: number) => { const key = `${t.id}|${m}|${pid}`;
    if (mv[key] != null) return mv[key]; if (mv[pid] != null && m === inModeOf(t.id)) return mv[pid];
    return m === "pct" ? Math.round(100 / (t.people.length || 1)) + (k < 100 - Math.round(100 / (t.people.length || 1)) * t.people.length ? 0 : 0) : 0; };
  const adTeams = TA.map(t => { const m = inModeOf(t.id), mem = t.people;
    const totalMax = mem.reduce((a2, p, k) => a2 + valOf(t, "max", p.id, k), 0), totalPct = mem.reduce((a2, p, k) => a2 + valOf(t, "pct", p.id, k), 0);
    return { name: t.name, color: t.color, share: `${pctDefault[t.id] ?? 0}%`, field: m !== "evenly", unit: m === "pct" ? "%" : "max",
      note: m === "max" ? `Up to ${totalMax} leads in this team` : m === "pct" ? (totalPct === 100 ? "Adds up to 100%" : `Adds up to ${totalPct}% · needs 100%`) : `Shared evenly among ${mem.length} people`,
      noteColor: m === "pct" && totalPct !== 100 ? "#A3371A" : "#387557",
      members: mem.map((p, k) => { const key = `${t.id}|${m}|${p.id}`, val = valOf(t, m, p.id, k), taken = takenOf(p.id);
        return { name: p.name, value: val, valueStr: String(val),
          onVal: (e: { target: { value: string } }) => { const nv = Math.min(m === "pct" ? 100 : 999, parseInt(String(e.target.value).replace(/\D/g, ""), 10) || 0); set(u => ({ ...u, mv: { ...u.mv, [key]: nv } })); },
          sub: m === "max" ? (val === 0 ? "Gets none" : `${taken} of ${val} taken${taken >= val ? " · full" : ""}`) : `${taken} taken so far`,
          subColor: m === "max" && val > 0 && taken >= val ? "#A3371A" : "#806B60" }; }),
      opts: ([["evenly", "Evenly"], ["pct", "By %"], ["max", "By max"]] as const).map(([v, label]) => ({ label, on: v === m, off: v !== m, pick: () => set(u => ({ ...u, tm: { ...u.tm, [t.id]: v } })) })) }; });
  const ruleFromDraft = () => {
    if (mode === "evenly") return { mode: "even" as const, split: {}, pm: "pct" as const, pp: {}, tm: undefined };
    const pp: Record<string, number> = {}, tmo: Record<string, "even" | "pct" | "cnt"> = {};
    TA.forEach(t => { const m = inModeOf(t.id); tmo[t.id] = toDb(m); t.people.forEach((p, k) => { pp[p.id] = valOf(t, m, p.id, k); }); });
    return { mode: "split" as const, split: { ...pctDefault }, pm: "pct" as const, pp, tm: tmo };
  };
  const draftOk = mode === "evenly" || (Object.values(pctDefault).reduce((a2, n) => a2 + n, 0) === 100
    && TA.every(t => { const m = inModeOf(t.id); if (!(pctDefault[t.id] > 0)) return true; if (m === "pct") return t.people.reduce((s, p, k) => s + valOf(t, "pct", p.id, k), 0) === 100; if (m === "max") return t.people.some((p, k) => valOf(t, "max", p.id, k) > 0); return true; }));
  const saveOne = async (id: string, label: string) => ctx.act.saveAdRule(id, label, ruleFromDraft());
  const applyN = shownAds.length;
  const adEdit = {
    adOpen, ad: { name: ad?.label ?? "", meta: ad ? `${ad.wa ? "WhatsApp" : "Messenger"} · ${ad.leads} leads` : "" },
    adModes: ([["evenly", "Evenly"], ["team", "By team"]] as const).map(([v, label]) => ({ label, on: v === mode, off: v !== mode, pick: () => patch({ adMode: v }) })),
    adByTeam: mode === "team", adEvenly: mode !== "team",
    adSplit: TA.map(t => ({ name: t.name, color: t.color, pct: mode === "team" ? pctDefault[t.id] ?? 0 : Math.round(100 / (TA.length || 1)), pctStr: String(mode === "team" ? pctDefault[t.id] ?? 0 : Math.round(100 / (TA.length || 1))),
      onRange: (e: { target: { value: string } }) => setSplit(t.id, e.target.value) })),
    resetSplit: () => patch({ split: null, mv: {} }),
    evenTotal: TA.reduce((a2, t) => a2 + t.people.length, 0),
    evenTeams: TA.map(t => ({ name: t.name, color: t.color, avs: t.people.map(p => ({ ini: initials(p.name) })), names: t.people.map(p => shortName(p.name, t.people.map(x => x.name))).join(", ") })),
    adTeams, closeAd: () => patch({ ad: null }),
    applyLabel: `Save and apply to all ${applyN}${adSt === "all" ? "" : ` ${adSt.toLowerCase()}`} ads`,
    applyAll: () => { if (!ad || !draftOk) return; const list = shownAds.some(a => a.id === ad.id) ? shownAds : [...shownAds, ad];
      void Promise.all(list.map(a => saveOne(a.id, a.label))).then(rs => { const ok = rs.filter(Boolean).length;
        if (ok) patch({ ad: null, toast: `Applied to ${ok}${adSt === "all" ? "" : ` ${adSt.toLowerCase()}`} ads` }); }); },
    saveAd: () => { if (!ad || !draftOk) return; void saveOne(ad.id, ad.label).then(r => { if (r) patch({ ad: null, toast: `Saved · ${ad.label}${r.dealt ? ` · ${r.dealt} waiting lead${r.dealt === 1 ? "" : "s"} dealt` : ""}` }); }); },
  };

  // ── Full time lead allocation (D5): days per person, taking turns; Off = follows Ads to teams.
  const ftPeople = (tid: string) => (T.find(t => t.id === tid)?.people ?? []).filter(p => p.fullTime);
  const ticks = (tid: string) => { const r = data.ftRules.find(x => x.tlId === tid), v: Record<string, number[]> = {};
    if (r) for (const id in r.vals) v[id] = [0, 1, 2, 3, 4, 5, 6].map(d => ((r.vals[id]?.[String(d)] ?? 0) > 0 && r.days.includes(d) ? 1 : 0));
    return v; };
  const dayPills = (arr: number[], color: string, edit: boolean, pid?: string) => DAYS.map((l, i) => ({ l, bg: arr[i] ? color : edit ? "#F5EBE3" : "#F7F3EF", fg: arr[i] ? "#fff" : "#A08E82",
    toggle: edit && pid ? () => set(u => { const d = u.ftDraft ?? { on: true, days: {} }; const a = [...(d.days[pid] ?? [0, 0, 0, 0, 0, 0, 0])]; a[i] = a[i] ? 0 : 1; return { ...u, ftDraft: { ...d, days: { ...d.days, [pid]: a } } }; }) : () => {} }));
  const ftCards = T.map(t => { const v = ticks(t.id), on = Object.values(v).some(a => a.some(Boolean)), sel = ui.ftEdit === t.id;
    return { name: t.name, color: t.color, state: on ? "On" : "Off", stBg: on ? "#E8F3ED" : "#F2F0EB", stFg: on ? "#387557" : "#6B645A",
      mode: on ? "" : "Off · follows Ads to teams", cta: data.ftRules.some(r => r.tlId === t.id) ? "Edit days" : "Set up", noTag: true, tag: null as string | null, tagBg: "#F5EBE3", tagFg: "#6B574C",
      bd: sel ? "#BD4A19" : "#EBDDD2", ring: sel ? "0 0 0 3px #FFF0E4" : "none",
      people: ftPeople(t.id).map(p => ({ name: p.name, days: dayPills(on ? v[p.id] ?? [0, 0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0], t.color, false) })),
      open: () => { const cur = ticks(t.id), days: Record<string, number[]> = {}; ftPeople(t.id).forEach(p => { days[p.id] = cur[p.id] ?? [1, 1, 1, 1, 1, 0, 0]; });
        patch({ ftEdit: t.id, stage: "op", ftDraft: { on: on || !data.ftRules.some(r => r.tlId === t.id), days } }); } }; });
  const en = ui.ftEdit ? T.find(t => t.id === ui.ftEdit) : undefined, dr = ui.ftDraft ?? { on: true, days: {} };
  const ftOpen = sheetOpen && opItem === "Full time lead allocation" && !!en;
  const isFull = (pid: string) => (dr.days[pid] ?? []).filter(Boolean).length === 7;
  const setDays = (pids: string[], val: boolean) => set(u => { const d = u.ftDraft ?? { on: true, days: {} }; const days = { ...d.days }; pids.forEach(pid => { days[pid] = Array(7).fill(val ? 1 : 0); }); return { ...u, ftDraft: { ...d, days } }; });
  const ps = en ? ftPeople(en.id) : [];
  const saveFt = async (tid: string, draft: { on: boolean; days: Record<string, number[]> }) => {
    const people = ftPeople(tid), vals: Record<string, Record<string, number>> = {};
    people.forEach(p => { vals[p.id] = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), draft.on && (draft.days[p.id] ?? [])[d] ? 1 : 0])); });
    const days = [0, 1, 2, 3, 4, 5, 6].filter(d => draft.on && people.some(p => (draft.days[p.id] ?? [])[d]));
    return ctx.act.saveFtRule(tid, "turns", days, vals);
  };
  const ftEdit = {
    ftCards, ftOpen, ftOn: dr.on, ftOff: !dr.on,
    ftE: { name: en?.name ?? "", color: en?.color ?? "#BD4A19",
      people: ps.map(p => ({ name: p.name, days: dayPills(dr.days[p.id] ?? [0, 0, 0, 0, 0, 0, 0], en?.color ?? "#BD4A19", true, p.id), allLabel: isFull(p.id) ? "Clear all days" : "Every day", all: () => setDays([p.id], !isFull(p.id)) })),
      summary: DAY_NAMES.map((day, i) => { const who = ps.filter(p => (dr.days[p.id] ?? [])[i]).map(p => p.name);
        return { day, who: !dr.on || !who.length ? "No one · follows Ads to teams" : who.length === 1 ? `${who[0]} only` : `${who.join(", ")} take turns`, fg: dr.on && who.length ? "#3F2B22" : "#A08E82" }; }) },
    ftAllLabel: ps.length && ps.every(p => isFull(p.id)) ? "Clear all" : "Tick every day", ftAllToggle: () => setDays(ps.map(p => p.id), !(ps.length && ps.every(p => isFull(p.id)))),
    ftModes: ([[false, "Off"], [true, "On"]] as const).map(([v, label]) => ({ label, bg: v ? "#387557" : "#6B645A", on: v === dr.on, off: v !== dr.on, pick: () => set(u => ({ ...u, ftDraft: { ...(u.ftDraft ?? { on: true, days: {} }), on: v } })) })),
    closeFt: () => patch({ ftEdit: null }),
    ftSave: () => { if (en) void saveFt(en.id, dr).then(ok => { if (ok) patch({ ftEdit: null, toast: `Saved · ${en.name}` }); }); },
    ftApplyAll: () => { if (!en) return; const pattern = dr.days[ps[0]?.id ?? ""] ?? [1, 1, 1, 1, 1, 0, 0];
      void Promise.all(T.map(t => { const days: Record<string, number[]> = {}; ftPeople(t.id).forEach(p => { days[p.id] = t.id === en.id ? dr.days[p.id] ?? [...pattern] : [...pattern]; }); return saveFt(t.id, { on: dr.on, days }); }))
        .then(rs => { if (rs.some(Boolean)) patch({ ftEdit: null, toast: `Applied to all ${T.length} teams` }); }); },
  };

  return {
    opRows, sendOpen: sheetOpen && (opItem === "Organic Leads" || opItem === "Awaiting reply") && !!sf, sendName: sf?.name ?? "", sendMeta: sf ? `${sf.ad} · ${chName(sf.channel)}` : "",
    sendGroups, closeSend: () => patch({ sendFor: null }),
    awOpen, aw, awAssign: () => patch({ sendFor: ui.awChat, awMenuOpen: false }), awMenu: ui.awMenuOpen, awMenuToggle: () => set(u => ({ ...u, awMenuOpen: !u.awMenuOpen })),
    awRemind: () => { if (awC) { patch({ awMenuOpen: false }); void remind(ctx, awC.id); } }, closeAw: () => patch({ awChat: null }),
    adCards, stOpen: ui.stOpen, toggleSt: () => set(u => ({ ...u, stOpen: !u.stOpen })), stCur, stOpts,
    ...adEdit, ...ftEdit,
    teamOf: (id: string | null) => teamNameOf(ctx, id),
  };
}

const DAY_MS = 86_400_000;

/** Send reminder (C4 / D4): the salesperson is told to reply (crm_remind, PROPOSALS.md B2). */
export async function remind(ctx: DeskCtx, customerId: string) {
  const c = ctx.data.customers.find(x => x.id === customerId);
  const ok = await ctx.deskAct.remind(customerId);
  if (ok) ctx.patch({ toast: `Reminder sent to ${c?.assignedTo ? ctx.nameOf(c.assignedTo) : "the salesperson"} · reply to ${c?.name ?? "the customer"}` });
}
