"use client";

import { ICON, Svg } from "../icons";
import Sheet, { SheetHandle } from "../Sheet";
import type { CoSheetVM, IncomeOrdersVM, IncomeVM, Tone } from "./profile-vm";
import s from "./profile.module.css";

export const TONE: Record<Tone, string> = { good: s.toneGood, neutral: s.toneNeutral, warn: s.toneWarn, bad: s.toneBad, none: s.toneNone };

/** ‹ Back, the period chip, the title — every page inside Profile opens this way. */
export function PageHead({ back, title, period, lede, centered, onBack, onPeriod }: {
  back: string;
  /** The back link centred on the chip's row rather than at its top. */
  centered?: boolean;
  title: string;
  period?: string;
  lede?: string;
  onBack: () => void;
  onPeriod?: () => void;
}) {
  const backBtn = <button className={`${s.back} ${centered ? s.backCenter : ""}`} onClick={onBack}><Svg d={ICON.back} size={20} sw={1.9} />{back}</button>;
  return (
    <div className={s.head}>
      {period !== undefined ? (
        <div className={s.headRow}>{backBtn}<button className={s.period} onClick={onPeriod} disabled={!onPeriod}>{period}</button></div>
      ) : backBtn}
      <h1 className={s.title}>{title}</h1>
      {lede && <p className={s.lede}>{lede}</p>}
    </div>
  );
}

/** My income (lines 887–924): the month's estimate, its breakdown, and the months before it. */
export function IncomePage({ vm, hidden, message, onBack, onPeriod, onToggleHide, onOrders, onMonth }: {
  vm: IncomeVM | null;
  /** Said instead of "Working out…" when the month could not be read. */
  message?: string | null;
  hidden: boolean;
  onBack: () => void;
  onPeriod: () => void;
  onToggleHide: () => void;
  onOrders: () => void;
  onMonth: (period: string) => void;
}) {
  return (
    <div className={s.page}>
      <PageHead back="Profile" title="My income" period={vm?.periodLabel ?? ""} onBack={onBack} onPeriod={onPeriod} />
      {!vm ? <p className={s.empty}>{message ?? "Working out your income…"}</p> : (
        <>
          <section className={s.incHero}>
            <div className={s.incHeroTop}>
              <span className={s.incHeroLabel}>{vm.heroLabel}</span>
              <button className={s.incEye} onClick={onToggleHide} aria-label="Hide amounts"><Svg d={hidden ? ICON.eyeOff : ICON.eye} size={18} sw={1.8} /></button>
            </div>
            <span className={s.incAmount}>{vm.amount}</span>
            <span className={s.incHeroNote}>{vm.heroNote}</span>
          </section>
          {vm.notice ? <p className={s.note}>{vm.notice}</p> : (
            <section>
              <div className={s.sectHead}><h2 className={s.h2}>Breakdown</h2></div>
              {vm.rows.map(r => (
                <div key={r.label} className={s.row}>
                  <span className={s.sheetMinW}><span className={s.rowLabel}>{r.label}</span><span className={s.rowSub}>{r.sub}</span></span>
                  <span className={`${s.rowAmt} ${r.neg ? s.rowNeg : ""}`}>{r.amt}</span>
                </div>
              ))}
              <div className={s.total}><span>Total</span><span className={s.tabular}>{vm.total}</span></div>
            </section>
          )}
          {vm.hasOrders && (
            <button className={s.linkCard} onClick={onOrders}>
              <span className={s.linkIcon}><Svg d={ICON.receipt} size={20} sw={1.8} /></span>
              <span className={s.linkText}><span className={s.linkTitle}>Commission by order</span><span className={s.linkSub}>Each order line by line, plus team override</span></span>
              <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
            </button>
          )}
          {vm.held && (
            <div className={s.heldNote}><span className={s.heldDot} /><span><strong className={s.heldStrong}>{vm.held.strong}</strong> <span className={s.heldSub}>{vm.held.rest}</span></span></div>
          )}
          {vm.past.length > 0 && (
            <section>
              <div className={s.sectHead}><h2 className={s.h2}>Past months</h2></div>
              {vm.past.map(p => (
                <button key={p.period} className={s.pastRow} onClick={() => onMonth(p.period)}>
                  <span><span className={s.pastMonth}>{p.month}</span><span className={s.pastPaid}>{p.paid}</span></span>
                  <span className={s.pastRight}><span className={s.pastAmt}>{p.amt}</span><span className={`${s.pastStatus} ${p.settled ? "" : s.pastStatusWait}`}>{p.status}</span></span>
                </button>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Commission by order (lines 925–952): every bill and its commission, then the override from the team. */
export function IncomeOrdersPage({ vm, tab, message, onTab, onBack, onPeriod, onRow }: {
  vm: IncomeOrdersVM | null;
  message?: string | null;
  tab: "mine" | "override";
  onTab: (tab: "mine" | "override") => void;
  onBack: () => void;
  onPeriod: () => void;
  onRow: (id: string) => void;
}) {
  const co = vm ? (tab === "mine" ? vm.mine : vm.override) : null;
  return (
    <div className={`${s.page} ${s.pageTight}`}>
      <PageHead back="My income" title="Commission by order" period={vm?.periodLabel ?? ""} centered onBack={onBack} onPeriod={onPeriod} />
      {!vm || !co ? <p className={s.empty}>{message ?? "Working out your commission…"}</p> : (
        <>
          <div className={s.seg}>
            {(["mine", "override"] as const).map(t => (
              <button key={t} className={`${s.segBtn} ${s.segTall} ${tab === t ? s.segOn : ""}`} onClick={() => onTab(t)} aria-pressed={tab === t}>
                {t === "mine" ? vm.mine.tab : vm.override.tab}
              </button>
            ))}
          </div>
          <section className={`${s.coCard} ${tab === "override" ? s.coCardOv : ""}`}>
            <span className={s.coLabel}>{co.label}</span>
            <span className={s.coTotal}>{co.total}</span>
            <span className={s.coBase}>{co.base} · {co.rate}</span>
          </section>
          <section>
            {co.rows.map(r => (
              <button key={r.id} className={s.coRow} onClick={() => onRow(r.id)}>
                <span className={s.sheetMinW}><span className={s.coNo}>{r.no}</span><span className={s.coMeta}>{r.meta}</span></span>
                <span className={s.coRight}><span className={`${s.coPay} ${r.held ? s.coPayHeld : ""}`}>{r.pay}</span><span className={s.coSub}>{r.sub}</span></span>
                <Svg d={ICON.chevronRight} size={14} sw={1.9} stroke="var(--rv-sub)" />
              </button>
            ))}
            {!co.rows.length && <p className={s.empty}>{tab === "mine" ? "No bills this month yet." : "No override from your team this month."}</p>}
          </section>
          <p className={`${s.note} ${s.notePretty}`}>{co.note}</p>
        </>
      )}
    </div>
  );
}

/** One bill, line by line (lines 1730–1758). */
export function CommissionSheet({ open, vm, onClose }: { open: boolean; vm: CoSheetVM | null; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} z={22} maxHeight="86%" scroll className={s.sheetBody} label={vm?.no ?? "Order"}>
      <SheetHandle />
      {vm && (
        <>
          <div className={s.sheetTop}>
            <div className={s.sheetMinW}><span className={s.cpNo}>{vm.no}</span><span className={s.cpMeta}>{vm.meta}</span></div>
            <span className={`${s.tag} ${TONE[vm.tone]}`}>{vm.tag}</span>
          </div>
          <div className={s.grid3}>
            <div className={s.cell}><span className={s.cellLabel}>Order amount</span><span className={s.cellValue}>{vm.amt}</span></div>
            <div className={s.cell}><span className={s.cellLabel}>{vm.commLabel}</span><span className={s.cellValue}>{vm.comm}</span></div>
            <div className={s.cell}><span className={s.cellLabel}>KPI pay</span><span className={`${s.cellValue} ${s.cellKpi}`}>{vm.kpiPay}</span><span className={s.cellSub}>{vm.kpiSub}</span></div>
          </div>
          <div>
            <div className={s.lineHead}><span>PRODUCT LINE</span><span className={s.right}>COMMISSION</span><span className={s.right}>KPI</span></div>
            {vm.lines.map((l, i) => (
              <div key={i} className={s.line}>
                <span className={s.sheetMinW}><span className={s.lineName}>{l.name}</span><span className={s.lineQty}>Qty {l.qty} · {l.amt}</span></span>
                <span className={s.linePay}>{l.pay}</span>
                <span className={`${s.linePay} ${l.kpi ? s.lineKpi : s.lineNone}`}>{l.kpiPay}</span>
              </div>
            ))}
            <div className={s.earn}><span>You earn</span><span className={s.tabular}>{vm.total}</span></div>
          </div>
          <p className={s.sheetNote}>{vm.note}</p>
          <button className={s.done} onClick={onClose}>Done</button>
        </>
      )}
    </Sheet>
  );
}

/** A Principal on a member's own page without anybody picked: the way into View as. */
export function PickSomebody({ title, onBack, onViewAs }: { title: string; onBack: () => void; onViewAs: () => void }) {
  return (
    <div className={s.page}>
      <PageHead back="Profile" title={title} onBack={onBack} />
      <p className={s.note}>{`${title} is a member's own. Pick somebody in Revenue to see theirs, exactly as they do.`}</p>
      <button className={s.vaEntryBtn} onClick={onViewAs}>
        <span className={s.vaEntryIcon}><Svg d={ICON.viewing} size={20} sw={1.8} /></span>
        <span className={s.vaEntryText}>
          <span className={s.vaEntryTitle}>View as a team member</span>
          <span className={s.vaEntrySub}>Pick anyone in Revenue · read-only</span>
        </span>
        <Svg d={ICON.chevronRight} size={16} sw={1.9} stroke="var(--rv-blush)" />
      </button>
    </div>
  );
}
