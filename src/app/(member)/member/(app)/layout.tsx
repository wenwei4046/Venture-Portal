import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { getMemberUser } from "@/lib/auth";
import { loadMemberData } from "@/lib/member/server";
import { productListAccess } from "@/lib/member/product-access";
import RevenueApp from "@/components/member/app/RevenueApp";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

/**
 * The Revenue app around every page of it (2026-10-08). `/member` itself is the
 * app's own screens — Today, Insight, Quote, Arena, Profile, switched in the
 * browser — and `/member/products` is the Product List, a page of its own the
 * server renders only for an account holding `product_list`, so its code and
 * its numbers never reach anybody else's browser. Both sit in this one layout:
 * moving between them keeps the app (its sheets, its reads, View as) in place
 * and swaps only the page.
 */
export default async function MemberAppLayout({ children }: { children: ReactNode }) {
  const user = await getMemberUser();
  if (!user) redirect("/login");
  const [data, products] = await Promise.all([loadMemberData(), productListAccess(user)]);
  return <RevenueApp initialData={data} productList={products}>{children}</RevenueApp>;
}
