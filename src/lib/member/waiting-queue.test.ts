import { describe, expect, it } from "vitest";
import { placeOf, queuesFrom } from "./waiting-queue";

// member_waiting_queue() as it answered the dry-run (2026-10-10): Fair, two accepted, the second the member's.
const RAW = [{
  subDepartmentId: "fair", name: "Fair",
  rows: [
    { position: 2, name: "Siti Aisyah", mine: true, requestId: "w1" },
    { position: 1, name: "Daniel L.", mine: false, requestId: null },
  ],
}];

describe("the waiting list a member sees (HR revamp 7b)", () => {
  it("reads the queue in its order, a request id only on the member's own", () => {
    expect(queuesFrom(RAW)).toEqual([{
      subDepartmentId: "fair", name: "Fair",
      rows: [
        { position: 1, name: "Daniel L.", mine: false, requestId: null },
        { position: 2, name: "Siti Aisyah", mine: true, requestId: "w1" },
      ],
    }]);
    // Somebody else's row never carries the request it came from.
    expect(queuesFrom([{ subDepartmentId: "ir", name: "IR", rows: [{ position: 1, name: "Lee W.", mine: false, requestId: "x" }] }])[0].rows[0].requestId).toBeNull();
  });

  it("leaves out what the function could not have sent", () => {
    expect(queuesFrom(null)).toEqual([]);
    expect(queuesFrom([{ name: "No id" }, { subDepartmentId: "fair", name: "Fair", rows: [{ position: 0, name: "x" }, { position: 1 }, "x"] }]))
      .toEqual([{ subDepartmentId: "fair", name: "Fair", rows: [] }]);
  });

  it("finds where the member's own request stands", () => {
    const queues = queuesFrom(RAW);
    expect(placeOf(queues, "w1")).toEqual({ position: 2, total: 2, ahead: 1 });
    expect(placeOf(queues, "nope")).toBeNull();
  });
});
