"use client";

import { useId, useState, type FormEvent } from "react";
import type { BrandCode } from "./arena-model";
import { allocatedWeeks, isValidBrandWeeks, type MonthlyBrandWeeks } from "./arena-brand-weeks";
import s from "./ArenaBrandWeeksForm.module.css";

const brands: { code: BrandCode; label: string; tone: number }[] = [
  { code: "AKEMI", label: "Akemi", tone: 0 },
  { code: "DUNLOP", label: "Dunlopillo", tone: 1 },
  { code: "ZANOTTI", label: "Zanotti", tone: 2 },
  { code: "ERGOTEX", label: "Ergotex", tone: 3 },
];

interface ArenaBrandWeeksFormProps {
  initialValue?: MonthlyBrandWeeks;
  monthLabel: string;
  onSave: (value: MonthlyBrandWeeks) => { ok: boolean; error?: string };
}

export function ArenaBrandWeeksForm({ initialValue, monthLabel, onSave }: ArenaBrandWeeksFormProps) {
  const id = useId();
  const [draft, setDraft] = useState<MonthlyBrandWeeks>(() => initialValue
    ? { weeks: initialValue.weeks, counts: { ...initialValue.counts } }
    : { weeks: 4, counts: { AKEMI: 0, DUNLOP: 0, ZANOTTI: 0, ERGOTEX: 0 } });
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const allocated = allocatedWeeks(draft);
  const remaining = draft.weeks - allocated;
  const valid = isValidBrandWeeks(draft);

  function changeWeeks(weeks: 4 | 5) {
    setDraft(previous => ({ ...previous, weeks }));
    setFeedback(null);
  }

  function changeBrand(code: BrandCode, difference: number) {
    setDraft(previous => {
      if (difference > 0 && allocatedWeeks(previous) >= previous.weeks) return previous;
      const count = Math.max(0, previous.counts[code] + difference);
      return { ...previous, counts: { ...previous.counts, [code]: count } };
    });
    setFeedback(null);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidBrandWeeks(draft)) return;
    try {
      const result = onSave({ weeks: draft.weeks, counts: { ...draft.counts } });
      setFeedback(result.ok
        ? { ok: true, text: "Saved on this device for the preview." }
        : { ok: false, text: result.error || "Your weeks could not be saved. Please try again." });
    } catch {
      setFeedback({ ok: false, text: "Your weeks could not be saved. Please try again." });
    }
  }

  return <form className={s.form} onSubmit={save} aria-label={`Brand weeks for ${monthLabel}`}>
    <fieldset className={s.monthCard}>
      <legend>Weeks this month</legend>
      <div className={s.weekOptions}>
        {([4, 5] as const).map(weeks => <label className={s.weekOption} key={weeks}>
          <input type="radio" name={`${id}-weeks`} value={weeks} checked={draft.weeks === weeks} onChange={() => changeWeeks(weeks)} />
          <span className={s.weekChoice}>
            <span className={s.tick} aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            {weeks} weeks
          </span>
        </label>)}
      </div>
    </fieldset>

    <section className={s.brandsCard} aria-labelledby={`${id}-brands`}>
      <div className={s.sectionHeading}>
        <h2 id={`${id}-brands`}>Weeks worked per brand</h2>
        <p>Use + and − to fill your month.</p>
      </div>
      <div className={s.brandList}>
        {brands.map(brand => <div className={s.brandRow} key={brand.code} data-tone={brand.tone}>
          <div className={s.brandLabel}>
            <span className={s.brandDot} aria-hidden="true" />
            <div><strong>{brand.label}</strong><span>{Math.round(draft.counts[brand.code] / draft.weeks * 100)}%</span></div>
          </div>
          <div className={s.stepper}>
            <button type="button" aria-label={`Remove 1 week from ${brand.label}`} disabled={draft.counts[brand.code] === 0} onClick={() => changeBrand(brand.code, -1)}>−</button>
            <output aria-label={`${brand.label} weeks`}>{draft.counts[brand.code]}</output>
            <button type="button" aria-label={`Add 1 week to ${brand.label}`} disabled={remaining <= 0} onClick={() => changeBrand(brand.code, 1)}>+</button>
          </div>
        </div>)}
      </div>
      <div className={s.allocation} data-complete={valid} data-over={remaining < 0} aria-live="polite" aria-atomic="true">
        <strong>{allocated} of {draft.weeks} weeks</strong>
        <span>{remaining > 0 ? `${remaining} left` : remaining < 0 ? `Remove ${Math.abs(remaining)}` : "All set"}</span>
      </div>
      {remaining < 0 && <p className={s.overMessage}>Your brand weeks still total {allocated}. Reduce them to {draft.weeks} before saving.</p>}
    </section>

    <div className={s.saveArea}>
      <p>Save to update your ranking formulas.</p>
      <button className={s.saveButton} type="submit" disabled={!valid}>Save brand weeks</button>
      {feedback && <p className={s.feedback} data-error={!feedback.ok} role={feedback.ok ? "status" : "alert"}>{feedback.text}</p>}
    </div>
  </form>;
}
