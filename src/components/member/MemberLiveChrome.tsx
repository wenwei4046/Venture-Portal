"use client";

import type { MemberPage } from "@/lib/member/types";
import { Icon, initials } from "./MemberUI";
import s from "./MemberLiveWorkspace.module.css";

export function MemberLiveHeader({ name, department, onProfile, onHome }: {
  name: string; department?: string; onProfile: () => void; onHome: () => void;
}) {
  return <header className={s.appHeader} data-arena-chrome>
    <button className={s.logo} onClick={onHome} aria-label="Revenue home">HOUZS<span>REVENUE</span></button>
    <div className={s.headerIdentity}><span>{department}</span>
      <button className={s.profileButton} onClick={onProfile} aria-label="Open profile">{initials(name)}</button>
    </div>
  </header>;
}

export function MemberLiveNav({ active, canQuote, desktop = false, onSelect }: {
  active: MemberPage; canQuote: boolean; desktop?: boolean; onSelect: (page: MemberPage) => void;
}) {
  const entries: { page: MemberPage; icon: string; label: string }[] = [
    { page: "today", icon: "home", label: "Today" },
    { page: "insight", icon: "chart", label: "Insight" },
    ...(canQuote ? [{ page: "quote" as const, icon: "calculator", label: "Quote" }] : []),
    { page: "arena", icon: "trophy", label: "Arena" },
    ...(desktop ? [
      { page: "income" as const, icon: "wallet", label: "Income" },
      { page: "team" as const, icon: "team", label: "My team" },
      { page: "requests" as const, icon: "receipt", label: "Requests" },
      { page: "memos" as const, icon: "bell", label: "Notifications" },
    ] : []),
    { page: "account", icon: "user", label: "Profile" },
  ];
  const selected = desktop ? active : ["team", "requests", "memos"].includes(active) ? "account" : active === "income" ? "insight" : active;
  const content = entries.map(entry => <button key={entry.page} aria-current={selected === entry.page ? "page" : undefined} onClick={() => onSelect(entry.page)}>
    <span className={s.navIcon}><Icon name={entry.icon} size={desktop ? 23 : 25} /></span><span>{entry.label}</span>
  </button>);
  return desktop ? <div className={s.desktopNav}>{content}</div> : <nav className={s.mobileNav} aria-label="Mobile navigation">{content}</nav>;
}
