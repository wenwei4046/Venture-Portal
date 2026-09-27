import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_COOKIE, VIEW_AS_MIRROR_COOKIE } from "@/lib/view-as";
import MemberLoginScreen from "@/components/member/MemberLoginScreen";

export const metadata = { title: "Sign In · HOUZS Venture" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
      await supabase.auth.signOut();
      return { error: "Your account is not active. Please contact HR." };
    }

    // A fresh sign-in starts in the account's own view, not a previous mask.
    (await cookies()).delete(VIEW_AS_COOKIE);
    (await cookies()).delete(VIEW_AS_MIRROR_COOKIE);
    redirect(profile.role === "revenue_member" ? "/member" : "/dashboard");
  }

  return <MemberLoginScreen action={signIn} initialError={error} />;
}
