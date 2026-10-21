"use client";

import { ICON, Svg } from "../icons";
import type { NotifGroup, NotifItem, NotifTab } from "./notify-model";
import s from "./notifications.module.css";

const TABS: [NotifTab, string][] = [["all", "All"], ["requests", "Requests"], ["memos", "Memos"], ["results", "Results"]];
const KIND_LABEL: Record<NotifItem["kind"], string> = { memo: "Memo", res: "Results", pay: "Commission", req: "Your request", room: "Meeting", hire: "Manpower request", it: "IT support", share: "Share order" };
// A meeting in the rooms' slate, a manpower request in the walnut of Requests (2026-10-11).
const ICON_TONE = { memo: s.k_memo, res: s.k_res, pay: s.k_pay, req: s.k_req, room: s.k_room, hire: s.k_hire, it: s.k_room, share: s.k_req } as const;
const KIND_TONE = { memo: s.kk_memo, res: s.kk_res, pay: s.kk_pay, req: s.kk_req, room: s.kk_room, hire: s.kk_hire, it: s.kk_room, share: s.kk_req } as const;
const DONE_TONE = { green: s.t_green, amber: s.t_amber, red: s.t_red, sub: s.t_sub } as const;

/** The bell's page: what needs you first, then the settled month, then request updates. */
export default function Notifications({ open, summary, tab, groups, onTab, onClose, onReadAll, onOpen }: {
  open: boolean;
  summary: string;
  tab: NotifTab;
  groups: NotifGroup[];
  onTab: (tab: NotifTab) => void;
  onClose: () => void;
  onReadAll: () => void;
  onOpen: (item: NotifItem) => void;
}) {
  return (
    <div className={`${s.page} ${open ? s.pageOpen : ""}`} aria-hidden={!open} inert={!open} role="dialog" aria-label="Notifications">
      <div className={s.bar}>
        <button className={s.back} onClick={onClose}><Svg d={ICON.chevronLeft} size={22} sw={2} />Today</button>
        <button className={s.readAll} onClick={onReadAll}>Mark all read</button>
      </div>
      <div className={s.body}>
        <div><h1 className={s.title}>Notifications</h1><p className={s.summary}>{summary}</p></div>
        <div className={s.tabs}>
          {TABS.map(([id, label]) => (
            <button key={id} className={`${s.tab} ${tab === id ? s.tabOn : ""}`} onClick={() => onTab(id)} aria-pressed={tab === id}>{label}</button>
          ))}
        </div>
        {groups.map(g => (
          <section key={g.title} className={s.group}>
            <h2 className={s.groupTitle}>{g.title}</h2>
            {g.items.map(n => (
              <div key={n.id} className={`${s.card} ${n.unread ? s.cardUnread : ""}`} onClick={() => onOpen(n)} role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(n); } }}>
                <div className={s.row}>
                  <span className={`${s.icon} ${ICON_TONE[n.kind]}`}><Svg d={n.icon} size={19} sw={1.8} /><span className={s.dot} /></span>
                  <div className={s.text}>
                    <div className={s.meta}><span className={`${s.kind} ${KIND_TONE[n.kind]}`}>{KIND_LABEL[n.kind]}</span><span className={s.time}>{n.time}</span></div>
                    <p className={s.itemTitle}>{n.title}</p>
                    <p className={s.itemSub}>{n.sub}</p>
                  </div>
                </div>
                {n.big && (
                  <div className={s.big}>
                    {n.big.map(b => <div key={b.l} className={s.bigCell}><div className={s.bigV}>{b.v}</div><div className={s.bigL}>{b.l}</div></div>)}
                  </div>
                )}
                {n.link && (
                  <button className={s.link} tabIndex={-1}>{n.link}<Svg d={ICON.chevronRightWide} size={18} sw={2} stroke="var(--rv-accent)" /></button>
                )}
                {n.done && (
                  <div className={`${s.done} ${DONE_TONE[n.done.tone]}`}><Svg d={ICON.tick} size={16} sw={2.2} />{n.done.text}</div>
                )}
              </div>
            ))}
          </section>
        ))}
        {!groups.length && <p className={s.empty}>Nothing here right now.</p>}
      </div>
    </div>
  );
}
