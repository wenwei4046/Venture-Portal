"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Where the app is — the prototype's `screen` plus the page inside it. Kept in
 * the address bar (`?page=…&view=…`) so Back, a reload and a shared link all
 * land on the same page; sheets stay in component state.
 */
export type Screen = "today" | "quote" | "calc" | "insight" | "arena" | "account";
export type ProfileView = "income" | "incOrders" | "honours" | "team" | "requests" | "memos" | "brandWeeks";
export type InsightView = "main" | "bills" | "kpi" | "brand";
export type ArenaView = "hub" | "board" | "record";
export type Board = "sales" | "margin" | "kpi" | "champ";

export interface Route {
  screen: Screen;
  /** Profile's page; null = Profile itself. */
  pf: ProfileView | null;
  ins: InsightView;
  arena: ArenaView;
  board: Board;
  /** The sub-department (`comm_sub_departments.id`); empty = the first membership. */
  department: string;
  /** Principal only: whom the app is viewed as. */
  staff: string;
}

const SCREENS: Screen[] = ["today", "quote", "calc", "insight", "arena", "account"];
const PF: ProfileView[] = ["income", "incOrders", "honours", "team", "requests", "memos", "brandWeeks"];
const INS: InsightView[] = ["bills", "kpi", "brand"];
const BOARDS: Board[] = ["sales", "margin", "kpi", "champ"];
/** The old app's pages, so a bookmark or a memo link still lands. */
const LEGACY: Record<string, Partial<Route>> = {
  income: { screen: "account", pf: "income" },
  team: { screen: "account", pf: "team" },
  requests: { screen: "account", pf: "requests" },
  memos: { screen: "account", pf: "memos" },
};

export function readRoute(search: string): Route {
  const q = new URLSearchParams(search);
  const page = q.get("page") ?? "today";
  const view = q.get("view") ?? "";
  const base: Route = { screen: "today", pf: null, ins: "main", arena: "hub", board: "sales", department: q.get("department") ?? "", staff: q.get("staff") ?? "" };
  if (LEGACY[page]) return { ...base, ...LEGACY[page] };
  const screen = (SCREENS as string[]).includes(page) ? (page as Screen) : "today";
  const board = (BOARDS as string[]).includes(q.get("board") ?? "") ? (q.get("board") as Board) : "sales";
  return {
    ...base,
    screen,
    pf: screen === "account" && (PF as string[]).includes(view) ? (view as ProfileView) : null,
    ins: screen === "insight" && (INS as string[]).includes(view) ? (view as InsightView) : "main",
    arena: screen === "arena" && (view === "board" || view === "record") ? view : "hub",
    board,
  };
}

export function writeRoute(route: Route, base: string): string {
  const url = new URL(base);
  const q = new URLSearchParams();
  if (route.screen !== "today") q.set("page", route.screen);
  const view = route.screen === "account" ? route.pf : route.screen === "insight" && route.ins !== "main" ? route.ins
    : route.screen === "arena" && route.arena !== "hub" ? route.arena : null;
  if (view) q.set("view", view);
  if (route.screen === "arena" && route.arena === "board") q.set("board", route.board);
  if (route.department) q.set("department", route.department);
  if (route.staff) q.set("staff", route.staff);
  const keep = new URL(base).searchParams;
  for (const key of ["device", "fixture"]) { const v = keep.get(key); if (v) q.set(key, v); }
  url.search = q.toString();
  return url.toString();
}

/** The route, kept in step with the address bar. */
export function useRoute(initial: string): [Route, (next: Partial<Route>, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => readRoute(initial));
  const latest = useRef(route);
  latest.current = route;
  useEffect(() => {
    const sync = () => setRoute(readRoute(window.location.search));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const go = useCallback((next: Partial<Route>, replace = false) => {
    const merged = { ...latest.current, ...next };
    const href = writeRoute(merged, window.location.href);
    if (href !== window.location.href) window.history[replace ? "replaceState" : "pushState"](window.history.state, "", href);
    latest.current = merged;
    setRoute(merged);
  }, []);
  return [route, go];
}
