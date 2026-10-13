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
import { canFromRole, type CrmData } from "@/lib/member/crm-data";
import { crmDemoData } from "@/lib/member/crm-demo-data";
import H from "./crm.module.css";
import { KEYFRAMES } from "./keyframes";
import { personOf } from "./shared/people";
import { makeSalesActions } from "./sales/actions";
import { initialSalesUi, type SalesRefs, type SalesTab, type SalesUi } from "./sales/ui";
import { type SalesCtx } from "./sales/vm/common";
import { lastAt } from "./sales/vm/inbox";
import SalesScreens from "./sales/SalesScreens";
import SalesShellBanners from "./sales/SalesShellBanners";
import { shellVM } from "./sales/vm/header";
import { byTeam, downlineOf } from "./shared/people";
import PanelScreens from "./panel/PanelScreens";
import DeskScreens from "./desk/DeskScreens";
import type { DeskApp as DeskAppFrame } from "./desk/vm/ctx";
import D from "./desk/desk.module.css";
import { makePanelActions } from "./panel/actions";
import { initialPanelUi, type PanelTab, type PanelUi } from "./panel/ui";
import { teamsOf, type PanelCtx } from "./panel/vm/common";
import { useSwipeToClose } from "./shared/swipe-close";

/** Team | Mine keeps the page: one's CRM page → the Control panel's (it has no Contacts: its Inbox lists everybody's). */
const TEAM_TAB: Record<SalesTab, PanelTab> = { inbox: "inbox", contacts: "inbox", calendar: "calendar", insight: "overview", profile: "profile" };
const MINE_TAB: Record<PanelTab, SalesTab> = { overview: "insight", inbox: "inbox", calendar: "calendar", profile: "profile", assign: "inbox", ads: "insight" };

/** On demo data (/member/preview) the Control panel is looked at with ?crmAs=boss or ?crmAs=hod. */
const demoViewer = () => (typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("crmAs") ?? undefined);

/**
 * `desk`: the Revenue app is on a computer (2026-10-12, the user: My leads & appointments opens a desktop version on a
 * computer, the phone's on a phone). The Control panel then opens as panel/desk/PanelDesk — the same data, writes and
 * view models, laid out wide; the salesperson CRM stays the phone's until its desktop is built on the same frame.
 */
export default function CrmApp({ live, salesperson, onExit, desk = false, deskApp }: { live: boolean; salesperson: string; onExit: () => void; desk?: boolean; deskApp?: DeskAppFrame }) {
  const [data, setData] = useState<CrmData | null>(() => (live ? null : crmDemoData(salesperson)));
  // Any bottom sheet closes when pulled down (user 2026-10-13).
  useSwipeToClose();
  const [problem, setProblem] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [ui, setUi] = useState<SalesUi>(initialSalesUi);
  const [viewing, setViewing] = useState<string | null>(null);
  // The Principal and the Director: the Control panel, or (the Director) their own CRM.
  const [panelUi, setPanelUi] = useState<PanelUi>(initialPanelUi);
  // Team (the Control panel) or Mine (one's own CRM): null until chosen — the Director opens on Team, a leader on Mine.
  const [hodMode, setHodMode] = useState<"panel" | "crm" | null>(null);
  // View as somebody who leads: their Team side (the Control panel as they see it), or null for their CRM.
  const [teamAs, setTeamAs] = useState<string | null>(null);
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const refs = useRef<SalesRefs>({}).current;
  const dataRef = useRef<CrmData | null>(data);
  dataRef.current = data;

  // Live: read once on opening, under the member's own session.
  useEffect(() => {
    if (!live) return;
    let current = true;
    void fetchCrmData({ journey: desk }).then(r => { if (current) { if (r.ok) setData(r.data); else setProblem(r.error); } });
    return () => { current = false; };
  }, [live, desk]);
  // Live: new messages arrive without a reload (user 2026-10-09: 我發送 receive 但是 crm inbox 收不到 —
  // it was saved; the screen had read once). Read again every 5 s while on screen and at once on coming
  // back; never two reads at a time, and a read begun before one of our own changes is dropped, so it
  // cannot put back what that change just replaced.
  useEffect(() => {
    if (!live) return;
    let busy = false, stopped = false;
    const pull = async () => {
      if (busy || stopped || document.visibilityState !== "visible") return;
      busy = true;
      const started = Date.now();
      try {
        // The desktop also reads every customer's journey (Chat progress, CRM Desktop rev 1).
        const r = await fetchCrmData({ journey: desk });
        if (!stopped && r.ok && started >= (refs.localAt ?? 0)) setData(r.data);
      } finally { busy = false; }
    };
    const t = setInterval(() => void pull(), 5_000);
    const back = () => void pull();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { stopped = true; clearInterval(t); document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, [live, refs, desk]);
  // Demo only: whose eyes, after the first paint (the server cannot read the address's ?crmAs).
  useEffect(() => { const v = demoViewer(); if (!live && v) setData(crmDemoData(salesperson, v)); }, [live, salesperson]);
  // The clock behind the colours: every minute the waits grow.
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const toast = useCallback((text: string) => {
    setUi(u => ({ ...u, toast: text }));
    clearTimeout(refs.toastT);
    refs.toastT = setTimeout(() => setUi(u => (u.toast === text ? { ...u, toast: "" } : u)), 4000);
  }, [refs]);
  const setDataSafe = useCallback((f: SetStateAction<CrmData>) => { refs.localAt = Date.now(); setData(d => (d ? (typeof f === "function" ? f(d) : f) : d)); }, [refs]);
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
  // A line instead of the CRM (loading, not in it): on a computer in the page, not in a phone-sized box.
  const notice = (line: React.ReactNode) => (desk ? <div className={D.desk}><p className={H.loading}>{line}</p></div> : shell(<p className={H.loading}>{line}</p>));
  if (!data) return notice(problem || "Loading your customers…");
  const me = personOf(data.viewerId, data.people);
  if (!me) return notice(data.setup === "no_role"
    ? "Your job title has no role in the CRM. The CRM is for the Revenue team; if you should be in it, ask your administrator to check your title in People."
    : "Your login is not linked to your employee record in People yet. Once your administrator links them, your customers appear here.");

  // Whoever holds CRM · View at All sees everyone: the Control panel, and anyone's own CRM from it
  // (2026-10-10: the permission matrix decides — the Principal and the Revenue Director by their templates).
  const full = data.can.viewAll;
  // Everybody in the CRM sells but the Boss: somebody with the Control panel who sells has My CRM beside it.
  const sells = me.role !== "boss";
  // A leader (STL / TL / TA with a downline, rev 1011): the Control panel scoped to their whole downline — the database
  // already gives them only their line — beside their own CRM.
  const leads = !full && data.people.some(p => p.uplineId === me.id);
  const mode = hodMode ?? (full ? "panel" : "crm");
  const nameOf = (id: string | null | undefined) => personOf(id, data.people)?.name ?? "—";
  const openCrmOf = (staffId: string, customerId?: string) => {
    setTeamAs(null);
    if (staffId === me.id && sells) { setViewing(null); setHodMode("crm"); } else setViewing(staffId);
    setUi(u => ({ ...initialSalesUi(), toast: u.toast, chat: customerId ?? null }));
  };
  // Who has a Team side: the Director, and anyone with somebody below them (rev 1011).
  // Whose CRM may be on screen: one's own, or someone below (View my team) — anyone, for the Principal and the Director.
  const below = full ? data.people.filter(p => p.id !== me.id && ["hod", "stl", "tl", "ta", "rs"].includes(p.role)).map(p => p.id) : downlineOf(me.id, data.people);
  const switchList = byTeam(below.map(id => personOf(id, data.people)!).filter(Boolean), data.people);
  const hasTeamSide = (p: { id: string; role: string }) => p.role === "hod" || data.people.some(q => q.uplineId === p.id);
  const viewed = viewing ? personOf(viewing, data.people) : undefined;
  const panelFor = viewed && teamAs === viewed.id ? viewed : !viewing && (full || leads) && (!sells || mode === "panel") ? me : undefined;
  if (panelFor) {
    // Their own view: the Director (or whoever holds View at All) every team; a leader their own line.
    const wide = panelFor.id === me.id ? full : panelFor.role === "hod";
    const mine = new Set([panelFor.id, ...downlineOf(panelFor.id, data.people)]);
    // Viewing a leader's Team: only what THEIR session would read — their line's customers and visits — and their own
    // cells, as the database gives them when they sign in (user 2026-10-11: View as showed the whole company).
    const pdata: CrmData = panelFor.id === me.id || wide ? data : (() => {
      const shared = new Set(data.shares.filter(s => mine.has(s.staffId)).map(s => s.customerId));
      const customers = data.customers.filter(c => (c.assignedTo && mine.has(c.assignedTo)) || (c.teamId && mine.has(c.teamId)) || shared.has(c.id));
      const ids = new Set(customers.map(c => c.id));
      return { ...data, viewerId: panelFor.id, can: canFromRole(panelFor.role), customers, visits: data.visits.filter(v => ids.has(v.customerId)) };
    })();
    const teams = wide ? teamsOf(pdata) : teamsOf(pdata).filter(t => mine.has(t.id) || t.people.some(p => p.id === panelFor.id));
    const pctx: PanelCtx = {
      data: pdata, me: panelFor, now, live, ui: panelUi, set: setPanelUi, patch: p => setPanelUi(u => ({ ...u, ...p })), act: panelAct, nameOf, teams,
      directors: wide ? data.people.filter(p => p.role === "hod").sort((a, b) => a.name.localeCompare(b.name)) : [],
      teamOfStaff: id => { const tl = id ? teams.find(t => t.id === id || t.people.some(p => p.id === id)) : undefined; return tl; },
      openCrmOf,
      // Mine: one's own CRM — or, viewing somebody, back to theirs.
      // …and Mine comes back to the same page.
      toMyCrm: panelFor.id !== me.id ? () => { setTeamAs(null); setUi(u => ({ ...u, tab: MINE_TAB[panelUi.tab], chat: null, profSub: null })); }
        : sells ? () => { openCrmOf(me.id); setUi(u => ({ ...u, tab: MINE_TAB[panelUi.tab] })); } : undefined,
      exitApp: onExit, slotCounts,
    };
    // On a computer, whoever holds View at All (the Principal and the Director — user 2026-10-12) gets the desktop
    // Control panel: CRM Desktop rev 1, built to its prototype (2026-10-13), on the same data and writes.
    if (desk && full && panelFor.id === me.id && deskApp) {
      return (
        <DeskScreens data={data} me={me} now={now} live={live} act={panelAct} setData={setDataSafe} teams={teams} directors={pctx.directors}
          nameOf={nameOf} app={deskApp} exit={onExit} toMine={pctx.toMyCrm} problem={problem} />
      );
    }
    // Viewing somebody's Team: the same "Viewing X's CRM · Switch · Exit" banner their own CRM has (user 2026-10-11).
    // Switch stays on the Team side when the next person has one; Exit is back to one's own panel.
    const banner = panelFor.id !== me.id ? shellVM({
      ui, set: setUi, owner: panelFor, viewingOther: true, data,
      embedded: {
        rdMode: false, switchList,
        onSwitch: (id: string) => { const p = personOf(id, data.people); setViewing(id); setTeamAs(p && hasTeamSide(p) ? id : null); },
        exitAs: () => { setTeamAs(null); setViewing(null); },
      },
    } as unknown as SalesCtx) : null;
    return shell(<>
      {problem && <p className={H.problem}>{problem}</p>}
      {banner && <SalesShellBanners v={banner} />}
      <PanelScreens ctx={pctx} />
    </>, H.panel);
  }

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
      rdMode: full && sells,
      toPanel: () => { setHodMode("panel"); setViewing(null); },
      // Team | Mine (rev 1010 §7.3): the Director to the Control panel.
      // Viewing somebody who leads: their Team, as they see it (user 2026-10-11).
      // Team opens on the same page, team-wide (user 2026-10-11: from Inbox / Calendar / Contacts it landed on Insight).
      toTeam: owner.id !== me.id ? (hasTeamSide(owner) ? from => { setTeamAs(owner.id); setPanelUi({ ...initialPanelUi(), tab: TEAM_TAB[from] }); } : undefined)
        : (full && sells) || leads ? from => { setHodMode("panel"); setViewing(null); setPanelUi(u => ({ ...u, tab: TEAM_TAB[from], lead: null })); } : undefined,
      switchList,
      // Assign to somebody: assignment is CRM · Manage's.
      assignTo: data.can.manage ? (customerId, staffId) => panelAct.sendTo(customerId, staffId) : undefined,
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
