"use client";

import { ICON, Svg } from "../icons";
import type { RecordVM } from "./arena-model";
import s from "./arena.module.css";

/** Highest Fair Record — everyone's best single fair (RevenueApp.dc.html 700–736). */
export default function ArenaRecord({ vm, onBack }: { vm: RecordVM; onBack: () => void }) {
  return (
    <div className={s.recPage}>
      <div className={s.subHead}>
        <button className={s.back} onClick={onBack}><Svg d={ICON.back} size={20} sw={1.9} />Arena</button>
        <h1 className={s.subTitle}>Highest Fair Record</h1>
        <p className={s.subLede}>Everyone&apos;s best single fair, all time</p>
      </div>
      <section className={s.hall}>
        <p className={s.hallLabel}>HALL OF RECORDS</p>
        <div className={s.hallGrid}>
          {vm.podium.map(w => {
            const first = w.place === 1;
            return (
              <div key={w.id} className={`${s.hallCol} ${s[`m${w.place}`]}`}>
                <span className={`${s.hallAv} ${first ? s.hallAvFirst : ""}`}>
                  {w.ini}
                  {first && <span className={s.crown}><Svg d={ICON.trophy} size={15} sw={2} /></span>}
                </span>
                <span className={s.hallName}>{w.name}</span>
                <span className={`${s.hallAmt} ${first ? s.hallAmtFirst : ""}`}>{w.amt}</span>
                <span className={s.hallWhere}>{w.venue}<br />{w.dates}</span>
                <span className={`${s.hallStep} ${first ? s.hallStep1 : w.place === 2 ? s.hallStep2 : ""}`}>
                  <span className={s.hallPlace}><span className={`${s.hallNum} ${first ? s.hallNumFirst : ""}`}>{w.place}</span><span className={s.hallSuf}>{w.suf}</span></span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <div className={s.myBest}>
        <span className={s.myBestLabel}>Your best · {vm.myPos}</span>
        <span className={s.myBestAmt}>{vm.myAmt}</span>
      </div>
      <section>
        {vm.rest.map(r => (
          <div key={r.id} className={`${s.recRow} ${r.mine ? s.recRowMine : ""}`}>
            <span className={`${s.pos} ${r.medal ? `${s.posMedal} ${s[`m${r.medal}`]}` : ""}`}>{r.pos}</span>
            <span className={s.rowText}>
              <span className={`${s.recName} ${r.mine ? s.rowNameMine : ""}`}>{r.name}</span>
              <span className={s.recWhere}>{r.where}</span>
            </span>
            <span className={s.recAmt}>{r.amt}</span>
          </div>
        ))}
      </section>
      <p className={s.recNote}>One fair only, never added together. A record stays until it is beaten.</p>
    </div>
  );
}
