"use client";

import { ICON, Svg } from "../icons";
import { MODULES, type ModuleId } from "../shell/Chrome";
import InstallRow from "./InstallRow";
import PushRow from "./PushRow";
import type { ProfileMainVM, WorkKey } from "./profile-vm";
import s from "./profile.module.css";

const ROWS: { key: WorkKey; label: string; sub: string; d: string; tone: string }[] = [
  { key: "income", label: "My income", sub: "Commission, KPI and incentive", d: ICON.wallet, tone: s.toneIncome },
  { key: "honours", label: "My honours", sub: "Medals and Fair records", d: ICON.trophy, tone: s.toneHonours },
  { key: "team", label: "Team & capacity", sub: "Department map and your reporting tree", d: ICON.team, tone: s.toneTeam },
  { key: "requests", label: "Requests", sub: "Claims, team changes and waiting lists", d: ICON.receipt, tone: s.toneRequests },
  // The HR revamp (2026-10-10): where the waiting lists and replacements the member sent stand.
  { key: "track", label: "Waiting list & replacements", sub: "Queue position and status of what you sent", d: ICON.queue, tone: s.toneTrack },
  // The HR revamp's second package (2026-10-11, README 18.4): the meeting rooms, booked from the phone.
  { key: "rooms", label: "Book a room", sub: "See free meeting rooms and book a slot", d: ICON.room, tone: s.toneRooms },
  { key: "docs", label: "Documentation", sub: "Handbook, price list and files from HR", d: ICON.doc, tone: s.toneDocs },
  // The CRM (2026-10-09, prototype 2a: Profile › My leads & appointments).
  { key: "crm", label: "My leads & appointments", sub: "Manage your leads and appointments", d: ICON.chat, tone: s.toneLeads },
  { key: "memos", label: "Memos & notifications", sub: "Read published team updates", d: ICON.bell, tone: s.toneMemos },
];

export interface ProfileMainActions {
  open: (key: WorkKey) => void;
  /** Absent while their ticks close the page (2026-10-11, People › Permissions › Revenue app): no chip. */
  scheme?: () => void;
  brandWeeks?: () => void;
  /** Absent while My income is closed (2026-10-11): the income stays hidden, so Privacy has nothing to show. */
  toggleHide?: () => void;
  signOut: () => void;
  /** A Principal not viewing anybody yet: the way into View as. */
  viewAs?: () => void;
  /**
   * Change password (2026-10-12 — the user: "in their profile tab", "just for that personal acc"): present only for a
   * login of their own, never a shared one, never while viewing a member, never on the preview's demo.
   */
  changePassword?: () => void;
}

const NO_ROWS: readonly WorkKey[] = [];

/** Switch view's rows (2026-10-11, one app): where each view opens on a phone, in the HR app's More's order. */
const VIEWS: { id: ModuleId; where: string }[] = [
  { id: "principal", where: "The portal" },
  { id: "finance", where: "The portal" },
  { id: "hr", where: "The HR app" },
  { id: "revenue", where: "The Revenue app" },
];

/**
 * Profile — the peach card, Your workspace, Privacy and Sign out (lines 1132–1187).
 * `closedRows`: the workspace's pages their ticks close (2026-10-11) — not listed.
 */
export default function ProfileMain({ vm, hidden, actions, crm = true, closedRows = NO_ROWS, push = false, views = null }: {
  vm: ProfileMainVM; hidden: boolean; actions: ProfileMainActions; crm?: boolean; closedRows?: readonly WorkKey[];
  /** This phone's notifications row (2026-10-11): their own app only — never while the Principal views a member. */
  push?: boolean;
  /**
   * Switch view (2026-10-11 — the user: "do a switch button for me to switch to hr and other view, in revenue view
   * don't have that button"): the app's other views for an account that may switch them, on a phone — the desktop
   * has the sidebar's module menu. Not while viewing a member.
   */
  views?: { current: ModuleId; pick: (id: ModuleId) => void } | null;
}) {
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
          {actions.scheme || actions.brandWeeks ? (
            <div className={`${s.chips} ${actions.scheme && actions.brandWeeks ? "" : s.chipsOne}`}>
              {actions.scheme && <button className={s.chip} onClick={actions.scheme}><span className={s.chipIcon}><Svg d={ICON.receipt} size={18} sw={1.7} /></span>Commission scheme</button>}
              {actions.brandWeeks && <button className={s.chip} onClick={actions.brandWeeks}><span className={s.chipIcon}><Svg d={ICON.calendar} size={18} sw={1.7} /></span>My brand weeks</button>}
            </div>
          ) : null}
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
        {views ? (
          <section className={s.views} aria-label="Switch view">
            <h2 className={s.h2}>Switch view</h2>
            {VIEWS.map(({ id, where }) => {
              const m = MODULES.find(x => x.id === id);
              if (!m) return null;
              const here = id === views.current;
              const face = (
                <>
                  <span className={`${s.workIcon} ${s.toneView}`}><span className={`${s.viewDot} ${m.dot}`} /></span>
                  <span className={s.workText}>
                    <span className={s.workLabel}>{m.label}</span>
                    <span className={s.workSub}>{here ? "You are here" : where}</span>
                  </span>
                  {here ? <span /> : <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />}
                </>
              );
              return here
                ? <div key={id} className={s.workRow} aria-current="true">{face}</div>
                : <button key={id} className={s.workRow} onClick={() => views.pick(id)}>{face}</button>;
            })}
          </section>
        ) : null}
        <section className={s.work}>
          <h2 className={s.h2}>Your workspace</h2>
          {/* My leads & appointments: only for an account the CRM is open to (CRM · View, 2026-10-10). */}
          {ROWS.filter(r => (r.key !== "crm" || crm) && !closedRows.includes(r.key)).map(r => (
            <button key={r.key} className={s.workRow} onClick={() => actions.open(r.key)}>
              <span className={`${s.workIcon} ${r.tone}`}><Svg d={r.d} size={22} sw={1.8} /></span>
              <span className={s.workText}>
                <span className={s.workLabel}>{r.label}{vm.badges[r.key] && <span className={r.key === "track" || r.key === "docs" || r.key === "crm" ? s.workCount : s.workBadge}>{vm.badges[r.key]}</span>}</span>
                <span className={s.workSub}>{r.sub}</span>
              </span>
              <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
            </button>
          ))}
          <InstallRow />
          {push ? <PushRow /> : null}
        </section>
        {actions.toggleHide ? (
          <section className={s.privacy}>
            <h2 className={s.h2}>Privacy</h2>
            <button className={s.hideBtn} onClick={actions.toggleHide}>
              {hidden ? "Show income amounts" : "Hide income amounts"}<Svg d={hidden ? ICON.eyeOff : ICON.eye} size={20} sw={1.7} />
            </button>
          </section>
        ) : null}
        {/* Not in the prototype (2026-10-12): the login's own password, drawn as Privacy's button. */}
        {actions.changePassword ? (
          <section className={s.privacy} aria-label="Account">
            <h2 className={s.h2}>Account</h2>
            <button className={s.hideBtn} onClick={actions.changePassword}>
              Change password<Svg d={ICON.lock} size={20} sw={1.7} />
            </button>
          </section>
        ) : null}
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
