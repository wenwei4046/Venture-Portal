import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { loadMemberData } from "@/lib/member/server";
import MemberWorkspace from "@/components/member/MemberWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Revenue · HOUZS Venture" };

export default async function MemberPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const data = await loadMemberData();
  return <MemberWorkspace initialData={data} />;
}
