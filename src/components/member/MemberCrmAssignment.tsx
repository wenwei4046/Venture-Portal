"use client";

import { useMemo, useState } from "react";
import {
  ROLE_LABELS, allTeams, assignsAds, canEditTeamRules, emptyCounts, previewAssignments, teamHandlers, visibleTeams,
  type CrmAssignConfig, type CrmAssignment, type CrmMember, type CrmTeamSettings,
} from "@/lib/member/crm-team";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { Icon } from "./MemberUI";
import { roleTag } from "./MemberCrmTeam";

const NO_RULE = "\u0000no-rule";
const sum = (values: number[]) => values.reduce((a, b) => a + Math.max(0, b), 0);

/** The next day from today that is (or is not) Friday–Sunday — what the preview deals for. */
function nextDay(weekend: boolean): Date {
  const d = new Date();
  d.setHours(11, 0, 0, 0);
  for (let i = 0; i < 7; i++, d.setDate(d.getDate() + 1)) if ([5, 6, 0].includes(d.getDay()) === weekend) break;
  return d;
}

/**
 * Who gets a new enquiry.
 *   Which team — the Boss or HOD: an ad handed to TLs (Mode 1), any other ad by each team's % (Mode 2).
 *   Who in the team — Friday–Sunday full-time RS in turn; Monday–Thursday as the TL chooses: automatically by %, or by hand.
 * The Boss and HOD edit the first; each TL edits only their own team.
 */
export default function MemberCrmAssignment({ viewer, members, ads, config, onConfig, onBack }: {
  viewer: CrmMember;
  members: CrmMember[];
  ads: string[];
  config: CrmAssignConfig;
  onConfig: (config: CrmAssignConfig) => void;
  onBack: () => void;
}) {
  const top = assignsAds(viewer);
  // The Boss and HOD (and a Senior TL) see both steps; a TL sees only who in their own team.
  const wholeFlow = viewer.role !== "tl";
  const teams = visibleTeams(viewer, members);
  const tls = allTeams(members);
  const nameOf = (id: string | null) => members.find(m => m.id === id)?.name ?? "—";
  const teamName = (id: string | null) => members.find(m => m.id === id)?.teamName ?? nameOf(id);
  const [openAd, setOpenAd] = useState<string | null>(null);
  const [previewAd, setPreviewAd] = useState<string>(NO_RULE);
  const [weekend, setWeekend] = useState(false);

  const ruleFor = (ad: string) => config.rules.find(r => r.adName === ad)?.tlIds ?? [];
  const toggle = (ad: string, tlId: string) => {
    const now = ruleFor(ad);
    const next = now.includes(tlId) ? now.filter(id => id !== tlId) : [...now, tlId];
    onConfig({ ...config, rules: [...config.rules.filter(r => r.adName !== ad), ...(next.length ? [{ adName: ad, tlIds: next }] : [])] });
  };
  const settingsOf = (tlId: string): CrmTeamSettings => config.teams[tlId] ?? { weekday: "manual", ratios: {} };
  const setTeam = (tlId: string, change: Partial<CrmTeamSettings>) =>
    onConfig({ ...config, teams: { ...config.teams, [tlId]: { ...settingsOf(tlId), ...change } } });
  const teamTotal = sum(tls.map(t => config.teamRatios[t.id] ?? 0));

  // The preview: the whole flow for the Boss and HOD; for a TL, how their own team's enquiries are dealt.
  const at = useMemo(() => nextDay(weekend), [weekend]);
  const own = viewer.role === "tl" ? viewer.id : null;
  const previewConfig: CrmAssignConfig = own ? { rules: [], teamRatios: { [own]: 1 }, teams: { [own]: settingsOf(own) } } : config;
  const picks = previewAssignments(previewAd === NO_RULE ? "" : previewAd, at, 10, previewConfig, emptyCounts(), members);
  const pickLabel = (p: CrmAssignment) =>
    !p.teamId ? "Nobody can take it — waits for the Boss or HOD"
      : p.memberId ? nameOf(p.memberId)
        : p.memberBy === "no_full_time" ? `No full-time RS — waits for ${nameOf(p.teamId)}`
          : `Waits for ${nameOf(p.teamId)} to assign`;

  // Shares are typed as percentages; each group should add up to 100%.
  const percent = (value: number, onChange: (n: number) => void, label: string, disabled = false) => <>
    <input className={c.shareInput} type="number" inputMode="numeric" min={0} max={100} step={1} value={value} disabled={disabled} aria-label={`${label} (%)`}
      onChange={e => onChange(Math.min(100, Math.max(0, Math.floor(Number(e.target.value) || 0))))} />
    <small>%</small>
  </>;
  const totalLine = (total: number) => <p className={c.percentTotal} data-off={total !== 100 || undefined}>
    Total {total}%{total !== 100 && ` — should add up to 100% (${total < 100 ? `${100 - total}% left` : `${total - 100}% too much`})`}
  </p>;

  return <div className={c.chat}>
    <div className={c.chatHead}>
      <button className={c.back} onClick={onBack} aria-label="Back to Settings"><Icon name="back" size={20} /></button>
      <div className={c.chatWho}><strong>Assignment</strong><span className={s.caption}>Who gets a new enquiry</span></div>
    </div>
    {wholeFlow && <ol className={c.flowSteps}>
      <li><strong>Which team</strong> · set by the Boss and HOD</li>
      <li><strong>Who in the team</strong> · Fri–Sun full-time RS in turn; Mon–Thu as the TL chooses</li>
    </ol>}

    {/* Step 1: which team — the Boss and HOD set it; a TL only deals with their own team, so it is left out */}
    {wholeFlow && <section className={s.card} aria-label="Which team">
      <h2>1 · Which team</h2>
      <h3 className={c.subHead}>Mode 1 · Ads handed to TLs</h3>
      <p className={s.caption}>{top ? "Hand an ad to one or several TLs. Its enquiries rotate evenly among their teams." : "Set by the Boss and HOD."}</p>
      {ads.map(ad => {
        const ids = ruleFor(ad);
        if (!top && !ids.some(id => teams.some(t => t.id === id))) return null;
        return <div key={ad} className={c.rule}>
          <div className={c.ruleTop}>
            <span><strong>{ad}</strong><br /><span className={s.caption}>
              {ids.length === 0 ? "No TL · split by % (Mode 2)" : `${ids.filter(id => top || teams.some(t => t.id === id)).map(teamName).join(", ")}${!top && ids.length > 1 ? " + another team" : ""} · in turn`}
            </span></span>
            {top && <button className={c.chip} aria-expanded={openAd === ad} onClick={() => setOpenAd(openAd === ad ? null : ad)}>{openAd === ad ? "Done" : "Choose"}</button>}
          </div>
          {top && openAd === ad && <fieldset className={c.pickTeam}>
            <legend>TLs</legend>
            {tls.map(t => <label key={t.id} className={c.switch}>
              <input type="checkbox" checked={ids.includes(t.id)} onChange={() => toggle(ad, t.id)} /> {t.name} · {t.teamName}
            </label>)}
          </fieldset>}
        </div>;
      })}

      <h3 className={c.subHead}>Mode 2 · Split between teams</h3>
      <p className={s.caption}>For every ad not handed to a TL: the % of those enquiries each team gets.</p>
      {tls.filter(t => top || teams.some(x => x.id === t.id)).map(t => <div key={t.id} className={c.shareRow}>
        <span>{t.teamName} <small className={s.caption}>· {t.name}</small></span>
        {percent(config.teamRatios[t.id] ?? 0, n => onConfig({ ...config, teamRatios: { ...config.teamRatios, [t.id]: n } }), `${t.teamName} share`, !top)}
      </div>)}
      {top && totalLine(teamTotal)}
    </section>}

    {/* Step 2: who in each team */}
    {teams.map(t => {
      const st = settingsOf(t.id);
      const canEdit = canEditTeamRules(viewer, t.id); // the TL, the Boss and the HOD
      const edited = st.editedBy;
      const editor = edited && members.find(m => m.id === edited.memberId);
      const handlers = teamHandlers(t.id, members);
      const fullTime = handlers.filter(m => m.role === "rs" && m.fullTime);
      const total = sum(handlers.map(m => st.ratios[m.id] ?? 0));
      return <section key={t.id} className={s.card} aria-label={`Who in ${t.teamName}`}>
        <h2>{wholeFlow ? "2 · " : ""}Who in {t.teamName}</h2>
        <p className={s.caption}>{viewer.id === t.id ? "Your team — you decide. The Boss and HOD can change it too." : canEdit ? `Set by ${t.name}, the TL. As ${ROLE_LABELS[viewer.role]} you can change it too.` : `Set by ${t.name}, the TL.`}</p>

        <h3 className={c.subHead}>Friday – Sunday</h3>
        <p className={s.sub}>{fullTime.length
          ? <>Full-time RS only, in turn: <strong>{fullTime.map(m => m.name).join(", ")}</strong></>
          : "No full-time RS — weekend enquiries wait for the TL to assign."}</p>

        <h3 className={c.subHead}>Monday – Thursday</h3>
        <div className={c.segment} role="radiogroup" aria-label="Monday to Thursday">
          {(["auto", "manual"] as const).map(mode => <button key={mode} role="radio" aria-checked={st.weekday === mode}
            disabled={!canEdit} onClick={() => mode !== st.weekday && setTeam(t.id, { weekday: mode, editedBy: { memberId: viewer.id, at: new Date().toISOString() } })}>
            {mode === "auto" ? "Automatic by %" : "I assign by hand"}
          </button>)}
        </div>
        {st.weekday === "manual"
          ? <p className={s.caption}>Every Monday–Thursday enquiry waits in the &ldquo;To assign&rdquo; list on Team for {t.name.split(" ")[0]} to hand out.</p>
          : <>
            <p className={s.caption}>The % of Monday–Thursday enquiries each person gets. {t.name.split(" ")[0]} can still reassign any lead by hand.</p>
            {handlers.map(m => <div key={m.id} className={c.shareRow}>
              <span>{m.name} <small className={s.caption}>· {roleTag(m)}</small></span>
              {percent(st.ratios[m.id] ?? 0, n => setTeam(t.id, { ratios: { ...st.ratios, [m.id]: n }, editedBy: { memberId: viewer.id, at: new Date().toISOString() } }), `${m.name} share`, !canEdit)}
            </div>)}
            {total === 0 ? <p className={c.composerProblem}>Nobody has a % — Monday–Thursday enquiries wait for {t.name.split(" ")[0]} to assign.</p> : canEdit && totalLine(total)}
          </>}
        {/* The mode or the %s changed over the TL's head: the TL should know. */}
        {edited && editor && editor.id !== t.id && <p className={c.editedBy}>
          <Icon name="info" size={14} /> Last changed by {editor.id === viewer.id ? "you" : editor.name} ({ROLE_LABELS[editor.role]}) · {new Date(edited.at).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
        </p>}
      </section>;
    })}

    {/* Preview */}
    <section className={s.card} aria-label="Preview: the next 10 enquiries">
      <h2>Next 10 enquiries</h2>
      <p className={s.caption}>{own ? `How the next 10 that reach ${viewer.teamName} would be dealt.` : "Who would get them, from a fresh round. Nothing is changed."}</p>
      <div className={c.segment} role="radiogroup" aria-label="Day">
        <button role="radio" aria-checked={!weekend} onClick={() => setWeekend(false)}>Mon – Thu</button>
        <button role="radio" aria-checked={weekend} onClick={() => setWeekend(true)}>Fri – Sun</button>
      </div>
      {!own && <label className={s.field}><span>From the ad</span>
        <select value={previewAd} onChange={e => setPreviewAd(e.target.value)}>
          <option value={NO_RULE}>An ad not handed to a TL (Mode 2)</option>
          {ads.map(ad => <option key={ad} value={ad}>{ad}{ruleFor(ad).length ? " · Mode 1" : ""}</option>)}
        </select>
      </label>}
      <ol className={c.preview}>
        {picks.map((p, i) => <li key={i}>
          <strong>{pickLabel(p)}</strong>
          {p.teamId && !own && <span className={s.caption}>{teamName(p.teamId)}</span>}
          {p.teamId && <span className={c.modeTag}>{p.memberBy === "weekend" ? "Fri–Sun" : p.memberId ? "By %" : "By hand"}{own ? "" : ` · Mode ${p.teamBy}`}</span>}
        </li>)}
      </ol>
    </section>
  </div>;
}
