"use client";

import { useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

/** How long a section takes to open (the refresh handoff: a brand week's days, 200ms). */
export const REVEAL_MS = 200;

/**
 * A section that grows open from nothing as it appears — its height from 0 and its opacity from 0 together (2026-10-14,
 * the "Revenue app refresh" handoff: "days grid reveals (height auto, opacity 0→1) in 200ms"). Measured once it is in,
 * then animated to that height, so it works on a phone's Safari too; nothing moves for reduced motion. Closing is
 * instant: it is simply gone.
 */
export default function Reveal({ children, ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const full = el.getBoundingClientRect().height;
    el.style.overflow = "hidden";
    el.style.boxSizing = "border-box";
    const opening = el.animate([{ height: "0px", opacity: 0 }, { height: `${full}px`, opacity: 1 }],
      { duration: REVEAL_MS, easing: "cubic-bezier(.2,.8,.2,1)" });
    const done = () => { el.style.overflow = ""; el.style.boxSizing = ""; };
    opening.onfinish = done;
    opening.oncancel = done;
    return () => opening.cancel();
  }, []);
  return <div ref={ref} {...rest}>{children}</div>;
}
