"use client";
/**
 * Insight › Overview on the phone (the owner, 2026-11-17: "我想在 insight 加 Overview，主要是整合 ads performance + team
 * performance"; both screens): under Insight's head and its period row, the brand (All · The Conts · Dream Crafter — the
 * phone's Insight has no brand switch of its own, so the Overview carries one, as the desktop's top), the figures as a
 * 2-column hero (the ads' money, then the team's work, each against the period before), the ads by brand and ad by ad
 * (an ad opens to the teams its leads went to) and the teams (a team opens to its people). The figures are
 * shared/insight-overview.ts's, the same as the desktop's; Meta's spend is read on the server (CRM · Manage) as the
 * phone's Ads performance reads it, and kept on the phone for the next open.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { fetchAdInsights } from "@/app/(member)/member/crm-actions";
import type { MetaFig } from "@/lib/member/crm-ad-names-meta";
import { withoutHiddenAds, type CrmData } from "@/lib/member/crm-data";
import { inSource, type SourcePick } from "@/lib/member/crm-source";
import { Ic } from "./icons4a";
import { PHONE_TYPE, typePx } from "./type";
import { mins, overviewFigures, overviewTiles, pctOf, rm, rm2, type OvRange, type OvTeamIn } from "./insight-overview";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", padding: 0, margin: 0, boxSizing: "border-box" };
const NUM = (bold: boolean): CSSProperties => ({ textAlign: "right", fontWeight: bold ? 500 : 400, whiteSpace: "nowrap" });
const BRANDS: [SourcePick, string][] = [["all", "All"], ["conts", "The Conts"], ["dc", "Dream Crafter"]];
const KEPT = "crm-ov-meta";
/** The phone's type, as phone4a.tsx's `fs` (not imported: phone4a.tsx mounts this file). */
const fs = (px: number) => typePx(Math.round((px / PHONE_TYPE) * 100) / 100);

export interface PhoneOverviewProps {
  data: CrmData; r: OvRange; prev: OvRange; now: Date;
  teams: (OvTeamIn & { c?: string })[]; directors: { id: string; name: string }[]; directorTeam: string; directorColour: string;
  live: boolean; money: boolean;
  openAds?: () => void; openTeam?: () => void;
}

function kept(): Record<string, Record<string, MetaFig | null>> { try { return JSON.parse(localStorage.getItem(KEPT) || "{}"); } catch { return {}; } }
function keep(v: Record<string, Record<string, MetaFig | null>>) {
  try { const ks = Object.keys(v); const out = Object.fromEntries(ks.slice(Math.max(0, ks.length - 16)).map(k => [k, v[k]])); localStorage.setItem(KEPT, JSON.stringify(out)); } catch { /* storage off */ }
}

export function PhoneOverview(p: PhoneOverviewProps) {
  const [src, setSrc] = useState<SourcePick>("all");
  const [openTeam, setOpenTeam] = useState<string | null>(null), [openAd, setOpenAd] = useState<string | null>(null), [allAds, setAllAds] = useState(false);
  const [meta, setMeta] = useState<Record<string, Record<string, MetaFig | null>>>(() => (p.live ? kept() : {}));
  const data = useMemo(() => { const d = withoutHiddenAds(p.data); return src === "all" ? d : { ...d, customers: d.customers.filter(c => inSource(c, src)) }; }, [p.data, src]);
  const f = overviewFigures({ data, r: p.r, prev: p.prev, now: p.now, teams: p.teams, directors: p.directors, directorTeam: p.directorTeam, src, meta, money: p.money && p.live });
  const needKey = JSON.stringify(f.need);
  useEffect(() => {
    if (!p.live || !p.money || !f.need.length) return;
    let on = true;
    for (const n of f.need) void fetchAdInsights(n.ids, n.since, n.until).then(x => {
      if (!on) return;
      const figs = x.ok ? x.figs : Object.fromEntries(n.ids.map(id => [id, null]));
      setMeta(m => { const v = { ...m, [n.key]: { ...(m[n.key] ?? {}), ...figs } }; keep(v); return v; });
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.live, p.money, needKey]);

  const money = p.money;
  const tiles = overviewTiles(f, money);
  const colourOf = (key: string) => (key === p.directorTeam ? p.directorColour : p.teams.find(t => t.id === key)?.c ?? "var(--crm-faint-2)");
  const ads = allAds ? f.adRows : f.adRows.slice(0, 5);
  const ACOLS = money ? "minmax(0,1fr) 62px 40px 66px" : "minmax(0,1fr) 44px 44px 44px";
  const TCOLS = "minmax(0,1fr) 40px 58px 44px 36px";
  const head = (title: string, go?: () => void, goLabel?: string) => (
    <div style={{ display: "flex", alignItems: "baseline", paddingBottom: "8px", borderBottom: "1px solid var(--crm-rule)" }}>
      <h2 style={{ margin: 0, fontFamily: TIGHT, fontSize: fs(17), fontWeight: 500 }}>{title}</h2>
      {go && <button type="button" onClick={go} style={{ ...BTN, marginLeft: "auto", fontSize: fs(12), fontWeight: 500, color: "var(--crm-rust)" }}>{goLabel} ›</button>}
    </div>
  );
  const cols = (c: string, labels: string[]) => (
    <div style={{ display: "grid", gridTemplateColumns: c, columnGap: "6px", padding: "8px 0 6px", fontSize: fs(11), fontWeight: 500, color: "var(--crm-muted)" }}>
      {labels.map((l, i) => <span key={l} style={{ textAlign: i ? "right" : "left" }}>{l}</span>)}
    </div>
  );
  return (<>
    <div role="group" aria-label="Brand" data-ov-brand="" style={{ flex: "none", display: "flex", padding: "3px", borderRadius: "18px", background: "var(--crm-field)" }}>
      {BRANDS.map(([k, label]) => <button key={k} type="button" onClick={() => setSrc(k)} aria-pressed={src === k} style={{ ...BTN, flex: 1, height: "30px", borderRadius: "15px", fontSize: fs(12), fontWeight: src === k ? 600 : 500,
        background: src === k ? "#fff" : "transparent", boxShadow: src === k ? "0 1px 2px #2A160C1F" : "none", color: src === k ? "var(--crm-ink)" : "var(--crm-muted)" }}>{label}</button>)}
    </div>
    <div data-ov-sum="" style={{ flex: "none", display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: "12px", padding: "14px 0", borderRadius: "16px", background: "var(--crm-rust)", color: "#fff" }}>
      {tiles.map((m, i) => (
        <div key={m.label} style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0, padding: "0 16px", borderLeft: i % 2 ? "1px solid rgba(255,255,255,.22)" : "1px solid transparent" }}>
          <span style={{ fontSize: fs(12), fontWeight: 500, color: "var(--crm-hero-label)", whiteSpace: "nowrap" }}>{m.label}</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0, whiteSpace: "nowrap" }}>
            <span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(m.value.length > 9 ? 18 : 22), letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{m.value}</span>
            {m.d !== "—" && <span style={{ fontSize: fs(11), fontWeight: 500, color: m.good ? "var(--crm-delta-good)" : "var(--crm-delta-bad)", overflow: "hidden", textOverflow: "ellipsis" }}>{m.d}</span>}
          </span>
          {m.sub && <span style={{ fontSize: fs(11), color: "var(--crm-hero-label)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.sub}</span>}
        </div>
      ))}
    </div>

    <section data-ov-ads="" style={{ flex: "none", display: "flex", flexDirection: "column" }}>
      {head("Ads", p.openAds, "Ads performance")}
      {f.brands.length > 1 && (<>
        {cols(ACOLS, money ? ["Brand", "Spend", "Leads", "Per lead"] : ["Brand", "Leads", "Appt", "Won"])}
        {f.brands.map(b => (
          <div key={b.key} style={{ display: "grid", gridTemplateColumns: ACOLS, columnGap: "6px", alignItems: "center", minHeight: "40px", fontSize: fs(13), fontVariantNumeric: "tabular-nums", borderBottom: "1px solid var(--crm-rule-soft)" }}>
            <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
            {money ? <><span style={NUM(false)}>{rm(b.spend)}</span><span style={NUM(true)}>{b.leads}</span><span style={NUM(false)}>{rm2(b.cpl)}</span></>
              : <><span style={NUM(true)}>{b.leads}</span><span style={NUM(false)}>{b.appt}</span><span style={NUM(false)}>{b.won}</span></>}
          </div>
        ))}
        <div style={{ height: "10px" }} />
      </>)}
      {cols(ACOLS, money ? ["Ad", "Spend", "Leads", "Per lead"] : ["Ad", "Leads", "Appt", "Won"])}
      {ads.map(a => {
        const split = f.adTeams.find(x => x.id === a.id), canOpen = !!split?.teams.length, open = openAd === a.id && canOpen;
        return (
          <div key={a.id} style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--crm-rule-soft)" }}>
            <div onClick={canOpen ? () => setOpenAd(open ? null : a.id) : undefined} role={canOpen ? "button" : undefined} aria-expanded={canOpen ? open : undefined}
              style={{ display: "grid", gridTemplateColumns: ACOLS, columnGap: "6px", alignItems: "center", minHeight: "48px", fontSize: fs(13), fontVariantNumeric: "tabular-nums", cursor: canOpen ? "pointer" : "default" }}>
              <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                  {a.brand && <span style={{ fontSize: fs(11), color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{a.brand}</span>}
                </span>
                {canOpen && <span style={{ flex: "none", display: "flex", color: "var(--crm-faint-2)", transform: `rotate(${open ? 90 : 0}deg)`, transition: "transform 150ms" }}><Ic name="chevron-right" size={12} /></span>}
              </span>
              {money ? <><span style={NUM(false)}>{a.paid ? rm(a.spend) : "—"}</span><span style={NUM(true)}>{a.leads}</span><span style={NUM(false)}>{a.paid ? rm2(a.cpl) : "—"}</span></>
                : <><span style={NUM(true)}>{a.leads}</span><span style={NUM(false)}>{a.appt}</span><span style={NUM(false)}>{a.won}</span></>}
            </div>
            {open && split!.teams.map(t => (
              <div key={t.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 44px 44px 44px", columnGap: "6px", alignItems: "center", minHeight: "36px", padding: "0 0 0 12px", fontSize: fs(12), fontVariantNumeric: "tabular-nums", color: "var(--crm-ink-soft)" }}>
                <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: t.key ? colourOf(t.key) : "var(--crm-faint-2)" }} />
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                </span>
                <span style={NUM(true)}>{t.leads}</span><span style={NUM(false)}>{t.booked} appt</span><span style={NUM(false)}>{t.won} won</span>
              </div>
            ))}
          </div>
        );
      })}
      {!f.adRows.length && <p style={{ margin: "12px 0 0", fontSize: fs(13), color: "var(--crm-muted)" }}>No ad brought a lead in this period.</p>}
      {f.adRows.length > 5 && <button type="button" onClick={() => setAllAds(!allAds)} style={{ ...BTN, alignSelf: "flex-start", padding: "10px 0 0", fontSize: fs(12), fontWeight: 500, color: "var(--crm-rust)" }}>{allAds ? "Show fewer" : `Show all ${f.adRows.length} ads`}</button>}
    </section>

    <section data-ov-team="" style={{ flex: "none", display: "flex", flexDirection: "column" }}>
      {head("Teams", p.openTeam, "Team performance")}
      {cols(TCOLS, ["Team", "Leads", "Reply", "Appt", "Won"])}
      {f.teams.map(t => {
        const canOpen = t.people.length > 0, open = canOpen && openTeam === t.key;
        return (
          <div key={t.key || "nobody"} style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--crm-rule-soft)" }}>
            <div onClick={canOpen ? () => setOpenTeam(open ? null : t.key) : undefined} role={canOpen ? "button" : undefined} aria-expanded={canOpen ? open : undefined}
              style={{ display: "grid", gridTemplateColumns: TCOLS, columnGap: "6px", alignItems: "center", minHeight: "48px", fontSize: fs(13), fontWeight: 500, fontVariantNumeric: "tabular-nums", cursor: canOpen ? "pointer" : "default" }}>
              <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ flex: "none", width: "9px", height: "9px", borderRadius: "50%", background: t.key ? colourOf(t.key) : "var(--crm-faint-2)" }} />
                <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                {canOpen && <span style={{ flex: "none", display: "flex", color: "var(--crm-faint-2)", transform: `rotate(${open ? 90 : 0}deg)`, transition: "transform 150ms" }}><Ic name="chevron-right" size={12} /></span>}
              </span>
              <span style={NUM(true)}>{t.leads}</span><span style={NUM(false)}>{mins(t.avgReply)}</span><span style={NUM(false)}>{pctOf(t.apptRate)}</span><span style={NUM(false)}>{t.won}</span>
            </div>
            {open && t.people.map(x => (
              <div key={x.id} style={{ display: "grid", gridTemplateColumns: TCOLS, columnGap: "6px", alignItems: "center", minHeight: "40px", padding: "0 0 0 17px", fontSize: fs(12), fontVariantNumeric: "tabular-nums", color: "var(--crm-ink-soft)" }}>
                <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</span>
                <span style={NUM(true)}>{x.leads}</span><span style={NUM(false)}>{mins(x.avgReply)}</span><span style={NUM(false)}>{pctOf(x.apptRate)}</span><span style={NUM(false)}>{x.won}</span>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  </>);
}
