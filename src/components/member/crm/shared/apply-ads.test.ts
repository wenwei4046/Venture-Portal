/**
 * Save and apply to all's window (the owner, 2026-10-24): the ads ticked, then Standard or Count together.
 */
import { describe, expect, it } from "vitest";
import type { CrmAdRule } from "@/lib/member/crm-data";
import { applyOpening, applyToast, applyWindowVM, type ApplyAd, type ApplyPick } from "./apply-ads";

const rule = (adId: string, together = false): CrmAdRule => ({ adId, label: adId, mode: "split", split: {}, pm: "pct", pp: {}, startedAt: "2026-10-24T00:00:00Z", ...(together ? { together: true } : {}) });
const ad = (id: string, leads = 1): ApplyAd => ({ id, label: `Ad ${id}`, leads, status: null });

function harness(pick: ApplyPick, rules: CrmAdRule[] = []) {
  let p: ApplyPick | null = pick;
  const runs: [string[], boolean][] = [];
  const vm = () => applyWindowVM({ pick: p as ApplyPick, openId: "A", ads: [ad("C", 9), ad("A"), ad("B", 0)], rules, set: x => { p = x; }, run: (ads, t) => { runs.push([ads.map(a => a.id), t]); } });
  return { vm, pick: () => p, runs };
}

describe("what the window opens on", () => {
  it("an ad apart: Standard, with every ad of the list ticked", () => {
    expect(applyOpening("A", [rule("A")], ["C", "A", "B"])).toEqual({ ads: ["A", "C", "B"], together: false });
  });
  it("an ad counted together: Count together, with the other together ads ticked", () => {
    expect(applyOpening("A", [rule("A", true), rule("B", true), rule("C")], ["C", "A", "B"])).toEqual({ ads: ["A", "B"], together: true });
  });
});

describe("the window", () => {
  it("lists the ad being edited first, always ticked; the others tick and untick", () => {
    const h = harness({ ads: ["A", "B"], together: false });
    expect(h.vm().rows.map(r => [r.id, r.on, r.fixed])).toEqual([["A", true, true], ["C", false, false], ["B", true, false]]);
    expect(h.vm().count).toBe("2 of 3");
    h.vm().rows[0].toggle();
    expect(h.pick()?.ads).toEqual(["A", "B"]);
    h.vm().rows[1].toggle();
    expect(h.pick()?.ads).toEqual(["A", "B", "C"]);
    expect(h.vm().all.label).toBe("Untick all");
    h.vm().all.toggle();
    expect(h.pick()?.ads).toEqual(["A"]);
    expect(h.vm().go.label).toBe("Apply to 1 ad");
  });
  it("Standard applies to the ads ticked, each on its own", () => {
    const h = harness({ ads: ["A", "C"], together: false });
    expect(h.vm().go.label).toBe("Apply to 2 ads");
    h.vm().go.run?.();
    expect(h.runs).toEqual([[["A", "C"], false]]);
  });
  it("Count together counts the ads ticked together — two at least", () => {
    const h = harness({ ads: ["A"], together: false }, [rule("B", true)]);
    h.vm().modes[1].pick();
    expect(h.vm().modes.map(m => m.on)).toEqual([false, true]);
    expect(h.vm().go.ok).toBe(false);
    expect(h.vm().go.run).toBeUndefined();
    expect(h.vm().rows.find(r => r.id === "B")?.together).toBe(true);
    h.vm().rows.find(r => r.id === "B")?.toggle();
    expect(h.vm().go.label).toBe("Count 2 ads together");
    h.vm().go.run?.();
    expect(h.runs).toEqual([[["A", "B"], true]]);
  });
  it("closes without saving", () => {
    const h = harness({ ads: ["A"], together: false });
    h.vm().close();
    expect(h.pick()).toBeNull();
    expect(h.runs).toEqual([]);
  });
});

describe("the toast", () => {
  it("says which way, what left the together ads and what was dealt", () => {
    expect(applyToast({ saved: 3, dealt: 0, left: 0 }, false)).toBe("Applied to 3 ads");
    expect(applyToast({ saved: 1, dealt: 2, left: 0 }, false)).toBe("Applied to 1 ad · 2 waiting leads dealt");
    expect(applyToast({ saved: 4, dealt: 0, left: 1 }, true)).toBe("4 ads counted together · 1 ad now counts on its own");
    expect(applyToast({ saved: 2, dealt: 1, left: 2 }, true)).toBe("2 ads counted together · 2 ads now count on their own · 1 waiting lead dealt");
  });
});
