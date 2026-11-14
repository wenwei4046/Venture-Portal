"use client";

import { useActionState, useId, useState } from "react";
import { resetEmailProblem } from "@/lib/password-reset";
import { InputIcon } from "./MemberLoginForm";
import s from "./MemberLogin.module.css";

/** What the page answers: an error, or the note that the link is on its way. */
export type ResetLinkState = { error: string; sent?: string };

/**
 * Forgot password (2026-11-14): the sign-in's email box again, carrying what was
 * typed there, and *Send reset link*. Supabase emails the login a link to
 * /reset-password; the answer is the same whether the address has a login or not.
 */
export default function ForgotPasswordForm({
  action,
  initialEmail = "",
  onBack,
}: {
  action: (form: FormData) => Promise<ResetLinkState>;
  initialEmail?: string;
  onBack: () => void;
}) {
  const id = useId();
  const emailId = `${id}-email`;
  const [email, setEmail] = useState(initialEmail);
  const [state, formAction, pending] = useActionState(
    async (_previous: ResetLinkState, form: FormData): Promise<ResetLinkState> => {
      const typed = String(form.get("email") ?? "").trim();
      const problem = resetEmailProblem(typed);
      if (problem) return { error: problem };
      form.set("email", typed);
      try {
        return await action(form);
      } catch {
        return { error: "Unable to connect right now. Please try again shortly." };
      }
    },
    { error: "" },
  );

  return (
    <form className={s.form} action={formAction} aria-label="Reset your password" aria-busy={pending}>
      {state.error && (
        <p className={s.error} role="alert">
          {state.error}
        </p>
      )}
      {state.sent && (
        <p className={s.helpPanel} role="status">
          {state.sent}
        </p>
      )}
      <div className={s.field}>
        <label className={s.labelRow} htmlFor={emailId}>
          Work email
        </label>
        <div className={s.inputWrap}>
          <span className={s.inputIcon}>
            <InputIcon name="mail" />
          </span>
          <input
            className={s.input}
            id={emailId}
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={pending}
            placeholder="name@company.com"
          />
        </div>
      </div>
      <button className={s.submit} type="submit" disabled={pending}>
        {pending && <span className={s.submitSpinner} aria-hidden="true" />}
        {pending ? "Sending…" : state.sent ? "Send again" : "Send reset link"}
      </button>
      <button className={`${s.helpToggle} ${s.backLink}`} type="button" onClick={onBack} disabled={pending}>
        Back to sign in
      </button>
    </form>
  );
}
