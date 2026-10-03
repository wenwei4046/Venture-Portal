"use client";

import { useState } from "react";
import type { CrmLead } from "@/lib/member/crm";
import {
  DEFAULT_TEAM_SETTINGS, ROLE_LABELS, WEEKDAYS, allTeams, assignsAds, canEditTeamRules, ruleForAd, teamHandlers, visibleTeams,
  type CrmAssignConfig, type CrmMember, type CrmTeamSettings,
} from "@/lib/member/crm-team";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { Icon } from "./MemberUI";
import { roleTag } from "./MemberCrmTeam";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const sum = (values: number[]) => values.reduce((a, b) => a + Math.max(0, b), 0);
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short" });

/** An ad as the Assignment page lists it: from the enquiries it brought (and any rule already set). */
export interface CrmAdInfo {
  /** The Meta ad id. */
  id: string;
  name: string;
  /** WhatsApp / Messenger. */
  channel?: string;
  leads: number;
  /** When its first and latest enquiries arrived. */
  firstAt?: string;
  lastAt?: string;
}

/** Every ad that brought an enquiry, newest first, plus any ad with a rule and no enquiry yet. */
export function adsFromLeads(leads: CrmLead[], config: CrmAssignConfig): CrmAdInfo[] {
  const byId = new Map<string, CrmAdInfo>();
  for (const l of leads) {
    if (!l.campaign) continue;
    const ad = byId.get(l.campaign) ?? { id: l.campaign, name: l.adName, channel: l.pageName, leads: 0, firstAt: l.createdAt, lastAt: l.createdAt };
    ad.leads += 1;
    if (l.createdAt < (ad.firstAt ?? l.createdAt)) ad.firstAt = l.createdAt;
    if (l.createdAt > (ad.lastAt ?? "")) ad.lastAt = l.createdAt;
    byId.set(l.campaign, ad);
  }
  for (const r of config.rules) if (r.adId && !byId.has(r.adId)) byId.set(r.adId, { id: r.adId, name: r.adName, leads: 0 });
  return [...byId.values()].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

/** One line a Boss or HOD reads a team's rules by: "Mon Tue Wed Thu by % · Fri–Sun full time only". */
function rulesSummary(st: CrmTeamSettings): string {
  const days = st.percentDays.length === 4 ? "Mon–Thu by %" : st.percentDays.length ? `${st.percentDays.map(d => DAY_NAMES[d]).join(" ")} by %` : "Mon–Thu by hand";
  return `${days} · Fri–Sun ${st.weekendFullTime ? "full time only" : "by %"}`;
}

/**
 * Who gets a new enquiry (revised by the user 2026-10-03).
 *   Which team — the Principal (Boss) and HOD, ad by ad: hand it to one or more
 *   teams (evenly among them) or split it by %; saved with a Save. An ad not
 *   set yet, and an enquiry from no ad, goes evenly across every team.
 *   Who in the team — each TL: which Mon–Thu days go by %, and whether Fri–Sun
 *   is full time only. The Principal and HOD may change it too; the TL sees who did.
 */
export default function MemberCrmAssignment({ viewer, members, ads, config, onConfig, onSaveAd, waiting = [], onSendToTeam, onOpenLead, onBack, readOnly = false }: {
  viewer: CrmMember;
  members: CrmMember[];
  ads: CrmAdInfo[];
  config: CrmAssignConfig;
  /** A team's own rules changed (saved a moment later). */
  onConfig: (config: CrmAssignConfig) => void;
  /** Save which teams take an ad: tlIds evenly, or shares (TL → %, adding to 100). Resolves false when not saved. */
  onSaveAd?: (ad: CrmAdInfo, tlIds: string[], shares: Record<string, number> | null) => Promise<boolean>;
  /** Enquiries in no team (only when no team could take them), for the Principal / HOD to send. */
  waiting?: CrmLead[];
  onSendToTeam?: (leadId: string, tlId: string) => void;
  onOpenLead?: (leadId: string) => void;
  /** Opened from Settings: the way back. Absent when Assignment is a tab of its own (the Principal). */
  onBack?: () => void;
  readOnly?: boolean;
}) {
  const top = assignsAds(viewer);
  const topEdits = top && !readOnly;
  const ownTeam = viewer.role === "tl" ? viewer.id : null;
  const teams = visibleTeams(viewer, members);
  const tls = allTeams(members);
  const nameOf = (id: string | null) => members.find(m => m.id === id)?.name ?? "—";
  const teamName = (id: string | null) => members.find(m => m.id === id)?.teamName ?? nameOf(id);
  const [openTeam, setOpenTeam] = useState<string | null>(ownTeam);
  // The ad being decided: a draft until Save.
  const [draft, setDraft] = useState<{ adId: string; mode: "teams" | "percent"; tlIds: string[]; shares: Record<string, number> } | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (ad: CrmAdInfo) => {
    const rule = ruleForAd(config, ad.id);
    setDraft(rule?.shares
      ? { adId: ad.id, mode: "percent", tlIds: rule.tlIds, shares: { ...rule.shares } }
      : { adId: ad.id, mode: "teams", tlIds: rule?.tlIds ?? [], shares: {} });
  };
  /** Who takes an ad's enquiries now: each team, with its % when split. */
  const adSummary = (ad: CrmAdInfo): { kind: "percent" | "teams" | "even"; parts: { id: string; name: string; pct?: number }[] } => {
    const rule = ruleForAd(config, ad.id);
    const live = (ids: string[]) => ids.filter(id => tls.some(x => x.id === id));
    if (rule?.shares) {
      const parts = Object.entries(rule.shares).filter(([id, n]) => n > 0 && live([id]).length);
      if (parts.length) return { kind: "percent", parts: parts.map(([id, n]) => ({ id, name: teamName(id), pct: n })) };
    }
    if (rule && live(rule.tlIds).length) return { kind: "teams", parts: live(rule.tlIds).map(id => ({ id, name: teamName(id) })) };
    return { kind: "even", parts: [] };
  };
  const draftTotal = draft ? sum(Object.values(draft.shares)) : 0;
  const draftOk = !!draft && (draft.mode === "teams" || draftTotal === 100);
  const save = async (ad: CrmAdInfo) => {
    if (!draft || !onSaveAd || !draftOk) return;
    setSaving(true);
    const shares = draft.mode === "percent" ? Object.fromEntries(Object.entries(draft.shares).filter(([, n]) => n > 0)) : null;
    const tlIds = shares ? Object.keys(shares) : draft.tlIds;
    const ok = await onSaveAd(ad, tlIds, shares);
    setSaving(false);
    if (ok) setDraft(null);
  };
  const settingsOf = (tlId: string): CrmTeamSettings => config.teams[tlId] ?? DEFAULT_TEAM_SETTINGS;
  const setTeam = (tlId: string, change: Partial<CrmTeamSettings>) => onConfig({
    ...config,
    teams: { ...config.teams, [tlId]: { ...settingsOf(tlId), ...change, editedBy: { memberId: viewer.id, at: new Date().toISOString() } } },
  });
  const percent = (value: number, onChange: (n: number) => void, label: string, disabled: boolean) => <>
    <input className={c.shareInput} type="number" inputMode="numeric" min={0} max={100} step={1} value={value} disabled={disabled} aria-label={`${label} (%)`}
      onChange={e => onChange(Math.min(100, Math.max(0, Math.floor(Number(e.target.value) || 0))))} />
    <small>%</small>
  </>;
  const totalLine = (total: number) => <p className={c.percentTotal} data-off={total !== 100 || undefined}>
    Total {total}%{total !== 100 && ` — should add up to 100% (${total < 100 ? `${100 - total}% left` : `${total - 100}% too much`})`}
  </p>;

  /** A team's own rules: the days, the weekend switch, each person's %. */
  const teamRules = (t: CrmMember) => {
    const st = settingsOf(t.id);
    const canEdit = !readOnly && canEditTeamRules(viewer, t.id);
    const handlers = teamHandlers(t.id, members);
    const fullTime = handlers.filter(m => m.role === "rs" && m.fullTime);
    const total = sum(handlers.map(m => st.ratios[m.id] ?? 0));
    const percentUnused = st.percentDays.length === 0 && st.weekendFullTime;
    const editor = st.editedBy && members.find(m => m.id === st.editedBy!.memberId);
    const tlFirst = t.name.split(" ")[0];
    return <>
      <div className={c.ruleBlock}>
        <div className={c.ruleHead}><strong>Monday – Thursday</strong><span className={s.caption}>Tick the days that go by %</span></div>
        <div className={`${c.dayChips} ${c.dayRow}`} role="group" aria-label="Days by %">
          {WEEKDAYS.map(d => {
            const on = st.percentDays.includes(d);
            return <button key={d} className={c.dayChip} aria-pressed={on} disabled={!canEdit}
              onClick={() => setTeam(t.id, { percentDays: on ? st.percentDays.filter(x => x !== d) : [...st.percentDays, d].sort() })}>
              {on && <Icon name="check" size={14} />}{DAY_NAMES[d]}
            </button>;
          })}
        </div>
        <p className={s.caption}>{st.percentDays.length === 4 ? "Every weekday goes by each person's %."
          : st.percentDays.length === 0 ? `No day ticked — every weekday enquiry waits in ${tlFirst}'s To assign list.`
            : `Unticked days wait in ${tlFirst}'s To assign list.`}</p>
      </div>

      <div className={c.ruleBlock}>
        <label className={c.ruleHead}>
          <strong>Friday – Sunday: full time only</strong>
          <span className={c.toggle}>
            <input type="checkbox" role="switch" checked={st.weekendFullTime} disabled={!canEdit} onChange={e => setTeam(t.id, { weekendFullTime: e.target.checked })} />
            <span aria-hidden="true" />
          </span>
        </label>
        <p className={s.caption}>{st.weekendFullTime
          ? fullTime.length ? `Only full-time RS, in turn: ${fullTime.map(m => m.name.split(" ")[0]).join(", ")}.` : "No full-time RS in this team — weekend enquiries wait for the TL."
          : "Off — weekends go by each person's %, like a ticked weekday."}</p>
      </div>

      <div className={c.ruleBlock}>
        <div className={c.ruleHead}><strong>Each person&apos;s %</strong><span className={s.caption}>Full time or not</span></div>
        {percentUnused && <p className={s.caption}>Not used right now — tick a weekday, or turn the weekend switch off.</p>}
        {handlers.map(m => <div key={m.id} className={c.shareRow}>
          <span>{m.name} <small className={s.caption}>· {roleTag(m)}</small></span>
          {percent(st.ratios[m.id] ?? 0, n => setTeam(t.id, { ratios: { ...st.ratios, [m.id]: n } }), `${m.name} share`, !canEdit)}
        </div>)}
        {canEdit && (total === 0 ? <p className={c.composerProblem}>Nobody has a % yet.</p> : totalLine(total))}
      </div>

      {editor && editor.id !== t.id && <p className={c.editedBy}>
        <Icon name="info" size={14} /> Last changed by {editor.id === viewer.id ? "you" : editor.name} ({ROLE_LABELS[editor.role]}) · {new Date(st.editedBy!.at).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
      </p>}
    </>;
  };

  const subtitle = ownTeam ? `Who in ${viewer.teamName ?? "your team"} gets a new enquiry` : "Which team gets each ad's enquiries";
  const summaries = new Map(ads.map(ad => [ad.id, adSummary(ad)]));
  const unset = ads.filter(ad => summaries.get(ad.id)?.kind === "even").length;
  return <div className={onBack ? c.chat : c.assignPage}>
    {onBack
      ? <div className={c.chatHead}>
        <button className={c.back} onClick={onBack} aria-label="Back to Settings"><Icon name="back" size={20} /></button>
        <div className={c.chatWho}><strong>Assignment</strong><span className={s.caption}>{subtitle}</span></div>
      </div>
      : <div className={c.tabTitle}><h1>Assignment</h1><p className={s.sub}>{subtitle}</p></div>}

    {/* At a glance: how many ads, how many decided, how many still left to the even split. */}
    {!ownTeam && ads.length > 0 && <div className={c.adCounts}>
      <div><strong>{ads.length}</strong><span>{ads.length === 1 ? "Ad" : "Ads"} running</span></div>
      <div data-kind="set"><strong>{ads.length - unset}</strong><span>Assigned</span></div>
      <div data-kind="unset"><strong>{unset}</strong><span>Not set yet</span></div>
    </div>}

    {/* Enquiries in no team — only when no team could take them; the Principal / HOD send each one. */}
    {top && waiting.length > 0 && <section className={c.waitQueue} aria-label="Not in a team">
      <div className={c.waitQueueHead}><h2>Waiting for a team · {waiting.length}</h2><span>its team&apos;s rules pick who</span></div>
      {waiting.map(l => <div key={l.id} className={c.queueRow}>
        <button className={c.queueLead} onClick={() => onOpenLead?.(l.id)}><strong>{l.name}</strong><span>{l.adName || "Messaged the page directly"}</span></button>
        {onSendToTeam && !readOnly && <select value="" onChange={e => e.target.value && onSendToTeam(l.id, e.target.value)} aria-label={`Send ${l.name} to a team`}>
          <option value="">Send to team…</option>
          {tls.map(tl => <option key={tl.id} value={tl.id}>{tl.teamName} · {tl.name}</option>)}
        </select>}
      </div>)}
    </section>}

    {/* Which team — ad by ad, the Principal's and HOD's; a TL only deals with their own team. */}
    {!ownTeam && <section className={c.adList} aria-label="Ads">
      <div className={c.adListHead}><h2>Ads</h2><span className={s.caption}>Not set = evenly to every team</span></div>
      {ads.length === 0 && <p className={s.sub}>No ad has brought an enquiry yet. A new ad appears here with its first enquiry.</p>}
      {ads.map(ad => {
        const now = summaries.get(ad.id) ?? { kind: "even" as const, parts: [] };
        const editing = draft?.adId === ad.id;
        return <article key={ad.id} className={c.adCard} data-state={editing ? "editing" : now.kind === "even" ? "unset" : "set"}>
          <div className={c.ruleHead}>
            <span className={c.adName}><strong>{ad.name}</strong>
              <small className={s.caption}>{[ad.channel, `${ad.leads} ${ad.leads === 1 ? "enquiry" : "enquiries"}`, ad.firstAt && `since ${dayMonth(ad.firstAt)}`].filter(Boolean).join(" · ")}</small></span>
            {topEdits && onSaveAd && <button className={c.adAction} disabled={saving}
              onClick={() => (editing ? setDraft(null) : startEdit(ad))}>{editing ? "Close" : now.kind === "even" ? "Choose teams" : "Change"}</button>}
          </div>
          {!editing && now.kind === "even" && <em className={c.adUnset}>Not set · going evenly to every team</em>}
          {!editing && now.kind !== "even" && <>
            {now.kind === "percent" && <div className={c.adSplitBar} aria-hidden="true">
              {now.parts.map((p, i) => <i key={p.id} data-shade={i % 3} style={{ flexGrow: p.pct ?? 1 }} />)}
            </div>}
            <div className={c.adTags}>
              {now.parts.map(p => <span key={p.id} className={c.adTag}><Icon name="check" size={12} />{p.name}
                {(p.pct != null || now.parts.length === 1) && <small>{p.pct != null ? `${p.pct}%` : "only"}</small>}</span>)}
            </div>
          </>}
          {editing && draft && <div className={c.adEditor}>
            <div className={c.segment2} role="radiogroup" aria-label="How">
              <button role="radio" aria-checked={draft.mode === "teams"} onClick={() => setDraft({ ...draft, mode: "teams" })}>Hand to teams</button>
              <button role="radio" aria-checked={draft.mode === "percent"} onClick={() => setDraft({ ...draft, mode: "percent" })}>Split by %</button>
            </div>
            {draft.mode === "teams"
              ? <>
                <div className={c.dayChips} role="group" aria-label={`Teams for ${ad.name}`}>
                  {tls.map(tl => {
                    const on = draft.tlIds.includes(tl.id);
                    return <button key={tl.id} className={c.dayChip} aria-pressed={on}
                      onClick={() => setDraft({ ...draft, tlIds: on ? draft.tlIds.filter(x => x !== tl.id) : [...draft.tlIds, tl.id] })}>
                      {on && <Icon name="check" size={14} />}{tl.teamName}
                    </button>;
                  })}
                </div>
                <p className={s.caption}>{draft.tlIds.length === 0 ? "None ticked — evenly across every team." : draft.tlIds.length === 1 ? "Only this team takes it." : "Evenly among the ticked teams."}</p>
              </>
              : <>
                {tls.map(tl => <div key={tl.id} className={c.shareRow}>
                  <span>{tl.teamName} <small className={s.caption}>· {tl.name}</small></span>
                  {percent(draft.shares[tl.id] ?? 0, n => setDraft({ ...draft, shares: { ...draft.shares, [tl.id]: n } }), `${tl.teamName} share of ${ad.name}`, false)}
                </div>)}
                {totalLine(draftTotal)}
              </>}
            <div className={c.saveBar}>
              <button className={s.button} disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button className={`${s.button} ${s.primary}`} disabled={saving || !draftOk} onClick={() => void save(ad)}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>}
        </article>;
      })}
      <p className={`${s.caption} ${c.adFoot}`}>Not from an ad: customers who message us directly go evenly across every team. Move one from its chat.</p>
    </section>}

    {/* Who in the team: a TL's own team open; the Boss and HOD see each team as one line, opened on a tap. */}
    {ownTeam
      ? <section className={s.card} aria-label={`Who in ${viewer.teamName}`}>{teamRules(viewer)}</section>
      : <section className={s.card} aria-label="Who in each team">
        <h2>Who in each team</h2>
        <p className={s.caption}>Set by each TL{top ? "; you can change it too" : ""}.</p>
        {teams.map(t => <div key={t.id} className={c.teamRules}>
          <button className={c.teamRulesHead} aria-expanded={openTeam === t.id} onClick={() => setOpenTeam(openTeam === t.id ? null : t.id)}>
            <span><strong>{t.teamName}</strong><small className={s.caption}>{t.name} · {rulesSummary(settingsOf(t.id))}</small></span>
            <Icon name="chevron" size={16} />
          </button>
          {openTeam === t.id && <div className={c.teamRulesBody}>{teamRules(t)}</div>}
        </div>)}
      </section>}

  </div>;
}
