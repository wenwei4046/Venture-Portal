import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss, { type Rule } from "postcss";
import { describe, expect, it } from "vitest";

// IT support's list on the phone (2026-10-27 — the user's screenshot of *Everybody's requests*: "Linking with the
// "Add on candidate on inside the position title"" ran on under its Fixed chip). Every button in the Revenue app is
// `white-space: nowrap` — the prototype's own rule — and a request's row is a button, so its title and its line kept
// to one line and spilled over the status chip. Requests & claims draws its rows the same way.

const declsOf = (file: string, selector: string): Record<string, string> => {
  const rule = postcss.parse(readFileSync(resolve(__dirname, file), "utf8")).nodes
    .find((n): n is Rule => n.type === "rule" && n.selector === selector);
  return Object.fromEntries((rule?.nodes ?? []).flatMap(n => (n.type === "decl" ? [[n.prop, n.value]] : [])));
};

describe("a request's row", () => {
  it("is a button, and the app's buttons keep to one line", () => {
    expect(declsOf("../base.module.css", ":where(.root) button")["white-space"]).toBe("nowrap");
  });

  it("wraps its title and its line inside their column; the status chip keeps its one line beside them", () => {
    expect(declsOf("profile.module.css", ".reqRow")["grid-template-columns"]).toBe("minmax(0, 1fr) auto 14px");
    expect(declsOf("profile.module.css", ".reqTitle")).toMatchObject({ "white-space": "normal", "overflow-wrap": "anywhere" });
    expect(declsOf("profile.module.css", ".reqSub")).toMatchObject({ "white-space": "normal", "overflow-wrap": "anywhere" });
    expect(declsOf("profile.module.css", ".status")["white-space"]).toBe("nowrap");
  });
});
