"use client";

import type { CSSProperties } from "react";
import Sheet, { SheetHandle } from "../Sheet";
import type { Board } from "../route";
import type { ChampBreakdown, FairView } from "./arena-model";
import s from "./arena.module.css";

/** The date sheet marks the picked period in the board's colour. */
export function boardThemeClass(board: Board): string {
  return `${s[`t_${board}`]} ${s.dateTheme}`;
}

const medal = (n: number) => (n >= 1 && n <= 3 ? s[`m${n}`] : "");

/** Your fairs: the medal counts and every fair of the period (RevenueApp.dc.html 1806–1835). */
export function FairsSheet({ open, fair, dateLabel, onClose }: { open: boolean; fair: FairView | null; dateLabel: string; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} z={20} dim="a" maxHeight="84%" scroll className={s.sheetPanel} label="Your fairs">
      <SheetHandle />
      <div className={s.sheetHead}><h2 className={s.sheetTitle}>Your fairs</h2><span className={s.sheetCtx}>{fair?.sheet.countText ?? ""} · {dateLabel}</span></div>
      {fair && (
        <>
          <div className={s.fsMedals}>
            {fair.hero.medals.map(m => (
              <div key={m.n} className={`${s.fsMedal} ${medal(m.n)}`}>
                <span className={s.fsMedalLabel}>{m.label}</span>
                <span className={s.fsMedalCount}>{m.count}</span>
              </div>
            ))}
          </div>
          <span className={s.fsOther}>{fair.sheet.other}</span>
          <div>
            {fair.sheet.fairs.map((f, i) => (
              <div key={i} className={s.fsRow}>
                <span className={s.fsText}><span className={s.fsVenue}>{f.venue}</span><span className={s.fsWhen}>{f.dates} · {f.sales}</span></span>
                <span className={`${s.fsFinish} ${medal(f.medal)}`}>{f.finish}</span>
              </div>
            ))}
            {!fair.sheet.fairs.length && <p className={s.empty}>No completed fairs at your brand week&apos;s booth in this period.</p>}
          </div>
        </>
      )}
      <p className={s.note}>Only your own completed weekly fairs count. A shared place counts for everyone tied.</p>
      <button className={s.done} onClick={onClose}>Done</button>
    </Sheet>
  );
}

/** How the Championship points add up (RevenueApp.dc.html 1836–1863). */
export function ChampSheet({ open, champ, onClose }: { open: boolean; champ: ChampBreakdown | null; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} z={20} dim="a" maxHeight="82%" scroll className={s.sheetPanel} label="Championship points">
      <SheetHandle />
      {champ && (
        <>
          <div className={s.csHead}>
            <div><span className={s.csLabel}>Championship · {champ.periodLabel}</span><span className={s.csValue}>{champ.myValue}</span></div>
            <span className={s.csPos}>{champ.myPos} of {champ.count}</span>
          </div>
          <span className={s.csBar}>
            {champ.groups.map(g => <span key={g.id} className={`${s.champSeg} ${s[`g_${g.id}`]}`} style={{ flex: `${g.num} 1 0` } as CSSProperties} />)}
          </span>
          <div>
            {champ.parts.map(c => (
              <div key={c.item} className={`${s.csRow} ${s[`g_${c.group}`]}`}>
                <span className={s.csDot} />
                <span className={s.csText}><span className={s.csName}>{c.label}</span><span className={s.csSub}>{c.sub}</span></span>
                <span className={s.csVal}>{c.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className={s.note}>Points are added together across the period. They are not an average.</p>
      <button className={s.done} onClick={onClose}>Done</button>
    </Sheet>
  );
}
