import { describe, expect, it } from "vitest";
import { readRoute, visitPath } from "./route";

// The app's visits reach People's Last seen and Activity (2026-10-22): each is filed under its screen and the page inside
// it — never whom the app is viewed as, nor the sub-department.

describe("visitPath", () => {
  it("files each screen at /member, its page in the query", () => {
    expect(visitPath(readRoute(""))).toBe("/member");
    expect(visitPath(readRoute("?page=quote"))).toBe("/member?page=quote");
    expect(visitPath(readRoute("?page=insight"))).toBe("/member?page=insight");
    expect(visitPath(readRoute("?page=insight&view=bills"))).toBe("/member?page=insight&view=bills");
    expect(visitPath(readRoute("?page=arena&view=board&board=margin"))).toBe("/member?page=arena&view=board");
    expect(visitPath(readRoute("?page=account"))).toBe("/member?page=account");
    expect(visitPath(readRoute("?page=account&view=crm"))).toBe("/member?page=account&view=crm");
  });

  it("leaves out whom the app is viewed as and the sub-department", () => {
    expect(visitPath(readRoute("?page=account&view=memos&staff=s-1&department=d-1"))).toBe("/member?page=account&view=memos");
    expect(visitPath(readRoute("?staff=s-1&department=d-1"))).toBe("/member");
  });

  it("files an old bookmark where it lands", () => {
    expect(visitPath(readRoute("?page=income"))).toBe("/member?page=account&view=income");
    expect(visitPath(readRoute("?memo=m-1"))).toBe("/member?page=account&view=memos");
  });

  it("files the Product List at its own address", () => {
    expect(visitPath({ ...readRoute(""), screen: "products" })).toBe("/member/products");
  });
});
