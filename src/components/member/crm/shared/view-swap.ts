/**
 * The view switch in the place of the Inbox's bell (2026-11-27 — the owner, circling the bell on the phone CRM's Team Inbox:
 * "change this icon of notification with change view, for ir & dc ( those have crm servcice connected )"). For whoever has
 * two views with a CRM of their own — IR's The Conts and DC's Dream Crafter (lib/member/crm-view.ts › crmViewSwitch) — both
 * phone Inboxes, Mine's and Team's, have one round button where the bell was: the view one is in ("IR", "DC") with a swap
 * badge on its corner, and a tap moves the Revenue app to the other view, the CRM staying open on it. On one's own CRM only
 * (never while viewing somebody). Whoever has one such view, or is in Fair's, keeps the bell. Notifications stay Profile's
 * either way (the Profile tab carries their count).
 */

/** What the Revenue app hands the CRM: the view one is in, the one a tap goes to, and the move. */
export type CrmViewSwap = { label: string; to: string; swap: () => void };

/** The button as both Inboxes draw it; off — the bell in its place. */
export type ViewSwapBtn = { on: boolean; label: string; title: string; swap: () => void };

export function viewSwapBtn(vs: CrmViewSwap | null | undefined): ViewSwapBtn {
  return vs ? { on: true, label: vs.label, title: `${vs.label} view · switch to ${vs.to}`, swap: vs.swap } : { on: false, label: "", title: "", swap: () => {} };
}
