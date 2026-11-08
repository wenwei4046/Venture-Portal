"use client";
/**
 * Up next's state and writes, for the desktop and the phone. Live: the read is crm_up_next, again every 15 s while on
 * screen and after every action (each action saves first, the screen changes only on yes). Preview: UpNextDemo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { crmWrite, fetchUpNext } from "@/app/(member)/member/crm-actions";
import { DEMO_ADS, UpNextDemo, demoBook } from "./up-next-demo";
import { fmtRange, leaveFormVM, upNextFrame, type LeaveEdit, type UpNextAd, type UpNextActs, type UpNextBook, type UpNextRead, type UpNextUi } from "./up-next";

const TOAST_MS = 2600;
const POLL_MS = 15_000;
const iso = (s: string) => `${s}:00+08:00`;

export function useUpNext(o: { live: boolean; book: UpNextBook; ads: UpNextAd[]; canAct: boolean; line: string | null }) {
  const demo = useRef<UpNextDemo | null>(null);
  if (!o.live && !demo.current) demo.current = new UpNextDemo();
  const book = o.live ? o.book : demoBook;
  const ads = useMemo(() => (o.live ? o.ads : DEMO_ADS.map(({ id, name, sub }) => ({ id, name, sub }))), [o.live, o.ads]);
  const [ui, setUi] = useState<UpNextUi>({ ad: "all", adOpen: false, tip: false, pick: false, more: false, why: false, hov: null, sheet: null, ltab: "in" });
  const set = useCallback((p: Partial<UpNextUi>) => setUi(u => ({ ...u, ...p })), []);
  const [read, setRead] = useState<UpNextRead | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [edit, setEdit] = useState<LeaveEdit | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback((t: string) => { clearTimeout(timer.current); setToast(t); timer.current = setTimeout(() => setToast(null), TOAST_MS); }, []);

  const adRef = useRef(ui.ad); adRef.current = ui.ad;
  const seq = useRef(0);
  // The ads taking leads now go round on All ads (the read's p_ads), each dealt by its own split.
  const allIds = useMemo(() => ads.filter(a => a.id !== "all").map(a => a.id), [ads]);
  const load = useCallback(async (ad: string): Promise<UpNextRead | null> => {
    if (demo.current) { const r = demo.current.read(ad); setRead(r); return r; }
    const n = ++seq.current;
    const got = await fetchUpNext({ ad, ads: ad === "all" ? allIds : null, line: o.line });
    if (n !== seq.current || ad !== adRef.current) return null;
    if (!got.ok) { setFailed(got.error); return null; }
    setFailed(null); setRead(got.read);
    return got.read;
  }, [allIds, o.line]);

  useEffect(() => {
    void load(ui.ad);
    if (demo.current) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(adRef.current); }, POLL_MS);
    return () => clearInterval(t);
  }, [load, ui.ad]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const write = useCallback(async (name: Parameters<typeof crmWrite>[0], args: Record<string, unknown>) => {
    const r = await crmWrite(name, args);
    if (!r.ok) flash(r.error);
    return r.ok;
  }, [flash]);
  const shut = { pick: false, sheet: null, hov: null } as const;
  const nameOf = book.nameOf;
  const teamWord = (id: string) => { const p = read?.people.find(x => x.staff === id); return p ? book.teamOf(p.team).name : ""; };

  const acts: UpNextActs = {
    set,
    // The dropdown only changes what is looked at (the owner, 2026-11-08: the rules are Assignment's; Up next shows who is
    // next). A pin or skip set stays until a lead uses it or Undo.
    pickAd: id => set({ ad: id, adOpen: false, pick: false, sheet: null }),
    skip: async id => {
      if (demo.current) demo.current.skip(id); else if (!(await write("crm_up_next_skip", { p_ad: ui.ad, p_staff: id }))) return;
      set(shut);
      const r = await load(ui.ad);
      flash(`${nameOf(id)} skipped · next lead goes to ${r?.queue[0] ? nameOf(r.queue[0].staff) : "—"}`);
    },
    pause: async id => {
      if (demo.current) demo.current.pause(id); else if (!(await write("crm_up_next_pause", { p_staff: id, p_on: true }))) return;
      set(shut); await load(ui.ad);
      flash(`${nameOf(id)} paused · resume from Not in turn`);
    },
    resume: async id => {
      if (demo.current) demo.current.resume(id); else if (!(await write("crm_up_next_pause", { p_staff: id, p_on: false }))) return;
      const team = teamWord(id);
      await load(ui.ad);
      flash(`${nameOf(id)} is back in ${team}'s turn`);
    },
    give: async id => {
      if (demo.current) demo.current.give(id); else if (!(await write("crm_up_next_give", { p_ad: ui.ad, p_staff: id }))) return;
      set(shut); await load(ui.ad);
      flash(`Next ad lead goes to ${nameOf(id)}`);
    },
    unpin: async () => {
      if (demo.current) demo.current.undo(); else if (!(await write("crm_up_next_undo", { p_ad: ui.ad }))) return;
      await load(ui.ad);
      flash("Back to the split as set in Assignment");
    },
    openLeave: id => {
      const now = read?.people.find(p => p.staff === id)?.leave ?? read?.upcoming.find(u => u.staff === id) ?? null;
      const today = (read?.now ?? "").slice(0, 10);
      setEdit({ id, leaveId: now?.id ?? null, from: now?.from ?? `${today}T09:00`, to: now?.to ?? `${today}T18:00`, reason: now?.reason ?? "Annual", note: now?.note ?? "" });
      set(shut);
    },
    endLeave: async (id, leaveId) => {
      if (demo.current) demo.current.endLeave(id); else if (!(await write("crm_up_next_end_leave", { p_id: leaveId }))) return;
      await load(ui.ad);
      flash(`${nameOf(id)} is back in today's turn`);
    },
    cancelLeave: async (id, leaveId) => {
      if (demo.current) demo.current.endLeave(id); else if (!(await write("crm_up_next_end_leave", { p_id: leaveId }))) return;
      await load(ui.ad);
      flash(`${nameOf(id)}'s leave cancelled`);
    },
  };

  const saveLeave = async () => {
    if (!edit || edit.to < edit.from) return;
    if (edit.reason === "Other" && !edit.note.trim()) { flash("Write the reason"); return; }
    if (demo.current) demo.current.saveLeave(edit.id, edit.from, edit.to, edit.reason, edit.note);
    else if (!(await write("crm_up_next_save_leave", { p_id: edit.leaveId, p_staff: edit.id, p_from: iso(edit.from), p_to: iso(edit.to), p_reason: edit.reason, p_note: edit.note }))) return;
    const e = edit;
    setEdit(null); await load(ui.ad);
    flash(`${nameOf(e.id)} on leave ${fmtRange(e.from, e.to)}`);
  };

  const d = read ? upNextFrame(read, book, ads, ui, acts, o.canAct) : null;
  const lv = edit ? leaveFormVM(edit, nameOf(edit.id), p => setEdit(e => (e ? { ...e, ...p } : e)), () => void saveLeave(), () => setEdit(null)) : null;
  return { d, lv, toast, failed, close: () => set({ pick: false, adOpen: false }) };
}
