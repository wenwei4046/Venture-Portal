/** Client-side navigation shared by the workspace header and quote builder. */
export const MEMBER_ROUTE_CHANGE = "member-route-change";

const stateKey = "__houzsMemberNavigationV1";
const memberPages = new Set([
  "today", "insight", "arena", "income", "quote", "team", "requests", "memos", "crm", "account",
]);
type RouteMarker = { id: number; current: string; previous: string };
// A history entry is trusted only if this running workspace created its marker.
// Reloaded or externally supplied state falls back to a safe in-app destination.
const issuedMarkers = new Map<number, RouteMarker>();
let sequence = 0;

function historyState(): Record<string, unknown> {
  const state: unknown = window.history.state;
  return state && typeof state === "object" && !Array.isArray(state)
    ? { ...(state as Record<string, unknown>) }
    : {};
}

function memberRoute(value: string, current: URL): URL | null {
  try {
    const url = new URL(value);
    if (
      url.origin !== current.origin ||
      url.pathname !== current.pathname ||
      !memberPages.has(url.searchParams.get("page") || "today")
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function routeIdentity(url: URL): string {
  const normalized = new URL(url);
  normalized.searchParams.set("page", normalized.searchParams.get("page") || "today");
  if (normalized.searchParams.get("page") === "quote") {
    normalized.searchParams.set(
      "quoteView",
      normalized.searchParams.get("quoteView") === "calculator" ? "calculator" : "catalog",
    );
  }
  normalized.searchParams.sort();
  return normalized.href;
}

function knownPrevious(current: URL): URL | null {
  const candidate = historyState()[stateKey];
  if (!candidate || typeof candidate !== "object") return null;
  const marker = candidate as RouteMarker;
  const issued = issuedMarkers.get(marker.id);
  if (
    !issued ||
    marker.current !== issued.current ||
    marker.previous !== issued.previous ||
    marker.current !== current.href
  ) return null;
  const previous = memberRoute(marker.previous, current);
  return previous && routeIdentity(previous) !== routeIdentity(current) ? previous : null;
}

function announceRouteChange() {
  window.dispatchEvent(new Event(MEMBER_ROUTE_CHANGE));
}

/** Push a member route without losing framework state or manufacturing popstate. */
export function pushMemberRoute(url: URL): void {
  const current = new URL(window.location.href);
  if (!memberRoute(url.href, current) || url.href === current.href) return;
  const state = historyState();
  delete state[stateKey];
  if (memberRoute(current.href, current)) {
    const marker: RouteMarker = {
      id: ++sequence,
      current: url.href,
      previous: current.href,
    };
    issuedMarkers.set(marker.id, marker);
    state[stateKey] = marker;
  }
  window.history.pushState(state, "", url);
  announceRouteChange();
}

/** A deterministic safe destination, also used to label/disable the Back button. */
export function getMemberBackTarget(): URL | null {
  const current = new URL(window.location.href);
  const previous = knownPrevious(current);
  if (
    current.searchParams.get("page") === "quote" &&
    current.searchParams.get("quoteView") === "calculator"
  ) {
    const catalog = new URL(current);
    catalog.searchParams.set("quoteView", "catalog");
    return previous && routeIdentity(previous) === routeIdentity(catalog) ? previous : catalog;
  }
  if (previous) return previous;
  if ((current.searchParams.get("page") || "today") === "today") return null;
  const today = new URL(current);
  today.searchParams.set("page", "today");
  today.searchParams.delete("quoteView");
  return today;
}

export function goMemberBack(): void {
  const current = new URL(window.location.href);
  const target = getMemberBackTarget();
  if (!target) return;
  const previous = knownPrevious(current);
  if (previous?.href === target.href) {
    window.history.back();
    return;
  }
  const state = historyState();
  delete state[stateKey];
  window.history.replaceState(state, "", target);
  // A fallback is still a Back navigation: synchronize the existing route
  // readers, while ordinary forward pushes only announce the custom event.
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
  announceRouteChange();
}
