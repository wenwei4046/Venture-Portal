import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types";

const { getAccountUser, getMemberUser, redirect } = vi.hoisted(() => ({
  getAccountUser: vi.fn(),
  getMemberUser: vi.fn(),
  redirect: vi.fn((to: string) => { throw new Error(`redirect ${to}`); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth", () => ({ getAccountUser, getMemberUser }));

import { canOpenProductList, productListAccess, requireProductList, requireProductListEdit } from "./product-access";

function user(overrides: Partial<User>): User {
  return {
    id: "u1", email: "u@venture.my", name: "U", role: "revenue_member", is_active: true,
    created_at: "2026-01-01", updated_at: "2026-01-01", permissions: [], ...overrides,
  };
}
const principal = user({ role: "principal", permissions: ["product_list", "treasury"] });

beforeEach(() => {
  getAccountUser.mockReset();
  getMemberUser.mockReset();
  redirect.mockClear();
});

// The Product List in the Revenue app (2026-10-08): the tab shows only to whoever
// holds product_list — and its Save stands behind the same answer.
describe("who may open the Product List", () => {
  it("a salesperson may not, and the account is never asked", async () => {
    expect(await productListAccess(user({ permissions: ["member_insight"] }))).toBeNull();
    expect(getAccountUser).not.toHaveBeenCalled();
  });

  it("the Principal may, as the Principal", async () => {
    expect(await productListAccess(principal)).toEqual({ group: "PRINCIPAL", audience: "Principal only" });
  });

  it("a title granted product_list may, under its own heading", async () => {
    expect(await productListAccess(user({ role: "hr", permissions: ["product_list"] })))
      .toEqual({ group: "MANAGEMENT", audience: "Product List access" });
  });

  it("a Principal in Revenue View still may: the account itself answers", async () => {
    getAccountUser.mockResolvedValue(principal);
    const masked = user({ role: "revenue_member", actualRole: "principal", permissions: ["member_insight"] });
    expect(await canOpenProductList(masked)).toBe(true);
    expect(await productListAccess(masked)).toEqual({ group: "PRINCIPAL", audience: "Principal only" });
  });

  // User 2026-10-08: "why there is no product list in revenue view" — an HR view left on in the portal hid it.
  it.each(["hr", "finance"] as const)("a Principal with the portal left in the %s view still may", async view => {
    getAccountUser.mockResolvedValue(principal);
    const masked = user({ role: view, actualRole: "principal", permissions: ["staff_costs"] });
    expect(await productListAccess(masked)).toEqual({ group: "PRINCIPAL", audience: "Principal only" });
  });

  it("an account without product_list may not, whatever it is masked as", async () => {
    getAccountUser.mockResolvedValue(user({ role: "principal", permissions: ["treasury"] }));
    expect(await canOpenProductList(user({ role: "hr", actualRole: "principal", permissions: [] }))).toBe(false);
  });
});

describe("requireProductList — the Save behind the page", () => {
  it("answers the caller when they may", async () => {
    getMemberUser.mockResolvedValue(user({ role: "hr", actualRole: "principal", permissions: [] }));
    getAccountUser.mockResolvedValue(principal);
    expect(await requireProductList()).toMatchObject({ id: "u1", actualRole: "principal" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a stranger to log in and anybody else back to the app", async () => {
    getMemberUser.mockResolvedValue(null);
    await expect(requireProductList()).rejects.toThrow("redirect /login");
    getMemberUser.mockResolvedValue(user({ permissions: ["member_insight"] }));
    await expect(requireProductList()).rejects.toThrow("redirect /member");
  });
});

// PR2 (2026-10-08): reading the Product List is its View; changing it is its Edit.
describe("requireProductListEdit — a change to the Product List", () => {
  const editor = { "product_list.view": "all", "product_list.edit": "all" } as const;

  it("lets an account holding Product list · Edit save", async () => {
    getMemberUser.mockResolvedValue(user({ role: "staff", permissions: ["product_list"], actions: editor }));
    expect(await requireProductListEdit()).toMatchObject({ id: "u1" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("asks the account behind a masked Principal, as the page does", async () => {
    getMemberUser.mockResolvedValue(user({ role: "revenue_member", actualRole: "principal", permissions: ["member_insight"] }));
    getAccountUser.mockResolvedValue({ ...principal, actions: editor });
    expect(await requireProductListEdit()).toMatchObject({ actualRole: "principal" });
  });

  it("sends somebody who may only read it back to the app", async () => {
    getMemberUser.mockResolvedValue(user({ role: "staff", permissions: ["product_list"], actions: { "product_list.view": "all" } }));
    await expect(requireProductListEdit()).rejects.toThrow("redirect /member");
    getMemberUser.mockResolvedValue(null);
    await expect(requireProductListEdit()).rejects.toThrow("redirect /login");
  });
});
