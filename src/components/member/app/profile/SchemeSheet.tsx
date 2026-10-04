"use client";

import Sheet, { SheetHandle } from "../Sheet";
import type { SchemeVM } from "./scheme-model";
import s from "./profile.module.css";

/** Commission scheme — the Profile chip (no prototype sheet; the person sheet's parts). */
export default function SchemeSheet({ open, vm, onClose }: { open: boolean; vm: SchemeVM | null; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} z={22} className={`${s.sheetBody} ${s.sheetGap14}`} label="Commission scheme">
      <SheetHandle />
      {vm && (
        <>
          <div className={s.psWho}>
            <span className={`${s.psAv} ${s.psAvMe}`}>{vm.ini}</span>
            <div className={s.sheetMinW}><span className={s.psName}>Commission scheme</span><span className={s.psRole}>{vm.name} · {vm.role}</span></div>
          </div>
          <div className={s.grid3}>
            {vm.stats.map(x => (
              <div key={x.label} className={s.cell}><span className={s.cellLabel}>{x.label}</span><span className={s.psValue}>{x.value}</span></div>
            ))}
          </div>
          {vm.brands.map(b => (
            <div key={b.brand} className={s.schemeTiers}>
              <p className={s.schemeBrand}>{b.brand.toUpperCase()} · MARGIN LADDER</p>
              {b.rows.map(r => (
                <div key={r.label} className={s.schemeTier}>
                  <span><span className={s.schemeTierLabel}>{r.label}</span><span className={s.schemeTierSub}>{r.sub}</span></span>
                  <span className={s.schemeTierValue}>{r.value}</span>
                </div>
              ))}
            </div>
          ))}
          <p className={s.sheetNote}>{vm.note}</p>
          <button className={s.done} onClick={onClose}>Done</button>
        </>
      )}
    </Sheet>
  );
}
