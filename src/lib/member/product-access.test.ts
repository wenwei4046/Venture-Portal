import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getUser }));

import { canOpenProductList, productListAccess } from "./product-access";

function user(overrides: Partial<User>): User {
  return {
    id: "u1", email: "u@venture.my", name: "U", role: "revenue_member", is_active: true,
    created_at: "2026-01-01", updated_at: "2026-01-01", permissions: [], ...overrides,
  };
}

beforeEach(() => getUser.mockReset());

// The Product List in the Revenue app (2026-10-08): the tab shows only to whoever
// holds product_list — the same answer its Server Actions get.
describe("who may open the Product List", () => {
  it("a salesperson may not, and the portal is never asked", async () => {
    expect(await productListAccess(user({ permissions: ["member_insight"] }))).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("the Principal may, as the Principal", async () => {
    expect(await productListAccess(user({ role: "principal", permissions: ["product_list", "treasury"] })))
      .toEqual({ group: "PRINCIPAL", audience: "Principal only" });
  });

  it("a title granted product_list may, under its own heading", async () => {
    expect(await productListAccess(user({ role: "hr", permissions: ["product_list"] })))
      .toEqual({ group: "MANAGEMENT", audience: "Product List access" });
  });

  it("a Principal in Revenue View still may: the portal's reading of the account answers", async () => {
    getUser.mockResolvedValue(user({ role: "principal", permissions: ["product_list"] }));
    const masked = user({ role: "revenue_member", actualRole: "principal", permissions: ["member_insight"] });
    expect(await canOpenProductList(masked)).toBe(true);
    expect(await productListAccess(masked)).toEqual({ group: "PRINCIPAL", audience: "Principal only" });
  });

  it("a Principal looking at the portal as HR may not", async () => {
    getUser.mockResolvedValue(user({ role: "hr", actualRole: "principal", permissions: ["staff_costs"] }));
    expect(await canOpenProductList(user({ role: "revenue_member", actualRole: "principal", permissions: [] }))).toBe(false);
  });
});
