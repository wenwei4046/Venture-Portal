import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The Revenue app's type is ONE dial (2026-10-06). Every font-size is the
// prototype's own px value times `--rv-type`: 1 on a desktop, .92 on a phone,
// where the prototype's sizes read a step too big. A size written as plain
// px would stay big on the phone while everything around it shrank — so no
// px font-size is allowed outside that multiplication.

// Vitest runs from the repository root.
const APP_DIR = resolve(process.cwd(), "src/components/member/app");

function files(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path, ext);
    return entry.name.endsWith(ext) && !entry.name.includes(".test.") ? [path] : [];
  });
}

const read = (path: string) => readFileSync(path, "utf8");
const where = (path: string) => relative(APP_DIR, path).replace(/\\/g, "/");

describe("Revenue app type scale", () => {
  const css = files(APP_DIR, ".module.css");

  it("finds the app's stylesheets (the scan itself works)", () => {
    expect(css.map(where)).toEqual(expect.arrayContaining(["base.module.css", "shell.module.css", "today/today.module.css"]));
  });

  it("writes every px font-size as calc(Npx * var(--rv-type))", () => {
    const plain = css.flatMap(path => read(path).split(/\r?\n/).flatMap((line, i) =>
      [...line.matchAll(/font-size:\s*([^;}]+)/g)]
        .map(match => match[1].trim())
        .filter(value => /\d(px)?\b/.test(value) && !/^calc\(\d*\.?\d+px \* var\(--rv-type\)\)$/.test(value) && !/^\d*\.?\d+(em|%)$/.test(value))
        .map(value => `${where(path)}:${i + 1} font-size: ${value}`)));
    expect(plain).toEqual([]);
  });

  it("gives inline styles no number of their own either", () => {
    const inline = files(APP_DIR, ".tsx").flatMap(path => read(path).split(/\r?\n/).flatMap((line, i) =>
      /fontSize:\s*\d/.test(line) ? [`${where(path)}:${i + 1}`] : []));
    expect(inline).toEqual([]);
  });

  it("is 1 at the root and on a desktop, one step smaller on a phone", () => {
    expect(read(join(APP_DIR, "base.module.css"))).toMatch(/\.root \{\s*--rv-type: 1;/);
    const shell = read(join(APP_DIR, "shell.module.css"));
    expect(shell).toMatch(/\.screen \{\s*--rv-type: \.92;\s*font-size: calc\(16px \* var\(--rv-type\)\);/);
    expect(shell).toMatch(/@container rv \(min-width: 1024px\) \{\s*\.screen \{[^}]*--rv-type: 1;/);
  });
});
