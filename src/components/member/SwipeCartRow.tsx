"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import s from "./SwipeCartRow.module.css";

const REVEAL_WIDTH = 80;
const INTENT_DISTANCE = 10;
const INTERACTIVE =
  'button, input, select, textarea, a, [role="button"], [contenteditable="true"], [data-no-swipe]';

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: number;
  offset: number;
  intent: "pending" | "horizontal" | "vertical";
};

type SwipeCartRowProps = {
  id: string;
  label: string;
  children: ReactNode;
  onDelete: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** A swipe only reveals the action; removing an item always takes a click. */
export default function SwipeCartRow({
  id,
  label,
  children,
  onDelete,
  open,
  onOpenChange,
}: SwipeCartRowProps) {
  const gesture = useRef<Gesture | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const suppressClickUntil = useRef(0);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const offset = dragOffset ?? (open ? -REVEAL_WIDTH : 0);
  const revealing = offset < 0;

  useEffect(() => {
    gesture.current = null;
    setDragOffset(null);
    if (!open && document.activeElement === deleteRef.current) {
      moreRef.current?.focus();
    }
  }, [open]);

  function releasePointer(target: HTMLDivElement, pointerId: number) {
    if (target.hasPointerCapture?.(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
  }

  function beginGesture(event: ReactPointerEvent<HTMLDivElement>) {
    suppressClickUntil.current = 0;
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      (event.target instanceof Element && event.target.closest(INTERACTIVE))
    ) {
      return;
    }
    const startOffset = open ? -REVEAL_WIDTH : 0;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset,
      offset: startOffset,
      intent: "pending",
    };
  }

  function moveGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;

    if (current.intent === "pending") {
      if (Math.abs(dy) >= INTENT_DISTANCE && Math.abs(dy) >= Math.abs(dx)) {
        current.intent = "vertical";
      } else if (
        Math.abs(dx) >= INTENT_DISTANCE &&
        Math.abs(dx) > Math.abs(dy) * 1.2
      ) {
        current.intent = "horizontal";
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    }
    if (current.intent !== "horizontal") return;

    event.preventDefault();
    current.offset = Math.max(
      -REVEAL_WIDTH,
      Math.min(0, current.startOffset + dx),
    );
    setDragOffset(current.offset);
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (current.intent === "horizontal") {
      suppressClickUntil.current = Date.now() + 250;
      onOpenChange(current.offset <= -REVEAL_WIDTH / 2);
    }
    setDragOffset(null);
    releasePointer(event.currentTarget, event.pointerId);
  }

  function cancelGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return;
    if (gesture.current.intent === "horizontal") {
      suppressClickUntil.current = Date.now() + 250;
    }
    gesture.current = null;
    setDragOffset(null);
    releasePointer(event.currentTarget, event.pointerId);
  }

  return (
    <div
      className={s.row}
      role="group"
      aria-label={label}
      data-cart-row={id}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          onOpenChange(false);
          moreRef.current?.focus();
        }
      }}
    >
      <div
        className={`${s.front} ${dragOffset !== null ? s.dragging : ""}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={beginGesture}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
        onDragStart={(event) => event.preventDefault()}
        onPointerLeave={(event) => {
          if (gesture.current?.intent !== "horizontal") cancelGesture(event);
        }}
        onClickCapture={(event) => {
          if (Date.now() < suppressClickUntil.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div className={s.content}>{children}</div>
        <button
          ref={moreRef}
          type="button"
          className={s.more}
          aria-label={`Actions for ${label}`}
          aria-expanded={open}
          aria-controls={`cart-delete-${id}`}
          title="Item actions"
          onClick={() => onOpenChange(!open)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="5" r="1.7" fill="currentColor" />
            <circle cx="12" cy="12" r="1.7" fill="currentColor" />
            <circle cx="12" cy="19" r="1.7" fill="currentColor" />
          </svg>
        </button>
      </div>
      <button
        id={`cart-delete-${id}`}
        ref={deleteRef}
        type="button"
        className={s.delete}
        style={{ visibility: revealing || open ? "visible" : "hidden" }}
        aria-label={`Delete ${label}`}
        aria-hidden={!open}
        disabled={!open}
        tabIndex={open ? 0 : -1}
        onClick={onDelete}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
        </svg>
        <span>Delete</span>
      </button>
    </div>
  );
}
