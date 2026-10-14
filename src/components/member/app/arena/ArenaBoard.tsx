"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ICON, Svg } from "../icons";
import type { PeriodKind } from "../insight/period";
import { BOARD_ICON, type ArenaSub, type BoardVM, type FairView, type HeroState, type RankView } from "./arena-model";
import { PERIOD_SEG } from "./ArenaHub";
import CrossFade from "./CrossFade";
import s from "./arena.module.css";

export interface ArenaBoardActions {
  back: () => void;
  openDate: () => void;
  setKind: (kind: PeriodKind) => void;
  setSub: (sub: ArenaSub) => void;
  setBrand: (code: string) => void;
  openChamp: () => void;
  openFairs: () => void;
  /** Insight's brand page — absent when their ticks close Insight (2026-10-11): the foot is not shown. */
  openFoot?: () => void;
}

const medal = (n: number) => (n >= 1 && n <= 3 ? s[`m${n}`] : "");

/** ‹ Arena: the hero fades out over this long before the hub comes back (the refresh handoff's motion). */
export const HERO_OUT_MS = 200;
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * One board: its bank card for a hero (2026-10-14, the refresh handoff §5 — back and the date, the board and your
 * figure beside its icon, your place, the chase, the period), then its ranking (RevenueApp.dc.html 737–884). A board is
 * its own page: the app's header is not drawn over it. The hero rises in as the page opens and fades out on ‹ Arena.
 */
export default function ArenaBoard({ vm, kind, dateLabel, actions }: { vm: BoardVM; kind: PeriodKind; dateLabel: string; actions: ArenaBoardActions }) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const back = () => {
    if (leaving) return;
    if (reducedMotion()) { actions.back(); return; }
    setLeaving(true);
    timer.current = setTimeout(actions.back, HERO_OUT_MS);
  };
  const hero = vm.rank?.hero;
  return (
    <div className={`${s.board} ${s[`t_${vm.board}`]}`}>
      <section className={`${s.hero} ${leaving ? s.heroLeaving : ""}`}>
        <div className={s.heroTop}>
          <button className={s.heroBack} onClick={back}><Svg d={ICON.back} size={20} sw={1.9} />Arena</button>
          <button className={s.heroDate} onClick={actions.openDate}>
            <Svg d={ICON.calendar} size={15} sw={1.9} />{dateLabel}<Svg d={ICON.chevronDown} size={13} sw={2.2} />
          </button>
        </div>
        <div className={s.heroHead}>
          <span className={s.heroHeadText}>
            <h1 className={s.heroTitle}>{vm.title}</h1>
            {hero && (hero.state === "loading" ? <span className={`${s.skel} ${s.heroValueSkel}`} />
              : <CrossFade k={hero.value} block><span className={s.heroValue}>{hero.value}</span></CrossFade>)}
          </span>
          <span className={s.heroIcon}><Svg d={BOARD_ICON[vm.board]} size={20} sw={1.8} /></span>
        </div>
        {vm.rank && <RankHeroBlock rank={vm.rank} />}
        {vm.fair && <FairHeroBlock fair={vm.fair} />}
        <div className={s.heroSeg}>
          {PERIOD_SEG.map(([id, label]) => (
            <button key={id} className={`${s.heroSegBtn} ${kind === id ? s.heroSegOn : ""}`} onClick={() => actions.setKind(id)} aria-pressed={kind === id}>{label}</button>
          ))}
        </div>
      </section>
      <div className={s.body}>
        {vm.tabs.length > 0 && (
          <div className={s.tabs}>
            {vm.tabs.map(t => (
              <button key={t.id} className={`${s.tab} ${vm.sub === t.id ? s.tabOn : ""}`} onClick={() => actions.setSub(t.id)} aria-pressed={vm.sub === t.id}>{t.label}</button>
            ))}
          </div>
        )}
        {vm.brands.length > 0 && (
          <div className={s.chips}>
            {vm.brands.map(b => (
              <button key={b.code} className={`${s.chip} ${vm.brand === b.code ? s.chipOn : ""}`} onClick={() => actions.setBrand(b.code)} aria-pressed={vm.brand === b.code}>{b.label}</button>
            ))}
          </div>
        )}
        {vm.rank && <RankBody rank={vm.rank} onChamp={actions.openChamp} />}
        {vm.fair && <FairBody fair={vm.fair} onFairs={actions.openFairs} />}
        {vm.foot && actions.openFoot && (
          <button className={s.foot} onClick={actions.openFoot}>
            <span className={s.footText}><span className={s.footTitle}>{vm.foot.title}</span><span className={s.footSub}>{vm.foot.sub}</span></span>
            <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
          </button>
        )}
        <p className={s.basis}>{vm.basis}</p>
      </div>
    </div>
  );
}

/**
 * The hero's place: the number, "Not ranked yet" in words, or a placeholder while the board is read — and for a
 * director, who is on no board, who leads it.
 */
function HeroPlace({ state, num, suf, leader }: { state: HeroState; num: string; suf: string; leader?: string }) {
  if (state === "loading") return <span className={`${s.skel} ${s.heroNumSkel}`} role="img" aria-label="Loading your place" />;
  if (state === "unranked") return <span className={s.heroNone}>Not ranked yet</span>;
  if (state === "lead") return <span className={s.heroNone}>{leader ? `${leader} leads` : "Nobody placed yet"}</span>;
  // "off" (KPI not counted this period) keeps the dash: nobody has a place, and nobody will.
  return (
    <CrossFade k={`${num}${suf}`}>
      <span className={s.rankNum}><span className={s.heroNum}>{num}</span><span className={s.heroSuf}>{suf}</span></span>
    </CrossFade>
  );
}

function RankHeroBlock({ rank }: { rank: RankView }) {
  const h = rank.hero;
  return (
    <>
      <div className={s.heroRank}>
        <HeroPlace state={h.state} num={h.num} suf={h.suf} leader={h.leader} />
        {(h.state === "ranked" || h.state === "off") && <span className={s.heroOf}>of {h.count}</span>}
      </div>
      <div className={s.heroChase}><Svg d={ICON.arrowUp} size={16} sw={2.2} className={s.heroChaseIcon} /><span className={s.heroChaseText}>{h.chase}</span></div>
    </>
  );
}

/** Sales › Fair results: your finish and its medals on the hero's place row; no figure beside the board's name. */
function FairHeroBlock({ fair }: { fair: FairView }) {
  const h = fair.hero;
  return (
    <>
      <div className={`${s.heroRank} ${s.heroRankFair}`}>
        <span className={s.heroRank}>
          <HeroPlace state={h.state} num={h.num} suf={h.suf} leader={h.leader} />
          {(h.state === "ranked" || h.state === "off") && <span className={s.heroOf}>of {h.count}</span>}
        </span>
        <span className={s.heroMedals}>
          {h.medals.map(m => (
            <span key={m.n} className={`${s.heroMedal} ${medal(m.n)}`}><span className={s.heroMedalN}>{m.n}</span>{m.count}</span>
          ))}
        </span>
      </div>
      <div className={s.heroChase}><Svg d={ICON.arrowUp} size={16} sw={2.2} className={s.heroChaseIcon} /><span className={s.heroChaseText}>{h.chase}</span></div>
    </>
  );
}

function RankBody({ rank, onChamp }: { rank: RankView; onChamp: () => void }) {
  return (
    <>
      <section>
        <h2 className={s.h2}>Top 3</h2>
        {rank.podium.length ? (
          <div className={s.podium}>
            {rank.podium.map(w => (
              <div key={w.id} className={`${s.podCol} ${medal(w.place)}`}>
                <span className={`${s.podAv} ${w.place === 1 ? s.podAvFirst : ""}`}>{w.ini}</span>
                <span className={s.podName}>{w.name}</span>
                <span className={s.podValue}>{w.value}</span>
                <span className={`${s.podStep} ${w.place === 1 ? s.podStep1 : w.place === 2 ? s.podStep2 : ""}`}>{w.place}</span>
              </div>
            ))}
          </div>
        ) : <p className={s.empty}>Nobody is placed on this board yet.</p>}
      </section>
      {rank.champ && (
        <button className={s.champCard} onClick={onChamp}>
          <span className={s.champTop}>
            <span className={s.champTitle}>How your points add up</span>
            <span className={s.champLink}>Breakdown<Svg d={ICON.chevronRight} size={16} sw={1.8} /></span>
          </span>
          <span className={s.champBar}>
            {rank.champ.groups.map(g => <span key={g.id} className={`${s.champSeg} ${s[`g_${g.id}`]}`} style={{ flex: `${g.num} 1 0` } as CSSProperties} />)}
          </span>
          <span className={s.champLegend}>
            {rank.champ.groups.map(g => (
              <span key={g.id} className={`${s.champLeg} ${s[`g_${g.id}`]}`}><span className={s.champDot} />{g.label} <span className={s.champLegValue}>{g.value}</span></span>
            ))}
          </span>
        </button>
      )}
      <section>
        <div className={s.listHead}><h2 className={s.listTitle}>{rank.listTitle}</h2><span className={s.listCount}>{rank.count} people</span></div>
        {rank.rows.map(r => (
          <div key={r.id} className={`${s.row} ${r.mine ? s.rowMine : ""}`}>
            <span className={`${s.pos} ${s.posNum} ${r.medal ? `${s.posMedal} ${medal(r.medal)}` : ""}`}>{r.pos}</span>
            <span className={`${s.av} ${r.medal ? `${s.avMedal} ${medal(r.medal)}` : r.mine ? s.avMine : ""}`}>{r.ini}</span>
            <span className={s.rowText}>
              <span className={`${s.rowName} ${r.mine ? s.rowNameMine : ""}`}>{r.name}</span>
              {r.tag && <span className={`${s.rowTag} ${r.tag === "you" ? s.tagYou : s.tagNext}`}>{r.tag === "you" ? "You" : "Next to catch"}</span>}
            </span>
            <span className={`${s.rowValue} ${r.muted ? s.rowValueMuted : ""}`}>{r.value}</span>
          </div>
        ))}
      </section>
    </>
  );
}

function FairBody({ fair, onFairs }: { fair: FairView; onFairs: () => void }) {
  return (
    <>
      <section className={s.fairBox}>
        <p className={s.fairLabel}>TOP 3 · MOST FAIR WINS</p>
        {fair.podium.length ? (
          <div className={s.fairGrid} style={{ gridTemplateColumns: `repeat(${fair.podium.length},minmax(0,1fr))` }}>
            {fair.podium.map(w => (
              <div key={w.id} className={`${s.fairCol} ${medal(w.medal)}`}>
                <span className={`${s.fairAv} ${w.big ? s.fairAvFirst : ""}`}>{w.ini}</span>
                <span className={s.fairName}>{w.name}</span>
                <span className={s.fairCounts}>
                  <span className={`${s.fairCount} ${s.fc1}`}>{w.g}</span>
                  <span className={`${s.fairCount} ${s.fc2}`}>{w.s}</span>
                  <span className={`${s.fairCount} ${s.fc3}`}>{w.b}</span>
                </span>
                <span className={`${s.fairStep} ${w.medal === 1 ? s.fairStep1 : w.medal === 2 ? s.fairStep2 : ""}`}>
                  <span className={s.fairPlace}>{w.place}</span><span className={s.fairJoint}>{w.joint}</span>
                </span>
              </div>
            ))}
          </div>
        ) : <p className={s.empty} style={{ padding: "0 6px 16px" }}>No completed fairs in this period yet.</p>}
      </section>
      <button className={s.fairsCard} onClick={onFairs}>
        <span className={s.fairsText}>
          <span className={s.fairsTitle}>Your fairs</span>
          <span className={s.fairsSub}>{fair.entrySub}</span>
          <span className={s.fairsChips}>
            {fair.chips.map((c, i) => <span key={i} className={`${s.fairsChip} ${medal(c.medal)}`}>{c.place}</span>)}
          </span>
        </span>
        <span className={s.view}>View<Svg d={ICON.chevronRight} size={16} sw={1.8} /></span>
      </button>
      <section>
        <div className={`${s.listHead} ${s.listHeadFair}`}><h2 className={s.listTitle}>{fair.tableTitle}</h2><span className={s.listCount}>{fair.rows.length} people</span></div>
        <div className={s.ftHead}>
          <span /><span /><span>Most 1st, then 2nd, then 3rd</span>
          {[1, 2, 3].map(n => <span key={n} className={`${s.ftMedal} ${medal(n)}`}>{n}</span>)}
        </div>
        {fair.rows.map(r => (
          <div key={r.id} className={`${s.ftRow} ${r.mine ? s.rowMine : ""}`}>
            <span className={`${s.pos} ${r.medal ? `${s.posMedal} ${medal(r.medal)}` : ""}`}>{r.pos}</span>
            <span className={`${s.av} ${r.mine ? s.avMine : ""}`}>{r.ini}</span>
            <span className={s.rowText}>
              <span className={`${s.rowName} ${r.mine ? s.rowNameMine : ""}`}>{r.name}</span>
              <span className={`${s.ftSub} ${r.joint ? s.ftSubJoint : ""}`}>{r.sub}</span>
            </span>
            <span className={`${s.ftNum} ${r.g ? s.ftN1 : ""}`}>{r.g}</span>
            <span className={`${s.ftNum} ${r.s ? s.ftN2 : ""}`}>{r.s}</span>
            <span className={`${s.ftNum} ${r.b ? s.ftN3 : ""}`}>{r.b}</span>
          </div>
        ))}
      </section>
    </>
  );
}
