import { describe, expect, it } from "vitest";
import { irqCustomerFilter } from "./irq-customer-search";

// The user, 2026-11-17, on Send to CRM chat: "除了搜寻，也连接 contact 下拉式 + 搜寻（例如打M，可以看到M的客户）".
describe("IR Quote's CRM customer search", () => {
  it("lists the latest customers when nothing is typed", () => {
    expect(irqCustomerFilter("")).toEqual({ or: null, limit: 30, byName: false });
    expect(irqCustomerFilter("  ")).toEqual({ or: null, limit: 30, byName: false });
  });

  it("lists the names that start with one letter, A–Z", () => {
    expect(irqCustomerFilter("M")).toEqual({ or: "name.ilike.M%", limit: 30, byName: true });
    expect(irqCustomerFilter(" m ")).toEqual({ or: "name.ilike.m%", limit: 30, byName: true });
  });

  it("reads one digit in the phone", () => {
    expect(irqCustomerFilter("7")).toEqual({ or: "phone.ilike.%7%", limit: 30, byName: false });
  });

  it("finds two or more letters anywhere in the name, and the phone by its digits", () => {
    expect(irqCustomerFilter("tan")).toEqual({ or: "name.ilike.%tan%", limit: 20, byName: false });
    expect(irqCustomerFilter("012-338 4471").or).toBe("name.ilike.%012-338 4471%,phone.ilike.%123384471%");
  });

  it("never lets a typed character change the filter", () => {
    expect(irqCustomerFilter("%")).toEqual({ or: null, limit: 30, byName: false });
    expect(irqCustomerFilter("a,b(c)").or).toBe("name.ilike.%a b c%");
  });
});
