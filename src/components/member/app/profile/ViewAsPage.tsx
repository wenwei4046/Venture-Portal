"use client";

import { ICON, Svg } from "../icons";
import type { VaGroupVM } from "./profile-vm";
import s from "./profile.module.css";

const SEARCH = "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3";

/**
 * View as (`va-style="a"`, lines 1345–1366): a Principal picks anybody in
 * Revenue and sees the app exactly as they do, read-only. A page that slides
 * in over the app from the right.
 */
export default function ViewAsPage({ open, query, groups, onQuery, onPick, onClose }: {
  open: boolean;
  query: string;
  groups: VaGroupVM[];
  onQuery: (query: string) => void;
  onPick: (staffId: string, departmentId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className={`${s.va} ${open ? s.vaOpen : ""}`} aria-hidden={!open} inert={!open}>
      <div className={s.vaTop}>
        <button className={s.vaBack} onClick={onClose}><Svg d={ICON.chevronLeft} size={22} sw={2} />Profile</button>
      </div>
      <div className={s.vaScroll} data-rv-scroll="1">
        <div>
          <h1 className={s.vaTitle}>View as</h1>
          <p className={s.vaLede}>See the app exactly as this person sees it. Nothing can be changed while viewing.</p>
        </div>
        <div className={s.vaSearch}>
          <Svg d={SEARCH} size={20} sw={2} stroke="var(--rv-accent)" className={s.vaSearchIcon} />
          <input className={s.vaInput} value={query} onChange={e => onQuery(e.target.value)} placeholder="Search name or title" aria-label="Search name or title" />
        </div>
        <div>
          {groups.map(g => (
            <section key={g.title} className={s.vaGroup}>
              <p className={s.vaGroupTitle}>{g.title}</p>
              {g.people.map(p => (
                <button key={`${p.departmentId}:${p.id}`} className={s.vaPerson} onClick={() => onPick(p.id, p.departmentId)}>
                  <span className={`${s.vaAv} ${p.level === 0 ? s.vaAv0 : p.level === 1 ? s.vaAv1 : ""}`}>{p.ini}</span>
                  <span className={s.vaText}>
                    <span className={s.vaName}>{p.name}</span>
                    <span className={s.vaSub}>{p.sub}</span>
                  </span>
                  <span className={`${s.vaAction} ${p.viewing ? s.vaViewing : ""}`}>{p.viewing ? "Viewing" : "View"}</span>
                </button>
              ))}
            </section>
          ))}
          {!groups.length && <p className={s.empty}>Nobody matches “{query}”.</p>}
        </div>
      </div>
    </div>
  );
}
