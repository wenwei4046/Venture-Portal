/**
 * Assignment's v2 additions (CRM Desktop v2, README › 5), over rev 1's editors (vm/assign.ts):
 *   5a Ads to teams — the ad list (who got the leads this month, ads needing attention, each ad's split), the split
 *      editor (an Evenly team's people fold away; "Also apply to all N … ads"), the Ad performance column (Today / This
 *      week / This month / Custom with its calendar) and the ad's Audit log (a 44 px rail, closed by default);
 *   5b Full time lead allocation — "Also apply to all N teams" only when everyone in this team works the same days;
 *   5c Member work type — its Audit log.
 * Ad performance's numbers are Ads Performance's own (adsperf.ts › crmFigures — leads, appointments from the CRM; spend,
 * reach and clicks are Meta's, "—" until Meta Ads is connected), so the two pages never disagree. The logs are the audit
 * trail (audit_changes: crm_ad_assign, crm_fulltime_rules, crm_staff), the same rows the sidebar's Audit log reads.
 */
import type { CSSProperties } from "react";
import type { DeskCtx, HistRow } from "./ctx";
import { crmFigures } from "./adsperf";
import type { assignPageVM } from "./assign";
import { MON } from "./insight";
import { DIRECTOR_C, DIRECTOR_SPLIT_KEY, DIRECTOR_TEAM, teamColours } from "./tokens";

const DAY = 86_400_000;
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const tm = (iso: string) => new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
const dm = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MON[d.getMonth()].slice(0, 3)}`; };
const IC: Record<string, [string, string, string]> = {
  live: ["#E8F3ED", "#387557", "M6 4l14 8-14 8z"], edit: ["#FFF0E4", "#BD4A19", "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"],
  auto: ["#E4EDF8", "#2F6FB5", "M13 2 3 14h9l-1 8 10-12h-9l1-8z"], pause: ["#F2F0EB", "#6B645A", "M8 5v14M16 5v14"],
  ft: ["#E4F1EA", "#2E6B4E", "M20 6 9 17l-5-5"], pt: ["#F2F0EB", "#6B645A", "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"], set: ["#FFF0E4", "#BD4A19", "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"],
};
type LogEv = { at: string; who: string; text: string; kind: keyof typeof IC };
/** A log as v2 draws it (newest first): the day once, time, who, the words; a rail of the newest five when shut. */
function logOf(ev: LogEv[]) {
  const e = [...ev].sort((a, b) => b.at.localeCompare(a.at));
  return {
    rows: e.map((x, i) => { const c = IC[x.kind]; return { date: !i || dm(e[i - 1].at) !== dm(x.at) ? dm(x.at) : "", time: tm(x.at), who: x.who, text: x.text, bg: c[0], fg: c[1], d: c[2], line: i === e.length - 1 ? "transparent" : "#EBDDD2" }; }),
    rail: e.slice(0, 5).map((x, i, R) => ({ dot: IC[x.kind][1], tip: x.text, gap: i === R.length - 1 ? "transparent" : "#D9C9BD" })),
  };
}

export function assignV2VM(ctx: DeskCtx, opItem: string, as: ReturnType<typeof assignPageVM>, frame: { sheetW: number; isAdsOp: boolean; isFtOp: boolean; isMwtOp: boolean; sheetMode: boolean; perfW: number }) {
  const { ui, patch, set, data, now, teams, W } = ctx;
  const T = day0(now), monthA = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const inSheet = frame.sheetMode && ui.stage !== "menu";
  const hist = ui.history ?? [];

  // ── The ads (the live list: one per ad id the CRM saw), their leads, their rule.
  const adIds = [...new Set(data.customers.map(c => c.adId).filter((x): x is string => !!x))];
  const adOf = (id: string) => { const cs = data.customers.filter(c => c.adId === id); return { id, label: cs[0]?.ad ?? `Ad ${id}`, cs, wa: cs.some(c => c.channel === "whatsapp") }; };
  const ads = adIds.map(adOf).sort((a, b) => b.cs.length - a.cs.length);
  // The Revenue Director first, above the teams (the owner, 2026-10-16).
  const T3 = [...(ctx.directors.length ? [{ id: DIRECTOR_SPLIT_KEY, name: DIRECTOR_TEAM, color: DIRECTOR_C[0], people: ctx.directors }] : []),
    ...teams.map((t, k) => ({ id: t.id, name: t.name, color: teamColours(k)[0], people: t.people }))];
  const teamOf = (pid: string | null) => (pid ? T3.find(t => t.id === pid || t.people.some(p => p.id === pid)) : undefined);

  // Who got the leads this month: each team's leads from the ads (by who has them now), and those held for a full team.
  const monthLeads = data.customers.filter(c => c.adId && new Date(c.createdAt).getTime() >= monthA);
  const held = monthLeads.filter(c => c.held && !c.assignedTo);
  const byTeam = T3.map(t => ({ name: t.name, color: t.color, leads: monthLeads.filter(c => c.assignedTo && teamOf(c.assignedTo)?.id === t.id).length }));
  const extra = held.length ? [{ name: "Waiting · team full", color: "#C9B8AB", leads: held.length }] : [];
  const maxL = Math.max(1, ...byTeam.map(t => t.leads), held.length);
  const totL = [...byTeam, ...extra].reduce((a, t) => a + t.leads, 0);
  const adByTeam2 = [...byTeam, ...extra].map(t => ({ ...t, appt: 0, rate: "—", w: Math.round((t.leads / maxL) * 100), share: totL ? `${Math.round((t.leads / totL) * 100)}%` : "—" }));
  // Needs attention: an ad whose leads wait because a By max team is full (the live rule — an ad with no split is dealt evenly, so nothing else waits).
  const attn = ads.filter(a => a.cs.some(c => c.held && !c.assignedTo)).map((a, i) => { const n = a.cs.filter(c => c.held && !c.assignedTo).length;
    return { title: a.label, sub: `${n} ${n === 1 ? "lead waits" : "leads wait"} · a team is at its max`, btn: "Set up", bt: i ? "1px solid #F3DCC4" : "0",
      go: () => as.openAdById(a.id) }; });

  // ── Ad performance (the open ad): Today · This week · This month · Custom (its calendar: pick the start, then the end).
  const ad = ui.ad ? ads.find(a => a.id === ui.ad) : undefined;
  const wkA = T - ((now.getDay() + 6) % 7) * DAY;
  const cu = ui.adCust ?? { a: monthA, b: T };
  const cuL = cu.a === cu.b ? dm(new Date(cu.a).toISOString()) : `${new Date(cu.a).getDate()}–${dm(new Date(cu.b).toISOString())}`;
  const PER: [typeof ui.adPer, string, number, number][] = [["Today", dm(new Date(T).toISOString()), T, T], ["This week", `${new Date(wkA).getDate()}–${dm(new Date(T).toISOString())}`, wkA, T], ["This month", MON[now.getMonth()].slice(0, 3), monthA, T], ["Custom", cuL, cu.a, cu.b]];
  const per = PER.find(p => p[0] === ui.adPer) ?? PER[2];
  const f = ad ? crmFigures(ad.cs, ctx, per[2], per[3]) : {};
  const leads = (f.leads as number) ?? 0, appt = (f.appt as number) ?? 0;
  // Meta's figures (spend, reach, clicks) wait for Meta Ads (README › Data sources): "—" until connected.
  const pc = (a: number | null, b: number | null) => (a == null || !b ? "—" : `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%`);
  const FN: [string, number | null, string][] = [["Reach", null, ""], ["Clicks", null, "— of reach"], ["Leads", leads, "— of clicks"], ["Appointments", appt, `${pc(appt, leads)} of leads`]];
  const mx = Math.max(1, leads);
  const adFunnel = FN.map(([k, n, sub], i) => ({ k, n: n == null ? "—" : n.toLocaleString("en-MY"), sub, w: n ? Math.max(3, Math.round(Math.sqrt(n / mx) * 100)) : 0, color: ["#E2CFC1", "#D9A88A", "#BD4A19", "#387557"][i] }));
  const adCosts = [["Cost per click", "—"], ["Cost per lead", "—"], ["Cost per appointment", "—"], ["Click-through rate", "—"]].map(([k, v]) => ({ k, v }));
  const adSumRows = [["Spend", "RM —", ""], ["Leads", String(leads), ""], ["Cost per lead", "—", ""], ["Appointments", String(appt), leads ? `${Math.round((appt / leads) * 100)}% of leads` : ""]].map(([k, v, sub]) => ({ k, v, sub }));
  // The custom range's calendar: this month, days after today greyed.
  const t0 = ui.adCustT ?? { ...cu, step: 0 };
  const first = new Date(now.getFullYear(), now.getMonth(), 1), lead = (first.getDay() + 6) % 7, days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const adCalDays = [...Array.from({ length: lead }, () => ({ l: "", bg: "transparent", fg: "transparent", cur: "default", w: 500, pick: () => {} })),
    ...Array.from({ length: days }, (_, k) => { const d = new Date(now.getFullYear(), now.getMonth(), k + 1).getTime(), fut = d > T, ends = d === t0.a || d === t0.b, inR = d > t0.a && d < t0.b;
      return { l: String(k + 1), bg: ends ? "#BD4A19" : inR ? "#FFF0E4" : "transparent", fg: fut ? "#D3C5BA" : ends ? "#fff" : "#3F2B22", cur: fut ? "not-allowed" : "pointer", w: ends ? 700 : 500,
        pick: () => { if (fut) return; set(u => { const x = u.adCustT ?? { ...cu, step: 0 }; return { ...u, adCustT: x.step !== 1 ? { a: d, b: d, step: 1 } : d < x.a ? { a: d, b: x.a, step: 0 } : { a: x.a, b: d, step: 0 } }; }); } }; })];
  const calLbl = (x: { a: number; b: number }) => `${x.a === x.b ? new Date(x.a).getDate() : `${new Date(x.a).getDate()} – ${new Date(x.b).getDate()}`} ${MON[new Date(x.b).getMonth()].slice(0, 3)} ${new Date(x.b).getFullYear()}`;

  // ── The ad's Audit log: the CRM saw it first (its first lead), then every saved split (audit_changes on crm_ad_assign).
  const adEv: LogEv[] = ad ? [
    { at: ad.cs.map(c => c.createdAt).sort()[0] ?? now.toISOString(), who: "System", text: `First lead from this ad · ${ad.wa ? "WhatsApp" : "Messenger"}`, kind: "live" },
    ...hist.filter(h => h.table === "crm_ad_assign" && String(h.row.ad_id ?? "") === ad.id).map(h => ({ at: h.at, who: h.who, kind: "edit" as const,
      text: h.op === "INSERT" ? `Split set · ${describeAd(h.after, T3)}` : h.op === "DELETE" ? "Split removed · back to evenly" : `Split changed · ${describeAd(h.after, T3)}` })),
    ...(data.adRules.some(r => r.adId === ad.id) ? [] : [{ at: ad.cs.map(c => c.createdAt).sort()[0] ?? now.toISOString(), who: "System", text: "No split set · leads shared evenly by default", kind: "auto" as const }]),
  ] : [];
  const adL = logOf(adEv), logOpen = ui.adLog;
  const dock = W >= 1440, aw = ui.auditW ?? 280;
  // The Audit log docks at Ad performance's right on every width (the owner, 2026-10-15: "它會在 ads performance 右邊"); where
  // the page is narrow, opening it folds Ad performance to its strip so the two never cover each other. White, lifted
  // off the sand of Ad performance by its shadow.
  const perfShut = ui.adPerfShut || (logOpen && !dock);
  const adLogStyle: CSSProperties = { position: "relative", flex: `0 1 ${aw}px`, width: aw, minWidth: 220, boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", boxShadow: "-10px 0 24px rgba(40,25,18,.08)", display: "flex", flexDirection: "column" };

  // ── Member work type's Audit log: full time / part time changes (crm_staff.full_time).
  const mwtEv: LogEv[] = hist.filter(h => h.table === "crm_staff" && (h.op !== "UPDATE" || h.changes.some(c => c.field === "Full time")))
    .map(h => { const on = !!h.row.full_time; return { at: h.at, who: h.who, kind: on ? "ft" as const : "pt" as const, text: `${h.what} set to ${on ? "Full time" : "Part time"}` }; });
  const mwtL = logOf(mwtEv), mwtShow = frame.isMwtOp && inSheet, mwtOpen = mwtShow && ui.mwtLog;

  // ── Full time: "Also apply to all N teams" only when everyone in this team works the same days.
  const ftDays = ui.ftDraft?.days ?? {};
  const ftPids = Object.keys(ftDays);
  const ftSame = ftPids.length > 0 && ftPids.every(p => (ftDays[p] ?? []).map(x => (x ? 1 : 0)).join("") === (ftDays[ftPids[0]] ?? []).map(x => (x ? 1 : 0)).join(""));
  const ftApplyOn = ftSame && ui.ftApplyChk;

  // Evenly teams fold their people away (v2): "N members · each gets an equal share · Show".
  const adTeams = as.adTeams.map(t => { const ev = t.opts.some(o => o.on && o.label === "Evenly"), op = !!ui.evOpen[t.name];
    return { ...t, evenShut: ev && !op, evenOpen: ev && op, listShown: !ev || op, memberCount: t.members.length, toggleList: () => set(u => ({ ...u, evOpen: { ...u.evOpen, [t.name]: !op } })) }; });
  const shownN = ui.adSt === "all" ? ads.length : 0;
  const noun = ui.adSt === "all" ? "" : ` ${ui.adSt.toLowerCase()}`;
  return {
    adList: frame.isAdsOp, adGrid: false, adOverview: !as.adOpen, adNone: frame.isAdsOp && inSheet && !as.adOpen, adNoneW: frame.sheetW + 304,
    listMin: frame.isAdsOp ? 240 : 0, splitFlex: `0 1 ${frame.sheetW}px`,
    attn, hasAttn: attn.length > 0, adByTeam2, adLeadsTotal: totL,
    adTeams,
    applyChk: ui.applyChk, toggleApplyChk: () => patch({ applyChk: !ui.applyChk }), applyChkLabel: `Also apply to all ${shownN || ads.length}${noun} ads`,
    saveOrApply: () => (ui.applyChk ? as.applyAll : as.saveAd)(),
    adSum: { rows: adSumRows }, adFunnel, adCosts,
    adPerLabel: per[0] === "Custom" ? per[1] : per[0], adPerOpen: ui.adPerOpen, adPerBg: ui.adPerOpen ? "#FFF1E6" : "#fff",
    adPerToggle: () => patch({ adPerOpen: !ui.adPerOpen, adCal: false }),
    adPerOpts: PER.map(([label, range]) => { const on = label === per[0]; return { label, range, bg: on ? "#FFF5EC" : "transparent", w: on ? 650 : 500,
      pick: () => (label === "Custom" ? patch({ adCal: true, adCustT: { ...cu, step: 0 } }) : patch({ adPer: label, adPerOpen: false, adCal: false })) }; }),
    adCalOpen: ui.adCal, adCalList: !ui.adCal, adCalHint: t0.step === 1 ? "Now pick the end date" : "Pick the start date", adCalLabel: calLbl(t0),
    adCalBack: () => patch({ adCal: false }), adCalApply: () => patch({ adCust: { a: t0.a, b: t0.b }, adPer: "Custom", adCal: false, adPerOpen: false }), adCalDays,
    openAdsPerf: () => patch({ tab: "adsperf", pane: "closed", ad: null, adLog: false, toast: "" }),
    perfShut, perfFold: () => patch({ adPerfShut: true }),
    perfRail: { title: "Ad performance", open: () => patch({ adPerfShut: false, ...(dock ? {} : { adLog: false }) }) },
    adLogOpen: logOpen, adLogClosed: !logOpen, adLogToggle: () => patch({ adLog: !logOpen }), adLog: adL.rows, adLogRail: adL.rail, adLogStyle,
    mwtLogOpen: mwtOpen, mwtLogClosed: mwtShow && !mwtOpen, mwtLogW: ui.mwtLogW ?? 280, mwtLogToggle: () => patch({ mwtLog: !ui.mwtLog }), mwtLog: mwtL.rows, mwtLogRail: mwtL.rail,
    ftSame, ftApplyDis: !ftSame, ftApplyOn, ftApplyFg: ftSame ? "#3F2B22" : "#A08E82", ftApplyCur: ftSame ? "pointer" : "not-allowed", ftApplyTip: ftSame ? "" : "Everyone in this team needs the same days",
    toggleFtApplyChk: () => { if (ftSame) patch({ ftApplyChk: !ui.ftApplyChk }); }, ftSaveOrApply: () => (ftApplyOn ? as.ftApplyAll : as.ftSave)(),
    ftNone: frame.isFtOp && inSheet && !as.ftOpen,
    ftCards: as.ftCards.map(c => ({ ...c, rowBg: ui.ftEdit && as.ftE.name === c.name ? "#FFF5EC" : "#fff", stFg: c.state === "On" ? "#387557" : "#A08E82" })),
    // Which ad / team to open on entering (DeskScreens opens it once, as v2's "entering opens the first running ad").
    adSeed: frame.isAdsOp && inSheet && !ui.ad && ads[0] ? ads[0].id : null,
    ftSeed: frame.isFtOp && inSheet && !ui.ftEdit && as.ftCards[0] ? as.ftCards[0].open : null,
  };
}

/** A saved split in words: "Evenly · each team 1/3" or "By team · Kelvin 50% · Priya 30% · Ryan 20%". */
function describeAd(row: Record<string, unknown> | null, T3: { id: string; name: string }[]): string {
  if (!row) return "—";
  if (row.mode === "even" || !row.team_split) return "Evenly · each team gets an equal share";
  const s = row.team_split as Record<string, number>;
  return `By team · ${T3.filter(t => (s[t.id] ?? 0) > 0).map(t => `${t.name.replace(/^Team /, "")} ${s[t.id]}%`).join(" · ")}`;
}
export type { HistRow };
