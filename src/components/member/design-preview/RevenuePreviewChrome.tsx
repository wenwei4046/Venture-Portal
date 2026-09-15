"use client";

import { Icon } from "../MemberUI";
import s from "./ArenaDesignPreview.module.css";

export type PreviewDesign = "a" | "b" | "c";
export type PreviewTab = "today" | "insight" | "quote" | "arena" | "profile";

const tabs: { tab: PreviewTab; label: string; icon: string; destination: string }[] = [
  { tab: "today", label: "Today", icon: "home", destination: "page=today" },
  { tab: "insight", label: "Insight", icon: "chart", destination: "view=insight" },
  { tab: "quote", label: "Quote", icon: "calculator", destination: "page=quote" },
  { tab: "arena", label: "Arena", icon: "trophy", destination: "view=arena" },
  { tab: "profile", label: "Profile", icon: "user", destination: "page=account" },
];

export function RevenuePreviewHeader({ design, onProfile, departmentLabel = "Fair", profileInitials = "JE" }: {
  design: PreviewDesign;
  onProfile?: () => void;
  departmentLabel?: string;
  profileInitials?: string;
}) {
  return <header className={s.appHeader} data-arena-chrome>
    <a href={`/member/preview?design=${design}&view=arena`} className={s.wordmark} aria-label="Revenue Arena home">HOUZS<span>REVENUE</span></a>
    <div className={s.headerActions}>
      <span className={s.departmentBadge}>{departmentLabel}</span>
      {onProfile
        ? <button className={s.avatarButton} aria-label="Open profile" onClick={onProfile}>{profileInitials}</button>
        : <a className={s.avatarButton} style={{ display: "grid", placeItems: "center", color: "rgb(var(--arena-on-primary))", textDecoration: "none" }} aria-label="Open profile" href={`/member/preview?design=${design}&page=account`}>{profileInitials}</a>}
    </div>
  </header>;
}

export function RevenuePreviewNav({ design, active, onSelect = {} }: {
  design: PreviewDesign;
  active: PreviewTab;
  onSelect?: Partial<Record<PreviewTab, () => void>>;
}) {
  return <nav className={s.bottomNav} aria-label="Mobile navigation">
    {tabs.map(({ tab, label, icon, destination }) => {
      const content = <><Icon name={icon} /><span>{label}</span></>;
      return onSelect[tab]
        ? <button key={tab} aria-current={active === tab ? "page" : undefined} onClick={onSelect[tab]}>{content}</button>
        : <a key={tab} aria-current={active === tab ? "page" : undefined} href={`/member/preview?design=${design}&${destination}`}>{content}</a>;
    })}
  </nav>;
}
