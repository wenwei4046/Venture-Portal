"use client";

import { ICON, Svg } from "../icons";
import Sheet, { SheetHandle } from "../Sheet";
import { ordinal } from "../format";
import { PageHead } from "./IncomePages";
import type { HonourBoard, HonourKind, HonoursVM } from "./profile-vm";
import s from "./profile.module.css";

const KINDS: { id: HonourKind; label: string }[] = [
  { id: "monthly", label: "Monthly" }, { id: "quarterly", label: "Quarterly" }, { id: "annual", label: "Annual" },
];
const BOARD: Record<HonourBoard, string> = { Sales: s.boardSales, Margin: s.boardMargin, KPI: s.boardKpi, Championship: s.boardChamp, Fair: s.boardFair };
const ROW = (place: number) => (place === 1 ? s.p1 : place === 2 ? s.p2 : place === 3 ? s.p3 : "");
const BADGE = (place: number) => (place === 1 ? s.b1 : place === 2 ? s.b2 : place === 3 ? s.b3 : s.bn);
const SHEET_BADGE = (place: number) => (place === 1 ? s.hs1 : place === 2 ? s.hs2 : place === 3 ? s.hs3 : s.hsn);

/** My honours (`hon-style="a"`, lines 953–998): the period's podium, then every place and what it was for. */
export default function HonoursPage({ vm, kind, message, onKind, onBack, onPeriod, onPlace }: {
  vm: HonoursVM | null;
  message?: string | null;
  kind: HonourKind;
  onKind: (kind: HonourKind) => void;
  onBack: () => void;
  onPeriod: () => void;
  onPlace: (place: number) => void;
}) {
  return (
    <div className={`${s.page} ${s.pageHonours}`}>
      <PageHead back="Profile" title="My honours" period={vm?.periodLabel ?? ""} centered onBack={onBack} onPeriod={onPeriod} />
      <div className={`${s.seg} ${s.seg3}`}>
        {KINDS.map(k => (
          <button key={k.id} className={`${s.segBtn} ${kind === k.id ? s.segOn : ""}`} onClick={() => onKind(k.id)} aria-pressed={kind === k.id}>{k.label}</button>
        ))}
      </div>
      {!vm ? <p className={s.empty}>{message ?? "Counting your finishes…"}</p> : (
        <>
          <section className={s.honCard}>
            <span className={s.honGlow} />
            <div className={s.honTop}>
              <div>
                <span className={s.honEyebrow}>{vm.eyebrow}</span>
                <span className={s.honCount}>{vm.podiums} podium finish{vm.podiums === 1 ? "" : "es"}</span>
                <span className={s.honOf}>out of {vm.finishes} finish{vm.finishes === 1 ? "" : "es"}</span>
              </div>
              {vm.delta && <span className={s.honDelta}>{vm.delta}</span>}
            </div>
            <div className={s.podium}>
              <Step label="SILVER" place={2} count={vm.podium.silver} medal={s.medalSilver} labelInk={s.labelSilver} step={s.stepSilver} />
              <Step label="GOLD" place={1} count={vm.podium.gold} medal={s.medalGold} labelInk={s.labelGold} step={s.stepGold} />
              <Step label="BRONZE" place={3} count={vm.podium.bronze} medal={s.medalBronze} labelInk={s.labelBronze} step={s.stepBronze} />
            </div>
          </section>
          {vm.highlight && (
            <div className={s.hiCard}>
              <span className={s.hiCoin}><Svg d={ICON.trophy} size={18} sw={2} /></span>
              <span className={s.hiText}><span className={s.hiLabel}>HIGHLIGHT</span><span className={s.hiBody}>{vm.highlight}</span></span>
            </div>
          )}
          {vm.notice ? <p className={s.note}>{vm.notice}</p> : (
            <>
              <p className={s.tapHint}>Tap a place to see what each finish was for</p>
              <section className={s.places}>
                {vm.places.map(p => (
                  <button key={p.place} className={`${s.place} ${ROW(p.place)}`} onClick={() => onPlace(p.place)}>
                    <span className={`${s.placeBadge} ${BADGE(p.place)}`}>{p.short}</span>
                    <span className={s.placeLabel}>{p.label}</span>
                    <span className={s.placeCount}>{p.count}</span>
                    <span className={s.placeUnit}>{p.unit}</span>
                    <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
                  </button>
                ))}
              </section>
            </>
          )}
          <p className={s.note}>Every finish counts, from Sales, Margin, KPI and Championship boards (total and by brand) and your weekly fairs. Joint places count for everyone tied.</p>
        </>
      )}
    </div>
  );
}

function Step({ label, place, count, medal, labelInk, step }: { label: string; place: number; count: number; medal: string; labelInk: string; step: string }) {
  return (
    <div className={s.step}>
      <span className={`${s.medal} ${medal}`}>{count}</span>
      <span className={`${s.medalLabel} ${labelInk}`}>{label}</span>
      <span className={`${s.stepBox} ${step}`}>{ordinal(place)}</span>
    </div>
  );
}

/** One place: every finish behind it (lines 1712–1729). */
export function HonourSheet({ open, place, vm, periodLabel, onClose }: {
  open: boolean;
  place: number | null;
  vm: HonoursVM | null;
  periodLabel: string;
  onClose: () => void;
}) {
  const sheet = place !== null ? vm?.sheets[place] : undefined;
  return (
    <Sheet open={open} onClose={onClose} z={22} maxHeight="84%" scroll peek className={`${s.sheetBody} ${s.sheetGap12}`} label="Finishes">
      <SheetHandle />
      {sheet && place !== null && (
        <>
          <div className={s.hsWho}>
            <span className={`${s.hsBadge} ${SHEET_BADGE(place)}`}>{ordinal(place)}</span>
            <div><span className={s.hsTitle}>{sheet.title}</span><span className={s.hsPeriod}>{periodLabel}</span></div>
          </div>
          <div>
            {sheet.items.map((r, i) => (
              <div key={i} className={s.row}>
                <span className={s.sheetMinW}><span className={s.hsItem}>{r.title}</span><span className={s.rowSub}>{r.sub}</span></span>
                <span className={`${s.boardTag} ${BOARD[r.board]}`}>{r.board}</span>
              </div>
            ))}
          </div>
          <button className={s.done} onClick={onClose}>Done</button>
        </>
      )}
    </Sheet>
  );
}
