import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEMBER_ROUTE_CHANGE,
  getMemberBackTarget,
  goMemberBack,
  pushMemberRoute,
} from "./navigation";

const route = (query: string) => new URL(`/member/preview?${query}`, window.location.origin);
const visit = (query: string, state: Record<string, unknown> = {}) =>
  window.history.replaceState(state, "", route(query));

beforeEach(() => visit("page=today"));
afterEach(() => vi.restoreAllMocks());

describe("member navigation", () => {
  it("takes a directly opened calculator to the catalogue and retains department and preview settings", () => {
    visit("page=quote&quoteView=calculator&department=fair&device=phone", { framework: 1 });
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const changed = vi.fn();
    const popstate = vi.fn();
    window.addEventListener(MEMBER_ROUTE_CHANGE, changed, { once: true });
    window.addEventListener("popstate", popstate, { once: true });

    goMemberBack();

    expect(window.location.href).toBe(route("page=quote&quoteView=catalog&department=fair&device=phone").href);
    expect(window.history.state).toEqual({ framework: 1 });
    expect(back).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledOnce();
    expect(popstate).toHaveBeenCalledOnce();
    expect(popstate.mock.calls[0][0].state).toEqual({ framework: 1 });
    expect(getMemberBackTarget()?.searchParams.get("page")).toBe("today");
  });

  it("takes a direct catalogue to Today without leaving the member route", () => {
    visit("page=quote&quoteView=catalog&department=fair");
    goMemberBack();
    expect(window.location.pathname).toBe("/member/preview");
    expect(window.location.search).toBe("?page=today&department=fair");
    expect(getMemberBackTarget()).toBeNull();
  });

  it("has no Back destination on a direct Today page", () => {
    visit("department=fair");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState");
    expect(getMemberBackTarget()).toBeNull();
    goMemberBack();
    expect(back).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("returns to the prior member page using browser history and preserves framework state", () => {
    visit("page=team&department=fair", { __NA: true, tree: ["member"] });
    const team = window.location.href;
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    pushMemberRoute(route("page=quote&quoteView=catalog&department=fair"));

    expect(window.history.state).toMatchObject({ __NA: true, tree: ["member"] });
    expect(getMemberBackTarget()?.href).toBe(team);
    goMemberBack();
    expect(back).toHaveBeenCalledOnce();
  });

  it("returns from Calculator to the actual catalogue entry even when its default view was omitted", () => {
    visit("page=quote&department=fair");
    const catalog = window.location.href;
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    pushMemberRoute(route("page=quote&department=fair&quoteView=calculator"));
    expect(getMemberBackTarget()?.href).toBe(catalog);
    goMemberBack();
    expect(back).toHaveBeenCalledOnce();
  });

  it("lets the catalogue opened by Add product return to Calculator", () => {
    visit("page=quote&quoteView=calculator&department=fair");
    const calculator = window.location.href;
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    pushMemberRoute(route("page=quote&quoteView=catalog&department=fair"));
    expect(getMemberBackTarget()?.href).toBe(calculator);
    goMemberBack();
    expect(back).toHaveBeenCalledOnce();
  });

  it("uses the catalogue fallback when Calculator was opened from another member page and clears the stale marker", () => {
    visit("page=team&department=fair", { framework: "retained" });
    pushMemberRoute(route("page=quote&quoteView=calculator&department=fair"));
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    goMemberBack();
    expect(window.location.search).toBe("?page=quote&quoteView=catalog&department=fair");
    expect(window.history.state).toEqual({ framework: "retained" });
    expect(getMemberBackTarget()?.searchParams.get("page")).toBe("today");
    expect(back).not.toHaveBeenCalled();
  });

  it("does not duplicate an identical route or announce a browser popstate for a push", () => {
    const changed = vi.fn();
    const popstate = vi.fn();
    window.addEventListener(MEMBER_ROUTE_CHANGE, changed);
    window.addEventListener("popstate", popstate);
    const push = vi.spyOn(window.history, "pushState");
    const target = route("page=income&department=fair");
    pushMemberRoute(target);
    pushMemberRoute(target);
    expect(push).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
    expect(popstate).not.toHaveBeenCalled();
    window.removeEventListener(MEMBER_ROUTE_CHANGE, changed);
    window.removeEventListener("popstate", popstate);
  });

  it("ignores external or different-path navigation requests", () => {
    const current = window.location.href;
    const push = vi.spyOn(window.history, "pushState");
    pushMemberRoute(new URL("https://example.com/member/preview?page=team"));
    pushMemberRoute(new URL("/admin?page=team", window.location.origin));
    expect(window.location.href).toBe(current);
    expect(push).not.toHaveBeenCalled();
  });

  it("rejects a forged external previous marker rather than calling browser Back", () => {
    visit("page=quote&quoteView=catalog", {
      __houzsMemberNavigationV1: {
        id: -1,
        current: route("page=quote&quoteView=catalog").href,
        previous: "https://example.com/",
      },
    });
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    goMemberBack();
    expect(back).not.toHaveBeenCalled();
    expect(window.location.href).toBe(route("page=today").href);
  });

  it("rejects a tampered helper marker and a stale marker copied onto another route", () => {
    visit("page=team");
    pushMemberRoute(route("page=quote&quoteView=catalog"));
    const issuedState = window.history.state;
    visit("page=quote&quoteView=catalog", {
      ...issuedState,
      __houzsMemberNavigationV1: {
        ...issuedState.__houzsMemberNavigationV1,
        previous: route("page=account").href,
      },
    });
    expect(getMemberBackTarget()?.searchParams.get("page")).toBe("today");
    visit("page=income", issuedState);
    expect(getMemberBackTarget()?.searchParams.get("page")).toBe("today");
  });
});
