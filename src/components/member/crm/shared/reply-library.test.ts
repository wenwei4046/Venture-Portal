/** The reply library (2026-10-29): good replies kept once, the blanks filled for the customer, a matching one suggested first. */
import { describe, expect, it } from "vitest";
import type { CrmChatMessage, CrmReplyItem } from "@/lib/member/crm-data";
import { fillReply, fillWithFor, libraryFor, suggestReplies } from "./suggest-reply";
import { filterLibrary } from "./suggest-float";
import { libraryProblem, tidyLibrary } from "../desk/DeskReplyLibrary";

const msg = (from: "lead" | "me", text: string): CrmChatMessage => ({ id: Math.random().toString(36), from, kind: "text", text, at: "2026-10-29T01:00:00Z" });
const cust = { name: "Wah Leong", details: { loc: "Setia Sky Ville", type: "Condo", size: "" } };
const LIB: CrmReplyItem[] = [
  { id: "a", title: "Price enquiry", category: "Pricing", body: "Hi {name}, I'm {me}. For {project} our package starts at RM 9,999. Visit us at {showroom}?", keywords: ["几钱", "price"] },
  { id: "b", title: "Rental", category: "Rental", body: "Yes {name}, we rent it out for you", keywords: ["rent"] },
];

describe("fillReply", () => {
  it("fills the customer's first and full name, the salesperson, the project, type and showroom; an empty blank goes quietly", () => {
    expect(fillReply("Hi {name} ({fullname}), {me} here about your {type} at {project}, {size} sqft", cust, { me: "Peter" }))
      .toBe("Hi Wah (Wah Leong), Peter here about your Condo at Setia Sky Ville, sqft");
    expect(fillReply("Hi {name}", { name: "" })).toBe("Hi there");
    expect(fillReply("See you at {showroom}", cust, { showroom: "KL Showroom" })).toBe("See you at KL Showroom");
  });
});

describe("the library in the suggestions", () => {
  it("puts a library reply whose keyword the customer used first, filled in, named by its title", () => {
    const c = { ...cust, messages: [msg("lead", "几钱？")] };
    const s = suggestReplies(c, [{ q: "几钱", a: "RM 9,999 起" }], [], 3, { library: LIB, me: "Peter", showroom: "KL Showroom" });
    expect(s[0]).toEqual({ text: "Hi Wah, I'm Peter. For Setia Sky Ville our package starts at RM 9,999. Visit us at KL Showroom?", why: "Reply library · Price enquiry" });
    expect(s.some(x => x.text.includes("rent"))).toBe(false);
  });
  it("lists the whole library filled for the customer, and the search and category narrow it", () => {
    const l = libraryFor(cust, LIB, { me: "Peter" });
    expect(l.map(x => x.title)).toEqual(["Price enquiry", "Rental"]);
    expect(l[1].text).toBe("Yes Wah, we rent it out for you");
    expect(filterLibrary(l, "rent", "").map(x => x.title)).toEqual(["Rental"]);
    expect(filterLibrary(l, "", "Pricing").map(x => x.title)).toEqual(["Price enquiry"]);
  });
  it("takes the showroom of the customer's next booked visit, else the first open one", () => {
    const now = new Date("2026-10-29T00:00:00Z");
    const rooms = [{ id: "kl", name: "KL Showroom", active: true }, { id: "pg", name: "Penang", active: true }] as never;
    const visits = [{ customerId: "c1", state: "booked", start: "2026-11-01T06:00:00Z", showroomId: "pg" }] as never;
    expect(fillWithFor({ visits, rooms }, { id: "c1" }, "Peter", now)).toEqual({ me: "Peter", showroom: "Penang" });
    expect(fillWithFor({ visits, rooms }, { id: "c2" }, undefined, now)).toEqual({ me: "", showroom: "KL Showroom" });
  });
});

describe("the library's editor", () => {
  it("saves trimmed replies with their keywords split, and says what is missing first", () => {
    expect(tidyLibrary([{ id: null, title: " T ", category: " ", body: " B ", keywords: [" a", "", "b "] }])).toEqual([{ id: null, title: "T", category: "", body: "B", keywords: ["a", "b"] }]);
    expect(libraryProblem([{ id: null, title: "", category: "", body: "x", keywords: [] }])).toBe("Give each reply a title.");
    expect(libraryProblem([{ id: null, title: "T", category: "", body: " ", keywords: [] }])).toBe('"T": write its words.');
    expect(libraryProblem(LIB)).toBeNull();
  });
});
