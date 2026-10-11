import { describe, expect, it } from "vitest";
import { NOTHING_CLOSED, type AppClosed } from "@/lib/member/app-pages";
import { allowedRoute, landing, pageOfRoute, requestPage, sends, shows } from "./app-access";
import { readRoute } from "./route";

const closing = (pages: AppClosed["pages"], sent: AppClosed["sends"] = []): AppClosed => ({ pages, sends: sent });

describe("where the app may go once ticks close some of its pages (2026-10-11)", () => {
  it("knows which page a route is on — and Profile, memos and the CRM are no tab’s", () => {
    expect(pageOfRoute(readRoute("?page=calc"))).toBe("quote");
    expect(pageOfRoute(readRoute("?page=account&view=incOrders"))).toBe("income");
    expect(pageOfRoute(readRoute("?page=account&view=track"))).toBe("track");
    // The rest of Profile has its own boxes since 2026-10-11.
    expect(pageOfRoute(readRoute("?page=account&view=honours"))).toBe("honours");
    expect(pageOfRoute(readRoute("?page=account&view=brandWeeks"))).toBe("brandWeeks");
    expect(pageOfRoute(readRoute("?page=account"))).toBeNull();
    // Memos & notifications stays open to all: HR's memos must be acknowledged.
    expect(pageOfRoute(readRoute("?page=account&view=memos"))).toBeNull();
    expect(pageOfRoute(readRoute("?page=account&view=crm"))).toBeNull();
  });

  it("a closed My honours or My brand weeks is not drawn: the app opens where it opens", () => {
    const honours = readRoute("?page=account&view=honours");
    expect(allowedRoute(honours, closing(["honours"])).screen).toBe("today");
    expect(allowedRoute(honours, closing(["brandWeeks"]))).toBe(honours);
    const weeks = readRoute("?page=account&view=brandWeeks");
    expect(allowedRoute(weeks, closing(["brandWeeks"])).pf).toBeNull();
  });

  it("opens on Today, else the first of Insight and the Arena, else Profile", () => {
    expect(landing(NOTHING_CLOSED)).toBe("today");
    expect(landing(closing(["today"]))).toBe("insight");
    expect(landing(closing(["today", "insight"]))).toBe("arena");
    expect(landing(closing(["today", "insight", "arena"]))).toBe("account");
  });

  it("a route to a closed page goes where the app opens; any other stays itself", () => {
    const arena = readRoute("?page=arena&view=board&board=margin&department=fair");
    expect(allowedRoute(arena, closing(["arena"]))).toEqual({ ...arena, screen: "today", pf: null, ins: "main", arena: "hub" });
    expect(allowedRoute(arena, closing(["insight"]))).toBe(arena);
    const income = readRoute("?page=account&view=income");
    expect(allowedRoute(income, closing(["income", "today"])).screen).toBe("insight");
  });

  it("a send closes with its Create, and with its page", () => {
    expect(sends(closing([], ["quote"]), "quote")).toBe(false);
    expect(sends(closing(["quote"]), "quote")).toBe(false);
    expect(shows(closing([], ["quote"]), "quote")).toBe(true);
  });

  it("a request is followed up on Requests — or, that closed, a waiting list or replacement on its own page", () => {
    expect(requestPage(NOTHING_CLOSED, "claim")).toBe("requests");
    expect(requestPage(closing(["requests"]), "waiting")).toBe("track");
    expect(requestPage(closing(["requests"]), "claim")).toBeNull();
    expect(requestPage(closing(["requests", "track"]), "replacement")).toBeNull();
  });
});
