import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isTokenHash, welcomeBlocker } from "@/lib/invite";
import { VIEW_AS_COOKIE, VIEW_AS_MIRROR_COOKIE, VIEW_AS_PERSON_COOKIE, VIEW_AS_PERSON_MARK } from "@/lib/view-as";
import MemberLoginScreen from "@/components/member/MemberLoginScreen";
import WelcomeForm, { type WelcomeState } from "@/components/member/WelcomeForm";

export const metadata = { title: "Set your password · HOUZS Venture" };

const EXPIRED = "This invite link has expired or was already used. Ask HR to send you a new one.";
/** How long after the link was used its own session may still set the password (a save that failed). */
const RETRY_MINUTES = 15;

/**
 * The invite link's page (2026-10-16, the user: "他是把 invite 链接点过去…
 * 填他的 new password，再填多一次 double confirm password，然后他就可以
 * activate 了"). People › Invite user › Send invite link makes the login and
 * Supabase emails this address — or HR passes it on by hand.
 *
 * Nothing is spent by opening it: the token is checked only when they press
 * Activate (a mail scanner that fetches every link cannot use it up). Then,
 * under their own session and nobody else's — no service role here:
 * `verifyOtp` proves the link and signs them in (it also confirms the invite,
 * which is what ends People's *Invited*), `updateUser` sets the password, and
 * the portal account must be active, as the sign-in asks. They land where a
 * sign-in lands: `/` sends each to their own app.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;
  const token = type === "invite" && isTokenHash(token_hash) ? token_hash : null;

  async function activate(form: FormData): Promise<WelcomeState | void> {
    "use server";
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const retry = form.get("verified") === "1";
    const blocker = welcomeBlocker(password, confirm);
    if (blocker) return { error: blocker, verified: retry };

    const supabase = await createClient();
    if (retry) {
      // Their link already signed them in and only the password failed: the same, fresh session may try
      // again — never an older one (somebody else signed in on a shared computer changes nothing here).
      const { data } = await supabase.auth.getUser();
      const confirmed = data.user?.invited_at && data.user.email_confirmed_at ? Date.parse(data.user.email_confirmed_at) : NaN;
      if (!(Date.now() - confirmed < RETRY_MINUTES * 60_000)) return { error: EXPIRED, verified: false };
    } else {
      const tokenHash = String(form.get("token_hash") ?? "");
      if (!isTokenHash(tokenHash)) return { error: EXPIRED, verified: false };
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
      if (error) return { error: EXPIRED, verified: false };
    }

    const { data: who } = await supabase.auth.getUser();
    if (!who.user) return { error: EXPIRED, verified: false };
    const { error: saveError } = await supabase.auth.updateUser({ password });
    if (saveError) {
      return {
        error: saveError.code === "weak_password" ? "Choose a stronger password." : "Your password was not saved. Try again.",
        verified: true,
      };
    }

    const { data: profile } = await supabase.from("users").select("is_active").eq("id", who.user.id).maybeSingle();
    if (!profile?.is_active) {
      // Only the session this link just opened.
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Your account is not active. Please contact HR.", verified: false };
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
        title: token ? "Set your password." : "This link is not complete.",
        intro: token
          ? "Choose a password to activate your account."
          : "Open the link from your invitation again, or ask HR to send you a new one.",
        body: token ? <WelcomeForm action={activate} token={token} /> : null,
      }}
    />
  );
}
