"use client";

import { ICON, Svg } from "../icons";
import type { Board } from "../route";
import type { PeriodKind } from "../insight/period";
import { BOARD_ICON, type HubVM } from "./arena-model";
import s from "./arena.module.css";

export const PERIOD_SEG: [PeriodKind, string][] = [["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annual", "Annual"]];
/** The Highest Fair Record's medal (the hub's record card). */
export const MEDAL_ICON = "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm-3.5-1.2L7 22l5-3 5 3-1.5-8.2";

/** Arena — your rank on every board (RevenueApp.dc.html 667–699). */
export default function ArenaHub({ vm, kind, onKind, onBoard, onRecord }: {
  vm: HubVM;
  kind: PeriodKind;
  onKind: (kind: PeriodKind) => void;
  onBoard: (board: Board) => void;
  onRecord: () => void;
}) {
  return (
    <div className={s.hub}>
      <div>
        <h1 className={s.title}>Arena</h1>
        <p className={s.lede}>{vm.director ? "Who leads every board" : "Your rank on every board"}{vm.updated ? ` · Updated ${vm.updated}` : ""}</p>
      </div>
      <div className={s.seg}>
        {PERIOD_SEG.map(([id, label]) => (
          <button key={id} className={`${s.segBtn} ${kind === id ? s.segOn : ""}`} onClick={() => onKind(id)} aria-pressed={kind === id}>{label}</button>
        ))}
      </div>
      <div className={s.cards}>
        {vm.cards.map(c => (
          <button key={c.board} className={`${s.card} ${s[`t_${c.board}`]}`} onClick={() => onBoard(c.board)}>
            <span className={s.cardTop}>
              <span className={s.cardIcon}><Svg d={BOARD_ICON[c.board]} size={20} sw={1.8} /></span>
              <span className={s.cardChev}><Svg d={ICON.chevronRight} size={16} sw={1.8} /></span>
            </span>
            <span className={s.cardBody}>
              <span className={s.cardLabel}>{c.label}</span>
              <span className={s.cardRank}>
                {c.state === "loading" ? <span className={`${s.skel} ${s.cardNumSkel}`} />
                  : c.state === "unranked" ? <span className={s.cardNone}>Not ranked yet</span>
                  : c.state === "lead" ? <span className={s.cardNone}>{c.leader ? `${c.leader} leads` : "Nobody placed yet"}</span>
                  : <span className={s.rankNum}><span className={s.cardNum}>{c.rankNum}</span><span className={s.cardSuf}>{c.rankSuf}</span></span>}
                <span className={s.cardOf}>{c.of}</span>
              </span>
              {c.state === "loading" ? <span className={`${s.skel} ${s.cardValueSkel}`} /> : <span className={s.cardValue}>{c.value}</span>}
            </span>
          </button>
        ))}
      </div>
      <button className={s.recCard} onClick={onRecord}>
        <span className={s.recIcon}><Svg d={MEDAL_ICON} size={20} sw={1.8} /></span>
        <span className={s.recText}>
          <span className={s.recTitle}>Highest Fair Record</span>
          <span className={s.recSub}>Everyone&apos;s best single fair, all time</span>
          <span className={s.recLine}>{vm.recordLine}</span>
        </span>
        <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
      </button>
      <p className={s.hint}>Tap a board to open its full ranking.</p>
    </div>
  );
}
