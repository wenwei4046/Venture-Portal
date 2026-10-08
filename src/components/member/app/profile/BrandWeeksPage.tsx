"use client";

import type { ArenaWeekBrand } from "@/lib/member/arena";
import { PageHead } from "./IncomePages";
import { BRAND_CHOICES, type BrandMonthVM } from "./brand-weeks-model";
import s from "./profile.module.css";

/**
 * My brand weeks — no prototype page (its Profile chip leads nowhere), so it
 * is built from the app's own row, chip and button parts. One block per month
 * still being worked; a week is one brand, tapped again to clear it.
 */
export default function BrandWeeksPage({ months, backOffice, busy, error, saved, onPick, onSave, onBack }: {
  months: BrandMonthVM[] | null;
  /** The Principal viewing a member: every week may change, closed ones too. */
  backOffice: boolean;
  busy: boolean;
  error: string | null;
  saved: boolean;
  onPick: (period: string, week: string, brand: ArenaWeekBrand | undefined) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const dirty = !!months?.some(m => m.dirty);
  const lede = backOffice
    ? "Back office: any week can be changed here, closed ones too."
    : "The brand you worked each fair weekend. Your Fair result scores at that brand's booth — one a week.";
  return (
    <div className={s.page}>
      <PageHead back="Profile" title={backOffice ? "Member brand weeks" : "My brand weeks"} lede={lede} onBack={onBack} />
      {!months ? <p className={s.empty}>Loading your fair weekends…</p> : months.map(m => (
        <section key={m.period} className={s.bwMonth} aria-label={m.label}>
          <div className={s.bwHead}>
            <h2 className={s.h2}>{m.label}</h2>
            <span className={s.bwCount}>{m.picked} of {m.weeks.length} picked</span>
          </div>
          {m.weeks.map(w => (
            <div key={w.key} className={s.bwWeek}>
              <div className={s.bwTop}><span className={s.bwTitle}>{w.title}</span><span className={s.bwWhen}>{w.when}</span></div>
              <div className={s.bwBrands} role="group" aria-label={`${m.label} ${w.title}`}>
                {BRAND_CHOICES.map(b => (
                  <button key={b.code} type="button" className={`${s.bwBrand} ${w.pick === b.code ? s.bwBrandOn : ""}`}
                    aria-pressed={w.pick === b.code} disabled={w.locked || busy}
                    onClick={() => onPick(m.period, w.key, w.pick === b.code ? undefined : b.code)}>{b.name}</button>
                ))}
              </div>
              <span className={`${s.bwNote} ${w.closed ? s.bwLocked : ""}`}>{w.note}</span>
            </div>
          ))}
        </section>
      ))}
      {error && <p className={s.formError} role="alert">{error}</p>}
      {months && (
        <button type="button" className={s.primary} disabled={!dirty || busy} onClick={onSave}>
          {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save brand weeks"}
        </button>
      )}
    </div>
  );
}
