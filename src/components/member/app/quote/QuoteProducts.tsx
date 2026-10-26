"use client";

import { ICON, Svg } from "../icons";
import { accOnlyTitle, liveSets, setMeta, type QCatalog, type QuoteMemory, type RecentSet } from "./quote-model";
import s from "./quote.module.css";

const HISTORY = "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2";
const SEARCH = "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3";

export function Stepper({ step, onProducts }: { step: 1 | 2; onProducts?: () => void }) {
  return (
    <div className={s.stepper}>
      {step === 1 ? (
        <span className={s.stepOn}><span className={s.stepNumOn}>1</span>Products</span>
      ) : (
        <button className={s.stepDone} onClick={onProducts}>
          <span className={s.stepTick}><Svg d="m5 12 4 4L19 6" size={13} sw={2.4} /></span>Products
        </button>
      )}
      <span className={s.stepRule} />
      {step === 1 ? (
        <span className={s.stepOff}><span className={s.stepNumOff}>2</span>Price &amp; margin</span>
      ) : (
        <span className={s.stepOn}><span className={s.stepNumOn}>2</span>Price &amp; margin</span>
      )}
    </div>
  );
}

/** Step 1 — the brand, last used sets, every model, and what sells on its own (241–326). */
export default function QuoteProducts({ catalog, memory, onBrand, onSet, onAll, onFrameOnly, onAccOnly }: {
  catalog: QCatalog;
  memory: QuoteMemory;
  onBrand: () => void;
  onSet: (r: RecentSet) => void;
  onAll: () => void;
  onFrameOnly: () => void;
  onAccOnly: () => void;
}) {
  const sets = liveSets(memory, catalog);
  const n = catalog.models.length;
  const kpi = catalog.kpis.length ? " · KPI items" : "";
  const frames = !catalog.sofa && catalog.frames.length > 0;
  return (
    <div className={s.page}>
      <div>
        <p className={s.eyebrow}>QUOTE</p>
        <button className={s.brandBtn} onClick={onBrand}>
          <span className={s.brandName}>{catalog.name}</span>
          <span className={s.brandKind}>{catalog.sofa ? "Sofa" : "Mattress"}<Svg d={ICON.chevronDown} size={13} sw={2.4} /></span>
        </button>
      </div>
      <Stepper step={1} />
      <section>
        <div className={s.secHead}>
          <h2 className={s.secTitle}>Last used sets</h2>
          <span className={s.secSub}>Tap Use to open the set, then adjust or set the quantity</span>
        </div>
        {sets.length ? (
          <div className={s.recentList}>
            {sets.map((r, i) => {
              const model = catalog.models.find(m => m.key === r.key);
              return (
                <div key={`${r.key}-${i}`} className={s.recentRow}>
                  <Svg d={HISTORY} size={18} sw={1.9} stroke="var(--rv-accent)" className={s.recentIcon} />
                  <span className={s.recentText}>
                    <span className={s.recentName}>{model?.name}</span>
                    <span className={s.recentMeta}>{setMeta(r, catalog)}</span>
                  </span>
                  <button className={s.useBtn} onClick={() => onSet(r)}>Use</button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={s.recentEmpty}>{`Sets you add for ${catalog.name} will appear here.`}</p>
        )}
        <button className={s.allBtn} onClick={onAll}>
          <Svg d={SEARCH} size={18} sw={1.9} stroke="var(--rv-sub)" />
          <span className={s.allText}>
            <span className={s.allName}>{`All ${catalog.name} models`}</span>
            <span className={s.allSub}>{`${n} model${n === 1 ? "" : "s"} · search or browse A–Z`}</span>
          </span>
          <Svg d={ICON.chevronDown} size={18} sw={2} stroke="var(--rv-accent)" />
        </button>
      </section>
      {/* A sofa brand sells its sofa accessories on their own (2026-10-26); bed frames are a mattress's. */}
      {(frames || catalog.accs.length > 0) && (
        <section>
          <div className={s.sepHead}><h2 className={s.secTitle}>Buy separately</h2></div>
          {frames && (
            <button className={s.sepRow} onClick={onFrameOnly}>
              <span>
                <span className={s.sepName}>Bed frame only</span>
                <span className={s.sepSub}>{`${catalog.frames.length} model${catalog.frames.length === 1 ? "" : "s"}${kpi} · ${catalog.name} margin`}</span>
              </span>
              <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
            </button>
          )}
          {catalog.accs.length > 0 && (
            <button className={s.sepRow} onClick={onAccOnly}>
              <span>
                <span className={s.sepName}>{accOnlyTitle(catalog)}</span>
                <span className={s.sepSub}>{`${catalog.accSummary} · ${catalog.name} margin`}</span>
              </span>
              <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
            </button>
          )}
        </section>
      )}
    </div>
  );
}
