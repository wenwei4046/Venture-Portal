import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The member app never says how the cost behind a margin is made up (user
// 2026-10-05: wording like that leaks our numbers). The prototype it was built
// from did, in four places — under Additional fee on the quote, Insight's bills
// and brand pages, and the Arena's margin board — and porting a screen
// "verbatim" again would bring the words straight back. So: no line of the
// member app, demo fixtures included, may name the cost basis or its ratio.
// The ratio itself stays on the server (`lib/member/server.ts`,
// `lib/member/order-book.ts`), where it is tested too.

// Vitest runs from the repository root.
const ROOTS = ["src/components/member", "src/app/(member)"].map(dir => resolve(process.cwd(), dir));
// The Product List moved into the Revenue app on 2026-10-08, but it is the
// Principal's page, not a member's: the server refuses it without product_list
// (lib/member/product-access.ts), nothing a member opens imports it, and it is
// where the ratio is SET — so it names it.
const EXEMPT = [resolve(process.cwd(), "src/app/(member)/member/(app)/products")];
const LEAK = /cost\s*÷|÷\s*0?\.\d|team[- ]cost|cost basis|Revenue Team(?:'s|&apos;s)? cost|company(?:'s|&apos;s)? own margin/i;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (EXEMPT.includes(path)) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the member app's wording", () => {
  it("never names the cost basis or its ratio", () => {
    const hits = ROOTS.flatMap(sources).flatMap(file =>
      readFileSync(file, "utf8").split(/\r?\n/).flatMap((line, i) =>
        LEAK.test(line) ? [`${relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`] : []));
    expect(hits).toEqual([]);
  });

  it("keeps the Product List's code out of every member screen", () => {
    const imports = ROOTS.flatMap(sources).flatMap(file =>
      readFileSync(file, "utf8").split(/\r?\n/).flatMap((line, i) =>
        /from\s+["'][^"']*\/products\/(?:_components|load|actions)\b/.test(line) ? [`${relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`] : []));
    expect(imports).toEqual([]);
  });

  it("would catch the sentences it replaced", () => {
    for (const old of [
      "Margin uses the Fair team cost basis (cost ÷ 0.7).",
      "Margin uses team cost (cost ÷ 0.7); a bill without cost stays pending.",
      "Margin is measured on the Revenue Team's cost, brand by brand.",
      "on the Revenue Team cost basis — the same figure the commission run pays on, not the company&apos;s own margin.",
    ]) expect(old).toMatch(LEAK);
  });
});
