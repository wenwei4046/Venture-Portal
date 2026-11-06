import { describe, expect, it } from "vitest";
import { fieldRows, packageName, versionWord } from "./quote-doc";

describe("a room type's versions", () => {
  const classic = { id: "a", group: "g1", style: "classic", name: "1R 1R CLASSIC" };
  const build = { id: "b", group: "g1", style: "build", name: "1R 1R BUILD IN" };
  const other = { id: "c", group: "g2", style: "classic", name: "2R 1R CLASSIC" };
  it("names the version only while the room type has two", () => {
    expect(versionWord([classic, build, other], build)).toBe("Build in");
    expect(versionWord([classic, build, other], classic)).toBe("Classic");
    expect(versionWord([classic, other], classic)).toBe("");
    expect(versionWord([build, other], build)).toBe("");
  });
  it("prints the name without the word when it is the only version", () => {
    expect(packageName([classic, build], build)).toBe("1R 1R BUILD IN");
    expect(packageName([build], build)).toBe("1R 1R");
    expect(packageName([classic], classic)).toBe("1R 1R");
  });
});

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
