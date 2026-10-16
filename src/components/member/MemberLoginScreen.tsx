"use client";

import { useEffect, type ReactNode } from "react";
import MemberLoginForm from "./MemberLoginForm";
import { forgetReads } from "./app/read-memory";
import { forgetMedia } from "./crm/shared/media-cache";
import LoginInstallCard from "@/components/pwa/LoginInstallCard";
import s from "./MemberLogin.module.css";
import { COMPANY_NAME } from "@/lib/company";

type LoginAction = (form: FormData) => Promise<{ error: string } | void>;
const previewAction: LoginAction = async () => ({
  error: "This is a design preview. Use Preview workspace to explore.",
});

type LoginScreenProps = {
  action?: LoginAction;
  initialError?: string;
  preview?: boolean;
  previewHref?: string;
  /**
   * Another job on the same page (2026-10-16 — /welcome, an invite link's
   * password): its own heading, line and form in place of the sign-in's.
   */
  panel?: { title: string; intro: string; body: ReactNode };
};

/** Selected Warm Editorial design for member sign-in and sample previews. */
export default function MemberLoginScreen({
  action = previewAction,
  initialError,
  preview = false,
  previewHref,
  panel,
}: LoginScreenProps) {
  // Every sign-out ends here: the Revenue app's figures kept on this phone go with the session (2026-10-08),
  // so a phone handed to somebody else shows nobody's.
  useEffect(() => {
    if (!preview) { void forgetReads(); void forgetMedia(); }
  }, [preview]);
  return (
    <div className={s.screen} lang="en-MY">
      <header className={s.brandHeader}>
        <div className={s.wordmark} aria-label="HOUZS VENTURE Revenue Workspace">
          HOUZS VENTURE<span>REVENUE WORKSPACE</span>
        </div>
        <span className={s.accessLabel}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v3" />
          </svg>
          Team access
        </span>
      </header>

      <main className={s.layout}>
        <aside className={s.story} aria-label="Your Revenue workspace">
          <div className={s.storyCopy}>
            <p className={s.eyebrow}>A PLACE TO GROW</p>
            <h2>A little closer,<br /><em>every day.</em></h2>
            <p>Your next great offer. Your next milestone.<br />Your team, with you all the way.</p>
          </div>
          <div className={s.art} aria-hidden="true">
            <svg viewBox="0 0 560 350" fill="none">
              <ellipse cx="289" cy="307" rx="212" ry="23" fill="#b9a993" opacity=".16" />
              <path d="M76 274V152a122 122 0 0 1 244 0v98" stroke="#cabda9" strokeWidth="1" />
              <path d="M100 271V153a98 98 0 0 1 196 0v99" stroke="#cabda9" strokeWidth="1" />
              <path d="M124 263V154a74 74 0 0 1 148 0v99" stroke="#cabda9" strokeWidth="1" />
              <path d="m112 276 99-45 96 40-99 46z" fill="#c0ad95" />
              <path d="m112 276 96 41v-47l-96-41z" fill="#bca88e" />
              <path d="m208 317 99-46v-47l-99 46z" fill="#a38a70" />
              <path d="m112 229 99-45 96 40-99 46z" fill="#e4d7c3" />
              <path d="m211 231 96 40v-97l-96-40z" fill="#c5b197" />
              <path d="m307 271 99-45v-97l-99 45z" fill="#b29a7f" />
              <path d="m211 134 99-45 96 40-99 45z" fill="#eee2cf" />
              <path d="m310 186 96 40V81l-96-40z" fill="#d0bea4" />
              <path d="m406 226 74-35V47l-74 34z" fill="#bca488" />
              <path d="m310 41 74-35 96 41-74 34z" fill="#f5ebdc" />
              <path d="M149 215c15-17 41-22 67-16 44 10 55-18 56-40 0-19 14-37 47-32 30 5 50-14 55-36" stroke="#fdfaf4" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 7" />
              <circle cx="150" cy="215" r="6" fill="#5a3e2b" stroke="#f5ebdc" strokeWidth="3" />
              <circle cx="274" cy="156" r="6" fill="#5a3e2b" stroke="#f5ebdc" strokeWidth="3" />
              <circle cx="389" cy="54" r="22" fill="#5a3e2b" />
              <path d="m389 42 3.1 8.9 9.4 3.1-9.4 3.1-3.1 8.9-3.1-8.9-9.4-3.1 9.4-3.1z" fill="#f5ebdc" />
            </svg>
            <span className={s.artNote}>Small steps. Real progress.</span>
          </div>
          <div className={s.storyFooter}>
            <span>Better offers</span><span>Clear progress</span><span>Shared wins</span>
          </div>
        </aside>

        <section className={s.loginColumn} aria-labelledby="member-login-heading">
          <div className={s.loginContent}>
            {preview && <p className={s.previewBadge}>Design preview · No account needed</p>}
            <div className={s.welcomeMark} aria-hidden="true">
              <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 27V9l10-4 10 4v18M11 27V13l10-4M16 27v-8M6 27h20" />
                <path d="m22 3 1 2m5 1-2 1" />
              </svg>
            </div>
            <h1 id="member-login-heading">{panel ? panel.title : "Welcome back."}</h1>
            <p className={s.intro}>{panel ? panel.intro : "Let’s make today a little more rewarding."}</p>
            {panel ? (
              panel.body
            ) : (
              <>
                <MemberLoginForm action={action} initialError={initialError} preview={preview} />
                {previewHref && (
                  <a className={s.previewLink} href={previewHref}>
                    {preview ? "Preview workspace" : "Explore the demo"}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14m-6-6 6 6-6 6" />
                    </svg>
                  </a>
                )}
                <LoginInstallCard />
                <p className={s.invitation}><strong>New to the team?</strong> Your HR team will help you get started.</p>
              </>
            )}
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <span>{COMPANY_NAME}</span>
        <span>Your team. Your next chapter.</span>
      </footer>
    </div>
  );
}
