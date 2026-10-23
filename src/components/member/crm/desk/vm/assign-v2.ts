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
import { adRunLine, adRunning } from "@/lib/member/crm-ad-running";
import { leadsByAd } from "./leads-by-ad";
import { chatRows, teamNameOf } from "./data";
import { STATUS, type StatusName } from "../../shared/palette";

const DAY = 86_400_000;
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const tm = (iso: string) => new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
const dm = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MON[d.getMonth()].slice(0, 3)}`; };
const IC: Record<string, [string, string, string]> = {
  live: ["var(--crm-tint-follow)", "var(--crm-brown)", "M6 4l14 8-14 8z"], edit: ["var(--crm-tint-attention)", "var(--crm-rust)", "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"],
  auto: ["var(--crm-tint-cold)", "var(--crm-ink-soft)", "M13 2 3 14h9l-1 8 10-12h-9l1-8z"], pause: ["var(--crm-field)", "var(--crm-ink-soft)", "M8 5v14M16 5v14"],
  ft: ["var(--crm-tint-follow)", "var(--crm-brown)", "M20 6 9 17l-5-5"], pt: ["var(--crm-field)", "var(--crm-ink-soft)", "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"], set: ["var(--crm-tint-attention)", "var(--crm-rust)", "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"],
};
type LogEv = { at: string; who: string; text: string; kind: keyof typeof IC };
/** A log as v2 draws it (newest first): the day once, time, who, the words; a rail of the newest five when shut. */
function logOf(ev: LogEv[]) {
  const e = [...ev].sort((a, b) => b.at.localeCompare(a.at));
  return {
    rows: e.map((x, i) => { const c = IC[x.kind]; return { date: !i || dm(e[i - 1].at) !== dm(x.at) ? dm(x.at) : "", time: tm(x.at), who: x.who, text: x.text, bg: c[0], fg: c[1], d: c[2], line: i === e.length - 1 ? "transparent" : "var(--crm-rule)" }; }),
    rail: e.slice(0, 5).map((x, i, R) => ({ dot: IC[x.kind][1], tip: x.text, gap: i === R.length - 1 ? "transparent" : "var(--crm-line)" })),
  };
}

export function assignV2VM(ctx: DeskCtx, opItem: string, as: ReturnType<typeof assignPageVM>, frame: { sheetW: number; isAdsOp: boolean; isFtOp: boolean; isMwtOp: boolean; sheetMode: boolean; perfW: number }) {
  const { ui, patch, set, data, now, teams, W } = ctx;
  const T = day0(now), monthA = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const inSheet = frame.sheetMode && ui.stage !== "menu";
  const hist = ui.history ?? [];

  // ── The ads (the live list: one per ad id the CRM saw), their leads, their rule.
  const added = Object.entries(data.adNames ?? {}).filter(([, n]) => n.added).map(([id]) => id);
  const adIds = [...new Set([...data.customers.map(c => c.adId).filter((x): x is string => !!x), ...added])];
  const adOf = (id: string) => { const cs = data.customers.filter(c => c.adId === id); return { id, label: cs[0]?.ad ?? data.adNames?.[id]?.name ?? `Ad ${id}`, cs, wa: !cs.length || cs.some(c => c.channel === "whatsapp") }; };
  const ads = adIds.map(adOf).sort((a, b) => b.cs.length - a.cs.length);
  // The Revenue Director first, above the teams (the owner, 2026-10-16).
  const T3 = [...(ctx.directors.length ? [{ id: DIRECTOR_SPLIT_KEY, name: DIRECTOR_TEAM, color: DIRECTOR_C[0], people: ctx.directors }] : []),
    ...teams.map((t, k) => ({ id: t.id, name: t.name, color: teamColours(k)[0], people: t.people }))];
  const teamOf = (pid: string | null) => (pid ? T3.find(t => t.id === pid || t.people.some(p => p.id === pid)) : undefined);

  // Who got the leads this month: each team's leads from the ads (by who has them now), and those held for a full team.
  const monthLeads = data.customers.filter(c => c.adId && new Date(c.createdAt).getTime() >= monthA);
  const held = monthLeads.filter(c => c.held && !c.assignedTo);
  const byTeam = T3.map(t => ({ name: t.name, color: t.color, leads: monthLeads.filter(c => c.assignedTo && teamOf(c.assignedTo)?.id === t.id).length }));
  const extra = held.length ? [{ name: "Waiting · team full", color: "var(--crm-faint-2)", leads: held.length }] : [];
  const maxL = Math.max(1, ...byTeam.map(t => t.leads), held.length);
  const totL = [...byTeam, ...extra].reduce((a, t) => a + t.leads, 0);
  const adByTeam2 = [...byTeam, ...extra].map(t => ({ ...t, appt: 0, rate: "—", w: Math.round((t.leads / maxL) * 100), share: totL ? `${Math.round((t.leads / totL) * 100)}%` : "—" }));
  // Needs attention: an ad whose leads wait because a By max team is full (the live rule — an ad with no split is dealt evenly, so nothing else waits).
  const attn = ads.filter(a => a.cs.some(c => c.held && !c.assignedTo)).map((a, i) => { const n = a.cs.filter(c => c.held && !c.assignedTo).length;
    return { title: a.label, sub: `${n} ${n === 1 ? "lead waits" : "leads wait"} · a team is at its max`, btn: "Set up", bt: i ? "1px solid var(--crm-tint-attention)" : "0",
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
  const adFunnel = FN.map(([k, n, sub], i) => ({ k, n: n == null ? "—" : n.toLocaleString("en-MY"), sub, w: n ? Math.max(3, Math.round(Math.sqrt(n / mx) * 100)) : 0, color: ["var(--crm-line)", "var(--crm-st-won)", "var(--crm-rust)", "var(--crm-brown)"][i] }));
  const adCosts = [["Cost per click", "—"], ["Cost per lead", "—"], ["Cost per appointment", "—"], ["Click-through rate", "—"]].map(([k, v]) => ({ k, v }));
  const adSumRows = [["Spend", "RM —", ""], ["Leads", String(leads), ""], ["Cost per lead", "—", ""], ["Appointments", String(appt), leads ? `${Math.round((appt / leads) * 100)}% of leads` : ""]].map(([k, v, sub]) => ({ k, v, sub }));
  // The custom range's calendar: this month, days after today greyed.
  const t0 = ui.adCustT ?? { ...cu, step: 0 };
  const first = new Date(now.getFullYear(), now.getMonth(), 1), lead = (first.getDay() + 6) % 7, days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const adCalDays = [...Array.from({ length: lead }, () => ({ l: "", bg: "transparent", fg: "transparent", cur: "default", w: 500, pick: () => {} })),
    ...Array.from({ length: days }, (_, k) => { const d = new Date(now.getFullYear(), now.getMonth(), k + 1).getTime(), fut = d > T, ends = d === t0.a || d === t0.b, inR = d > t0.a && d < t0.b;
      return { l: String(k + 1), bg: ends ? "var(--crm-rust)" : inR ? "var(--crm-tint-attention)" : "transparent", fg: fut ? "var(--crm-faint-2)" : ends ? "#fff" : "var(--crm-ink)", cur: fut ? "not-allowed" : "pointer", w: ends ? 700 : 500,
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
  const adLogStyle: CSSProperties = { position: "relative", flex: `0 1 ${frame.sheetW}px`, width: frame.sheetW, minWidth: 220, boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", boxShadow: "-10px 0 24px rgba(42,22,12,.08)", display: "flex", flexDirection: "column" };

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
  // 4a (frame 06): the ads as a table — channel, the name managers typed (oxblood "Not named yet" with Set up when it has
  // none), Meta's headline, leads, the split in team colours — and one docked editor with Split · Ad performance · Audit log.
  const named = (a: (typeof ads)[number]) => !!data.adNames?.[a.id];
  const brandOf = (id: string) => data.adNames?.[id]?.pageName || (data.adNames?.[id]?.pageId ? `Page ${data.adNames[id]!.pageId}` : "Other");
  const brandSort = <C extends { id: string }>(cs: C[]) => { const order = [...new Set(cs.map(c => brandOf(c.id)))].sort((x, y) => Number(x === "Other") - Number(y === "Other") || x.localeCompare(y));
    return [...cs].sort((x, y) => order.indexOf(brandOf(x.id)) - order.indexOf(brandOf(y.id))); };
  const adList4 = {
    summary: `${ads.length} ads`, unsetN: ads.filter(a => !data.adRules.some(r => r.adId === a.id) || !named(a)).length,
    legend: T3.map(t => ({ name: t.name === DIRECTOR_TEAM ? "Director" : t.name.replace(/^Team /, ""), color: t.color })),
    // By the ad's id (two ads may share a name — Meta lets a name repeat across ad sets), grouped by Page (2026-10-22, the
    // owner: "分一下 DC & The conts"): one brand after another, Other (no Page known) last.
    rows: brandSort(as.adCards).map((c, i, all) => { const a = ads.find(x => x.id === c.id);
      const brand = brandOf(c.id), dup = all.filter(x => x.name === c.name).length > 1;
      // "Not named yet" (oxblood) until a manager types its name; Meta's headline — or what the CRM calls it — under it.
      const nameless = !!a && !named(a), hl = a?.cs.find(x => x.adHeadline)?.adHeadline ?? "";
      // The desktop keeps every ad; a paused one says so (2026-10-22 — the phone shows Running | Paused tabs).
      const paused = !!a && !adRunning(data.adNames?.[a.id], a.cs.map(x => x.createdAt).sort().at(-1) ?? null, now);
      const run = a ? adRunLine(data.adNames?.[a.id], now) : "";
      return { name: nameless ? "Not named yet" : c.name, nameless, paused, run: dup ? [run, `ID …${c.id.slice(-6)}`].filter(Boolean).join(" · ") : run,
        brand, brandHead: i === 0 || brandOf(all[i - 1].id) !== brand, brandN: all.filter(x => brandOf(x.id) === brand).length,
        headline: nameless ? hl || c.name : hl, ch: (a?.wa ? "whatsapp" : "messenger") as "whatsapp" | "messenger", leads: c.leads,
        segs: c.segs2.length ? c.segs2 : T3.map(t => ({ color: t.color, pct: 1, op: 1, label: t.name, pctS: "" })), set: c.set && !nameless, sel: ui.ad === a?.id, open: c.open }; }),
  };
  // Ads to teams' "+" (2026-10-22, the owner: "director 能提前先把广告加进来先做分配"): Meta's ads to pick from, or a typed id.
  const addList = ui.addAdList, q = ui.addAdQ.trim().toLowerCase();
  const have = new Set(adIds);
  const pickAd = (r: { id: string; name: string; status: string; start: string | null; end: string | null; page?: string | null; pageName?: string | null }) =>
    void ctx.act.addAd(r).then(ok => { if (ok) { patch({ addAdOpen: false, addAdId: "" }); as.openAdById(r.id); } });
  const addAd = {
    open: ui.addAdOpen, canAdd: !!data.can.manage,
    show: () => { patch({ addAdOpen: true, addAdQ: "", addAdId: "" }); if (!ui.addAdList || ui.addAdList === "error") void ctx.act.metaAds(false).then(r => patch({ addAdList: r ?? "error" })); },
    close: () => patch({ addAdOpen: false }),
    q: ui.addAdQ, onQ: (e: { target: { value: string } }) => patch({ addAdQ: e.target.value }),
    loading: addList === null, failed: addList === "error",
    rows: (Array.isArray(addList) ? addList : []).filter(r => !q || r.name.toLowerCase().includes(q) || r.id.includes(q) || r.account.toLowerCase().includes(q)).slice(0, 80)
      .map(r => ({ id: r.id, name: r.name, account: r.account, run: adRunLine({ status: r.status, startAt: r.start, endAt: r.end }, now) || r.status, have: have.has(r.id), pick: () => pickAd(r) })),
    typed: ui.addAdId, onTyped: (e: { target: { value: string } }) => patch({ addAdId: e.target.value.replace(/\D/g, "").slice(0, 32) }),
    addTyped: () => { const id = ui.addAdId; if (!/^\d{5,32}$/.test(id)) return; const known = Array.isArray(addList) ? addList.find(r => r.id === id) : undefined; pickAd(known ?? { id, name: "", status: "", start: null, end: null }); },
  };
  // Assignment › Leads by ad (2026-10-22): each ad, who got how many of its leads (vm/leads-by-ad.ts).
  const lbaPer = ui.lbaPer ?? "month";
  const stOf = new Map(chatRows(ctx).map(r => [r.id, ["Overdue", "Urgent", "Reply soon"].includes(r.key) ? "Attention" : r.key === "Cold" ? "Cold leads" : r.key]));
  const leadsByAdV = {
    periods: ([["month", "This month"], ["all", "All time"]] as const).map(([k, label]) => ({ label, on: lbaPer === k, pick: () => patch({ lbaPer: k }) })),
    // An ad's card folds to its head; a person opens to the leads they got — status as Contacts says it, a tap opens the chat
    // (2026-10-23, the owner: "点成员名单要可以看到他们得到的 list", "这些名单做可收缩及展开的功能").
    ads: leadsByAd(data.customers, adIds, id => adOf(id).label, id => ctx.nameOf(id), id => teamNameOf(ctx, id), lbaPer, now).map(a => ({ ...a,
      shut: !!ui.lbaShut[a.id], fold: () => set(u => ({ ...u, lbaShut: { ...u.lbaShut, [a.id]: !u.lbaShut[a.id] } })),
      rows: a.rows.map(r => { const k = `${a.id}|${r.who}`, open = !!ui.lbaOpen[k];
        return { ...r, open, toggle: () => set(u => ({ ...u, lbaOpen: { ...u.lbaOpen, [k]: !u.lbaOpen[k] } })),
          leads: r.leads.map(l => { const st = STATUS[(stOf.get(l.id) ?? "") as StatusName];
            return { ...l, when: new Date(l.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), status: stOf.get(l.id) ?? "", stBg: st?.tint ?? "var(--crm-field)", stFg: st?.text ?? "var(--crm-muted)", stDot: st?.dot ?? null,
              open: () => patch({ tab: "inbox", ibListW: null, ibInfoW: null, ibCpW: null, ibCp: null, pane: "docked", kind: "chat", chat: l.id, fromTeam: false, inbF: "All", whoSel: [] }) }; }) }; }) })),
  };
  return {
    leadsByAd: leadsByAdV,
    addAd,
    adList4,
    saveOne4: as.saveAd, saveAll4: as.applyAll,
    adList: frame.isAdsOp, adGrid: false, adOverview: !as.adOpen, adNone: frame.isAdsOp && inSheet && !as.adOpen, adNoneW: frame.sheetW + 304,
    listMin: frame.isAdsOp ? 240 : 0, splitFlex: `0 1 ${frame.sheetW}px`,
    attn, hasAttn: attn.length > 0, adByTeam2, adLeadsTotal: totL,
    adTeams,
    applyChk: ui.applyChk, toggleApplyChk: () => patch({ applyChk: !ui.applyChk }), applyChkLabel: `Also apply to all ${shownN || ads.length}${noun} ads`,
    saveOrApply: () => (ui.applyChk ? as.applyAll : as.saveAd)(),
    adSum: { rows: adSumRows }, adFunnel, adCosts,
    adPerLabel: per[0] === "Custom" ? per[1] : per[0], adPerOpen: ui.adPerOpen, adPerBg: ui.adPerOpen ? "var(--crm-tint-attention)" : "#fff",
    adPerToggle: () => patch({ adPerOpen: !ui.adPerOpen, adCal: false }),
    adPerOpts: PER.map(([label, range]) => { const on = label === per[0]; return { label, range, bg: on ? "var(--crm-cream)" : "transparent", w: on ? 650 : 500,
      pick: () => (label === "Custom" ? patch({ adCal: true, adCustT: { ...cu, step: 0 } }) : patch({ adPer: label, adPerOpen: false, adCal: false })) }; }),
    adCalOpen: ui.adCal, adCalList: !ui.adCal, adCalHint: t0.step === 1 ? "Now pick the end date" : "Pick the start date", adCalLabel: calLbl(t0),
    adCalBack: () => patch({ adCal: false }), adCalApply: () => patch({ adCust: { a: t0.a, b: t0.b }, adPer: "Custom", adCal: false, adPerOpen: false }), adCalDays,
    openAdsPerf: () => patch({ tab: "adsperf", pane: "closed", ad: null, adLog: false, toast: "" }),
    // Ad performance and the Audit log are panels of their own beside Split, each folding to its strip (the owner,
    // 2026-10-18: "ads performance, audit log 分开"); both start folded so the split keeps its room.
    perfShut, perfFold: () => patch({ adPerfShut: true }),
    // Split folds to its strip too (2026-10-22, the owner: "做可收缩式").
    splitShut: !!ui.adSplitShut, splitFold: () => patch({ adSplitShut: true }), splitRail: { title: "Split", open: () => patch({ adSplitShut: false }) },
    perfRail: { title: "Ad performance", open: () => patch({ adPerfShut: false, ...(dock ? {} : { adLog: false }) }) },
    adLogOpen: logOpen, adLogClosed: !logOpen, adLogToggle: () => patch({ adLog: !logOpen }), adLog: adL.rows, adLogRail: adL.rail, adLogStyle,
    mwtLogOpen: mwtOpen, mwtLogClosed: mwtShow && !mwtOpen, mwtLogW: ui.mwtLogW ?? 280, mwtLogToggle: () => patch({ mwtLog: !ui.mwtLog }), mwtLog: mwtL.rows, mwtLogRail: mwtL.rail,
    ftSame, ftApplyDis: !ftSame, ftApplyOn, ftApplyFg: ftSame ? "var(--crm-ink)" : "var(--crm-faint)", ftApplyCur: ftSame ? "pointer" : "not-allowed", ftApplyTip: ftSame ? "" : "Everyone in this team needs the same days",
    toggleFtApplyChk: () => { if (ftSame) patch({ ftApplyChk: !ui.ftApplyChk }); }, ftSaveOrApply: () => (ftApplyOn ? as.ftApplyAll : as.ftSave)(),
    ftNone: frame.isFtOp && inSheet && !as.ftOpen,
    ftCards: as.ftCards.map(c => ({ ...c, rowBg: ui.ftEdit && as.ftE.name === c.name ? "var(--crm-cream)" : "#fff", stFg: c.state === "On" ? "var(--crm-brown)" : "var(--crm-faint)" })),
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
