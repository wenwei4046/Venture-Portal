import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { loadMemberData } from "@/lib/member/server";
import { productListAccess } from "@/lib/member/product-access";
import { appClosed } from "@/lib/member/app-pages";
import RevenueApp from "@/components/member/app/RevenueApp";
import { interTight } from "@/components/member/app/fonts";
import { isPrincipalAccount } from "@/lib/view-as";
import { loadMyNotices } from "@/lib/push/notices-server";
import { loginIsPersonal } from "@/lib/account/personal-login";
import { changeMyPassword } from "@/lib/account/actions";
import { loadMyMemos } from "@/lib/memos/server";
import { toMemberMemo } from "@/lib/memos/model";

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
  // Their notifications (2026-10-11): the Principal, who opens the app to view members, gets none here.
  // Profile › Change password (2026-10-12): a login of their own, never a shared one.
  // The Principal's own memos (2026-10-12): their People record's, read and acknowledged here as in every view.
  const [data, products, account, notices, password, own] = await Promise.all([loadMemberData({ lite: true }), productListAccess(user), getAccountUser(),
    isPrincipalAccount(user) ? Promise.resolve(undefined) : loadMyNotices(), loginIsPersonal(),
    isPrincipalAccount(user) && !user.viewingAs ? loadMyMemos() : Promise.resolve(null)]);
  const crm = canDo(account, "crm", "view", "own");
  // The pages and sends their ticks close (2026-10-11): only what somebody unticked for them.
  // The display face (2026-10-14): Inter Tight's variable on a wrapper that draws no box, so the
  // app and its loading frame read it and the portal never downloads the font.
  return <div className={interTight.variable} style={{ display: "contents" }}>
    <RevenueApp initialData={data} productList={products} crm={crm} closed={appClosed(user.closed)} notices={notices}
      changePassword={password ? changeMyPassword : undefined}
      own={own?.staffId ? { memos: own.memos.map(toMemberMemo) } : undefined}>{children}</RevenueApp>
  </div>;
}
