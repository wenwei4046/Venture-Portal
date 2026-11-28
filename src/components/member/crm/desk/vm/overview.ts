/**
 * Insight › Overview on the desktop (the owner, 2026-11-17: "我想在 insight 加 Overview，主要是整合 ads performance + team
 * performance"): Insight's first tab. The figures are shared/insight-overview.ts's; this binds them to the desk — the
 * brand picked at the top (`insSrc`, inBrand), Insight's period, Ads Performance's Meta cache (`apMeta`, asked for through
 * `ovNeed` by DeskScreens) — and to what a click does: a team opens to its people in place, a person opens their team's
 * overlay on them, an ad opens to the teams its leads went to, and each part's "›" opens its own Insight tab.
 */
import { readsAds, withoutHiddenAds } from "@/lib/member/crm-data";
import type { SourcePick } from "@/lib/member/crm-source";
import { pickedSource } from "@/lib/member/crm-view";
import { colValue, colsFor, keptCols, mins, overviewFigures, overviewTiles, pctOf, rm, rm2, type OvColKey } from "../../shared/insight-overview";
import { FEE_PREF, feeFixedOf } from "./adsperf";
import type { DeskCtx } from "./ctx";
import { AD_APPTS, AD_LEADS, AD_NOREPLY, AD_REPLIED, AD_WON, compareRange, compareWords, inBrand, insightRange } from "./insight";
import { rangeLine } from "./frame4a";
import { DIRECTOR_C, DIRECTOR_TEAM, teamColours } from "./tokens";

export function deskOverviewVM(ctx: DeskCtx) {
  const { ui, patch } = ctx;
  const data = inBrand(withoutHiddenAds(ctx.data), ui.insSrc as SourcePick | undefined);
  const { r } = insightRange(ctx), prev = compareRange(ui, r), money = readsAds(ctx.data.can);
  const f = overviewFigures({ data, r, prev, now: ctx.now, teams: ctx.teams, directors: ctx.directors, directorTeam: DIRECTOR_TEAM,
    src: pickedSource(ctx.data, ui.insSrc as SourcePick | undefined), meta: ui.apMeta, money, fee: feeFixedOf(ctx.data.uiPrefs) });
  const dotOf = (key: string) => { if (key === DIRECTOR_TEAM) return DIRECTOR_C[0]; const k = ctx.teams.findIndex(t => t.id === key); return k < 0 ? "var(--crm-faint-2)" : teamColours(k)[0]; };
  const maxLeads = Math.max(1, ...f.teams.map(t => t.leads));
  // The tables keep every column they have; "+" adds more, each with × (the owner, 2026-11-17: "目前有的这些可以保留，此外是 +
  // 数据，不是替换"). Kept per person on the server (crm_save_ui_pref "ovCols": { ads: [...], team: [...] }), as Ads
  // Performance keeps its figures; a single pick kept before reads as one added column.
  const keptRaw = ctx.data.uiPrefs?.ovCols as { ads?: unknown; team?: unknown } | undefined;
  const colsOf = (table: "ads" | "team"): OvColKey[] => {
    const offered = colsFor(table, money).map(c => c.key);
    return keptCols((table === "ads" ? ui.insOvAdCols : ui.insOvTeamCols) ?? keptRaw?.[table]).filter(k => offered.includes(k));
  };
  const colSet = (table: "ads" | "team") => {
    const on = colsOf(table), offered = colsFor(table, money);
    const keep = (next: OvColKey[]) => {
      patch(table === "ads" ? { insOvAdCols: next, insOvColMenu: null } : { insOvTeamCols: next, insOvColMenu: null });
      ctx.deskAct?.saveUiPref?.("ovCols", { ads: table === "ads" ? next : colsOf("ads"), team: table === "team" ? next : colsOf("team") });
    };
    return {
      keys: on,
      cols: on.map(k => ({ key: k, label: offered.find(c => c.key === k)!.label, remove: () => keep(on.filter(x => x !== k)) })),
      open: ui.insOvColMenu === table,
      toggle: () => patch({ insOvColMenu: ui.insOvColMenu === table ? null : table }),
      close: () => patch({ insOvColMenu: null }),
      options: offered.filter(c => !on.includes(c.key)).map(c => ({ label: c.label, group: c.group, pick: () => keep([...on, c.key]) })),
    };
  };
  const adCol = colSet("ads"), teamCol = colSet("team");
  const cells = (keys: OvColKey[], x: Parameters<typeof colValue>[1]) => keys.map(k => colValue(k, x));
  return {
    money,
    // The viewer's own marketing fee a brand a month, typed beside the brand pills (feeFixedOf; 2026-11-27).
    fee: { value: feeFixedOf(ctx.data.uiPrefs), save: (n: number) => ctx.deskAct?.saveUiPref?.(FEE_PREF, n) },
    // What every tile's change is against: "vs Oct", "vs last week", "vs 1–17 Oct" (Custom's Compare with).
    vs: compareWords(ui, prev),
    ready: f.ads.ready,
    tiles: overviewTiles(f, money, `vs ${rangeLine(prev)}`),
    adCol, teamCol,
    brands: f.brands.map(b => ({ label: b.label, spend: rm(b.spend), leads: String(b.leads), cpl: rm2(b.cpl), appt: String(b.appt), won: String(b.won), extra: cells(adCol.keys, b) })),
    ads: f.adRows.slice(0, ui.insOvAllAds ? undefined : 8).map(a => {
      const open = ui.insOvAd === a.id, split = f.adTeams.find(x => x.id === a.id);
      return { id: a.id, name: a.name, brand: a.brand, spend: a.paid ? rm(a.spend) : "—", leads: String(a.leads), cpl: a.paid ? rm2(a.cpl) : "—", appt: String(a.appt), won: String(a.won),
        extra: cells(adCol.keys, a.paid ? a : { ...a, cost: null }),
        open, canOpen: !!split?.teams.length, toggle: () => patch({ insOvAd: open ? null : a.id }),
        // Its Leads and Appt open their customers (the owner, 2026-11-27: "overview 也要"), as Ads Performance's.
        openLeads: a.leadIds.length ? () => patch({ pane: "overlay", kind: "clist", clist: `${AD_LEADS}${a.name}`, clistIds: a.leadIds, clistSub: null, clRep: null, infoId: null, visit: null }) : undefined,
        // After our template: replied (cyan) and no reply (yellow), each opening its customers (2026-11-28).
        replied: a.repliedIds, noReply: a.noReplyIds, tplAppt: a.tplApptIds, tplWon: a.tplWonIds,
        openTplWon: a.tplWonIds.length ? () => patch({ pane: "overlay", kind: "clist", clist: `${AD_WON}${a.name}`, clistIds: a.tplWonIds, clistSub: null, clRep: null, infoId: null, visit: null }) : undefined,
        openTplAppt: a.tplApptIds.length ? () => patch({ pane: "overlay", kind: "clist", clist: `${AD_APPTS}${a.name}`, clistIds: a.tplApptIds, clistSub: null, clRep: null, infoId: null, visit: null }) : undefined,
        openReplied: a.repliedIds.length ? () => patch({ pane: "overlay", kind: "clist", clist: `${AD_REPLIED}${a.name}`, clistIds: a.repliedIds, clistSub: null, clRep: null, infoId: null, visit: null }) : undefined,
        openNoReply: a.noReplyIds.length ? () => patch({ pane: "overlay", kind: "clist", clist: `${AD_NOREPLY}${a.name}`, clistIds: a.noReplyIds, clistSub: null, clRep: null, infoId: null, visit: null }) : undefined,
        openAppts: a.apptIds.length ? () => patch({ pane: "overlay", kind: "clist", clist: `${AD_APPTS}${a.name}`, clistIds: a.apptIds, clistSub: null, clRep: null, infoId: null, visit: null }) : undefined,
        teams: open && split ? split.teams.map(t => ({ name: t.name, dot: t.key ? dotOf(t.key) : "var(--crm-faint-2)", leads: String(t.leads), share: a.leads ? `${Math.round((t.leads / a.leads) * 100)}%` : "—", appt: String(t.booked), won: String(t.won),
          extra: cells(adCol.keys, { ...t, cost: null, fig: null }) })) : [] };
    }),
    adsMore: f.adRows.length > 8 ? { label: ui.insOvAllAds ? "Show fewer" : `Show all ${f.adRows.length} ads`, toggle: () => patch({ insOvAllAds: !ui.insOvAllAds }) } : null,
    teams: f.teams.flatMap(t => {
      const open = ui.insOvTeam === t.key && t.people.length > 0;
      const row = (x: typeof t | (typeof t.people)[number], person: boolean) => ({ name: x.name, person, leads: String(x.leads), leadsW: `${Math.round((x.leads / maxLeads) * 100)}%`,
        reply: mins(x.avgReply), appt: pctOf(x.apptRate), show: pctOf(x.showRate), won: String(x.won), extra: cells(teamCol.keys, x) });
      return [
        { ...row(t, false), key: t.key, dot: t.key ? dotOf(t.key) : "var(--crm-faint-2)", open, canOpen: t.people.length > 0, pick: () => (t.people.length ? patch({ insOvTeam: open ? null : t.key }) : undefined) },
        ...(open ? t.people.map(x => ({ ...row(x, true), key: `${t.key}:${x.id}`, dot: "transparent", open: false, canOpen: true, pick: () => patch({ pane: "overlay", kind: "team", team: t.key, person: x.id }) })) : []),
      ];
    }),
    goAds: () => patch({ insTab: "ads" }),
    goTeam: () => patch({ insTab: "team" }),
    /** Meta's figures still to read, for DeskScreens (only while Overview is on screen). */
    need: f.need,
  };
}
export type DeskOverview = ReturnType<typeof deskOverviewVM>;
