"use client";

import { useState } from "react";
import { ICON, Svg } from "../icons";
import { PageHead } from "./IncomePages";
import type { BrandMonthVM } from "./brand-weeks-model";
import s from "./profile.module.css";

/**
 * My brand weeks — read only since 2026-10-12: where the Houzs ERP's Sales
 * Attending puts the member each fair weekend (no prototype page; built from
 * the app's own row and badge parts). Redrawn the same day for the user: a
 * month to a fold, this month open and the two before it a tap away; per
 * weekend only the brand, the venue and the organizer; never a weekend after
 * this week's. Nothing to pick or save: HR changes the attendance in the ERP,
 * and the page reads it again on the next open or pull.
 */
export default function BrandWeeksPage({ months, viewing, onBack }: {
  months: BrandMonthVM[] | null;
  /** The Principal viewing a member. */
  viewing: boolean;
  onBack: () => void;
}) {
  // Folded by hand: this month is open until somebody closes it; the others open when tapped.
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const lede = viewing
    ? "Where this member works each fair weekend, from the ERP’s Sales Attending. Their Fair result earns points at that booth only."
    : "Where you work each fair weekend, from the ERP’s Sales Attending. Your Fair result earns points at that booth only.";
  return (
    <div className={s.page}>
      <PageHead back="Profile" title={viewing ? "Member brand weeks" : "My brand weeks"} lede={lede} onBack={onBack} />
      {!months ? <p className={s.empty}>Loading your fair weekends…</p> : !months.length ? <p className={s.empty}>No fair weekends yet.</p> : (
        <div className={s.bwMonths}>
          {months.map((m, i) => {
            const open = folds[m.period] ?? i === 0;
            const weeksId = `brand-weeks-${m.period}`;
            return (
              <section key={m.period} className={s.bwMonth} aria-label={m.label}>
                <button type="button" className={s.bwHead} aria-expanded={open} aria-controls={weeksId}
                  onClick={() => setFolds(f => ({ ...f, [m.period]: !open }))}>
                  <span className={s.bwMonthName}>{m.label}</span>
                  <span className={s.bwCount}>{m.summary}</span>
                  <Svg d={ICON.chevronDown} size={18} sw={2} className={`${s.bwChevron} ${open ? s.bwChevronOpen : ""}`} />
                </button>
                {open && (
                  <div id={weeksId} className={s.bwWeeks}>
                    {m.weeks.map(w => (
                      <div key={w.key} className={s.bwWeek} data-source={w.source}>
                        <span className={s.bwBadge} style={{ color: w.color, background: w.tint }}>{w.n}</span>
                        <div className={s.bwBody}>
                          <div className={s.bwWhen}>{w.when}{w.current && <span className={s.bwNow}>This week</span>}</div>
                          {w.empty ? <p className={s.bwEmpty}>{w.empty}</p> : (
                            <dl className={s.bwFacts}>
                              <dt>Brand</dt><dd className={s.bwBrandName}>{w.brandName}</dd>
                              <dt>Venue</dt><dd>{w.venue ?? "—"}</dd>
                              <dt>Organizer</dt><dd>{w.organizer ?? "—"}</dd>
                            </dl>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
