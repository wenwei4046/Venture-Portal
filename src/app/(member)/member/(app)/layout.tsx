import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
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
  // The first screen's snapshot: no Quote catalogue (2026-10-08) — the app reads that when the Quote opens.
  // The CRM's row under Profile: the ACCOUNT's CRM · View (2026-10-10, the permission matrix) — the CRM
  // is the signed-in account's own whatever view the portal was left in, as crm-actions.ts asks.
  const [data, products, account] = await Promise.all([loadMemberData({ lite: true }), productListAccess(user), getAccountUser()]);
  const crm = canDo(account, "crm", "view", "own");
  return <RevenueApp initialData={data} productList={products} crm={crm}>{children}</RevenueApp>;
}
