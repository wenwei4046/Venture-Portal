import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isTokenHash, welcomeBlocker } from "@/lib/invite";
import { RESET_EXPIRED, RESET_SHARED, openedByEmailLink } from "@/lib/password-reset";
import { VIEW_AS_COOKIE, VIEW_AS_MIRROR_COOKIE, VIEW_AS_PERSON_COOKIE, VIEW_AS_PERSON_MARK } from "@/lib/view-as";
import MemberLoginScreen from "@/components/member/MemberLoginScreen";
import WelcomeForm, { type WelcomeState } from "@/components/member/WelcomeForm";

export const metadata = { title: "Reset your password · HOUZS Venture" };

const WORDS = { form: "Reset your password", submit: "Save new password", pending: "Saving…" };

/**
 * The reset link's page (2026-11-14, the user: "i want forget password … when press, it can send
 * a reset password link"). The sign-in's *Forgot password?* has Supabase email the login a link
 * here (supabase/templates/recovery.html) — /welcome's twin, `type=recovery`.
 *
 * Nothing is spent by opening it: the token is checked only when they press Save (a mail scanner
 * that fetches every link cannot use it up). Then, under their own session — no service role:
 * `verifyOtp` proves the link and signs them in, the portal account must be active and their own
 * (a shared office login is refused, as Change password refuses it), and `updateUser` sets the
 * password. They land where a sign-in lands.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;
  const token = type === "recovery" && isTokenHash(token_hash) ? token_hash : null;

  async function save(form: FormData): Promise<WelcomeState | void> {
    "use server";
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const retry = form.get("verified") === "1";
    const blocker = welcomeBlocker(password, confirm);
    if (blocker) return { error: blocker, verified: retry };

    const supabase = await createClient();
    if (retry) {
      // The link already signed them in and only the password failed: the session it opened may try again,
      // for a few minutes — never a session opened with a password (that would skip the current one).
      const { data } = await supabase.auth.getClaims();
      if (!openedByEmailLink(data?.claims?.amr, Date.now())) return { error: RESET_EXPIRED, verified: false };
    } else {
      const tokenHash = String(form.get("token_hash") ?? "");
      if (!isTokenHash(tokenHash)) return { error: RESET_EXPIRED, verified: false };
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (error) return { error: RESET_EXPIRED, verified: false };
    }

    const { data: who } = await supabase.auth.getUser();
    if (!who.user) return { error: RESET_EXPIRED, verified: false };

    const { data: profile } = await supabase.from("users").select("is_active").eq("id", who.user.id).maybeSingle();
    if (!profile?.is_active) {
      // Only the session this link just opened.
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Your account is not active. Please contact HR.", verified: false };
    }
    // The function postdates database.types.ts.
    const { data: personal, error: personalError } = await (supabase as unknown as SupabaseClient).rpc("my_login_is_personal");
    if (personalError) return { error: "Your password was not saved. Try again.", verified: true };
    if (personal !== true) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: RESET_SHARED, verified: false };
    }

    const { error: saveError } = await supabase.auth.updateUser({ password });
    if (saveError) {
      return {
        error:
          saveError.code === "weak_password"
            ? "Choose a stronger password."
            : saveError.code === "same_password"
              ? "Choose a password different from your old one."
              : "Your password was not saved. Try again.",
        verified: true,
      };
    }

    // A fresh sign-in starts in the account's own view, not a mask left on this browser.
    const jar = await cookies();
    jar.delete(VIEW_AS_COOKIE);
    jar.delete(VIEW_AS_MIRROR_COOKIE);
    jar.delete(VIEW_AS_PERSON_COOKIE);
    jar.delete(VIEW_AS_PERSON_MARK);
    redirect("/");
  }

  return (
    <MemberLoginScreen
      panel={{
        title: token ? "Choose a new password." : "This link is not complete.",
        intro: token
          ? "Type your new password twice to save it."
          : "Open the link from your email again, or ask for a new one on the sign-in page.",
        body: token ? <WelcomeForm action={save} token={token} words={WORDS} /> : null,
      }}
    />
  );
}
