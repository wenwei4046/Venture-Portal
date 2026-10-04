"use client";

import Sheet, { SheetHandle } from "../Sheet";
import { ICON, Svg } from "../icons";
import s from "./overlays.module.css";

export interface SubDeptOption {
  id: string;
  name: string;
  abbr: string;
  /** `Home · Senior Executive · Rank B` / `Member · Executive` */
  meta: string;
}

/** Switch sub-department: only the ones the person belongs to. */
export default function SubDeptSheet({ open, options, current, onPick, onClose }: {
  open: boolean;
  options: SubDeptOption[];
  current: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} z={23} dim="a" className={s.sdPanel} label="Switch sub-department">
      <SheetHandle />
      <div>
        <h2 className={s.sdTitle}>Switch sub-department</h2>
        <p className={s.sdSub}>HOUZS Venture · Revenue · the sub-departments you work in</p>
      </div>
      <div className={s.sdList}>
        {options.map(o => {
          const on = o.id === current;
          return (
            <button key={o.id} className={`${s.sdRow} ${on ? s.sdRowOn : ""}`} onClick={() => onPick(o.id)} aria-pressed={on}>
              <span className={s.sdChip}>{o.abbr}</span>
              <span className={s.sdText}><span className={s.sdName}>{o.name}</span><span className={s.sdMeta}>{o.meta}</span></span>
              <span className={s.sdRadio}><Svg d={ICON.tick} size={13} sw={3} className={s.sdTick} /></span>
            </button>
          );
        })}
      </div>
      <p className={s.sdNote}>Sales, Arena boards, income and quotes follow the sub-department you choose. Only sub-departments you are a member of are listed.</p>
    </Sheet>
  );
}
