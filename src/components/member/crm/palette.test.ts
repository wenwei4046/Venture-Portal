// 4a "Espresso & White" (2026-10-18, docs/design_handoff_crm_redesign — change list 1): every colour of the CRM's
// screens comes from the --crm-* tokens (globals.css), the old cream / ink / muted are gone, and no screen writes a hex
// of its own — except what is drawn on a canvas or shows a photo / document as itself, listed here with why.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { avatarTint, STATUS, teamColour } from "./shared/palette";

const ROOT = resolve(__dirname);
const KEEP: Record<string, string> = {
  "shared/pick-editor.tsx": "the photo editor's pens and text, drawn into the picture",
  "shared/edit-render.ts": "draws the editor's marks on a canvas",
  "shared/in-app-camera.tsx": "the camera's black screen and its controls over the picture",
  "shared/film-strip.ts": "a canvas",
  "shared/viewer.tsx": "the photo viewer's black screen and the status bar it holds",
  "shared/file-preview.tsx": "a document drawn as itself",
  "shared/pdf-pages.tsx": "a PDF drawn as itself",
  "desk/vm/proto-logic.ts": "the v2 prototype's own script (the old harness)",
  "desk/DeskProto.tsx": "the v2 prototype harness",
  "desk/vm/proto-base.ts": "the v2 prototype harness",
};
const DEAD = /^panel\/Panel(Ads|Assign|Bell|Calendar|Head|Inbox|Nav|Overlays|Overview|Profile|Rooms)\.tsx$/; // the 1a screens nothing imports

function files(dir = ROOT): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|css)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [relative(ROOT, p).replace(/\\/g, "/")] : [];
  });
}

describe("the CRM's colours are 4a's tokens", () => {
  it("no screen writes a hex of its own, nor the old cream, ink or muted", () => {
    const bad: string[] = [];
    for (const f of files()) {
      if (KEEP[f] || DEAD.test(f)) continue;
      readFileSync(join(ROOT, f), "utf8").split("\n").forEach((line, i) => {
        if (line.includes("palette:keep")) return;
        if (/#[0-9A-Fa-f]{6}(?![0-9A-Za-z])/.test(line.replace(/\/\/.*$|\/\*.*?\*\//g, ""))) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("every --crm-* a screen reads is defined in globals.css", () => {
    const globals = readFileSync(resolve(ROOT, "../../../app/globals.css"), "utf8");
    const defined = new Set([...globals.matchAll(/(--crm-[\w-]+):/g)].map(m => m[1]));
    const used = new Set<string>();
    for (const f of files()) for (const m of readFileSync(join(ROOT, f), "utf8").matchAll(/var\((--crm-[\w-]+)\)/g)) used.add(m[1]);
    expect([...used].filter(t => !defined.has(t) && t !== "--crm-top" && t !== "--crm-kb-h")).toEqual([]);
  });

  it("the same customer always gets the same avatar tint, and four tints are used", () => {
    expect(avatarTint("Siti Aminah")).toEqual(avatarTint(" siti aminah "));
    const tints = new Set(["Siti Aminah", "Daniel Lim", "Rajesh Kumar", "Nurul Huda", "Mei Ling Tan", "Kumar Selvam", "Ahmad Faiz", "Lim Wei Jie"].map(n => avatarTint(n)[0]));
    expect(tints.size).toBeGreaterThan(1);
    expect(tints.size).toBeLessThanOrEqual(4);
  });

  it("teams follow the fixed order after the Director: orange, amber, oxblood, brown, then the spares", () => {
    expect([0, 1, 2, 3, 4, 5].map(k => teamColour(k)[0])).toEqual(
      ["var(--crm-orange)", "var(--crm-amber)", "var(--crm-oxblood)", "var(--crm-brown)", "var(--crm-team-6)", "var(--crm-team-7)"]);
    expect(STATUS.Attention.text).toBe("var(--crm-oxblood)");
  });
});
