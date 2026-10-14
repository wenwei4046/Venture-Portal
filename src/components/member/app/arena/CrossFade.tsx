"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import s from "./arena.module.css";

/** How long the old figure takes to go and the new one to come (the refresh handoff: 160ms). */
export const CROSS_FADE_MS = 160;

/**
 * A figure that changes cross-fades (2026-10-14 — the "Revenue app refresh" handoff's motion: a period switch fades the
 * rank and the value, 160ms, never a count): the new one fades in where it stands while the old one fades out over it.
 * Both sit in one grid cell, so nothing around them moves; on its own it is the figure and nothing else. `k` is what
 * the figure says — the same words, nothing moves. `block` for a figure that is a line of its own (its ellipsis kept).
 */
export default function CrossFade({ k, block = false, children }: { k: string; block?: boolean; children: ReactNode }) {
  const last = useRef({ k, node: children });
  const [out, setOut] = useState<{ k: string; node: ReactNode } | null>(null);
  // Before the paint: the figure on screen a moment ago becomes the one going.
  useLayoutEffect(() => {
    if (last.current.k !== k) setOut(last.current);
    last.current = { k, node: children };
  });
  useEffect(() => {
    if (!out) return;
    const timer = setTimeout(() => setOut(null), CROSS_FADE_MS);
    return () => clearTimeout(timer);
  }, [out]);
  return (
    <span className={block ? s.xfBlock : s.xf}>
      <span key={k} className={out ? `${s.xfCell} ${s.xfIn}` : s.xfCell}>{children}</span>
      {out && <span key={`out:${out.k}`} className={`${s.xfCell} ${s.xfOut}`} aria-hidden="true">{out.node}</span>}
    </span>
  );
}
