/**
 * Insight › Overview on the desktop (the owner, 2026-11-17: "我想在 insight 加 Overview，主要是整合 ads performance + team
 * performance"): Insight's first tab. The figures are shared/insight-overview.ts's; this binds them to the desk — the
 * brand picked at the top (`insSrc`, inBrand), Insight's period, Ads Performance's Meta cache (`apMeta`, asked for through
 * `ovNeed` by DeskScreens) — and to what a click does: a team opens to its people in place, a person opens their team's
 * overlay on them, an ad opens to the teams its leads went to, and each part's "›" opens its own Insight tab.
 */
import { readsAds, withoutHiddenAds } from "@/lib/member/crm-data";
import type { SourcePick } from "@/lib/member/crm-source";
import { colValue, colsFor, mins, overviewFigures, overviewTiles, pctOf, rm, rm2, type OvColKey } from "../../shared/insight-overview";
import type { DeskCtx } from "./ctx";
import { compareRange, compareWords, inBrand, insightRange } from "./insight";
import { rangeLine } from "./frame4a";
import { DIRECTOR_C, DIRECTOR_TEAM, teamColours } from "./tokens";

export function deskOverviewVM(ctx: DeskCtx) {
  const { ui, patch } = ctx;
  const data = inBrand(withoutHiddenAds(ctx.data), ui.insSrc as SourcePick | undefined);
  const { r } = insightRange(ctx), prev = compareRange(ui, r), money = readsAds(ctx.data.can);
  const f = overviewFigures({ data, r, prev, now: ctx.now, teams: ctx.teams, directors: ctx.directors, directorTeam: DIRECTOR_TEAM,
    src: ui.insSrc as SourcePick | undefined, meta: ui.apMeta, money });
  const dotOf = (key: string) => { if (key === DIRECTOR_TEAM) return DIRECTOR_C[0]; const k = ctx.teams.findIndex(t => t.id === key); return k < 0 ? "var(--crm-faint-2)" : teamColours(k)[0]; };
  const maxLeads = Math.max(1, ...f.teams.map(t => t.leads));
  // Each table's last column is picked from a list (the owner, 2026-11-17: "一个可选的 metric column"); Sales at first.
  const colMenu = (table: "ads" | "team") => {
    const list = colsFor(table, money), want: OvColKey = (table === "ads" ? ui.insOvAdCol : ui.insOvTeamCol) ?? "sales";
    const on = list.find(c => c.key === want) ?? list[0];
    return {
      key: on.key, label: on.label, open: ui.insOvColMenu === table,
      toggle: () => patch({ insOvColMenu: ui.insOvColMenu === table ? null : table }),
      close: () => patch({ insOvColMenu: null }),
      options: list.map(c => ({ label: c.label, on: c.key === on.key, pick: () => patch(table === "ads" ? { insOvAdCol: c.key, insOvColMenu: null } : { insOvTeamCol: c.key, insOvColMenu: null }) })),
    };
  };
  const adCol = colMenu("ads"), teamCol = colMenu("team");
  return {
    money,
    // What every tile's change is against: "vs Oct", "vs last week", "vs 1–17 Oct" (Custom's Compare with).
    vs: compareWords(ui, prev),
    ready: f.ads.ready,
    tiles: overviewTiles(f, money, `vs ${rangeLine(prev)}`),
    adCol, teamCol,
    brands: f.brands.map(b => ({ label: b.label, spend: rm(b.spend), leads: String(b.leads), cpl: rm2(b.cpl), appt: String(b.appt), won: String(b.won), extra: colValue(adCol.key, b) })),
    ads: f.adRows.slice(0, ui.insOvAllAds ? undefined : 8).map(a => {
      const open = ui.insOvAd === a.id, split = f.adTeams.find(x => x.id === a.id);
      return { id: a.id, name: a.name, brand: a.brand, spend: a.paid ? rm(a.spend) : "—", leads: String(a.leads), cpl: a.paid ? rm2(a.cpl) : "—", appt: String(a.appt), won: String(a.won),
        extra: colValue(adCol.key, a.paid ? a : { ...a, cost: null }),
        open, canOpen: !!split?.teams.length, toggle: () => patch({ insOvAd: open ? null : a.id }),
        teams: open && split ? split.teams.map(t => ({ name: t.name, dot: t.key ? dotOf(t.key) : "var(--crm-faint-2)", leads: String(t.leads), share: a.leads ? `${Math.round((t.leads / a.leads) * 100)}%` : "—", appt: String(t.booked), won: String(t.won),
          extra: colValue(adCol.key, { ...t, cost: null }) })) : [] };
    }),
    adsMore: f.adRows.length > 8 ? { label: ui.insOvAllAds ? "Show fewer" : `Show all ${f.adRows.length} ads`, toggle: () => patch({ insOvAllAds: !ui.insOvAllAds }) } : null,
    teams: f.teams.flatMap(t => {
      const open = ui.insOvTeam === t.key && t.people.length > 0;
      const row = (x: typeof t | (typeof t.people)[number], person: boolean) => ({ name: x.name, person, leads: String(x.leads), leadsW: `${Math.round((x.leads / maxLeads) * 100)}%`,
        reply: mins(x.avgReply), appt: pctOf(x.apptRate), show: pctOf(x.showRate), won: String(x.won), extra: colValue(teamCol.key, x) });
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
