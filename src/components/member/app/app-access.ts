import type { AppClosed, AppPage } from "@/lib/member/app-pages";
import type { Route, Screen } from "./route";

/**
 * Where the app may go once a holder's ticks close some of its pages
 * (2026-10-11, lib/member/app-pages.ts): which page a route is, where the app
 * opens instead, and which page a request is followed up on.
 */

/** The tabbed page a route is on; null for what no tab stands for (Profile itself, honours, memos, brand weeks, the CRM, the Product List). */
export function pageOfRoute(route: Pick<Route, "screen" | "pf">): AppPage | null {
  switch (route.screen) {
    case "today": case "insight": case "arena": return route.screen;
    case "quote": case "calc": return "quote";
    case "account":
      if (route.pf === "income" || route.pf === "incOrders") return "income";
      return route.pf === "requests" || route.pf === "track" || route.pf === "team" || route.pf === "rooms" || route.pf === "docs" ? route.pf : null;
    default: return null;
  }
}

export const shows = (closed: AppClosed, page: AppPage): boolean => !closed.pages.includes(page);
export const sends = (closed: AppClosed, page: AppPage): boolean => shows(closed, page) && !closed.sends.includes(page);

/** Where the app opens: Today, else the first of Insight and the Arena they have, else Profile — always theirs. */
export function landing(closed: AppClosed): Screen {
  return (["today", "insight", "arena"] as const).find(page => shows(closed, page)) ?? "account";
}

/** The route as the app may draw it: itself, or — its page closed — where the app opens. */
export function allowedRoute(route: Route, closed: AppClosed): Route {
  const page = pageOfRoute(route);
  return page && !shows(closed, page) ? { ...route, screen: landing(closed), pf: null, ins: "main", arena: "hub" } : route;
}

/**
 * The page a request is followed up on: Requests, which lists every kind — or,
 * Requests closed, Waiting list & replacements for those two. Null when neither
 * is open to them (its news then has nowhere to go and is not shown).
 */
export function requestPage(closed: AppClosed, kind: string): "requests" | "track" | null {
  if (shows(closed, "requests")) return "requests";
  return kind !== "claim" && shows(closed, "track") ? "track" : null;
}
