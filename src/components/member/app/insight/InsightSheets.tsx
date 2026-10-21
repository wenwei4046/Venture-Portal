"use client";

import { useEffect, useRef, useState } from "react";
import Sheet, { SheetHandle } from "../Sheet";
import { ICON, Svg } from "../icons";
import { TONES } from "./ladder";
import type { BrandPageVM, OrderSheetVM } from "./insight-model";
import type { PeriodKind, PeriodOption } from "./period";
import s from "./insight.module.css";
import t from "./share/share.module.css";

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

/** The bill's share request still open (2026-10-21): its id, and its state in words. */
export interface OrderShareRequest { id: string; status: string }

/**
 * One bill: amount, margin, KPI items and every product line (1779–1805). Its ⋯ (2026-10-21 — the user, circling the
 * deposit chip: "加一个三点，可以 share order request") shares the reader's own bill with colleagues, or opens the request
 * already open on it; a shared bill says who holds what.
 */
export function OrderSheet({ open, vm, onClose, canShare = false, request = null, onShare, onRequest }: {
  open: boolean;
  vm: OrderSheetVM | null;
  onClose: () => void;
  /** Share order is in the ⋯: the reader's own bill, and a sender (or View as, whose sheet sends nothing). */
  canShare?: boolean;
  request?: OrderShareRequest | null;
  onShare?: () => void;
  onRequest?: (id: string) => void;
}) {
  const st = vm ? TONES[vm.statusTone] : TONES.none;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasMenu = !!vm?.own && (canShare || !!request);
  useEffect(() => { if (!open) setMenu(false); }, [open, vm?.no]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", key); };
  }, [menu]);
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
            <div className={t.headEnd} ref={menuRef}>
              <span className={s.soStatus} style={{ color: st.ink, background: st.bg }}>{vm.status}</span>
              {hasMenu && (
                <button className={t.more} aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
                  <Svg d={ICON.more} size={18} sw={3} />
                </button>
              )}
              {hasMenu && menu && (
                <div className={t.menu} role="menu">
                  {request ? (
                    <button className={t.menuItem} role="menuitem" onClick={() => { setMenu(false); onRequest?.(request.id); }}>
                      <Svg d={ICON.share} size={18} sw={1.9} /><span className={t.menuText}>Share request</span>
                    </button>
                  ) : (
                    <button className={t.menuItem} role="menuitem" onClick={() => { setMenu(false); onShare?.(); }}>
                      <Svg d={ICON.share} size={18} sw={1.9} /><span className={t.menuText}>Share order</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {request && vm.own && (
            <button className={t.shareRow} onClick={() => onRequest?.(request.id)}>
              <span className={t.shareIcon}><Svg d={ICON.share} size={18} sw={1.9} /></span>
              <span className={t.shareText}><span className={t.shareLabel}>SHARE REQUEST</span><span className={t.shareWait}>{request.status}</span></span>
              <Svg d={ICON.chevronRight} size={16} sw={2} />
            </button>
          )}
          {vm.share && (
            <div className={t.shareRow}>
              <span className={t.shareIcon}><Svg d={ICON.share} size={18} sw={1.9} /></span>
              <span className={t.shareText}><span className={t.shareLabel}>SHARED</span><span className={t.shareLine}>{vm.share.line}</span><span className={t.shareSub}>{vm.share.sub}</span></span>
            </div>
          )}
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
