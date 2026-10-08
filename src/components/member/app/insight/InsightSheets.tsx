"use client";

import Sheet, { SheetHandle } from "../Sheet";
import { TONES } from "./ladder";
import type { BrandPageVM, OrderSheetVM } from "./insight-model";
import type { PeriodKind, PeriodOption } from "./period";
import s from "./insight.module.css";

const TITLES: Record<PeriodKind, string> = { monthly: "Choose a month", quarterly: "Choose a quarter", annual: "Choose a year" };
const SEG: [PeriodKind, string][] = [["monthly", "Month"], ["quarterly", "Quarter"], ["annual", "Year"]];

/**
 * Choose a month / quarter / year (1509–1529). Insight's variant has the
 * Month / Quarter / Year control; Arena's has none (the board's own hero
 * switches the kind), names the board, and marks the pick in its colour.
 */
export function DateSheet({ open, kind, options, selected, onKind, onPick, onClose, ctx = "Insight", segmented = true, themeClass }: {
  open: boolean;
  kind: PeriodKind;
  options: PeriodOption[];
  /** `from` of the selected period. */
  selected: string;
  onKind?: (kind: PeriodKind) => void;
  onPick: (option: PeriodOption) => void;
  onClose: () => void;
  ctx?: string;
  segmented?: boolean;
  /** Sets `--d-solid` / `--d-ink` / `--d-sub` for the picked option. */
  themeClass?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} z={21} dim="a" className={`${s.datePanel} ${themeClass ?? ""}`} label={TITLES[kind]}>
      <SheetHandle />
      <div className={s.sheetHead}><h2 className={s.sheetTitle}>{TITLES[kind]}</h2><span className={s.sheetCtx}>{ctx}</span></div>
      {segmented && (
        <div className={s.dateSeg}>
          {SEG.map(([id, label]) => (
            <button key={id} className={`${s.dateSegBtn} ${kind === id ? s.dateSegOn : ""}`} onClick={() => onKind?.(id)} aria-pressed={kind === id}>{label}</button>
          ))}
        </div>
      )}
      <div className={s.dateGrid}>
        {options.map(o => {
          const on = o.period.from === selected && o.period.kind === kind;
          return (
            <button key={o.period.from} className={`${s.dateOpt} ${on ? s.dateOptOn : ""}`} onClick={() => onPick(o)} aria-pressed={on}>
              <span>{o.period.short}</span>
              <span className={`${s.dateOptSub} ${o.live ? s.dateOptLive : ""}`}>{o.sub}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/** All of a brand's margin tiers (1760–1778). */
export function TiersSheet({ open, vm, onClose }: { open: boolean; vm: BrandPageVM | null; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} z={21} dim="a" maxHeight="84%" scroll className={s.tiersPanel} label="Margin tiers">
      <SheetHandle />
      <div className={s.sheetHead}><h2 className={s.sheetTitle}>Margin tiers</h2><span className={s.sheetCtx}>{vm ? `${vm.title} · ${vm.pct}` : ""}</span></div>
      <div className={s.tiersList}>
        {vm?.ladder.map(l => (
          <div key={l.name} className={s.ladderRow} style={l.on ? { background: vm.tint } : undefined}>
            <span className={s.ladderDot} style={{ background: l.dot }} />
            <span className={s.ladderText}><span className={`${s.ladderName} ${l.on ? s.ladderNameOn : ""}`}>{l.name}</span><span className={s.ladderEffect}>{l.effect}</span></span>
            <span className={s.ladderRange}>{l.range}</span>
          </div>
        ))}
      </div>
      <button className={s.done} onClick={onClose}>Done</button>
    </Sheet>
  );
}

/** One bill: amount, margin, KPI items and every product line (1779–1805). */
export function OrderSheet({ open, vm, onClose }: { open: boolean; vm: OrderSheetVM | null; onClose: () => void }) {
  const st = vm ? TONES[vm.statusTone] : TONES.none;
  return (
    <Sheet open={open} onClose={onClose} z={22} dim="a" maxHeight="86%" scroll peek className={s.soPanel} label="Sales order">
      <SheetHandle />
      {vm && (
        <>
          <div className={s.soHead}>
            <div className={s.soNoWrap}>
              <span className={s.soNo}>{vm.no}</span>
              <span className={s.soWhere}>{vm.cust} · {vm.where}</span>
            </div>
            <span className={s.soStatus} style={{ color: st.ink, background: st.bg }}>{vm.status}</span>
          </div>
          <div className={s.soCells}>
            <div className={s.soCell}><span className={s.soCellLabel}>Order amount</span><span className={`${s.soCellValue} ${s.soCellNum}`}>{vm.amt}</span></div>
            <div className={s.soCell}><span className={s.soCellLabel}>Margin</span><span className={s.soCellValue} style={{ color: vm.marginInk }}>{vm.margin}</span><span className={s.soCellSub}>{vm.tier}</span></div>
            <div className={s.soCell}><span className={s.soCellLabel}>KPI items</span><span className={s.soCellValue}>{vm.kpi}</span></div>
          </div>
          <div>
            <p className={s.soLinesHead}>PRODUCT LINES</p>
            {vm.lines.map((l, i) => (
              <div key={i} className={s.soLine}>
                <span className={s.soLineText}>
                  <span className={s.soLineName}>{l.name}</span>
                  <span className={s.soLineMeta}><span className={s.soLineQty}>Qty {l.qty}</span>{l.isKpi && <span className={s.soLineKpi}>KPI × {l.kpi}</span>}</span>
                </span>
                <span className={s.soLineAmt}>{l.amt}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <button className={s.done} onClick={onClose}>Done</button>
    </Sheet>
  );
}
