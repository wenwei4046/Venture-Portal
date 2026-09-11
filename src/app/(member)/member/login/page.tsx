import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MemberLoginScreen from "@/components/member/MemberLoginScreen";
export const metadata = { title: "Team Login · HOUZS Venture" };
export default async function MemberLogin({
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
    redirect(profile.role === "revenue_member" ? "/member" : "/dashboard");
  }
  return (
    <MemberLoginScreen action={signIn} initialError={error} />
  );
}
