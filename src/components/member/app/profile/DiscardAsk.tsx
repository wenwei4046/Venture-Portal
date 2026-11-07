"use client";

import { useEffect, useRef } from "react";
import s from "./profile.module.css";

/**
 * Asked over a request form when the phone's Back would drop what is filled in and not sent (2026-11-08 — the side note
 * the user forwarded: with only the claim form open, Back left Requests and the Subject, Remarks, Amount and invoice went
 * with it; the user: "do this"). *Keep editing* comes first and holds the focus; the phone's Back (RequestForm) and a
 * computer's Escape answer it the same way. *Discard* closes the form.
 */
export default function DiscardAsk({ title, onKeep, onDiscard }: { title: string; onKeep: () => void; onDiscard: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const latest = useRef(onKeep);
  useEffect(() => { latest.current = onKeep; }, [onKeep]);

  useEffect(() => {
    keepRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      latest.current();
    };
    // A pull on the question is not a pull on the sheet under it (Sheet's swipe-down listens on its panel).
    const el = root.current;
    const hold = (e: TouchEvent) => e.stopPropagation();
    window.addEventListener("keydown", onKey, true);
    el?.addEventListener("touchstart", hold, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      el?.removeEventListener("touchstart", hold);
    };
  }, []);

  return (
    <div ref={root} className={s.rfAsk} role="alertdialog" aria-modal="true" aria-label={title}>
      <div className={s.rfAskCard}>
        <span className={s.rfAskTitle}>{title}</span>
        <div className={s.rfAskBtns}>
          <button ref={keepRef} type="button" className={s.rfAskKeep} onClick={onKeep}>Keep editing</button>
          <button type="button" className={s.rfAskDrop} onClick={onDiscard}>Discard</button>
        </div>
      </div>
    </div>
  );
}
