import { describe, expect, it } from "vitest";
import { fitRows, titleCut } from "./fit-rows";

// A title row beside Team | Mine, the house and the bell (2026-10-14): tight only when its title would be cut. The test
// DOM does no layout, so each title says how wide it is and how wide it would like to be.
function row(title: { scroll: number; client: number }, tight = false) {
  const r = document.createElement("div");
  r.setAttribute("data-fit-row", "1");
  if (tight) r.setAttribute("data-tight", "");
  const h1 = document.createElement("h1");
  Object.defineProperty(h1, "scrollWidth", { get: () => (r.hasAttribute("data-tight") ? title.client : title.scroll) });
  Object.defineProperty(h1, "clientWidth", { get: () => title.client });
  r.appendChild(h1);
  document.body.appendChild(r);
  return r;
}

describe("fitting a title row", () => {
  it("leaves a row whose title fits as designed — and takes back a tight mark it no longer needs", () => {
    const wide = row({ scroll: 83, client: 120 }, true);
    fitRows(document);
    expect(wide.hasAttribute("data-tight")).toBe(false);
  });

  it("marks a row tight when its title would be cut, measured as designed first", () => {
    const narrow = row({ scroll: 107, client: 46 });
    expect(titleCut(narrow)).toBe(true);
    fitRows(document);
    expect(narrow.hasAttribute("data-tight")).toBe(true);
    // Measured again (a resize, the next paint): still too narrow as designed, so it stays tight.
    fitRows(document);
    expect(narrow.hasAttribute("data-tight")).toBe(true);
  });

  it("a pixel of rounding is not a cut", () => {
    expect(titleCut(row({ scroll: 121, client: 120 }))).toBe(false);
  });
});
