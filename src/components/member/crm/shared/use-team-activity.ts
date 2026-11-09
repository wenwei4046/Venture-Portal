"use client";
/**
 * Team activity's state (the prototype's this.state), its read of who was given which customer since the period began
 * (fetchCrmAssignedSince — again when the period's start moves, and with the CRM's own 5 s re-read of everything else),
 * and the clock beside the title, which moves every minute (the design's setInterval).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCrmAssignedSince } from "@/app/(member)/member/crm-actions";
import type { CrmData } from "@/lib/member/crm-data";
import { officeStamp } from "./leave-cal-data";
import type { PeopleBook } from "./people-book";
import { activityVM, periodDays, periodStartIso, type ActivityUi, type AssignedRow } from "./team-activity";

/**
 * The page's filters, kept while the CRM is open (the owner, 2026-11-09: "我点了 team activity，也做了一些筛选条件，等我看完
 * 聊天记录返回时，要一样的筛选条件 不要重新来过"): a chat replaces the page, which is drawn again on the way back — with the
 * person or team, period, dates, ad, sort and open rows it had. Menus and the lead drawer start shut.
 */
let KEPT: ActivityUi | null = null;
/** Tests start fresh. */
export const forgetActivityFilters = () => { KEPT = null; };

export function useTeamActivity(o: { data: CrmData; book: PeopleBook; live: boolean; who: string | null; nameOf(id: string | null | undefined): string; roleOf(id: string): string; openChat(id: string): void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const today = officeStamp(now).slice(0, 10);
  const [ui, setUi] = useState<ActivityUi>(() => KEPT && !o.who ? { ...KEPT, menu: false, pMenu: false, lead: null, pLead: null }
    : ({ team: "all", who: o.who, menu: false, per: "Today", from: `${today.slice(0, 7)}-01`, to: today,
      open: o.who ? { [o.who]: true } : {}, lead: null, sort: null, pMenu: false, pOpen: {}, pLead: null }));
  useEffect(() => { KEPT = ui; }, [ui]);
  // Opened again on another person (Inbox's name): the page follows.
  const lastWho = useRef(o.who);
  useEffect(() => { if (o.who !== lastWho.current) { lastWho.current = o.who; setUi(u => ({ ...u, team: "all", who: o.who, open: o.who ? { ...u.open, [o.who]: true } : u.open })); } }, [o.who]);
  const set = useCallback((p: Partial<ActivityUi> | ((u: ActivityUi) => Partial<ActivityUi>)) => setUi(u => ({ ...u, ...(typeof p === "function" ? p(u) : p) })), []);
  const start = periodDays(ui, today).a;
  const [rows, setRows] = useState<{ start: string; rows: AssignedRow[] } | null>(null);
  const seq = useRef(0);
  const stamp = o.data.events.length + ":" + o.data.customers.length;
  useEffect(() => {
    if (!o.live) { setRows({ start, rows: [] }); return; }
    const n = ++seq.current;
    void fetchCrmAssignedSince(periodStartIso(start)).then(r => { if (n === seq.current && r.ok) setRows({ start, rows: r.rows }); });
  }, [start, o.live, stamp]);
  return activityVM({ data: o.data, book: o.book, rows: rows && rows.start <= start ? rows.rows : null, now, ui, set, nameOf: o.nameOf, roleOf: o.roleOf, openChat: o.openChat });
}
