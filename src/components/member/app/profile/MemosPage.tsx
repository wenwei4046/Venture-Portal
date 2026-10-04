"use client";

import { ICON, Svg } from "../icons";
import Sheet, { SheetHandle } from "../Sheet";
import { PageHead } from "./IncomePages";
import type { MemoCat, MemoVM } from "./profile-vm";
import s from "./profile.module.css";

/** The sender's kind of memo: its icon and colours (the prototype's `CAT`). */
export const MEMO_CAT: Record<MemoCat, { d: string; tone: string; ink: string }> = {
  hr: { d: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", tone: s.catHr, ink: s.inkHr },
  mgmt: { d: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h6", tone: s.catMgmt, ink: s.inkMgmt },
  arena: { d: "M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3", tone: s.catArena, ink: s.inkArena },
  ops: { d: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", tone: s.catOps, ink: s.inkOps },
};

export type MemoTab = "all" | "unread";
/** Unread, or still waiting for the member's acknowledgement. */
export const memoOpen = (m: MemoVM) => !m.read || (m.needsAck && !m.acked);

/** Memos & notifications (lines 1109–1131). */
export default function MemosPage({ memos, tab, onTab, onBack, onOpen }: {
  memos: MemoVM[];
  tab: MemoTab;
  onTab: (tab: MemoTab) => void;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const open = memos.filter(memoOpen).length;
  const shown = memos.filter(m => tab === "all" || memoOpen(m));
  return (
    <div className={`${s.page} ${s.pageTight}`}>
      <PageHead back="Profile" title="Memos & notifications" onBack={onBack} />
      <div className={s.seg}>
        {([["all", "All"], ["unread", `Unread · ${open}`]] as const).map(([id, label]) => (
          <button key={id} className={`${s.segBtn} ${tab === id ? s.segOn : ""}`} onClick={() => onTab(id)} aria-pressed={tab === id}>{label}</button>
        ))}
      </div>
      {shown.map(m => {
        const c = MEMO_CAT[m.cat];
        const unread = !m.read;
        return (
          <button key={m.id} className={`${s.memo} ${unread ? s.memoUnread : ""}`} onClick={() => onOpen(m.id)}>
            <span className={`${s.memoIcon} ${c.tone}`}><Svg d={c.d} size={19} sw={1.8} />{unread && <span className={s.memoDot} />}</span>
            <span className={s.memoText}>
              <span className={s.memoTop}><span className={`${s.memoFrom} ${c.ink}`}>{m.from}</span><span className={s.memoWhen}>{m.when}</span></span>
              <span className={s.memoTitle}>{m.title}</span>
              <span className={s.memoPreview}>{m.paras[0] ?? ""}</span>
              {m.needsAck && <span className={`${s.memoTag} ${m.acked ? s.toneGood : s.toneWarn}`}>{m.acked ? "Acknowledged" : "Needs acknowledgement"}</span>}
            </span>
          </button>
        );
      })}
      {!shown.length && <p className={s.empty}>{memos.length ? "You're all caught up." : "No memos for your department yet."}</p>}
    </div>
  );
}

/** One memo, read in full; acknowledging records the member's name and time for HR (lines 1680–1697). */
export function MemoSheet({ open, memo, busy, readOnly, error, onAck, onClose }: {
  open: boolean;
  memo: MemoVM | null;
  busy: boolean;
  readOnly: boolean;
  error: string | null;
  onAck: () => void;
  onClose: () => void;
}) {
  const c = memo ? MEMO_CAT[memo.cat] : null;
  const needs = !!memo && memo.needsAck && !memo.acked;
  return (
    <Sheet open={open} onClose={onClose} z={22} maxHeight="88%" className={s.mdPanel} label={memo?.title ?? "Memo"}>
      {memo && c && (
        <>
          <div className={s.mdScroll}>
            <SheetHandle />
            <div className={s.mdWho}>
              <span className={`${s.mdIcon} ${c.tone}`}><Svg d={c.d} size={21} sw={1.8} /></span>
              <div className={s.sheetMinW}><span className={`${s.mdFrom} ${c.ink}`}>{memo.from}</span><span className={s.mdWhen}>{memo.whenFull}</span></div>
            </div>
            <h2 className={s.mdTitle}>{memo.title}</h2>
            {memo.paras.map((p, i) => <p key={i} className={s.mdPara}>{p}</p>)}
            {memo.acked && <div className={s.mdAcked}><Svg d={ICON.tick} size={18} sw={2.4} />{memo.ackedText}</div>}
            {error && <p className={s.formError}>{error}</p>}
          </div>
          <div className={s.mdFoot}>
            {needs && !readOnly ? (
              <>
                <button className={s.primary} onClick={onAck} disabled={busy}>{busy ? "Recording…" : "Acknowledge"}</button>
                <span className={s.mdAckNote}>Your name and time are recorded for HR.</span>
              </>
            ) : (
              <button className={s.done} onClick={onClose}>Done</button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
