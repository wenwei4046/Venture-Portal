import { describe, expect, it } from "vitest";
import { crmBrandOfView } from "./crm-source";

// The owner, 2026-11-17: "Dream Crafter view 默认打开 dream crafter 的数据，聊天室等".
describe("the brand a Revenue app view opens the CRM on", () => {
  it("is Dream Crafter in the Dream Crafter sub-department's view", () => {
    expect(crmBrandOfView("DC")).toBe("dc");
    expect(crmBrandOfView(" dc ")).toBe("dc");
  });

  it("is every brand in every other view", () => {
    expect(crmBrandOfView("IR")).toBeNull();
    expect(crmBrandOfView("FAIR")).toBeNull();
    expect(crmBrandOfView(null)).toBeNull();
    expect(crmBrandOfView(undefined)).toBeNull();
  });
});
