"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The keyboard's numbers on the phone itself (the owner, 2026-10-15, an iPhone on iOS 26: the reply bar stays behind the
 * keyboard after three fixes that could not be tried on the phone). Typing `kbdebug` in the reply box turns it on or off
 * (kept on this phone); it shows what the browser reports — the window, visualViewport, the screen's and the bar's
 * edges — over the top of what is visible, so a screenshot says why. Shows nothing else; sends nothing.
 */
const KEY = "crm-kb-debug";
export const KB_DEBUG_WORD = "kbdebug";
export function toggleKbDebug() {
  try { localStorage.setItem(KEY, localStorage.getItem(KEY) ? "" : "1"); } catch { /* private mode */ }
  window.dispatchEvent(new Event(KEY));
}
const on = () => { try { return !!localStorage.getItem(KEY); } catch { return false; } };

export function KbDebug() {
  const [show, setShow] = useState(false);
  const [txt, setTxt] = useState("");
  const [top, setTop] = useState(0);
  useEffect(() => {
    const f = () => setShow(on());
    f();
    window.addEventListener(KEY, f);
    return () => window.removeEventListener(KEY, f);
  }, []);
  useEffect(() => {
    if (!show) return;
    let raf = 0;
    const r = (el: Element | null | undefined) => { if (!el) return "—"; const b = el.getBoundingClientRect(); return `${Math.round(b.top)}→${Math.round(b.bottom)}`; };
    const tick = () => {
      const vv = window.visualViewport, app = document.querySelector<HTMLElement>("[data-revenue-app]");
      const ae = document.activeElement as HTMLElement | null;
      const sa = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
      setTop(vv ? vv.offsetTop : 0);
      setTxt([
        `iOS ${/OS (\d+[_\d]*)/.exec(navigator.userAgent)?.[1] ?? "?"} · ${sa ? "app" : "browser"} · build ${(process.env.NEXT_PUBLIC_APP_VERSION || "?").slice(-7)}`,
        `inner ${window.innerWidth}×${window.innerHeight} · client ${document.documentElement.clientHeight} · screen ${screen.height}`,
        `vv h ${vv ? Math.round(vv.height) : "—"} top ${vv ? Math.round(vv.offsetTop) : "—"} scale ${vv ? vv.scale.toFixed(2) : "—"} · scrollY ${Math.round(window.scrollY)}`,
        `app ${r(app)} st ${app ? app.scrollTop : "—"} css ${app ? `${app.style.top || "-"}/${app.style.bottom || "-"}` : "—"}`,
        `main ${r(document.querySelector("[data-composer]")?.closest("main"))} st ${document.querySelector("[data-composer]")?.closest("main")?.scrollTop ?? "—"}`,
        `bar ${r(document.querySelector("[data-composer]"))} · box ${r(document.querySelector("textarea[data-draft]"))}`,
        `focus ${ae ? ae.tagName.toLowerCase() + (ae.dataset.draft ? "[draft]" : "") : "—"} · kb ${(() => { try { return localStorage.getItem("crm-kb-h") ?? "—"; } catch { return "—"; } })()}`,
      ].join("\n"));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show]);
  if (!show || typeof document === "undefined") return null;
  return createPortal(
    <pre style={{ position: "fixed", left: 6, right: 6, top: top + 96, zIndex: 2147483647, margin: 0, padding: "6px 8px", borderRadius: 8,
      background: "rgba(0,0,0,.78)", color: "#7CFC9A", font: "11px/1.35 ui-monospace, Menlo, monospace", whiteSpace: "pre-wrap", pointerEvents: "none" }}>{txt}</pre>,
    document.body,
  );
}
