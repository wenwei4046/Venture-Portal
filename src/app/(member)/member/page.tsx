import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { getMemberUser } from "@/lib/auth";
import { loadMemberData } from "@/lib/member/server";
import RevenueApp from "@/components/member/app/RevenueApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Revenue · HOUZS Venture" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default async function MemberPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getMemberUser();
  if (!user) redirect("/login");
  const [data, params] = await Promise.all([loadMemberData(), searchParams]);
  const search = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : []))).toString();
  return <RevenueApp initialData={data} initialSearch={search ? `?${search}` : ""} />;
}
