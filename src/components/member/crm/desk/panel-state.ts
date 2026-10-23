"use client";
/**
 * A side panel's open / folded state, kept per browser (2026-10-23, redesign v2 › note 08: "Remember the state per user and
 * per panel (localStorage crm.panel.{name})"). Folded = the shared 44 px rail; the table or chat beside it takes the room.
 * A private window, or storage refused, keeps the default.
 */
import { useCallback, useEffect, useState } from "react";

export function usePanelOpen(name: string, dflt = true): [boolean, () => void] {
  const key = `crm.panel.${name}`;
  const [open, setOpen] = useState(dflt);
  useEffect(() => { try { const v = localStorage.getItem(key); if (v === "1" || v === "0") setOpen(v === "1"); } catch { /* storage refused */ } }, [key]);
  const toggle = useCallback(() => setOpen(o => { const n = !o; try { localStorage.setItem(key, n ? "1" : "0"); } catch { /* storage refused */ } return n; }), [key]);
  return [open, toggle];
}

/** The same, opened again whenever `when` changes to something (a customer picked in the table opens the panel even if it was folded). */
export function usePanelOpenOn(name: string, when: string | null, dflt = true): [boolean, () => void] {
  const [open, toggle] = usePanelOpen(name, dflt);
  useEffect(() => { if (when && !open) toggle(); }, [when]); // eslint-disable-line react-hooks/exhaustive-deps
  return [open, toggle];
}
