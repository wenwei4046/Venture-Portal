"use client";

import { useRequestEmail, type RequestEmailActions } from "@/components/account/use-request-email";
import { EMAIL_WORDS as W } from "@/lib/account/email-change";
import Sheet from "../Sheet";
import { TONE } from "./IncomePages";
import p from "./password.module.css";
import e from "./email.module.css";

/**
 * Profile › Request to change email (2026-10-16 — the user: their email is the one they sign in with, "不能乱改的，
 * 除非他们 request to change email", an option in their app beside Change password; HR approves it on Attendance ›
 * Requests, which moves their sign-in too). A sheet over Profile, on Change password's: the email they sign in with,
 * their latest request (waiting — with Withdraw —, declined with HR's words, or done), and the new email. Closed, it
 * forgets what was typed.
 */
export default function EmailSheet({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: RequestEmailActions }) {
  const f = useRequestEmail(actions, open);
  const close = () => { if (!f.busy) onClose(); };
  const current = f.mine?.email ?? "";
  const waiting = f.state?.kind === "waiting";
  return (
    <Sheet open={open} onClose={close} z={21} dim="e" maxHeight="88%" scroll className={p.sheet} label={W.title}>
      <span className={p.grab} />
      <div className={p.title}>{W.title}</div>
      <div className={e.fact}>
        <span className={e.factLabel}>{W.current}</span>
        <span className={e.factValue}>{f.loading && !current ? "…" : current || "—"}</span>
      </div>
      {f.sent && waiting && <p className={p.note} role="status">{W.sent(current)}</p>}
      {f.state && (
        <div className={e.card}>
          <div className={e.cardHead}>
            <span className={`${e.chip} ${TONE[f.state.kind === "waiting" ? "pending" : f.state.kind === "approved" ? "good" : "bad"]}`}>
              {f.state.kind === "waiting" ? W.waiting : f.state.kind === "approved" ? W.approved : W.declined}
            </span>
            {f.state.kind === "waiting" && f.state.ref ? <span className={e.ref}>{f.state.ref}</span> : null}
          </div>
          <p className={e.cardText}>
            {f.state.kind === "approved" ? W.approvedLine(f.state.to) : `${W.next} · ${f.state.to}`}
          </p>
          {f.state.kind === "declined" && f.state.note ? <p className={e.cardText}>“{f.state.note}”</p> : null}
          {f.state.kind === "waiting" && (
            <button type="button" className={e.withdraw} onClick={f.withdraw} disabled={f.busy}>{f.busy ? W.withdrawing : W.withdraw}</button>
          )}
        </div>
      )}
      {waiting ? (
        <>
          {f.error && <span className={p.err} role="alert">{f.error}</span>}
          <div className={p.actions}>
            <button type="button" className={p.go} onClick={close} disabled={f.busy}>Done</button>
          </div>
        </>
      ) : (
        <form className={p.form} noValidate onSubmit={ev => { ev.preventDefault(); f.submit(); }}>
          <label className={p.field}>
            <span className={p.label}>{W.next}</span>
            <input className={p.input} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
              value={f.next} onChange={ev => f.setNext(ev.target.value)} disabled={!f.mine} />
          </label>
          {f.error && <span className={p.err} role="alert">{f.error}</span>}
          <div className={p.actions}>
            <button type="button" className={p.cancel} onClick={close} disabled={f.busy}>Cancel</button>
            <button type="submit" className={p.go} disabled={f.busy || !f.mine}>{f.busy ? W.sending : W.send}</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
