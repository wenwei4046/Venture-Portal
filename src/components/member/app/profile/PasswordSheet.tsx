"use client";

import { useEffect } from "react";
import { PASSWORD_CHANGED, useChangePassword, type ChangePassword } from "@/components/account/use-change-password";
import { MIN_PASSWORD_LENGTH, type PasswordChange } from "@/lib/account/password";
import Sheet from "../Sheet";
import p from "./password.module.css";

/** The three boxes, in the order the user asked for them. */
const BOXES: Array<{ key: keyof PasswordChange; label: string; autoComplete: "current-password" | "new-password" }> = [
  { key: "current", label: "Current password", autoComplete: "current-password" },
  { key: "next", label: `New password · at least ${MIN_PASSWORD_LENGTH} characters`, autoComplete: "new-password" },
  { key: "confirm", label: "Confirm new password", autoComplete: "new-password" },
];

/**
 * Profile › Change password (2026-10-12 — the user: a change password "in their profile tab": the current one, then the
 * new one, then the new one again; "just for that personal acc"). A sheet over Profile; the portal's rules and its one
 * action (lib/account). Closed, it forgets everything typed into it.
 */
export default function PasswordSheet({ open, onClose, change }: { open: boolean; onClose: () => void; change: ChangePassword }) {
  const f = useChangePassword(change);
  const { reset } = f;
  useEffect(() => { if (!open) reset(); }, [open, reset]);
  return (
    <Sheet open={open} onClose={onClose} z={21} dim="e" maxHeight="88%" scroll className={p.sheet} label="Change password">
      <span className={p.grab} />
      <div className={p.title}>Change password</div>
      {f.done ? (
        <>
          <p className={p.note} role="status">{PASSWORD_CHANGED}</p>
          <div className={p.actions}>
            <button type="button" className={p.go} onClick={onClose}>Done</button>
          </div>
        </>
      ) : (
        <form className={p.form} noValidate onSubmit={e => { e.preventDefault(); f.submit(); }}>
          {BOXES.map(box => (
            <label key={box.key} className={p.field}>
              <span className={p.label}>{box.label}</span>
              <input className={p.input} type={f.shown ? "text" : "password"} autoComplete={box.autoComplete} spellCheck={false}
                value={f.form[box.key]} onChange={e => f.set(box.key)(e.target.value)} />
            </label>
          ))}
          <label className={p.show}>
            <input type="checkbox" checked={f.shown} onChange={e => f.setShown(e.target.checked)} />
            Show passwords
          </label>
          {f.error && <span className={p.err} role="alert">{f.error}</span>}
          <div className={p.actions}>
            <button type="button" className={p.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={p.go} disabled={f.busy}>{f.busy ? "Changing…" : "Change password"}</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
