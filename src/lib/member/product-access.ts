import "server-only";
import { redirect } from "next/navigation";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { canDo } from "@/lib/permission-actions";
import { isPrincipalAccount } from "@/lib/view-as";
import type { User } from "@/types";

/**
 * Who may open the Product List inside the Revenue app (2026-10-08, user: the
 * Product List moves from the HR side into the Revenue view, and "只有拥有权限进去
 * 的时候，才会看到这个 tab"). The answer is the ACCOUNT's `product_list` — what a
 * title grants, the Principal by default.
 *
 * The member app reads its caller with `getMemberUser()`, which honours a
 * Principal's view: in the Revenue View their permissions are a salesperson's,
 * in an HR or Finance view left on in the portal they are HR's or Finance's.
 * The Revenue app still shows them as the Principal — its Module box reads
 * "Revenue team" whatever the portal was left in — so a masked Principal is
 * asked about the account itself (`getAccountUser()`, no mask). Until the
 * same day an HR or Finance view hid the row with nothing on screen saying why
 * (user: "why there is no product list in revenue view").
 */
export async function canOpenProductList(memberUser: User): Promise<boolean> {
  if (can(memberUser, "product_list")) return true;
  if (memberUser.actualRole !== "principal") return false;
  const account = await getAccountUser();
  return !!account && can(account, "product_list");
}

export interface ProductListAccess {
  /** The sidebar's group label above the row: PRINCIPAL for the Principal. */
  group: string;
  /** Who the page says it is for: "Principal only" for the Principal. */
  audience: string;
}

/** What the Revenue app's sidebar needs to show the Product List — null hides it. */
export async function productListAccess(memberUser: User): Promise<ProductListAccess | null> {
  if (!(await canOpenProductList(memberUser))) return null;
  return isPrincipalAccount(memberUser)
    ? { group: "PRINCIPAL", audience: "Principal only" }
    : { group: "MANAGEMENT", audience: "Product List access" };
}

/**
 * The Product List's Server Actions stand behind the same answer as its page —
 * `requirePermission('product_list')` read the portal's view, so a Principal
 * in HR view would have been shown the page and refused its Save.
 */
export async function requireProductList(): Promise<User> {
  const user = await getMemberUser();
  if (!user) redirect("/login");
  if (!(await canOpenProductList(user))) redirect("/member");
  return user;
}

/**
 * A change to the Product List (2026-10-08, PR2): Product list · Edit, asked of
 * whichever answer opened the page — the session's, else the account behind a
 * masked Principal (canOpenProductList). View alone reads it.
 */
export async function requireProductListEdit(): Promise<User> {
  const user = await getMemberUser();
  if (!user) redirect("/login");
  if (canDo(user, "product_list", "edit")) return user;
  if (user.actualRole === "principal") {
    const account = await getAccountUser();
    if (account && canDo(account, "product_list", "edit")) return user;
  }
  redirect("/member");
}
