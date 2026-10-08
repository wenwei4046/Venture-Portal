"use client";

import { ICON, Svg } from "../icons";
import { TONES } from "./ladder";
import type { BrandPageVM } from "./insight-model";
import { SubHead } from "./parts";
import s from "./insight.module.css";

/** One brand's margin: the bar, the next tier, the three tiers around you, its bills (`tierStyle="c"`, 383–455). */
export default function BrandPage({ vm, dateLabel, onBrand, onTiers, onBill, onBack, onDate }: {
  vm: BrandPageVM | null;
  dateLabel: string;
  onBrand: (code: string) => void;
  onTiers: () => void;
  onBill: (id: string) => void;
  onBack: () => void;
  onDate: () => void;
}) {
  if (!vm) {
    return (
      <div className={s.subPage}>
        <SubHead title="Margin" dateLabel={dateLabel} onBack={onBack} onDate={onDate} />
        <p className={s.empty}>No counted sales in this period.</p>
      </div>
    );
  }
  const tone = TONES[vm.tone];
  return (
    <div className={s.subPage}>
      <SubHead title={vm.title} titleClass={s.brandTitle} dateLabel={dateLabel} onBack={onBack} onDate={onDate}>
        <div className={s.brandTabs}>
          {vm.tabs.map(t => (
            <button key={t.code} className={`${s.brandTab} ${t.code === vm.code ? s.brandTabOn : ""}`} onClick={() => onBrand(t.code)} aria-pressed={t.code === vm.code}>
              <span className={s.dot8} style={{ background: t.dot }} />{t.label}
            </button>
          ))}
        </div>
      </SubHead>
      <section className={s.brandHero} style={{ background: vm.tint }}>
        <div className={s.brandHeroTop}>
          <div>
            <span className={s.brandHeroLabel}>Brand margin · {vm.goods}</span>
            <span className={s.brandHeroPct} style={{ color: vm.ink }}>{vm.pct}</span>
          </div>
          <span className={s.brandHeroPill} style={{ color: tone.ink, background: tone.bg }}>{vm.tier}</span>
        </div>
        {vm.bar && (
          <div className={s.mbar}>
            <div className={s.mbarZones}>{vm.bar.zones.map((z, i) => <span key={i} style={{ flex: `${z.flex} 1 0`, background: z.color }} />)}</div>
            {vm.bar.markers.map(m => (
              <span key={m.label}>
                <span className={s.mbarTick} style={{ left: m.left, background: m.color }} />
                <span className={s.mbarTickLabel} style={{ left: m.left, color: m.color }}>{m.label}</span>
              </span>
            ))}
            <span className={s.mbarYou} style={{ left: vm.bar.pos }} />
            <span className={s.mbarYouLabel} style={{ left: vm.bar.pos }}>You</span>
          </div>
        )}
        <div className={s.nextCard}>
          <Svg d={ICON.arrowUp} size={18} sw={2.1} stroke={vm.ink} className={s.nextIcon} />
          <span className={s.nextText}><span className={s.nextTitle}>{vm.nextTitle}</span><span className={s.nextSub}>{vm.nextSub}</span></span>
        </div>
      </section>
      {vm.trio ? (
        <section className={s.tierSect}>
          <h2 className={s.tierHead}>Margin tier</h2>
          <div className={s.trio}>
            {vm.trio.map((t, i) => (
              <div key={i} className={s.trioCard} style={{ borderWidth: t.wide ? "1.5px" : "1px", borderColor: t.border, background: t.bg, opacity: t.op }}>
                {t.isCur && <span className={s.trioYou} style={{ background: t.border }}>You</span>}
                <span className={s.trioName}>{t.name}</span>
                <span className={s.trioRange} style={{ color: t.capInk }}>{t.range}</span>
              </div>
            ))}
          </div>
          <button className={s.allTiers} onClick={onTiers}>{vm.ladderCount}<Svg d={ICON.chevronRight} size={15} sw={1.9} /></button>
        </section>
      ) : vm.ladder.length > 0 && (
        <section>
          <h2 className={s.tierHead}>Margin tiers</h2>
          {vm.ladder.map(l => (
            <div key={l.name} className={s.ladderRow} style={l.on ? { background: vm.tint } : undefined}>
              <span className={s.ladderDot} style={{ background: l.dot }} />
              <span className={s.ladderText}><span className={`${s.ladderName} ${l.on ? s.ladderNameOn : ""}`}>{l.name}</span><span className={s.ladderEffect}>{l.effect}</span></span>
              <span className={s.ladderRange}>{l.range}</span>
            </div>
          ))}
        </section>
      )}
      <section>
        <div className={s.sectHead}><h2 className={s.sectTitle}>Orders by margin</h2><span className={s.sectNote}>Lowest first</span></div>
        {vm.orders.map(o => (
          <button key={o.id} className={s.ordRow} onClick={() => onBill(o.id)}>
            <span className={s.billText}><span className={s.billNo}>{o.no}</span><span className={s.billSub}>{o.meta}</span></span>
            <span className={s.billRight}><span className={s.ordPct} style={{ color: o.ink }}>{o.pct}</span><span className={s.ordTier}>{o.tier}</span></span>
          </button>
        ))}
      </section>
      <p className={s.footnote}>{vm.footnote}</p>
    </div>
  );
}
