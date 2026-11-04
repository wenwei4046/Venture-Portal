/**
 * The owner, 2026-11-04, a cold lead template typed in paragraphs whose preview ran into one: "为什么不能空格".
 * The body keeps its line breaks on its way to Meta; the desktop's preview keeps them too.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { templateSubmitRequest } from "@/lib/whatsapp/send";

describe("a cold lead template's line breaks", () => {
  it("go to Meta as they were typed", () => {
    const req = templateSubmitRequest({ name: "t", language: "zh_CN", category: "MARKETING", body: "Hi {name}\n\n1. A\n2. B" });
    expect(req.components[0].text).toBe("Hi {{1}}\n\n1. A\n2. B");
  });
  it("show in the desktop's preview", () => {
    const desk = readFileSync(join(__dirname, "DeskApp.tsx"), "utf8");
    expect(desk).toMatch(/textWrap: "pretty", whiteSpace: "pre-wrap" \}\}>\s*\{\(v\.cltE\.dsegs\)/);
  });
  it("show on the template's card, under its Edit (the owner, 2026-11-04: \"overlap\")", () => {
    const desk = readFileSync(join(__dirname, "DeskApp.tsx"), "utf8");
    expect(desk).toMatch(/textWrap: "pretty", whiteSpace: "pre-wrap" \}\}>\s*\{\(t\.segs\)/);
    expect(desk).toContain('title="Click to edit" style={{ position: "relative", padding: "38px 18px 16px"');
  });
});
