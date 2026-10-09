"use client";

import { ICON, Svg } from "../icons";
import InstallRow from "./InstallRow";
import type { ProfileMainVM, WorkKey } from "./profile-vm";
import s from "./profile.module.css";

const ROWS: { key: WorkKey; label: string; sub: string; d: string; tone: string }[] = [
  { key: "income", label: "My income", sub: "Commission, KPI and incentive", d: ICON.wallet, tone: s.toneIncome },
  { key: "honours", label: "My honours", sub: "Medals and Fair records", d: ICON.trophy, tone: s.toneHonours },
  { key: "team", label: "Team & capacity", sub: "Department map and your reporting tree", d: ICON.team, tone: s.toneTeam },
  { key: "requests", label: "Requests", sub: "Claims, team changes and waiting lists", d: ICON.receipt, tone: s.toneRequests },
  // The CRM (2026-10-09, prototype 2a: Profile › My leads & appointments).
  { key: "crm", label: "My leads & appointments", sub: "Manage your leads and appointments", d: ICON.chat, tone: s.toneLeads },
  { key: "memos", label: "Memos & notifications", sub: "Read published team updates", d: ICON.bell, tone: s.toneMemos },
];

export interface ProfileMainActions {
  open: (key: WorkKey) => void;
  scheme: () => void;
  brandWeeks: () => void;
  toggleHide: () => void;
  signOut: () => void;
  /** A Principal not viewing anybody yet: the way into View as. */
  viewAs?: () => void;
}

/** Profile — the peach card, Your workspace, Privacy and Sign out (lines 1132–1187). */
export default function ProfileMain({ vm, hidden, actions }: { vm: ProfileMainVM; hidden: boolean; actions: ProfileMainActions }) {
  return (
    <div className={s.main}>
      <div className={s.glow} />
      <div className={s.cardWrap}>
        <section className={s.card}>
          <div className={s.cardBody}>
            <div className={s.who}>
              <span className={s.avatar}>{vm.ini}</span>
              <div className={s.whoText}>
                <h1 className={s.name}>{vm.name}</h1>
                <p className={s.whoSub}>{vm.sub}</p>
              </div>
            </div>
            <div className={s.facts}>
              <div className={s.fact}><span className={s.factLabel}>Title</span><span className={s.factValue}>{vm.title}</span></div>
              <div className={s.fact}><span className={s.factLabel}>Rank</span><span className={s.factValue}>{vm.rank}</span></div>
            </div>
          </div>
          <div className={s.chips}>
            <button className={s.chip} onClick={actions.scheme}><span className={s.chipIcon}><Svg d={ICON.receipt} size={18} sw={1.7} /></span>Commission scheme</button>
            <button className={s.chip} onClick={actions.brandWeeks}><span className={s.chipIcon}><Svg d={ICON.calendar} size={18} sw={1.7} /></span>My brand weeks</button>
          </div>
        </section>
      </div>
      {actions.viewAs && (
        <div className={s.vaEntry}>
          <button className={s.vaEntryBtn} onClick={actions.viewAs}>
            <span className={s.vaEntryIcon}><Svg d={ICON.viewing} size={20} sw={1.8} /></span>
            <span className={s.vaEntryText}>
              <span className={s.vaEntryTitle}>View as a team member</span>
              <span className={s.vaEntrySub}>Pick anyone in Revenue · read-only</span>
            </span>
            <Svg d={ICON.chevronRight} size={16} sw={1.9} stroke="var(--rv-blush)" />
          </button>
        </div>
      )}
      <div className={s.body}>
        <section className={s.work}>
          <h2 className={s.h2}>Your workspace</h2>
          {ROWS.map(r => (
            <button key={r.key} className={s.workRow} onClick={() => actions.open(r.key)}>
              <span className={`${s.workIcon} ${r.tone}`}><Svg d={r.d} size={22} sw={1.7} /></span>
              <span className={s.workText}>
                <span className={s.workLabel}>{r.label}{vm.badges[r.key] && <span className={s.workBadge}>{vm.badges[r.key]}</span>}</span>
                <span className={s.workSub}>{r.sub}</span>
              </span>
              <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
            </button>
          ))}
          <InstallRow />
        </section>
        <section className={s.privacy}>
          <h2 className={s.h2}>Privacy</h2>
          <button className={s.hideBtn} onClick={actions.toggleHide}>
            {hidden ? "Show income amounts" : "Hide income amounts"}<Svg d={hidden ? ICON.eyeOff : ICON.eye} size={20} sw={1.7} />
          </button>
        </section>
        <button className={s.signOut} onClick={actions.signOut}>Sign out</button>
      </div>
    </div>
  );
}

/** The bar that slides down over the page once Profile has scrolled past its card (lines 130–137). */
export function ProfileMini({ on, name, ini, title, rank }: { on: boolean; name: string; ini: string; title: string; rank: string }) {
  return (
    <div className={`${s.mini} ${on ? s.miniOn : ""}`} aria-hidden={!on}>
      <div className={s.miniBar}>
        <span className={s.miniAvatar}>{ini}</span>
        <span className={s.miniText}>
          <span className={s.miniName}>{name}</span>
          <span className={s.miniSub}>{title} · {rank}</span>
        </span>
      </div>
    </div>
  );
}
