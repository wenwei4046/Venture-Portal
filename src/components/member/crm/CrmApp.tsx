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

export default function CrmApp({ live, salesperson, onExit }: { live: boolean; salesperson: string; onExit: () => void }) {
  const [data, setData] = useState<CrmData | null>(() => (live ? null : crmDemoData(salesperson)));
  const [problem, setProblem] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [ui, setUi] = useState<SalesUi>(initialSalesUi);
  const [viewing, setViewing] = useState<string | null>(null);
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
  // The clock behind the colours: every minute the waits grow.
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const toast = useCallback((text: string) => {
    setUi(u => ({ ...u, toast: text }));
    clearTimeout(refs.toastT);
    refs.toastT = setTimeout(() => setUi(u => (u.toast === text ? { ...u, toast: "" } : u)), 4000);
  }, [refs]);
  const setDataSafe = useCallback((f: SetStateAction<CrmData>) => setData(d => (d ? (typeof f === "function" ? f(d) : f) : d)), []);
  const act = useMemo(() => makeSalesActions({ live, me: data?.viewerId ?? "", data: () => dataRef.current!, setData: setDataSafe, toast }), [live, data?.viewerId, setDataSafe, toast]);

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

  const shell = (body: React.ReactNode) => (
    // data-revenue-app: the portal's display serif stays off the CRM's headings (globals.css).
    <div className={H.app} data-revenue-app="">
      <style>{KEYFRAMES}</style>
      {body}
    </div>
  );
  if (!data) return shell(<p className={H.loading}>{problem || "Loading your customers…"}</p>);
  const me = personOf(data.viewerId, data.people);
  if (!me) return shell(<p className={H.loading}>{data.setup === "no_role"
    ? "Your job title has no role in the CRM. The CRM is for the Revenue team; if you should be in it, ask your administrator to check your title in People."
    : "Your login is not linked to your employee record in People yet. Once your administrator links them, your customers appear here."}</p>);

  // Whose CRM is on screen: one's own, or someone below (View my team).
  const below = downlineOf(me.id, data.people);
  const owner = (viewing && below.includes(viewing) ? personOf(viewing, data.people) : undefined) ?? me;
  const hidden = (id: string) => !!(data.prefs[id]?.hidden);
  const shared = new Set(data.shares.filter(s => s.staffId === owner.id).map(s => s.customerId));
  const mine = data.customers.filter(c => (c.assignedTo === owner.id || shared.has(c.id)) && (owner.id !== me.id || !hidden(c.id)))
    .sort((a, b) => lastAt(b) - lastAt(a));
  const patch = (p: Partial<SalesUi>) => setUi(u => ({ ...u, ...p }));
  const ctx: SalesCtx = {
    data, me, owner, viewingOther: owner.id !== me.id, now, live, ui, set: setUi, patch, act, refs, slotCounts, mine,
    nameOf: id => personOf(id, data.people)?.name ?? "—",
    embedded: {
      rdMode: false,
      switchList: below.map(id => personOf(id, data.people)!).filter(Boolean),
      onSwitch: id => { setViewing(id); setUi(u => ({ ...u, tab: "inbox", chat: null, filter: null, profSub: null })); },
      exitAs: () => { setViewing(null); setUi(u => ({ ...u, tab: "profile", chat: null, filter: null })); },
    },
  };
  return shell(<>
    {problem && <p className={H.problem}>{problem}</p>}
    <SalesScreens ctx={ctx} onExit={onExit} />
  </>);
}
