"use client";

/**
 * The desktop CRM on the prototype's OWN logic and demo data (vm/proto-logic.ts, generated): what the generated markup
 * (DeskApp.tsx) is pixel-compared against the prototype's frames with (/member/preview?app=desk-proto&…, dev only).
 * The prototype's class runs as Claude Design's runtime runs it (vm/proto-base.ts): one instance, its state merged at
 * once, componentDidMount / DidUpdate / WillUnmount around the renders, the template drawn over its props.
 */
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import DeskApp from "./DeskApp";
import R from "./desk-root.module.css";
import { Component } from "./vm/proto-logic";
import type { DCLogic } from "./vm/proto-base";
import type { DeskVM } from "./vm/app";
import { NO_MEDIA } from "../shared/chat-media";

export type ProtoProps = Record<string, string | boolean | undefined>;

/** What tools/crm-design/desk-patches.cjs binds that the prototype wrote as text: the prototype's own words and look. */
const noop = () => {};
const PROTO_FRAME = {
  frameRadius: "14px", frameShadow: "0 1px 2px rgba(63,43,34,.08), 0 12px 40px rgba(63,43,34,.10)",
  greetWord: "Good morning", subLabel: "Fair view", subCur: "auto", dateLine: "Sat 3 Oct 2026 · Q4 2026", appBellDot: true,
  openSubDept: noop, openAppBell: noop, signOut: noop, signOutMe: noop, alertsN: "7", alertsHas: true,
  chTokenLine: "System user token · renews in 42 days", chTokenMask: "EAAG••••••••••••••••3fQ", chHookLine: "Receiving · last event 2 min ago", chHookC: "#387557", chHookUrl: "https://crm.houzs.my/api/meta/webhook",
  chReconnect: noop, chOpenPage: noop, chOpenWaManager: noop, chPageIni: "H", chPageName: "HOUZS Venture", waIni: "H", chMonth: "OCT", metaSync: "Synced from Meta Ads · 9:00 am", metaDot: "#3FA06B",
};
const MIC = "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3";
/**
 * The prototype draws a chat as one message under "Today", then the reminder card — the same, as the live list
 * desk-chat-v2.cjs draws (each message its own hover, menu, reaction and star).
 */
function protoChats(p: Record<string, unknown>) {
  const msg = { key: "m", id: "m", day: "", sys: "", inn: !!p.chatIn && !!p.msgShown, out: !!p.chatOut && !!p.msgShown, text: String(p.chatText ?? ""), time: String(p.chatTime ?? ""),
    starred: p.msgStarred, hasReaction: p.hasReaction, reaction: p.reaction, rxGap: p.rxGap, enter: p.msgEnter, leave: p.msgLeave, hover: p.msgHover,
    menuToggle: p.msgMenuToggle, menuOpen: p.msgMenuOpen, menuClose: p.msgMenuClose, reactBar: p.reactBar, acts: p.msgActs,
    tick: "#3B8FD9", hasTick: true, failed: false, quote: null, quoteMargin: "0", appt: null, ...NO_MEDIA };
  const appt = p.chatAppt ? [{ ...msg, key: "a", id: "a", inn: false, out: false, appt: { ...(p.appt as object), kind: "REMINDER", deco: "none", go: noop } }] : [];
  return {
    firstDay: "Today", pinText: String(p.chatText ?? ""), replyText: String(p.chatText ?? ""), msgs: [msg, ...appt],
    // Inbox rows: the time's colour as the design writes it (live: rust while unread).
    chats: ((p.chats ?? []) as Record<string, unknown>[]).map(c => ({ ...c, timeFg: "#A8968B" })),
    draft: "", micD: MIC, sendTitle: "Voice note",
    setDraft: noop, draftKey: noop, send: noop, photo: noop,
    awInfo: noop, awBook: noop, openNote: noop, editInfo: noop, cyclePeriod: noop, openInfo: noop, openBook: noop, freeLabel: "Free · 2 per slot",
    kBook: false, kNote: false, kForm: false,
    // Insight's ad table header as the design writes it (the live one sorts and sizes — BUILD-NOTES.md).
    insHead: ["AD", "SPEND (RM)", "REACH", "CLICKS", "CTR", "LEADS", "COST / LEAD (RM)", "APPT"].map((label, i) => ({ label, align: i ? "center" : "left", justify: i ? "center" : "flex-start",
      fg: "#806B60", arrow: "", ac: "#C9B8AC", sort: noop, resize: noop, unsize: noop })),
    insAdCols: "minmax(220px, 1.6fr) repeat(7, minmax(72px, 1fr))", insAdMinW: 820,
  };
}

/** A canvas's <dc-import> attributes as the runtime hands them to the logic: kebab-case → camelCase. */
const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Drawn on the client only: the frame appears once the prototype has mounted (the comparison waits for it). */
export default function DeskProto({ props }: { props: ProtoProps }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  return on ? <ProtoFrame props={props} /> : null;
}

function ProtoFrame({ props }: { props: ProtoProps }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const P = Object.fromEntries(Object.entries(props).map(([k, v]) => [camel(k), v]));
  const inst = useRef<DCLogic | null>(null);
  const after = useRef<(() => void)[]>([]);
  // A setState before the first commit (the prototype seeds state from a microtask inside renderVals) waits for it.
  const mounted = useRef(false), pending = useRef(false);
  if (!inst.current) {
    const c = new (Component as unknown as new (p: Record<string, unknown>) => DCLogic)(P);
    c.__rerender = cb => { if (cb) after.current.push(cb); if (mounted.current) bump(); else pending.current = true; };
    inst.current = c;
  }
  const c = inst.current;
  c.props = P;
  // Layout effects: the runtime mounts during the commit, before a microtask the first render queued can run.
  useLayoutEffect(() => {
    if (!mounted.current) { mounted.current = true; c.componentDidMount(); }
    else c.componentDidUpdate();
    const cbs = after.current.splice(0);
    cbs.forEach(f => f());
    if (pending.current) { pending.current = false; bump(); }
  });
  useLayoutEffect(() => () => c.componentWillUnmount(), [c]);
  const p = { ...P, ...c.renderVals() } as Record<string, unknown>;
  const v = { ...p, ...PROTO_FRAME, ...protoChats(p), chNote: p.chRo ? "Only Principal and Director can change these. You can look." : "" } as unknown as DeskVM;
  // data-revenue-app: where the desktop always sits (inside the Revenue app), so the portal's display serif stays off.
  return <div className={R.root} data-revenue-app=""><DeskApp v={v} /></div>;
}
