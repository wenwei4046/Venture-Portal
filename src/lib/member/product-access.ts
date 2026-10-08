import "server-only";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isPrincipalAccount } from "@/lib/view-as";
import type { User } from "@/types";

/**
 * Who may open the Product List inside the Revenue app (2026-10-08, user: the
 * Product List moves from the HR side into the Revenue view, and "只有拥有权限进去
 * 的时候，才会看到这个 tab"). The answer is the ACCOUNT's `product_list` — what a
 * title grants, the Principal by default — and the same answer the Product
 * List's Server Actions get from `requirePermission('product_list')`.
 *
 * The member app reads its caller with `getMemberUser()`, which honours a
 * Principal's Revenue View: their permissions there are a salesperson's. The
 * Product List is the Principal's own tool all the same, so for a masked
 * Principal the question goes to the portal's reading (`getUser()`), which
 * ignores the Revenue View and still honours an HR or Finance view — so a
 * Principal looking at the portal as HR does not see it here either.
 */
export async function canOpenProductList(memberUser: User): Promise<boolean> {
  if (can(memberUser, "product_list")) return true;
  if (memberUser.actualRole !== "principal") return false;
  const portalUser = await getUser();
  return !!portalUser && can(portalUser, "product_list");
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
