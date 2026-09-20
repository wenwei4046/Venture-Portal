import { initials } from "../MemberUI";
import type { Standing } from "./arena-model";
import s from "./ArenaDesignPreview.module.css";
const score = (value: number) => Number(value.toFixed(2)).toString();
export function RankingList({ rows, heading = "Leaderboard", format, points = true, brandPoints = false, showNextGap = false, showNotes = true, unrankedLabel = "Not assigned", selfId = "jia", selfLabel = "You" }: {
  rows: (Standing & { note?: string })[]; heading?: string; format: (value: number) => string; points?: boolean; brandPoints?: boolean; showNextGap?: boolean; showNotes?: boolean; unrankedLabel?: string; selfId?: string; selfLabel?: string;
}) {
  return <section className={s.rankingCard}>
    <div className={s.sectionHead}><h2>{heading}</h2><span>{rows.filter(r => r.position !== null).length} ranked</span></div>
    <ol className={s.rankingList} aria-label={heading}>{rows.map(row => <li key={row.id} className={row.id === selfId ? s.myRow : undefined}>
      <span className={s.place} data-medal={row.eligible && Number.isFinite(row.value) && row.value > 0 && row.position !== null && row.position <= 3 ? row.position : undefined} aria-label={!Number.isFinite(row.value) ? "Pending data" : row.position ? `Rank ${row.position}` : unrankedLabel}>{row.position?.toString().padStart(2, "0") ?? "—"}</span>
      <span className={s.personAvatar}>{initials(row.name)}</span>
      <span className={s.personName}>{row.name}{row.id === selfId && <small>{selfLabel}</small>}{!Number.isFinite(row.value) ? <span className={s.rowNote}>Pending data</span> : !row.eligible && <span className={s.rowNote}>{unrankedLabel}</span>}</span>
      <span className={s.rowAmount}><strong>{row.eligible && Number.isFinite(row.value) ? format(row.value) : "—"}</strong>{points && <small>{!Number.isFinite(row.value) ? "Pending" : row.eligible ? `${score(brandPoints ? row.contributionPoints ?? 0 : row.points)} pts${brandPoints ? " to total" : ""}` : "N/A"}</small>}</span>
      {points && row.position !== null && <span className={s.rankingMeta}>{brandPoints ? row.brandShare != null ? `(${score(row.basePoints)} rank${row.incentivePoints > 0 ? ` + ${score(row.incentivePoints)} incentive` : ""}) × ${score(row.brandShare * 100)}% assigned time = ${score(row.contributionPoints ?? 0)} pts` : "Sum of monthly contributions after each month’s assignment share" : `${row.scoringPosition !== null ? "Rank award" : "Monthly awards"} · ${score(row.basePoints)} rank pts${row.incentivePoints > 0 ? ` + ${score(row.incentivePoints)} incentive` : ""}`}</span>}
      {showNotes && row.note && !brandPoints && <span className={s.rankingMeta}>{row.note}</span>}
      {showNextGap && (() => { const next = rows.filter(peer => peer.value > row.value).at(-1); return next ? <span className={s.rankingMeta}>{score(next.value - row.value)} pts to match #{next.position}</span> : null; })()}
    </li>)}</ol>
  </section>;
}
