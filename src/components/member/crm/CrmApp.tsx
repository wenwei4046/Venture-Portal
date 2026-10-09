"use client";

/**
 * The redesigned CRM (Claude Design handoff, docs/design_handoff_crm_roles,
 * 2026-10-09). Salespeople — Senior TL, TL, TA, SRS, RS — get the salesperson
 * CRM (design 3b); the Principal and the Revenue Director get the Control
 * panel (design 1a), the Director with a My CRM toggle into their own. The
 * screens' markup is generated from the design (sales/Sales*.tsx); their
 * behaviour is sales/vm/*.ts; every change is saved first (sales/actions.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { fetchCrmData } from "@/app/(member)/member/crm-actions";
import type { CrmData } from "@/lib/member/crm-data";
import { crmDemoData } from "@/lib/member/crm-demo-data";
import H from "./crm.module.css";
import { KEYFRAMES } from "./keyframes";
import { personOf } from "./shared/people";
import { makeSalesActions } from "./sales/actions";
import { initialSalesUi, type SalesRefs, type SalesUi } from "./sales/ui";
import { type SalesCtx } from "./sales/vm/common";
import { lastAt } from "./sales/vm/inbox";
import SalesScreens from "./sales/SalesScreens";
import { downlineOf } from "./shared/people";
import PanelScreens from "./panel/PanelScreens";
import { makePanelActions } from "./panel/actions";
import { initialPanelUi, type PanelUi } from "./panel/ui";
import { teamsOf, type PanelCtx } from "./panel/vm/common";

/** On demo data (/member/preview) the Control panel is looked at with ?crmAs=boss or ?crmAs=hod. */
const demoViewer = () => (typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("crmAs") ?? undefined);

export default function CrmApp({ live, salesperson, onExit }: { live: boolean; salesperson: string; onExit: () => void }) {
  const [data, setData] = useState<CrmData | null>(() => (live ? null : crmDemoData(salesperson)));
  const [problem, setProblem] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [ui, setUi] = useState<SalesUi>(initialSalesUi);
  const [viewing, setViewing] = useState<string | null>(null);
  // The Principal and the Director: the Control panel, or (the Director) their own CRM.
  const [panelUi, setPanelUi] = useState<PanelUi>(initialPanelUi);
  const [hodMode, setHodMode] = useState<"panel" | "crm">("panel");
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const refs = useRef<SalesRefs>({}).current;
  const dataRef = useRef<CrmData | null>(data);
  dataRef.current = data;

  // Live: read once on opening, under the member's own session.
  useEffect(() => {
    if (!live) return;
    let current = true;
    void fetchCrmData().then(r => { if (current) { if (r.ok) setData(r.data); else setProblem(r.error); } });
    return () => { current = false; };
  }, [live]);
  // Demo only: whose eyes, after the first paint (the server cannot read the address's ?crmAs).
  useEffect(() => { const v = demoViewer(); if (!live && v) setData(crmDemoData(salesperson, v)); }, [live, salesperson]);
  // The clock behind the colours: every minute the waits grow.
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const toast = useCallback((text: string) => {
    setUi(u => ({ ...u, toast: text }));
    clearTimeout(refs.toastT);
    refs.toastT = setTimeout(() => setUi(u => (u.toast === text ? { ...u, toast: "" } : u)), 4000);
  }, [refs]);
  const setDataSafe = useCallback((f: SetStateAction<CrmData>) => setData(d => (d ? (typeof f === "function" ? f(d) : f) : d)), []);
  const act = useMemo(() => makeSalesActions({ live, me: data?.viewerId ?? "", data: () => dataRef.current!, setData: setDataSafe, toast }), [live, data?.viewerId, setDataSafe, toast]);
  const panelToast = useCallback((text: string) => {
    setPanelUi(u => ({ ...u, toast: text }));
    clearTimeout(refs.panelToastT);
    refs.panelToastT = setTimeout(() => setPanelUi(u => (u.toast === text ? { ...u, toast: "" } : u)), 4000);
  }, [refs]);
  // The panel's own copy of the chat's actions, so what they say (a failed send, a 4 MB file) shows on the panel.
  const panelAct = useMemo(() => makePanelActions(
    makeSalesActions({ live, me: data?.viewerId ?? "", data: () => dataRef.current!, setData: setDataSafe, toast: panelToast }),
    { live, data: () => dataRef.current!, setData: setDataSafe }), [panelToast, live, data?.viewerId, setDataSafe]);

  // Book visit greys a full slot: the showroom's booked counts around the chosen day.
  const book = ui.book, rooms = data?.rooms.filter(r => r.active) ?? [];
  const bookRoom = book ? (rooms[book.room] ?? rooms[0])?.id : undefined;
  const bookMonth = book ? `${new Date(book.day).getFullYear()}-${new Date(book.day).getMonth()}` : "";
  useEffect(() => {
    if (!bookRoom || !book) return;
    const d = new Date(book.day), from = new Date(d.getFullYear(), d.getMonth() - 1, 1), to = new Date(d.getFullYear(), d.getMonth() + 2, 1);
    let current = true;
    void act.slotCounts(bookRoom, from, to).then(c => { if (current) setSlotCounts(c); });
    return () => { current = false; };
    // Re-read when the room or the month changes (and after a booking changes the visits).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- book.day only matters through bookMonth
  }, [bookRoom, bookMonth, act, data?.visits.length]);

  const shell = (body: React.ReactNode, extra = "") => (
    // data-revenue-app: the portal's display serif stays off the CRM's headings (globals.css).
    <div className={extra ? `${H.app} ${extra}` : H.app} data-revenue-app="">
      <style>{KEYFRAMES}</style>
      {body}
    </div>
  );
  if (!data) return shell(<p className={H.loading}>{problem || "Loading your customers…"}</p>);
  const me = personOf(data.viewerId, data.people);
  if (!me) return shell(<p className={H.loading}>{data.setup === "no_role"
    ? "Your job title has no role in the CRM. The CRM is for the Revenue team; if you should be in it, ask your administrator to check your title in People."
    : "Your login is not linked to your employee record in People yet. Once your administrator links them, your customers appear here."}</p>);

  // The Principal and the Director see everyone: the Control panel, and anyone's own CRM from it.
  const full = me.role === "boss" || me.role === "hod";
  const nameOf = (id: string | null | undefined) => personOf(id, data.people)?.name ?? "—";
  const openCrmOf = (staffId: string, customerId?: string) => {
    if (staffId === me.id && me.role === "hod") { setViewing(null); setHodMode("crm"); } else setViewing(staffId);
    setUi(u => ({ ...initialSalesUi(), toast: u.toast, chat: customerId ?? null }));
  };
  if (full && !viewing && (me.role === "boss" || hodMode === "panel")) {
    const teams = teamsOf(data);
    const pctx: PanelCtx = {
      data, me, now, live, ui: panelUi, set: setPanelUi, patch: p => setPanelUi(u => ({ ...u, ...p })), act: panelAct, nameOf, teams,
      directors: data.people.filter(p => p.role === "hod").sort((a, b) => a.name.localeCompare(b.name)),
      teamOfStaff: id => { const tl = id ? teams.find(t => t.id === id || t.people.some(p => p.id === id)) : undefined; return tl; },
      openCrmOf, toMyCrm: me.role === "hod" ? () => openCrmOf(me.id) : undefined, exitApp: onExit, slotCounts,
    };
    return shell(<>
      {problem && <p className={H.problem}>{problem}</p>}
      <PanelScreens ctx={pctx} />
    </>, H.panel);
  }

  // Whose CRM is on screen: one's own, or someone below (View my team) — anyone, for the Principal and the Director.
  const below = full ? data.people.filter(p => p.id !== me.id && ["hod", "stl", "tl", "ta", "rs"].includes(p.role)).map(p => p.id) : downlineOf(me.id, data.people);
  const owner = (viewing && below.includes(viewing) ? personOf(viewing, data.people) : undefined) ?? me;
  const hidden = (id: string) => !!(data.prefs[id]?.hidden);
  const shared = new Set(data.shares.filter(s => s.staffId === owner.id).map(s => s.customerId));
  const mine = data.customers.filter(c => (c.assignedTo === owner.id || shared.has(c.id)) && (owner.id !== me.id || !hidden(c.id)))
    .sort((a, b) => lastAt(b) - lastAt(a));
  const patch = (p: Partial<SalesUi>) => setUi(u => ({ ...u, ...p }));
  const ctx: SalesCtx = {
    data, me, owner, viewingOther: owner.id !== me.id, now, live, ui, set: setUi, patch, act, refs, slotCounts, mine,
    nameOf,
    embedded: {
      // The Director's own CRM carries Control panel | My CRM.
      rdMode: me.role === "hod",
      toPanel: () => { setHodMode("panel"); setViewing(null); },
      switchList: below.map(id => personOf(id, data.people)!).filter(Boolean),
      onSwitch: id => { setViewing(id); setUi(u => ({ ...u, tab: "inbox", chat: null, filter: null, profSub: null })); },
      // Leaving someone's CRM goes back where it was opened: the Control panel, or one's own Profile.
      exitAs: () => { setViewing(null); setUi(u => ({ ...u, tab: full ? "inbox" : "profile", chat: null, filter: null })); },
    },
  };
  return shell(<>
    {problem && <p className={H.problem}>{problem}</p>}
    <SalesScreens ctx={ctx} onExit={onExit} />
  </>);
}
