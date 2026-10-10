import { describe, expect, it } from "vitest";
import type { MemberMemo, MemberRequest } from "@/lib/member/types";
import { notifications } from "./notify-model";

const request = (id: string, kind: MemberRequest["kind"], status: string): MemberRequest => ({
  id, kind, title: `${kind} ${id}`, status, createdAt: "2026-10-05T04:00:00Z", requestNo: `RQ-2610-00${id}`, staffId: "jia", detail: {},
});
const memo: MemberMemo = {
  id: "m1", title: "New fair rules", body: "Read this. Then sign.", sender: "People & Culture", publishedAt: "2026-10-04T04:00:00Z",
  effectiveAt: "2026-10-04", version: 1, requiresAck: true, acknowledgedAt: null, readAt: null, departments: [],
};

const base = {
  now: new Date("2026-10-05T08:00:00Z"), memos: [memo], salary: null, readAll: false,
  requestCode: (r: MemberRequest) => r.requestNo ?? r.id,
};

describe("the bell shows only what the app may open (2026-10-11)", () => {
  it("everything, when nothing is closed — a returned request and a memo to sign both count", () => {
    const { items, count } = notifications({ ...base, requests: [request("1", "claim", "needs_info"), request("2", "waiting", "waiting")] });
    expect(items.map(n => n.id)).toEqual(["rq-1", "rq-2", "memo-m1"]);
    expect(count).toBe(2);
    expect(items[1].go).toEqual({ to: "requests", requestId: "2", kind: "waiting" });
  });

  it("news about a page their ticks close is left out, and not counted", () => {
    const { items, count } = notifications({
      ...base, requests: [request("1", "claim", "needs_info"), request("2", "waiting", "waiting")],
      opens: go => !(go.to === "requests" && go.kind === "claim"),
    });
    expect(items.map(n => n.id)).toEqual(["rq-2", "memo-m1"]);
    expect(count).toBe(1);
  });
});
