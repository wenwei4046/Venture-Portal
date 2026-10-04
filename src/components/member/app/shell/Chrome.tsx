"use client";

import { ICON, Svg } from "../icons";
import type { Screen } from "../route";
import s from "../shell.module.css";

export interface Me {
  name: string;
  first: string;
  ini: string;
  title: string;
  rank: string;
}

/** The phone header (`header-style="d"`): wordmark, then Fair ▾ · bell · avatar in one capsule. */
export function MobileHeader({ ruled, back, subName, count, me, onLogo, onBack, onSubDept, onBell, onProfile }: {
  ruled: boolean;
  back: boolean;
  subName: string;
  count: number;
  me: Me;
  onLogo: () => void;
  onBack: () => void;
  onSubDept: () => void;
  onBell: () => void;
  onProfile: () => void;
}) {
  return (
    <header className={`${s.header} ${ruled ? s.headerRuled : ""}`}>
      {back ? (
        <button className={s.headerBack} onClick={onBack}><Svg d={ICON.arrowLeft} size={20} sw={1.9} />Products</button>
      ) : (
        <button className={s.headerLogo} onClick={onLogo}>
          <span className={s.headerWord}>HOUZS VENTURE</span>
          <span className={s.headerDept}>Revenue</span>
        </button>
      )}
      <div className={s.capsule}>
        <button className={s.capsuleSd} onClick={onSubDept} aria-label="Switch sub-department">
          {subName}<Svg d={ICON.chevronDown} size={15} sw={2.2} stroke="var(--rv-accent)" />
        </button>
        <span className={s.capsuleRule} />
        <button className={s.capsuleBell} onClick={onBell} aria-label="Notifications">
          <Svg d={ICON.bell} size={20} sw={1.7} />
          {count > 0 && <span className={s.capsuleBadge}>{count}</span>}
        </button>
        <button className={s.capsuleAvatar} onClick={onProfile} aria-label="Profile">{me.ini}</button>
      </div>
    </header>
  );
}

const NAV: { id: Exclude<Screen, "quote" | "calc">; label: string; d: string }[] = [
  { id: "today", label: "Today", d: ICON.home },
  { id: "insight", label: "Insight", d: ICON.chart },
  { id: "arena", label: "Arena", d: ICON.trophy },
  { id: "account", label: "Profile", d: ICON.user },
];

/** The bottom bar: Today · Insight · Quote (raised) · Arena · Profile. */
export function BottomNav({ active, android, live, onGo, onQuote }: {
  active: Screen;
  android: boolean;
  live: boolean;
  onGo: (screen: Screen) => void;
  onQuote: () => void;
}) {
  const tab = active === "calc" ? "quote" : active;
  const item = (n: (typeof NAV)[number]) => {
    const on = tab === n.id;
    return (
      <button key={n.id} className={`${s.navItem} ${on ? s.navItemOn : ""}`} onClick={() => onGo(n.id)} aria-current={on ? "page" : undefined}>
        <span className={`${s.navPill} ${on && android ? s.navPillOn : ""}`}><Svg d={n.d} size={24} sw={on ? 2 : 1.65} /></span>
        <span className={`${s.navLabel} ${on ? s.navLabelOn : ""}`}>{n.label}</span>
      </button>
    );
  };
  return (
    <nav className={`${s.nav} ${live ? s.navLive : ""}`}>
      <div className={s.navGrid}>
        {NAV.slice(0, 2).map(item)}
        <button className={`${s.navQuote} ${tab === "quote" ? s.navQuoteOn : ""}`} onClick={onQuote} aria-label="Quote">
          <span className={s.navQuoteCircle}><Svg d={ICON.quote} size={25} sw={1.8} /></span>
          <span className={s.navQuoteLabel}>Quote</span>
        </button>
        {NAV.slice(2).map(item)}
      </div>
      {!live && (android
        ? <div className={s.homeAndroid}><span className={s.homeAndroidBar} /></div>
        : <div className={s.homeIos}><span className={s.homeIosBar} /></div>)}
    </nav>
  );
}

const DESK_NAV: { id: Screen; label: string; d: string }[] = [
  { id: "today", label: "Today", d: ICON.home },
  { id: "insight", label: "Insight", d: ICON.chart },
  { id: "quote", label: "Quote", d: ICON.quoteDesk },
  { id: "arena", label: "Arena", d: ICON.trophy },
  { id: "account", label: "Profile", d: ICON.user },
];

/** Desktop: the 240px sidebar. */
export function DeskAside({ active, count, notifOpen, me, onGo, onQuote, onNotif, onProfile }: {
  active: Screen;
  count: number;
  notifOpen: boolean;
  me: Me;
  onGo: (screen: Screen) => void;
  onQuote: () => void;
  onNotif: () => void;
  onProfile: () => void;
}) {
  const tab = active === "calc" ? "quote" : active;
  return (
    <aside className={s.aside}>
      <button className={s.asideLogo} onClick={() => onGo("today")}>
        <span className={s.asideWord}>HOUZS VENTURE</span>
        <span className={s.asideDept}>Revenue</span>
      </button>
      {DESK_NAV.map(n => {
        const on = tab === n.id;
        return (
          <button key={n.id} className={`${s.asideNav} ${on ? s.asideNavOn : ""}`} onClick={() => (n.id === "quote" ? onQuote() : onGo(n.id))} aria-current={on ? "page" : undefined}>
            <Svg d={n.d} size={20} sw={1.8} />{n.label}
          </button>
        );
      })}
      <button className={`${s.asideNav} ${s.asideNotif} ${notifOpen ? s.asideNotifOn : ""}`} onClick={onNotif}>
        <Svg d={ICON.bell} size={20} sw={1.8} /><span className={s.asideNotifLabel}>Notifications</span>
        {count > 0 && <span className={s.asideCount}>{count}</span>}
      </button>
      <div className={s.asideSpacer} />
      <button className={s.asideMe} onClick={onProfile}>
        <span className={s.asideAvatar}>{me.ini}</span>
        <span className={s.asideMeText}>
          <span className={s.asideMeName}>{me.name}</span>
          <span className={s.asideMeSub}>{me.title} · {me.rank}</span>
        </span>
      </button>
    </aside>
  );
}

/** Desktop: the 60px top bar. */
export function DeskHeader({ greet, me, subName, dateLine, unread, onSubDept, onNotif, onSignOut }: {
  greet: string;
  me: Me;
  subName: string;
  dateLine: string;
  unread: boolean;
  onSubDept: () => void;
  onNotif: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className={s.deskHeader}>
      <span className={s.deskGreet}>{greet}, <span className={s.deskGreetName}>{me.first}</span>.</span>
      <button className={s.deskSd} onClick={onSubDept} aria-label="Switch sub-department">
        <span className={s.deskSdDot} />{subName} view<Svg d={ICON.chevronDown} size={15} sw={2.2} stroke="var(--rv-sub)" />
      </button>
      <span className={s.deskDate}>{dateLine}</span>
      <button className={s.deskBell} onClick={onNotif} aria-label="Notifications">
        <Svg d={ICON.bell} size={20} sw={1.7} />
        {unread && <span className={s.deskBellDot} />}
      </button>
      <button className={s.deskSignOut} onClick={onSignOut}>SIGN OUT</button>
    </header>
  );
}

/** A Principal viewing the app as somebody: on every screen, read-only. */
export function ViewingAsBar({ me, onSwitch, onExit }: { me: Me; onSwitch: () => void; onExit: () => void }) {
  return (
    <div className={s.vaBar}>
      <Svg d={ICON.viewing} size={17} sw={1.9} stroke="var(--rv-peach)" className={s.vaIcon} />
      <span className={s.vaText}>
        <span className={s.vaName}>Viewing as {me.name}</span>
        <span className={s.vaSub}>{me.title} · read-only</span>
      </span>
      <button className={s.vaSwitch} onClick={onSwitch}>Switch</button>
      <button className={s.vaExit} onClick={onExit}>Exit</button>
    </div>
  );
}
