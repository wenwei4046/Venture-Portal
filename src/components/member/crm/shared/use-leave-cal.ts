"use client";
/** Calendar's and People's screen state (the prototype's this.state) and its 2.4 s toast (its flash()). */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { leaveCalStart, leaveCalVM, type LeaveCalIn, type LeaveCalUi, type LeaveCalVM } from "./leave-cal";
import { useBackCloses } from "./back";

const TOAST_MS = 2400;

/*
 * The Add leave sheet, asked for from outside the screen that holds it (v4 notes/18-A): Assignment's "+ Leave" sits in the
 * page's title row (generated), and the desktop's Up next opens "the Add leave sheet with the person set". The screen on
 * top that listens (the last mounted) opens its own sheet — Add leave on the first person they may edit, or the person
 * given (their leave as Edit leave when they have one).
 */
type Ask = { open(who: string | null): void; canAdd: boolean };
const stack: Ask[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
/** Open the leave sheet on the screen that holds one; false when none is mounted. */
export function openLeaveSheetFor(who: string | null = null): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.open(who);
  return true;
}
/** Whether a mounted screen can add a leave (anybody this viewer may edit) — + Leave shows only then. */
export function useLeaveSheetReady(): boolean {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => !!stack[stack.length - 1]?.canAdd, () => false);
}

export function useLeaveCal(mode: "calendar" | "people", input: Omit<LeaveCalIn, "mode" | "ui" | "set" | "flash">, o?: { listen?: boolean; /** The desktop opens its own window, not the phone's sheet. */ desk?: boolean }) {
  const [ui, setUi] = useState<LeaveCalUi>(() => leaveCalStart(input.now, mode));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const set = useCallback((p: Partial<LeaveCalUi> | ((u: LeaveCalUi) => Partial<LeaveCalUi>)) => setUi(u => ({ ...u, ...(typeof p === "function" ? p(u) : p) })), []);
  const flash = useCallback((t: string) => { clearTimeout(timer.current); set({ toast: t }); timer.current = setTimeout(() => set({ toast: null }), TOAST_MS); }, [set]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const v = leaveCalVM({ ...input, mode, ui, set, flash });
  const ref = useRef<LeaveCalVM>(v);
  useEffect(() => { ref.current = v; });
  const listen = o?.listen ?? true, desk = !!o?.desk;
  // notes/10 §1: on the phone the Add / Edit leave sheet and the person sheet each hold a Back step — Back closes them,
  // never the page under them (the desktop window closes on Esc and its own ×).
  useBackCloses(!desk && !!ui.modal, () => set({ modal: null }), "leaveModal");
  useBackCloses(!desk && !ui.modal && !!ui.panel, () => set({ panel: null }), "leavePanel");
  const ask = useRef<Ask | null>(null);
  useEffect(() => {
    if (!listen) return;
    const a: Ask = { open: who => (who ? ref.current.pOpenFor(who, !desk) : desk ? ref.current.addLeave() : ref.current.pAddLeave()), canAdd: ref.current.canAdd };
    ask.current = a; stack.push(a); emit();
    return () => { const k = stack.indexOf(a); if (k >= 0) stack.splice(k, 1); ask.current = null; emit(); };
  }, [listen, desk]);
  useEffect(() => { if (ask.current && ask.current.canAdd !== v.canAdd) { ask.current.canAdd = v.canAdd; emit(); } }, [v.canAdd]);
  return v;
}
