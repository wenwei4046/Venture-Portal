"use client";

/**
 * The desktop CRM on the prototype's OWN logic and demo data (vm/proto-logic.ts, generated): what the generated markup
 * (DeskApp.tsx) is pixel-compared against the prototype's frames with (/member/preview?app=desk-proto&…, dev only).
 * Holds the prototype's state the way its runtime does — one object, setState merging, function updaters, a
 * callback after.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import DeskApp from "./DeskApp";
import R from "./desk-root.module.css";
import { keyHandler, protoVals } from "./vm/proto-logic";
import type { DeskVM } from "./vm/app";

export type ProtoProps = Record<string, string | boolean | undefined>;

/** What tools/crm-design/desk-patches.cjs binds that the prototype wrote as text: the prototype's own words and look. */
const noop = () => {};
const PROTO_FRAME = {
  frameRadius: "14px", frameShadow: "0 1px 2px rgba(63,43,34,.08), 0 12px 40px rgba(63,43,34,.10)",
  greetWord: "Good morning", subLabel: "Fair view", subCur: "auto", dateLine: "Sat 3 Oct 2026 · Q4 2026", appBellDot: true,
  openSubDept: noop, openAppBell: noop, signOut: noop, metaSync: "Synced from Meta Ads · 9:00 am", metaDot: "#3FA06B",
};
const MIC = "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3";
const one = (day: string, inn: boolean, text: string, time: string) =>
  [{ day }, { inn, out: !inn, text, time, tick: "#3B8FD9", hasTick: true }];
/** The prototype draws each chat as one message under its day (Awaiting reply: then the reminder pill) — the same, as a list. */
function protoChats(p: Record<string, unknown>) {
  const aw = (p.aw ?? {}) as Record<string, unknown>;
  return {
    msgs: one("Today", !!p.chatIn, String(p.chatText ?? ""), String(p.chatTime ?? "")),
    awMsgs: [...one(String(aw.time ?? ""), !!aw.inn, String(aw.msg ?? ""), String(aw.clock ?? "")), ...(aw.reminded ? [{ sys: String(aw.remindLog), bell: true }] : [])],
    draft: "", awDraft: "", micD: MIC, awMicD: MIC,
    setDraft: noop, awSetDraft: noop, draftKey: noop, awDraftKey: noop, send: noop, awSend: noop, attach: noop, awAttach: noop, photo: noop, awPhoto: noop,
    awInfo: noop, awBook: noop, openNote: noop, editInfo: noop, cyclePeriod: noop, openInfo: noop, openBook: noop, freeLabel: "Free · 2 per slot",
    kBook: false, kNote: false, kForm: false,
    // Insight's ad table header as the design writes it (the live one sorts and sizes — BUILD-NOTES.md).
    insHead: ["AD", "SPEND (RM)", "REACH", "CLICKS", "CTR", "LEADS", "COST / LEAD (RM)", "APPT"].map((label, i) => ({ label, align: i ? "center" : "left", justify: i ? "center" : "flex-start",
      fg: "#806B60", arrow: "", ac: "#C9B8AC", sort: noop, resize: noop, unsize: noop })),
    insAdCols: "minmax(220px, 1.6fr) repeat(7, minmax(72px, 1fr))", insAdMinW: 820,
  };
}
type ProtoState = Record<string, unknown>;
type Patch = Partial<ProtoState> | ((s: ProtoState) => Partial<ProtoState> | null);

export default function DeskProto({ props }: { props: ProtoProps }) {
  const [state, setState] = useState<ProtoState>({});
  const stateRef = useRef(state);
  stateRef.current = state;
  const refs = useRef<Record<string, unknown>>({}).current;
  const set = useCallback((p: Patch, after?: () => void) => {
    setState(s => {
      const next = { ...s, ...(typeof p === "function" ? p(s) ?? {} : p) };
      stateRef.current = next;
      return next;
    });
    if (after) setTimeout(after, 0);
  }, []);
  // The prototype's keyboard: Esc closes the menu / pane, ↑ ↓ walk the numeric inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (keyHandler(props, stateRef.current, set, refs) as (e: KeyboardEvent) => void)(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props, set, refs]);
  const p = protoVals(props, state, set, refs) as Record<string, unknown>;
  const v = { ...p, ...PROTO_FRAME, ...protoChats(p) } as unknown as DeskVM;
  // data-revenue-app: where the desktop always sits (inside the Revenue app), so the portal's display serif stays off.
  return <div className={R.root} data-revenue-app=""><DeskApp v={v} /></div>;
}
