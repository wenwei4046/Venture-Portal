import { describe, expect, it } from "vitest";
import { is100, pctOf, pctShow, pctText } from "./pct";
import { balance } from "../panel/vm/assign";

describe("shares to the hundredth", () => {
  it("keeps what is typed, two decimals at most", () => {
    expect(pctText("33.")).toBe("33.");
    expect(pctText("33.335")).toBe("33.33");
    expect(pctText("1.2.3")).toBe("1.23");
    expect(pctText("05")).toBe("5");
    expect(pctOf("33.33")).toBe(33.33);
    expect(pctOf("150")).toBe(100);
    expect(pctShow(25)).toBe("25");
    expect(pctShow(33.3)).toBe("33.3");
    expect(is100(33.33 + 33.33 + 33.34)).toBe(true);
  });
  it("rebalances the others in hundredths, adding up to 100", () => {
    const o = balance(["a", "b", "c"], { a: 34, b: 33, c: 33 }, "a", 33.33);
    expect(o.a).toBe(33.33);
    expect(is100(o.a + o.b + o.c)).toBe(true);
    expect([o.b, o.c].every(v => Math.round(v * 100) === v * 100 || Math.abs(Math.round(v * 100) - v * 100) < 1e-6)).toBe(true);
  });
});
