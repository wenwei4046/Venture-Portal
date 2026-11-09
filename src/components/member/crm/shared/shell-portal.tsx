"use client";
/**
 * A phone sheet drawn in the CRM's shell — its `[data-revenue-app]` root, which is fixed to the screen — so it stands
 * ABOVE the bottom tab bar and every page's own layers (v4 notes/18-A: the Add leave sheet drew under the tab bar, hiding
 * To and its buttons). Inside the shell, the CRM's type scale, fonts and tokens still apply. Outside any CRM (a test), the
 * page's body.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function InShell({ children }: { children: ReactNode }) {
  const probe = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  useLayoutEffect(() => { setHost(probe.current?.closest("[data-revenue-app]") ?? document.body); }, []);
  return (<>
    <span ref={probe} hidden />
    {host && createPortal(children, host)}
  </>);
}
