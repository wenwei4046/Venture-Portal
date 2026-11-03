"use client";

import { ICON, Svg } from "../icons";
import { initials } from "../format";
import type { InsightMainVM } from "./insight-model";
import { Personal, type InsightMainActions } from "./InsightMain";
import { DateChip } from "./parts";
import s from "./insight.module.css";

/**
 * Insight › My team › a person (2026-11-03 — the user, circling *Team members* on STANLEY's My team beside a member's
 * Personal tab and its *My sales orders*: "i need them can press their team member than can view their order as well
 * like this"): that person's Personal tab, read-only — their sales, KPI items, orders and margin by brand, *All bills*
 * their sales orders — under their name; ‹ My team goes back.
 */
export default function PersonPage({ vm, name, title, dateLabel, failed, onBack, actions }: {
  vm: InsightMainVM["personal"] | null;
  /** Their name and title as My team lists them; empty until the team has been read. */
  name: string;
  title: string;
  dateLabel: string;
  /** Their bills could not be read — nobody under the reader by that id, or the read failed. */
  failed: boolean;
  onBack: () => void;
  actions: Pick<InsightMainActions, "openDate" | "toBills" | "toKpi" | "toWaiting" | "openBrand">;
}) {
  return (
    <div className={s.page}>
      <div className={s.subHead}>
        <div className={s.subTop}>
          <button className={s.back} onClick={onBack}><Svg d={ICON.back} size={20} sw={1.9} />My team</button>
          <DateChip label={dateLabel} small onClick={actions.openDate} />
        </div>
        <div className={s.personHead}>
          <span className={`${s.av} ${s.personAv}`} aria-hidden="true">{initials(name)}</span>
          <span className={s.personText}>
            <h1 className={`${s.subTitle} ${s.personName}`}>{name || "Team member"}</h1>
            {title && <span className={s.personTitle}>{title}</span>}
          </span>
        </div>
      </div>
      {failed ? <p className={s.empty}>These bills are not available.</p>
        : !vm ? <p className={s.empty}>{name ? `Loading ${name}’s sales…` : "Loading the sales…"}</p>
        : <Personal vm={vm} actions={actions} person />}
    </div>
  );
}
