"use client";

import { useEffect } from "react";
import { ICON, Svg } from "../icons";
import { TONES } from "../insight/ladder";
import type { CalcVM } from "./calc-model";
import { lineNote, type CartLine } from "./quote-model";
import { rm } from "../format";
import { Stepper } from "./QuoteProducts";
import s from "./quote.module.css";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
const BAG = "M6 7h12l-1 13H7L6 7zM9 7a3 3 0 0 1 6 0";

export interface CalcProps {
  vm: CalcVM;
  brandName: string;
  cart: CartLine[];
  fee: string;
  /** A KPI item's fixed price, RM, by its key. */
  kpiEach?: Record<string, number>;
  onPress: (key: string) => void;
  onNext: () => void;
  onBump: (id: string, d: number) => void;
  onFee: (value: string) => void;
  onProducts: () => void;
}

/** A digit, `.` or Backspace typed on a keyboard works the keypad (desktop). */
function useKeyboard(onPress: (key: string) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key) || e.key === ".") onPress(e.key);
      else if (e.key === "Backspace") onPress("del");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPress]);
}

/** Step 2 — the price, its margin, the keypad and what is in the quote (328–382). */
export default function QuoteCalc({ vm, brandName, cart, fee, kpiEach, onPress, onNext, onBump, onFee, onProducts }: CalcProps) {
  useKeyboard(onPress);
  const tone = TONES[vm.tone];
  return (
    <div className={s.calcPage}>
      <Stepper step={2} onProducts={onProducts} />
      <section className={s.card}>
        <div className={s.cardGrid}>
          <div className={s.priceCell}>
            <span className={s.cellLabel}>Selling price</span>
            <div className={s.priceLine}><span className={s.priceRm}>RM</span><span className={s.priceNum}>{vm.priceText}</span><span className={s.caret} /></div>
            <span className={s.priceHint}>{vm.hint}</span>
          </div>
          <div className={s.marginCell} style={{ background: tone.bg }}>
            <span className={s.cellLabel}>Margin</span>
            <div className={s.marginNum} style={{ color: tone.ink }}>{vm.marginText}</div>
            <span className={s.tierChip} style={{ color: tone.ink }}>{vm.tierLabel}</span>
            {vm.penalty && <span className={s.penalty} style={{ color: tone.ink }}>{vm.penalty}</span>}
          </div>
        </div>
        {vm.next && cart.length > 0 && (
          <div className={s.nextRow}>
            <span className={s.nextText}>Reach <strong>{vm.next.tier}</strong> at <strong>{vm.next.price}</strong></span>
            <button className={s.usePrice} onClick={onNext}>Use price</button>
          </div>
        )}
        {vm.note && <div className={s.noteRow}>{vm.note}</div>}
        {vm.pay && (
          <div className={s.kpiBox}>
            {vm.kpi && <div className={s.kpiLine}><span><strong>{vm.kpi.label}</strong> · fixed, not in margin</span><span className={s.kpiAmt}>+ {vm.kpi.total}</span></div>}
            {vm.options && <div className={s.kpiLine}><span><strong>Option charges</strong> · not in margin</span><span className={s.kpiAmt}>+ {vm.options.total}</span></div>}
            <div className={s.payLine}><span>Customer pays</span><span className={s.payAmt}>{vm.pay}</span></div>
          </div>
        )}
      </section>
      <div className={s.keys}>
        {KEYS.map(k => (
          <button key={k} className={s.key} aria-label={k === "del" ? "Delete last digit" : k} onClick={() => onPress(k)}>{k === "del" ? "⌫" : k}</button>
        ))}
      </div>
      <section>
        <div className={s.inHead}>
          <h2 className={s.inTitle}>In this quote · {brandName}</h2>
          <button className={s.editLink} onClick={onProducts}>Edit</button>
        </div>
        {cart.map(l => (
          <div key={l.id} className={s.inLine}>
            <span className={s.inText}>
              <span className={s.inName}>{l.name + (l.size ? " · " + l.size : "")}</span>
              <span className={s.inNote}>{l.kind === "kpi" ? `KPI item · ${rm(kpiEach?.[l.key] ?? 0)} each · not in margin` : lineNote(l, brandName)}</span>
            </span>
            <QtyStepper qty={l.qty} onMinus={() => onBump(l.id, -1)} onAdd={() => onBump(l.id, 1)} />
          </div>
        ))}
        <label className={s.fee}>
          <span className={s.feeLabel}>Additional fee</span>
          <span className={s.feeBox}>
            <span className={s.feeRm}>RM</span>
            <input className={s.feeInput} inputMode="decimal" placeholder="0.00" value={fee} onChange={e => onFee(e.target.value)} />
          </span>
        </label>
      </section>
    </div>
  );
}

export function QtyStepper({ qty, onMinus, onAdd }: { qty: number; onMinus: () => void; onAdd: () => void }) {
  return (
    <div className={s.stepper3}>
      <button className={s.stepBtn} aria-label="Remove one" onClick={onMinus}>−</button>
      <span className={s.stepQty}>{qty}</span>
      <button className={s.stepBtn} aria-label="Add one" onClick={onAdd}>+</button>
    </div>
  );
}

/** The desktop's calculator, docked beside step 1 (1401–1440). */
export function DeskCalc(props: CalcProps & { show: boolean }) {
  const { show, ...calc } = props;
  if (!show) return null;
  return (
    <div className={s.deskCalc}>
      <div className={s.deskHead}>
        <p className={s.deskEyebrow}>CALCULATOR</p>
        <h2 className={s.deskTitle}>Price &amp; margin</h2>
      </div>
      <div className={s.deskBody}>
        <QuoteCalc {...calc} />
      </div>
    </div>
  );
}

/** Step 1's dock: the bag and Set price (1190–1215). */
export function ProductsDock({ items, itemsText, open, onBag, onSetPrice }: {
  items: number; itemsText: string; open: boolean; onBag: () => void; onSetPrice: () => void;
}) {
  return (
    <div className={s.dock}>
      <div className={s.dockRow}>
        <button className={`${s.bagBtn} ${items ? "" : s.bagBtnEmpty}`} onClick={onBag}>
          <span className={s.bag}>
            <Svg d={BAG} size={20} sw={1.8} />
            <span className={s.bagCount}>{items}</span>
          </span>
          <span className={s.bagText}>
            <span className={s.bagItems}>{itemsText}</span>
            <span className={s.bagHint}>
              {!items ? "Nothing added yet" : open ? "Hide" : "View or change"}
              <Svg d="m6 15 6-6 6 6" size={14} sw={2.2} className={`${s.bagChev} ${open ? s.bagChevOpen : ""}`} />
            </span>
          </span>
        </button>
        <button className={`${s.setPrice} ${items ? "" : s.setPriceOff}`} onClick={onSetPrice}>
          Set price<Svg d={ICON.arrowRight} size={18} sw={2} />
        </button>
      </div>
    </div>
  );
}

/** Step 2's dock: Preview customer quote (1217–1221). */
export function CalcDock({ ready, onPreview }: { ready: boolean; onPreview: () => void }) {
  return (
    <div className={s.dock2}>
      <button className={`${s.preview} ${ready ? "" : s.previewOff}`} onClick={onPreview}>
        Preview customer quote<Svg d={ICON.arrowRight} size={18} sw={2} />
      </button>
    </div>
  );
}

