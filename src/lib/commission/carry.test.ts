import { describe, expect, it } from "vitest";
import { carriesInto, payMonth } from "./carry";

// 2026-10-06: a bill's month is its own; a close decides only when it is paid.
// On 6 October nobody was closed for September, and Comm Cal's October page
// counted all 357 September bills again (Fair RM 185,329.41 for RM 24,834.81).
describe("payMonth — whose run pays a bill no run has paid", () => {
  it("is its own month while that month is open for its salesperson", () => {
    expect(payMonth("2026-09-01", null, null)).toBe("2026-09-01");
    expect(payMonth("2026-09-01", "2026-08-01", null)).toBe("2026-09-01");
  });
  it("is the month after a close of it — the salesperson's own, or the whole month's run", () => {
    expect(payMonth("2026-09-01", "2026-09-01", null)).toBe("2026-10-01");
    expect(payMonth("2026-09-01", null, "2026-09-01")).toBe("2026-10-01");
    expect(payMonth("2026-09-01", "2026-10-01", "2026-09-01")).toBe("2026-11-01");
    expect(payMonth("2026-12-01", "2026-12-01", null)).toBe("2027-01-01");
  });
});

describe("carriesInto — which earlier bills a month's run pays", () => {
  const facts = { closes: [{ staffId: "ETHAN", periodMonth: "2026-09-01" }, { staffId: "KAR", periodMonth: "2026-08-01" }], appliedRuns: [] };
  const into = carriesInto("2026-10-01", facts);
  it("leaves a September bill to September until its salesperson is closed for September", () => {
    expect(into({ staffId: "KAR", periodMonth: "2026-09-01" })).toBe(false);
    expect(into({ staffId: "NOBODY_CLOSED", periodMonth: "2026-09-01" })).toBe(false);
    expect(into({ staffId: null, periodMonth: "2026-09-01" })).toBe(false);
  });
  it("pays in October what a September close did not", () => {
    expect(into({ staffId: "ETHAN", periodMonth: "2026-09-01" })).toBe(true);
  });
  it("carries everybody's once the whole month's run is applied", () => {
    const run = carriesInto("2026-10-01", { closes: [], appliedRuns: ["2026-09-01"] });
    expect(run({ staffId: "KAR", periodMonth: "2026-09-01" })).toBe(true);
    expect(run({ staffId: "KAR", periodMonth: "2026-08-01" })).toBe(true);
  });
  it("never pays a bill in a month past the first one still open for its salesperson", () => {
    // Closed for September only: an unpaid September bill is October's to pay, not November's.
    expect(carriesInto("2026-11-01", facts)({ staffId: "ETHAN", periodMonth: "2026-09-01" })).toBe(false);
  });
  it("takes the latest standing close of each salesperson", () => {
    const later = carriesInto("2026-11-01", { closes: [{ staffId: "ETHAN", periodMonth: "2026-10-01" }, { staffId: "ETHAN", periodMonth: "2026-09-01" }], appliedRuns: [] });
    expect(later({ staffId: "ETHAN", periodMonth: "2026-09-01" })).toBe(true);
  });
});
