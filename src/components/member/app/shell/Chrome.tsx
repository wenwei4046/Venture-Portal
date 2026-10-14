"use client";

import { useRef, useState } from "react";
import { useTuckOnScroll } from "@/components/pwa/tuck";
import tuck from "@/components/pwa/tuck.module.css";
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

const NONE: readonly Screen[] = [];

/** The bottom bar: Today · Insight · Quote (raised) · Arena · Profile — less any their ticks close (2026-10-11). */
export function BottomNav({ active, page, android, live, hidden = NONE, onGo, onQuote }: {
  active: Screen;
  /** The page shown, a Profile page or a board included: another one brings the bar back (2026-10-11). */
  page?: string;
  android: boolean;
  live: boolean;
  /** Screens their ticks close: not in the bar (Profile never is). */
  hidden?: readonly Screen[];
  onGo: (screen: Screen) => void;
  onQuote: () => void;
}) {
  const tab = active === "calc" ? "quote" : active;
  const left = NAV.slice(0, 2).filter(n => !hidden.includes(n.id));
  const right = NAV.slice(2).filter(n => !hidden.includes(n.id));
  const quote = !hidden.includes("quote");
  const columns = left.length + right.length + (quote ? 1 : 0);
  // The bar steps out of the way while reading on, back on scrolling up or on another page (2026-10-11) — the live app only.
  const navRef = useRef<HTMLElement>(null);
  const tucked = useTuckOnScroll(navRef, live, page ?? active);
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
    <nav ref={navRef} className={`${s.nav} ${live ? s.navLive : ""} ${tuck.tuckable}`} data-tucked={tucked ? "" : undefined} inert={tucked || undefined}>
      <div className={s.navGrid} style={columns === 5 ? undefined : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {left.map(item)}
        {quote && (
          <button className={`${s.navQuote} ${tab === "quote" ? s.navQuoteOn : ""}`} onClick={onQuote} aria-label="Quote">
            <span className={s.navQuoteCircle}><Svg d={ICON.quote} size={25} sw={1.8} /></span>
            <span className={s.navQuoteLabel}>Quote</span>
          </button>
        )}
        {right.map(item)}
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

/** The portal's modules, in the switcher's order, and the dot each wears (Profile's Switch view on a phone reads them too). */
export type ModuleId = "finance" | "principal" | "hr" | "revenue";
export const MODULES: { id: ModuleId; label: string; dot: string }[] = [
  { id: "finance", label: "Finance", dot: s.moduleDotFinance },
  { id: "principal", label: "Principal", dot: s.moduleDotPrincipal },
  { id: "hr", label: "HR", dot: s.moduleDotHr },
  { id: "revenue", label: "Revenue team", dot: s.moduleDotRevenue },
];

/**
 * The foot of the sidebar (2026-10-08): which part of the portal this is, and
 * the others a Principal can switch to. The menu opens upward; a click outside
 * it closes it.
 */
function ModuleSwitcher({ current, onPick }: { current: ModuleId; onPick: (id: ModuleId) => void }) {
  const [open, setOpen] = useState(false);
  const name = MODULES.find(m => m.id === current)?.label ?? "";
  return (
    <div className={s.module}>
      {open && (
        <>
          <div className={s.moduleScrim} onClick={() => setOpen(false)} />
          <div className={s.moduleMenu} role="menu" aria-label="Switch module">
            <span className={s.moduleMenuLabel}>SWITCH MODULE</span>
            {MODULES.map(m => {
              const on = m.id === current;
              return (
                <button key={m.id} type="button" role="menuitemradio" aria-checked={on} className={`${s.moduleRow} ${on ? s.moduleRowOn : ""}`}
                  onClick={() => { setOpen(false); if (!on) onPick(m.id); }}>
                  <span className={`${s.moduleDot} ${m.dot}`} />
                  <span className={s.moduleRowLabel}>{m.label}</span>
                  <Svg d={ICON.check} size={15} sw={2.4} stroke="var(--rv-accent)" style={{ opacity: on ? 1 : 0 }} />
                </button>
              );
            })}
          </div>
        </>
      )}
      <button type="button" className={s.moduleButton} aria-label="Switch module" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <Svg d={ICON.modules} size={17} sw={1.8} stroke="var(--rv-sub)" />
        <span className={s.moduleText}>
          <span className={s.moduleLabel}>MODULE</span>
          <span className={s.moduleName}>{name}</span>
        </span>
        <Svg d={ICON.chevronUp} size={15} sw={2.2} stroke="var(--rv-sub)" />
      </button>
    </div>
  );
}

/** Desktop: the 240px sidebar. */
export function DeskAside({ active, count, notifOpen, me, products, modules, hidden = NONE, home = "today", onGo, onQuote, onNotif, onProfile }: {
  active: Screen;
  /** Screens their ticks close: not listed (2026-10-11). */
  hidden?: readonly Screen[];
  /** Where the wordmark goes: Today, unless their ticks close it. */
  home?: Screen;
  count: number;
  notifOpen: boolean;
  /** Absent while /member is still loading (`AppLoading`): no card at the foot. */
  me?: Me;
  /** The Product List row under its group label — only for an account holding `product_list`. */
  products?: { group: string; onOpen: () => void } | null;
  /** The module switcher — a Principal's, who can open the other modules. */
  modules?: { current: ModuleId; onPick: (id: ModuleId) => void } | null;
  onGo: (screen: Screen) => void;
  onQuote: () => void;
  onNotif: () => void;
  onProfile: () => void;
}) {
  const tab = active === "calc" ? "quote" : active;
  const productsOn = active === "products";
  return (
    <aside className={s.aside}>
      <button className={s.asideLogo} onClick={() => onGo(home)}>
        <span className={s.asideWord}>HOUZS VENTURE</span>
        <span className={s.asideDept}>Revenue</span>
      </button>
      {DESK_NAV.filter(n => !hidden.includes(n.id)).map(n => {
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
      {products && (
        <>
          <span className={s.asideGroup}>{products.group}</span>
          <button className={`${s.asideNav} ${productsOn ? s.asideNavOn : ""}`} onClick={products.onOpen} aria-current={productsOn ? "page" : undefined}>
            <Svg d={ICON.cube} size={20} sw={1.8} />Product List
          </button>
        </>
      )}
      <div className={s.asideSpacer} />
      {modules && <ModuleSwitcher current={modules.current} onPick={modules.onPick} />}
      {me && (
        <button className={s.asideMe} onClick={onProfile}>
          <span className={s.asideAvatar}>{me.ini}</span>
          <span className={s.asideMeText}>
            <span className={s.asideMeName}>{me.name}</span>
            <span className={s.asideMeSub}>{[me.title, me.rank].filter(Boolean).join(" · ")}</span>
          </span>
        </button>
      )}
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
