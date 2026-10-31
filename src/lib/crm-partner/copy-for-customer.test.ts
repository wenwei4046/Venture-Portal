/** The owner, 2026-10-31: a button to copy the visit for the customer, as the CRM's visit card reads (with Waze). */
import { describe, expect, it } from "vitest";
import { customerVisitText } from "./model";

describe("Copy for customer", () => {
  it("reads as the CRM's visit card, with Waze on its own line", () => {
    const t = customerVisitText("2026-10-31T01:00:00Z", "Skyline Embassy B-19-08", "185, Jln Ampang, Taman U Thant, 50450 Kuala Lumpur");
    expect(t).toContain("*Your showroom visit is confirmed*");
    expect(t).toContain("🗓️ *Date:* 31 Oct 2026 (Sat)");
    expect(t).toContain("⏰ *Time:* 9:00 am");
    expect(t).toContain("📍 *Location:* Skyline Embassy B-19-08");
    expect(t).toContain("🔸 *Address:* 185, Jln Ampang");
    expect(t).toMatch(/🚗 \*Waze:\* https:\/\/waze\.com\/ul\?q=185/);
  });
  it("no address, no Waze line", () => expect(customerVisitText("2026-10-31T01:00:00Z", "HQ", "")).not.toContain("Waze"));
});
