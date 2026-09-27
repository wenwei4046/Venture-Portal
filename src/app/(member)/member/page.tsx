import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { getMemberUser } from "@/lib/auth";
import { loadMemberData } from "@/lib/member/server";
import MemberWorkspace from "@/components/member/MemberWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Revenue · HOUZS Venture" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default async function MemberPage() {
  const user = await getMemberUser();
  if (!user) redirect("/login");
  const data = await loadMemberData();
  return <MemberWorkspace initialData={data} />;
}
