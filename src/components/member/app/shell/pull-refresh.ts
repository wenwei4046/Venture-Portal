/**
 * Pull to refresh (2026-10-06, user: 除非我拉下来 refresh，它才会直接变 … 往下滑 refresh
 * 之后应该就是新的 data). The app never changes on its own; a pull down from the
 * top of the page reads everything again and swaps it in when it lands.
 *
 * The gesture's arithmetic, kept apart so it is tested without a finger.
 */

/** How far the dot travels before a release refreshes. */
export const PULL_ARM = 64;
/** The dot never travels further than this, however far the finger goes. */
export const PULL_MAX = 112;
/** Where the dot rests, spinning, while the reads run. */
export const PULL_REST = 52;
/** Finger travel before a drag counts as a pull (a tap or a scroll is never one). */
export const PULL_SLOP = 8;
/**
 * Away this long, the app reads everything again once when it comes back (a
 * phone resumes an installed app where it was left — overnight, otherwise,
 * yesterday's memos and income would still be on screen).
 */
export const RETURN_REFRESH_MS = 10 * 60_000;

/**
 * A read refused because the server no longer knows this page's Server
 * Actions: a newer release is live (every build renames them), and the page
 * open since before it can read nothing more. Next names that error
 * `UnrecognizedActionError` ("… was not found on the server").
 */
export function isStaleAppError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "UnrecognizedActionError" || /was not found on the server|older or newer deployment/i.test(error.message);
}

/** Loading the page again — the new release and its data. An object, so a test can stand in for it. */
export const reloader = { reload: () => window.location.reload() };

/** Finger travel → dot travel: half the distance up to the arming point, then a quarter, never past PULL_MAX. */
export function pullDistance(dy: number): number {
  if (!(dy > 0)) return 0;
  const half = dy / 2;
  if (half <= PULL_ARM) return half;
  return Math.min(PULL_MAX, PULL_ARM + (half - PULL_ARM) / 2);
}

export type PullStart = "pull" | "wait" | "none";

/**
 * Whether a drag that began at the top of the page is a pull: down and mostly
 * vertical. A sideways swipe (brand chips) or a scroll up gives the gesture back.
 */
export function pullStart(dy: number, dx: number): PullStart {
  if (Math.abs(dx) > PULL_SLOP && Math.abs(dx) > Math.abs(dy)) return "none";
  if (dy < -4) return "none";
  return dy >= PULL_SLOP ? "pull" : "wait";
}
