import { describe, expect, it } from "vitest";
import { readRoute, visitPath, writeRoute } from "./route";

// Insight › My team › a person (2026-11-03): whose Insight pages are open rides the address (`of`), so Back, a reload and
// the phone's back gesture land on them — Insight's only, a staff id only.
describe("a person's Insight pages in the address", () => {
  const JAMES = "b45ba010-06a8-41b1-9b92-649a84dd8c00";
  it("reads and writes `of` on Insight, and nowhere else", () => {
    expect(readRoute(`?page=insight&of=${JAMES}`)).toMatchObject({ screen: "insight", ins: "main", of: JAMES });
    expect(readRoute(`?page=insight&view=bills&of=${JAMES}`)).toMatchObject({ ins: "bills", of: JAMES });
    expect(readRoute(`?page=arena&of=${JAMES}`).of).toBeUndefined();
    expect(readRoute("?page=insight&of=james").of).toBeUndefined();
    const href = writeRoute({ ...readRoute("?page=insight"), ins: "kpi", of: JAMES }, "https://x.test/member");
    expect(new URL(href).search).toBe(`?page=insight&view=kpi&of=${JAMES}`);
    expect(new URL(writeRoute({ ...readRoute("?page=insight"), screen: "today", of: JAMES }, "https://x.test/member")).search).toBe("");
  });
  it("files the visit without whom", () => {
    expect(visitPath(readRoute(`?page=insight&view=bills&of=${JAMES}`))).toBe("/member?page=insight&view=bills");
  });
});

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
