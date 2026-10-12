"use client";

import { PageHead } from "./IncomePages";
import type { BrandMonthVM } from "./brand-weeks-model";
import s from "./profile.module.css";

/**
 * My brand weeks — read only since 2026-10-12: where the Houzs ERP's Sales
 * Attending puts the member each fair weekend (no prototype page; built from
 * the app's own row and chip parts). One block per month still being worked,
 * this month first. Nothing to pick or save: HR changes the attendance in the
 * ERP, and the page reads it again on the next open or pull.
 */
export default function BrandWeeksPage({ months, viewing, onBack }: {
  months: BrandMonthVM[] | null;
  /** The Principal viewing a member. */
  viewing: boolean;
  onBack: () => void;
}) {
  const lede = viewing
    ? "Where the ERP’s Sales Attending puts this member each fair weekend. Their Fair result earns points at that booth only — one a week."
    : "Where the ERP’s Sales Attending puts you each fair weekend. Your Fair result earns points at that booth only — one a week. A weekend it lists you nowhere counts the booth with the most of your bills. HR changes it in the ERP.";
  return (
    <div className={s.page}>
      <PageHead back="Profile" title={viewing ? "Member brand weeks" : "My brand weeks"} lede={lede} onBack={onBack} />
      {!months ? <p className={s.empty}>Loading your fair weekends…</p> : months.map(m => (
        <section key={m.period} className={s.bwMonth} aria-label={m.label}>
          <div className={s.bwHead}>
            <h2 className={s.h2}>{m.label}</h2>
            <span className={s.bwCount}>{m.listed} of {m.weeks.length} from the ERP</span>
          </div>
          {m.weeks.map(w => (
            <div key={w.key} className={s.bwWeek} data-source={w.source}>
              <div className={s.bwTop}><span className={s.bwTitle}>{w.title}</span><span className={s.bwWhen}>{w.when}</span></div>
              {w.source !== "none" && (
                <div className={s.bwPlace}>
                  <span className={`${s.bwBrand} ${w.source === "erp" ? s.bwBrandOn : s.bwBrandAuto}`}>{w.brandName ?? "No brand"}</span>
                  {w.where && <span className={s.bwWhere}>{w.where}</span>}
                </div>
              )}
              <span className={`${s.bwNote} ${w.source === "auto" ? s.bwLocked : ""}`}>{w.note}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
