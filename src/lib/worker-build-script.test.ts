import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CI's worker job (`npm run verify:worker`) builds the app with OpenNext, which refuses a Next.js major more than two
// years after its release — Next 15 came out on 2024-10-21, so from 2026-10-21 every branch's worker job exited 1
// before building anything (PR #594's run). Production is Vercel's and never asks; the flag only keeps the check
// running (TESTING.md › Cloudflare worker verification). Once the app is on Next 16 the flag can go, and so can this test.
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
};

describe("the worker build", () => {
  it("builds on Next 15 past its two years of support", () => {
    const major = Number(/\d+/.exec(pkg.dependencies.next)?.[0]);
    if (major > 15) return;
    expect(pkg.scripts["build:worker"]).toMatch(/^opennextjs-cloudflare build --dangerouslyUseUnsupportedNextVersion /);
  });
});
