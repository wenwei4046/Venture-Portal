import { describe, expect, it, vi } from "vitest";
import { readAdFigures } from "./ad-figures-read";

// 2026-11-26 ("先看到之前的记录再跳真正的数据"): an answer from an older read is shown, then the new one a few seconds on.
describe("an older answer first, then the new", () => {
  it("hands over the old figures at once and the new ones when asked again", async () => {
    vi.useFakeTimers();
    const answers = [
      { figs: { "2026-11-01|2026-11-30#0": { "111111": { spend: 1 } } }, stale: ["2026-11-01|2026-11-30#0"] },
      { figs: { "2026-11-01|2026-11-30#0": { "111111": { spend: 2 } } }, stale: [] },
    ];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(answers.shift())));
    const seen: number[] = [];
    await readAdFigures([{ key: "2026-11-01|2026-11-30", since: "2026-11-01", until: "2026-11-30", ids: ["111111"] }],
      figs => seen.push((figs["2026-11-01|2026-11-30"]["111111"] as { spend: number }).spend), fetchImpl as unknown as typeof fetch);
    expect(seen).toEqual([1]);
    await vi.advanceTimersByTimeAsync(4000);
    expect(seen).toEqual([1, 2]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
