"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ICON, Svg } from "../icons";
import { PULL_ARM, PULL_REST, pullDistance, pullStart } from "./pull-refresh";
import s from "../shell.module.css";

/**
 * Pull to refresh: drag the page down from its top and let go past the arming
 * point. A dot follows the finger out from under the header and spins while
 * the reads run; the page stays as it is until the new data lands. The touch
 * listeners live here, on the page's scroller, so following the finger
 * re-renders this dot and nothing else.
 */
export default function PullRefresh({ target, enabled, refreshing, failed, onRefresh }: {
  /** The page's scroller (`<main>`). */
  target: RefObject<HTMLElement | null>;
  /** False while a sheet is open or on demo data. */
  enabled: boolean;
  refreshing: boolean;
  /** The last pull could not read everything; the page kept what it had. */
  failed: boolean;
  onRefresh: () => void;
}) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ enabled, refreshing, onRefresh });
  latest.current = { enabled, refreshing, onRefresh };

  // Listening only while a pull is possible: a non-passive touchmove makes the browser wait for script before every
  // scroll of what is under it, so with pulls off (a sheet, the CRM) nothing listens (2026-10-14).
  useEffect(() => {
    const el = target.current;
    if (!el || !enabled) return;
    let mode: "idle" | "wait" | "pull" = "idle";
    let x0 = 0, y0 = 0, distance = 0;
    const start = (e: TouchEvent) => {
      const { enabled: on, refreshing: busy } = latest.current;
      mode = on && !busy && e.touches.length === 1 && el.scrollTop <= 0 ? "wait" : "idle";
      x0 = e.touches[0]?.clientX ?? 0; y0 = e.touches[0]?.clientY ?? 0; distance = 0;
    };
    const move = (e: TouchEvent) => {
      if (mode === "idle") return;
      const touch = e.touches[0];
      if (!touch) return;
      const dy = touch.clientY - y0;
      if (mode === "wait") {
        const next = el.scrollTop > 0 ? "none" : pullStart(dy, touch.clientX - x0);
        if (next === "none") { mode = "idle"; return; }
        if (next === "wait") return;
        mode = "pull";
        setDragging(true);
      }
      // The page is at its top and the finger is going down: the drag is ours, not the browser's.
      if (e.cancelable) e.preventDefault();
      distance = pullDistance(dy);
      setPull(distance);
    };
    const end = () => {
      if (mode === "pull") {
        setDragging(false);
        setPull(0);
        if (distance >= PULL_ARM && latest.current.enabled && !latest.current.refreshing) latest.current.onRefresh();
      }
      mode = "idle";
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [target, enabled]);

  const y = refreshing ? PULL_REST : pull;
  const cls = [s.ptrDot, dragging && s.ptrDrag, refreshing && s.ptrBusy, !refreshing && pull >= PULL_ARM && s.ptrArmed].filter(Boolean).join(" ");
  return (
    <div className={s.ptr}>
      <div className={s.ptrClip}>
        <div className={cls} aria-hidden="true"
          style={{ transform: `translate(-50%, ${y - 44}px)`, opacity: y > 0 ? Math.min(1, y / 40) : 0 }}>
          <Svg d={ICON.refresh} size={18} sw={2.2} style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
        </div>
        {failed && !refreshing && <p className={s.ptrNote} role="alert">{"Couldn't refresh. Pull down to try again."}</p>}
      </div>
      <span className={s.ptrStatus} role="status">{refreshing ? "Refreshing…" : ""}</span>
    </div>
  );
}
