"use client";

import { useActionState, useId, useState } from "react";
import s from "./MemberLogin.module.css";

type LoginState = { error: string };

function InputIcon({ name }: { name: "mail" | "lock" | "eye" | "eyeOff" }) {
  const paths = {
    mail: "M4 5h16v14H4V5Zm0 1 8 6 8-6",
    lock: "M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 4v3",
    eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    eyeOff:
      "m3 3 18 18M10 5c7-1 12 7 12 7s-2 4-5 5M6 6c-3 2-4 6-4 6s3 7 10 7c2 0 3-.3 4-1",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export default function MemberLoginForm({
  action,
  initialError = "",
  preview = false,
}: {
  action: (form: FormData) => Promise<LoginState | void>;
  initialError?: string;
  preview?: boolean;
}) {
  const id = useId();
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;
  const helpId = `${id}-help`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (_previous: LoginState, form: FormData) => {
      if (preview)
        return {
          error: "This is a design preview. Use Preview workspace to explore.",
        };
      try {
        form.set("email", String(form.get("email") ?? "").trim());
        return (await action(form)) ?? { error: "" };
      } catch (error) {
        // Framework redirects must reach the router after a successful sign-in.
        if (error instanceof Error && error.message === "NEXT_REDIRECT")
          throw error;
        return {
          error: "Unable to connect right now. Please try again shortly.",
        };
      }
    },
    { error: initialError },
  );

  return (
    <form
      className={s.form}
      action={formAction}
      aria-label="Member sign-in"
      aria-busy={pending}
    >
      {state.error && (
        <p className={preview ? s.previewNotice : s.error} role="alert">
          {state.error}
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
      <div className={s.field}>
        <div className={s.labelRow}>
          <label htmlFor={passwordId}>Password</label>
          <button
            className={s.helpToggle}
            type="button"
            aria-expanded={showHelp}
            aria-controls={helpId}
            onClick={() => setShowHelp((shown) => !shown)}
          >
            Forgot password?
          </button>
        </div>
        <div className={s.inputWrap}>
          <span className={s.inputIcon}>
            <InputIcon name="lock" />
          </span>
          <input
            className={s.input}
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={pending}
            placeholder="Enter your password"
          />
          <button
            className={s.passwordToggle}
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((shown) => !shown)}
          >
            <InputIcon name={showPassword ? "eyeOff" : "eye"} />
          </button>
        </div>
        <div
          className={s.helpPanel}
          id={helpId}
          hidden={!showHelp}
          role="note"
          aria-label="Password and invitation help"
        >
          Contact HR to reset your password or resend your invitation. Use your
          company work email.
        </div>
      </div>
      <button className={s.submit} type="submit" disabled={pending}>
        {pending && <span className={s.submitSpinner} aria-hidden="true" />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
