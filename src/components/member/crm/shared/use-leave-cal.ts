"use client";
/** Calendar's and People's screen state (the prototype's this.state) and its 2.4 s toast (its flash()). */
import { useCallback, useEffect, useRef, useState } from "react";
import { leaveCalStart, leaveCalVM, type LeaveCalIn, type LeaveCalUi } from "./leave-cal";

const TOAST_MS = 2400;

export function useLeaveCal(mode: "calendar" | "people", input: Omit<LeaveCalIn, "mode" | "ui" | "set" | "flash">) {
  const [ui, setUi] = useState<LeaveCalUi>(() => leaveCalStart(input.now, mode));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const set = useCallback((p: Partial<LeaveCalUi> | ((u: LeaveCalUi) => Partial<LeaveCalUi>)) => setUi(u => ({ ...u, ...(typeof p === "function" ? p(u) : p) })), []);
  const flash = useCallback((t: string) => { clearTimeout(timer.current); set({ toast: t }); timer.current = setTimeout(() => set({ toast: null }), TOAST_MS); }, [set]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return leaveCalVM({ ...input, mode, ui, set, flash });
}
