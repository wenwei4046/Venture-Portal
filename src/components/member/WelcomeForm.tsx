"use client";

import { useActionState, useId, useState } from "react";
import { MIN_PASSWORD_LENGTH, welcomeBlocker } from "@/lib/invite";
import { InputIcon } from "./MemberLoginForm";
import s from "./MemberLogin.module.css";

/** What the page answers. `verified`: their link has signed them in already — only the password is still to save. */
export type WelcomeState = { error: string; verified: boolean };

const FIELDS = [
  { name: "password", label: "New password", placeholder: `At least ${MIN_PASSWORD_LENGTH} characters` },
  { name: "confirm", label: "Confirm password", placeholder: "Type it again" },
] as const;

/**
 * An invite link's two boxes (2026-10-16): the new password and the same again,
 * each with the sign-in page's eye, and Activate. The boxes are checked here
 * first, the same words the page answers with; the link's token rides along
 * hidden. Before the page hydrates the form posts nowhere (React keeps a form
 * whose action is a function from submitting), so a password never lands in
 * the address.
 */
export default function WelcomeForm({
  action,
  token,
}: {
  action: (form: FormData) => Promise<WelcomeState | void>;
  token: string;
}) {
  const id = useId();
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [shown, setShown] = useState({ password: false, confirm: false });
  const [state, formAction, pending] = useActionState(
    async (previous: WelcomeState, form: FormData): Promise<WelcomeState> => {
      const blocker = welcomeBlocker(String(form.get("password") ?? ""), String(form.get("confirm") ?? ""));
      if (blocker) return { error: blocker, verified: previous.verified };
      form.set("verified", previous.verified ? "1" : "");
      try {
        return (await action(form)) ?? { error: "", verified: previous.verified };
      } catch (error) {
        // The framework's redirect must reach the router once they are in.
        if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
        return { error: "Unable to connect right now. Please try again shortly.", verified: previous.verified };
      }
    },
    { error: "", verified: false },
  );

  return (
    <form className={s.form} action={formAction} aria-label="Set your password" aria-busy={pending}>
      {state.error && (
        <p className={s.error} role="alert">
          {state.error}
        </p>
      )}
      <input type="hidden" name="token_hash" value={token} />
      {FIELDS.map((f) => (
        <div key={f.name} className={s.field}>
          <label className={s.labelRow} htmlFor={`${id}-${f.name}`}>
            {f.label}
          </label>
          <div className={s.inputWrap}>
            <span className={s.inputIcon}>
              <InputIcon name="lock" />
            </span>
            <input
              className={s.input}
              id={`${id}-${f.name}`}
              name={f.name}
              type={shown[f.name] ? "text" : "password"}
              autoComplete="new-password"
              value={values[f.name]}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              required
              disabled={pending}
              placeholder={f.placeholder}
            />
            <button
              className={s.passwordToggle}
              type="button"
              aria-label={shown[f.name] ? `Hide ${f.label.toLowerCase()}` : `Show ${f.label.toLowerCase()}`}
              aria-pressed={shown[f.name]}
              onClick={() => setShown((v) => ({ ...v, [f.name]: !v[f.name] }))}
            >
              <InputIcon name={shown[f.name] ? "eyeOff" : "eye"} />
            </button>
          </div>
        </div>
      ))}
      <button className={s.submit} type="submit" disabled={pending}>
        {pending && <span className={s.submitSpinner} aria-hidden="true" />}
        {pending ? "Activating…" : "Activate account"}
      </button>
    </form>
  );
}
