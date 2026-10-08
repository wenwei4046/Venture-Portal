"use client";

import Sheet, { SheetHandle } from "../Sheet";
import { ICON, Svg } from "../icons";
import s from "./overlays.module.css";

export interface BrandOption {
  code: string;
  name: string;
  sofa: boolean;
  models: number;
}

/** "Start a quote": the brands this sub-department sells, from the Product List. */
export default function BrandPicker({ open, brands, current, onQuote, cartItems, onPick, onClose }: {
  open: boolean;
  brands: BrandOption[];
  /** The brand the quote is on. */
  current: string;
  /** True while the Quote page is the open screen. */
  onQuote: boolean;
  cartItems: number;
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  const currentName = brands.find(b => b.code === current)?.name ?? current;
  return (
    <Sheet open={open} onClose={onClose} z={30} dim="a" className={s.bpPanel} label="Start a quote">
      <SheetHandle />
      <div>
        <h2 className={s.bpTitle}>Start a quote</h2>
        <p className={s.bpSub}>Choose the brand you&apos;re selling</p>
      </div>
      <div className={s.bpList}>
        {brands.map(b => {
          const isCurrent = b.code === current;
          return (
            <button key={b.code} className={`${s.bpRow} ${isCurrent && onQuote ? s.bpRowOn : ""}`} onClick={() => onPick(b.code)}>
              <span className={`${s.bpChip} ${isCurrent ? s.bpChipCurrent : ""}`}>{b.name[0]}</span>
              <span className={s.bpText}>
                <span className={s.bpName}>{b.name}</span>
                <span className={s.bpMeta}>{b.sofa ? "Sofa" : "Mattress"} · {b.models} models</span>
              </span>
              <span className={s.bpTag}>{isCurrent ? "Current" : ""}</span>
              <Svg d={ICON.chevronRight} size={16} sw={1.9} stroke="var(--rv-sub)" />
            </button>
          );
        })}
        {!brands.length && <p className={s.bpEmpty}>No brands are set up for quotes in this sub-department yet.</p>}
      </div>
      {cartItems > 0 && (
        <p className={s.bpWarn}>Your cart has {cartItems} item{cartItems === 1 ? "" : "s"} from {currentName}. Choosing another brand clears it.</p>
      )}
    </Sheet>
  );
}
