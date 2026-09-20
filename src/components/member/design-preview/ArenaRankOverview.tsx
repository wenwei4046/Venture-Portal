"use client";

import { Icon } from "../MemberUI";
import s from "./ArenaRankOverview.module.css";

export type ArenaRankView = "sales" | "margin" | "kpi";

export interface ArenaRankOverviewRow {
  view: ArenaRankView;
  label: string;
  rank: number | null;
  value: string;
}

interface ArenaRankOverviewProps {
  rows: readonly ArenaRankOverviewRow[];
  onNavigate: (view: ArenaRankView) => void;
  heading?: string;
}

const icons: Record<ArenaRankView, string> = {
  sales: "chart",
  margin: "target",
  kpi: "receipt",
};

export function ArenaRankOverview({ rows, onNavigate, heading = "Your rankings" }: ArenaRankOverviewProps) {
  return (
    <section className={s.overview} aria-label={heading}>
      <div className={s.heading}>
        <h2>{heading}</h2>
        <span>Current position</span>
      </div>
      <div className={s.table}>
        {rows.map(({ view, label, rank, value }) => (
          <button
            key={view}
            type="button"
            className={s.row}
            data-ranking={view}
            aria-label={`${label}. ${rank === null ? "Not ranked" : `Rank ${rank}`}. ${value}. View leaderboard`}
            onClick={() => onNavigate(view)}
          >
            <span className={s.metric}>
              <span className={s.icon} aria-hidden="true">
                <Icon name={icons[view]} size={18} />
              </span>
              <span className={s.copy}>
                <span className={s.label}>{label}</span>
                <span className={s.value}>{value}</span>
              </span>
            </span>
            <span className={s.position} aria-hidden="true">
              <span>{rank === null ? "Unranked" : "Rank"}</span>
              <strong>{rank === null ? "—" : `#${rank}`}</strong>
            </span>
            <span className={s.arrow} aria-hidden="true">
              <Icon name="chevron" size={14} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
