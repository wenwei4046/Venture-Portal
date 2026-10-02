"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_TEAM_SETTINGS, ROLE_LABELS, WEEKDAYS, allTeams, assignsAds, canEditTeamRules, emptyCounts, previewAssignments, teamHandlers, visibleTeams,
  type CrmAssignConfig, type CrmAssignment, type CrmMember, type CrmTeamSettings,
} from "@/lib/member/crm-team";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { Icon } from "./MemberUI";
import { roleTag } from "./MemberCrmTeam";

const NO_RULE = "\u0000no-rule";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const sum = (values: number[]) => values.reduce((a, b) => a + Math.max(0, b), 0);

/** The next date (from today) that falls on this day of the week, at 11am — what the preview deals for. */
function nextOn(day: number): Date {
  const d = new Date();
  d.setHours(11, 0, 0, 0);
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7));
  return d;
}

/** One line a Boss or HOD reads a team's rules by: "Mon Tue Wed Thu by % · Fri–Sun full time only". */
function rulesSummary(st: CrmTeamSettings): string {
  const days = st.percentDays.length === 4 ? "Mon–Thu by %" : st.percentDays.length ? `${st.percentDays.map(d => DAY_NAMES[d]).join(" ")} by %` : "Mon–Thu by hand";
  return `${days} · Fri–Sun ${st.weekendFullTime ? "full time only" : "by %"}`;
}

/**
 * Who gets a new enquiry.
 *   Which team — the Boss and HOD: an ad handed to TLs (rotates evenly), any other ad by each team's %.
 *   Who in the team — each TL: which Mon–Thu days go by %, and whether Fri–Sun is full time only.
 * The Boss and HOD may change a team's rules too; the TL then sees who did.
 */
export default function MemberCrmAssignment({ viewer, members, ads, config, onConfig, onBack, readOnly = false }: {
  viewer: CrmMember;
  members: CrmMember[];
  ads: string[];
  config: CrmAssignConfig;
  onConfig: (config: CrmAssignConfig) => void;
  onBack: () => void;
  /** Live data, before saving settings is built: everything shows, nothing edits. */
  readOnly?: boolean;
}) {
  const top = assignsAds(viewer);
  const topEdits = top && !readOnly;
  const ownTeam = viewer.role === "tl" ? viewer.id : null;
  const teams = visibleTeams(viewer, members);
  const tls = allTeams(members);
  const nameOf = (id: string | null) => members.find(m => m.id === id)?.name ?? "—";
  const teamName = (id: string | null) => members.find(m => m.id === id)?.teamName ?? nameOf(id);
  const [editingAd, setEditingAd] = useState<string | null>(null);
  const [openTeam, setOpenTeam] = useState<string | null>(ownTeam);
  const [previewAd, setPreviewAd] = useState<string>(NO_RULE);
  const [previewDay, setPreviewDay] = useState(() => new Date().getDay());

  const ruleFor = (ad: string) => config.rules.find(r => r.adName === ad)?.tlIds ?? [];
  const toggleAd = (ad: string, tlId: string) => {
    const now = ruleFor(ad);
    const next = now.includes(tlId) ? now.filter(id => id !== tlId) : [...now, tlId];
    onConfig({ ...config, rules: [...config.rules.filter(r => r.adName !== ad), ...(next.length ? [{ adName: ad, tlIds: next }] : [])] });
  };
  const settingsOf = (tlId: string): CrmTeamSettings => config.teams[tlId] ?? DEFAULT_TEAM_SETTINGS;
  const setTeam = (tlId: string, change: Partial<CrmTeamSettings>) => onConfig({
    ...config,
    teams: { ...config.teams, [tlId]: { ...settingsOf(tlId), ...change, editedBy: { memberId: viewer.id, at: new Date().toISOString() } } },
  });
  const teamTotal = sum(tls.map(t => config.teamRatios[t.id] ?? 0));

  // The preview: the whole flow for the Boss and HOD; for a TL, how their own team's enquiries are dealt.
  const at = useMemo(() => nextOn(previewDay), [previewDay]);
  const previewConfig: CrmAssignConfig = ownTeam ? { rules: [], teamRatios: { [ownTeam]: 1 }, teams: { [ownTeam]: settingsOf(ownTeam) } } : config;
  const picks = previewAssignments(previewAd === NO_RULE ? "" : previewAd, at, 10, previewConfig, emptyCounts(), members);
  const pickLabel = (p: CrmAssignment) =>
    !p.teamId ? "Nobody can take it — waits for the Boss or HOD"
      : p.memberId ? nameOf(p.memberId)
        : p.memberBy === "no_full_time" ? `No full-time RS — waits for ${nameOf(p.teamId)}`
          : p.memberBy === "no_shares" ? `Nobody has a % — waits for ${nameOf(p.teamId)}`
            : `Waits for ${nameOf(p.teamId)} to assign`;
  const pickTag = (p: CrmAssignment) => (p.memberBy === "weekend" ? "Full time" : p.memberId ? "By %" : "By hand");

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

  return <div className={c.chat}>
    <div className={c.chatHead}>
      <button className={c.back} onClick={onBack} aria-label="Back to Settings"><Icon name="back" size={20} /></button>
      <div className={c.chatWho}><strong>Assignment</strong><span className={s.caption}>{ownTeam ? `Who in ${viewer.teamName ?? "your team"} gets a new enquiry` : "Who gets a new enquiry"}</span></div>
    </div>

    {/* Which team — the Boss and HOD's step; a TL only deals with their own team. */}
    {!ownTeam && <section className={s.card} aria-label="Which team">
      <h2>Which team</h2>

      <h3 className={c.subHead}>Ads handed to TLs</h3>
      <p className={s.caption}>An ad&apos;s enquiries rotate evenly among the TLs it is handed to.</p>
      {ads.map(ad => {
        const ids = ruleFor(ad);
        if (!top && !ids.some(id => teams.some(t => t.id === id))) return null;
        const shown = ids.filter(id => top || teams.some(t => t.id === id));
        return <div key={ad} className={c.adRow}>
          <div className={c.ruleHead}>
            <strong>{ad}</strong>
            {topEdits && <button className={c.linkButton} onClick={() => setEditingAd(editingAd === ad ? null : ad)}>{editingAd === ad ? "Done" : "Edit"}</button>}
          </div>
          {editingAd === ad
            ? <div className={c.dayChips} role="group" aria-label={`TLs for ${ad}`}>
              {tls.map(t => <button key={t.id} className={c.dayChip} aria-pressed={ids.includes(t.id)} onClick={() => toggleAd(ad, t.id)}>
                {ids.includes(t.id) && <Icon name="check" size={14} />}{t.teamName}
              </button>)}
            </div>
            : <p className={s.caption}>{shown.length ? `${shown.map(teamName).join(" · ")}${!top && ids.length > shown.length ? " + another team" : ""}` : "Not handed to a TL — split by %"}</p>}
        </div>;
      })}

      <h3 className={c.subHead}>Split between teams</h3>
      <p className={s.caption}>Every ad not handed to a TL.</p>
      {tls.filter(t => top || teams.some(x => x.id === t.id)).map(t => <div key={t.id} className={c.shareRow}>
        <span>{t.teamName} <small className={s.caption}>· {t.name}</small></span>
        {percent(config.teamRatios[t.id] ?? 0, n => onConfig({ ...config, teamRatios: { ...config.teamRatios, [t.id]: n } }), `${t.teamName} share`, !topEdits)}
      </div>)}
      {topEdits && totalLine(teamTotal)}
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

    {/* Preview */}
    <section className={s.card} aria-label="Preview: the next 10 enquiries">
      <h2>Next 10 enquiries</h2>
      <div className={`${c.dayChips} ${c.dayRow}`} role="radiogroup" aria-label="Day">
        {[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} role="radio" className={c.dayChip} aria-checked={previewDay === d} onClick={() => setPreviewDay(d)}>
          {DAY_NAMES[d]}
        </button>)}
      </div>
      {!ownTeam && <label className={s.field}><span>From the ad</span>
        <select value={previewAd} onChange={e => setPreviewAd(e.target.value)}>
          <option value={NO_RULE}>An ad not handed to a TL</option>
          {ads.map(ad => <option key={ad} value={ad}>{ad}</option>)}
        </select>
      </label>}
      <ol className={c.preview}>
        {picks.map((p, i) => <li key={i}>
          <strong>{pickLabel(p)}</strong>
          {p.teamId && !ownTeam && <span className={s.caption}>{teamName(p.teamId)}</span>}
          {p.teamId && <span className={c.modeTag}>{pickTag(p)}</span>}
        </li>)}
      </ol>
      <p className={s.caption}>From a fresh round. Nothing is changed.</p>
    </section>
  </div>;
}
