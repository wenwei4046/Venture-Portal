import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_COOKIE, VIEW_AS_MIRROR_COOKIE, VIEW_AS_PERSON_COOKIE, VIEW_AS_PERSON_MARK } from "@/lib/view-as";
import MemberLoginScreen from "@/components/member/MemberLoginScreen";

export const metadata = { title: "Sign In · HOUZS Venture" };

/**
 * Where a sign-in may return to (2026-10-11): only the installed HR app, which
 * sends `?next=/hr-app` — anything else is ignored, so the address can never
 * send a signed-in person off the portal.
 */
const RETURNS: ReadonlySet<string> = new Set(["/hr-app"]);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const back = next && RETURNS.has(next) ? next : null;

  async function signIn(form: FormData) {
    "use server";
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (error || !data.user)
      return { error: "The email or password is incorrect. Please try again." };

    const { data: profile } = await supabase
      .from("users")
      .select("is_active, role")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile?.is_active) {
      // Only the session this sign-in just opened. An inactive account is
      // refused on every request anyway, and a failed read looks the same.
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Your account is not active. Please contact HR." };
    }

    // A fresh sign-in starts in the account's own view, not a previous mask.
    (await cookies()).delete(VIEW_AS_COOKIE);
    (await cookies()).delete(VIEW_AS_MIRROR_COOKIE);
    // Viewing as somebody ends with the session that started it (2026-10-11): on
    // the shared office PC the next account must not inherit a read-only browser.
    (await cookies()).delete(VIEW_AS_PERSON_COOKIE);
    (await cookies()).delete(VIEW_AS_PERSON_MARK);
    redirect(back ?? (profile.role === "revenue_member" ? "/member" : "/dashboard"));
  }

  return <MemberLoginScreen action={signIn} initialError={error} />;
}
