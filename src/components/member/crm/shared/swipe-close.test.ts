import { describe, expect, it } from "vitest";
import { sheetOf } from "./swipe-close";

describe("pull a sheet down to close it", () => {
  it("finds the sheet a touch starts in, and none on a full-screen page", () => {
    document.body.innerHTML = `
      <div id="backdrop"><div id="sheet" style="animation: sheetUp 320ms ease"><span id="row">Phone</span></div></div>
      <div id="page" style="animation: slideIn 280ms ease"><span id="x">x</span></div>`;
    expect(sheetOf(document.getElementById("row"))?.id).toBe("sheet");
    expect(sheetOf(document.getElementById("x"))).toBeNull();
  });
});
