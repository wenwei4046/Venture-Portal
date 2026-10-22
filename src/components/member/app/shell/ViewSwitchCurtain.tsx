"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import s from "./curtain.module.css";

/**
 * The switch to the CRM on a phone (2026-10-17 — the user: "when revenue app, press switch to crm, i want is have a
 * motion"; the Claude Design handoff "Revenue → CRM switch view motion", design 2c "Peach · Context",
 * `.design/revenue-app/design_handoff_revenue_crm_switch`, its `motion-reference.html` the source of truth for timing).
 * A peach curtain rises over the app, the word rolls from Revenue to CRM while three dots pulse, the CRM is put in under
 * it, and the curtain lifts off the top onto the CRM rising into place. It lifts only once the CRM has drawn (its kept
 * copy or its first read) — never onto an empty screen — or after HOLD_MAX at the latest. With reduced motion, or where
 * the browser cannot animate, the switch is at once.
 *
 * The way back (`back`, the same day — the user: "也做一个反方向的幕布") is its mirror image on the same timings: the
 * curtain comes down from the top, CRM rolls down and out as Revenue comes down in, and it leaves through the bottom onto
 * the Revenue app settling into place from above. Its press is the CRM's house's (`press`): the CRM draws that button,
 * so the ripple is laid over it rather than inside it.
 */

/** The system's single curve (the handoff: every tween but the button's press and the dots). */
export const EASE = "cubic-bezier(.2,.8,.2,1)";

/** The handoff's sequence in ms from the tap (its README › Sequence, rebased to the tap). */
export const AT = {
  /** The panel comes in (up from below; the way back: down from above), its leading corners 40px → 0; the screen under it steps back 1 → .96. */
  cover: 400, coverFor: 550,
  /** "Now opening" and the dots fade in. */
  textIn: 750, textInFor: 250,
  /** The other side goes in under the curtain; the screen is full size again. */
  swap: 950,
  /** The old word rolls out and the new one in (up; the way back: down). */
  roll: 1150, rollFor: 400,
  /** "Now opening" and the dots fade out (the word stays) — where the curtain holds until the CRM has drawn. */
  textOut: 1700, textOutFor: 200,
  /** The panel leaves (off the top; the way back: off the bottom), its trailing corners 0 → 40px. */
  uncover: 1850, uncoverFor: 500,
  /** The new screen moves 36px into place (up; the way back: down). */
  screenIn: 1900, screenInFor: 550,
} as const;

/** The longest the curtain holds for a CRM that has not drawn; then it lifts onto whatever is there. */
export const HOLD_MAX = 6000;

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The switch's tap (the handoff's chip press): a small squeeze on the button, 1 → .96 → 1 in 250ms, and a ripple from
 * its middle, .2 → 1.6 while it fades from .3, in 450ms — while the curtain gets ready to come in.
 */
export function pressFeedback(button: HTMLElement, ripple: HTMLElement | null) {
  if (typeof button.animate !== "function" || reducedMotion()) return;
  button.animate([{ transform: "scale(1)" }, { transform: "scale(.96)" }, { transform: "scale(1)" }], { duration: 250, easing: "linear" });
  ripple?.animate([{ transform: "scale(.2)", opacity: .3 }, { transform: "scale(1.6)", opacity: 0 }], { duration: 450, easing: EASE });
}

export function ViewSwitchCurtain({ from, to, back = false, ready, screen, press = null, onSwap, onDone }: {
  from: string;
  to: string;
  /** The way back: the mirror image — in from the top, out through the bottom. */
  back?: boolean;
  /** The other side has drawn: the curtain may lift. */
  ready: boolean;
  /** The app's screen: it steps back as the curtain comes in, and the other side moves into place in it as it leaves. */
  screen: RefObject<HTMLElement | null>;
  /** The button pressed, when the app does not draw it (the CRM's house): its squeeze, and the ripple laid over it. */
  press?: HTMLElement | null;
  /** Put the other side in, under the curtain. */
  onSwap: () => void;
  /** The curtain has gone: take it away. */
  onDone: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLSpanElement>(null);
  const dots = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const next = useRef<HTMLSpanElement>(null);
  const ripple = useRef<HTMLSpanElement>(null);
  // Where the pressed button stood at the tap: the ripple is laid over it there.
  const [pressAt] = useState(() => press?.getBoundingClientRect() ?? null);
  const calls = useRef({ onSwap, onDone });
  calls.current = { onSwap, onDone };
  const readyNow = useRef(ready);
  readyNow.current = ready;
  // The lift, while the curtain holds for the CRM.
  const release = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (ready) release.current?.();
  }, [ready]);

  useEffect(() => {
    if (press) pressFeedback(press, ripple.current);
    const p = panel.current;
    if (!p || typeof p.animate !== "function" || reducedMotion()) {
      calls.current.onSwap();
      calls.current.onDone();
      return;
    }
    // Up from below and off the top; the way back mirrors every distance and corner.
    const y = (pct: number) => `translateY(${back ? -pct : pct}%)`;
    const leading = back ? "0 0 40px 40px" : "40px 40px 0 0";
    const trailing = back ? "40px 40px 0 0" : "0 0 40px 40px";
    const anims: Animation[] = [];
    const timers: number[] = [];
    const after = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
    const tween = (delay: number, duration: number): KeyframeAnimationOptions => ({ delay, duration, easing: EASE, fill: "both" });
    const fades = [caption.current, dots.current].filter((el): el is HTMLSpanElement | HTMLDivElement => !!el);

    anims.push(p.animate([{ transform: y(100), borderRadius: leading }, { transform: "translateY(0)", borderRadius: "0" }], tween(AT.cover, AT.coverFor)));
    // The screen steps back from a point above its middle (the handoff's origin, 50% 40%) — below it on the way back.
    if (screen.current) screen.current.style.transformOrigin = back ? "50% 60%" : "50% 40%";
    const stepBack = screen.current?.animate([{ transform: "scale(1)" }, { transform: "scale(.96)" }], tween(AT.cover, AT.coverFor));
    if (stepBack) anims.push(stepBack);
    for (const el of fades) anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], tween(AT.textIn, AT.textInFor)));
    if (word.current) anims.push(word.current.animate([{ transform: "translateY(0)" }, { transform: y(-100) }], tween(AT.roll, AT.rollFor)));
    if (next.current) anims.push(next.current.animate([{ transform: y(100) }, { transform: "translateY(0)" }], tween(AT.roll, AT.rollFor)));

    after(AT.swap, () => {
      // The other side takes the screen's place at full size, under the curtain.
      stepBack?.cancel();
      if (screen.current) screen.current.style.transformOrigin = "";
      calls.current.onSwap();
    });

    let lifted = false;
    const lift = () => {
      if (lifted) return;
      lifted = true;
      release.current = null;
      for (const el of fades) anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: AT.textOutFor, easing: EASE, fill: "forwards" }));
      after(AT.uncover - AT.textOut, () => {
        const off = p.animate([{ transform: "translateY(0)", borderRadius: "0" }, { transform: y(-100), borderRadius: trailing }], { duration: AT.uncoverFor, easing: EASE, fill: "forwards" });
        anims.push(off);
        // The new screen's move runs on past the curtain (it ends 100ms later): it is the screen's, so it is never cut short.
        screen.current?.animate([{ transform: `translateY(${back ? -36 : 36}px)` }, { transform: "translateY(0)" }], { delay: AT.screenIn - AT.uncover, duration: AT.screenInFor, easing: EASE, fill: "backwards" });
        off.finished.then(() => calls.current.onDone(), () => undefined);
      });
    };
    after(AT.textOut, () => {
      if (readyNow.current) return lift();
      release.current = lift;
      after(HOLD_MAX, lift);
    });

    return () => {
      timers.forEach(t => window.clearTimeout(t));
      anims.forEach(a => a.cancel());
      release.current = null;
      if (screen.current) screen.current.style.transformOrigin = "";
    };
    // The curtain runs once, from the tap that put it up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {pressAt && (
        <span className={s.press} style={{ left: pressAt.left, top: pressAt.top, width: pressAt.width, height: pressAt.height }} aria-hidden="true">
          <span ref={ripple} className={s.pressRipple} />
        </span>
      )}
      <div ref={panel} className={`${s.curtain} ${back ? s.back : ""}`} role="status" aria-live="polite" aria-label={`Opening ${to}`}>
        <span ref={caption} className={s.caption}>Now opening</span>
        <div className={s.roll} aria-hidden="true">
          <span ref={word} className={s.word}>{from}</span>
          <span ref={next} className={`${s.word} ${s.wordNext}`}>{to}</span>
        </div>
        <div ref={dots} className={s.dots} aria-hidden="true">
          <span className={s.dot} />
          <span className={s.dot} />
          <span className={s.dot} />
        </div>
      </div>
    </>
  );
}
