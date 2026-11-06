import { describe, expect, it } from "vitest";
import { fieldRows } from "./quote-doc";

describe("a section on the quotation", () => {
  it("prints only the answer while its name is still the type's own", () => {
    const html = fieldRows({ kind: "short", label: "Short text" }, "Remarks", 7, {});
    expect(html).toContain("Remarks");
    expect(html).not.toContain("Short text");
    expect(html).not.toContain("<b>");
    const long = fieldRows({ kind: "long", label: "Long text" }, "A note", 7, {});
    expect(long).not.toContain("Long text");
    expect(long.match(/<tr>/g)).toHaveLength(1);
  });

  it("prints a name somebody gave it, beside the answer", () => {
    const html = fieldRows({ kind: "short", label: "Remarks" }, "Paid", 7, {});
    expect(html).toContain("<b>Remarks</b>&nbsp;&nbsp;Paid");
    expect(fieldRows({ kind: "long", label: "Terms" }, "A note", 7, {})).toContain("<b>Terms</b>");
  });
});
