import { redirect } from "next/navigation";

/** Keep existing bookmarks working through the single sign-in entry. */
export default async function MemberLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const query = error ? `?${new URLSearchParams({ error })}` : "";
  redirect(`/login${query}`);
}
