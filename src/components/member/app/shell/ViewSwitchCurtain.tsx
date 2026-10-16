"use client";

import { useEffect, useRef, type RefObject } from "react";
import s from "./curtain.module.css";

/**
 * The switch to the CRM on a phone (2026-10-17 — the user: "when revenue app, press switch to crm, i want is have a
 * motion"; the Claude Design handoff "Revenue → CRM switch view motion", design 2c "Peach · Context",
 * `.design/revenue-app/design_handoff_revenue_crm_switch`, its `motion-reference.html` the source of truth for timing).
 * A peach curtain rises over the app, the word rolls from Revenue to CRM while three dots pulse, the CRM is put in under
 * it, and the curtain lifts off the top onto the CRM rising into place. It lifts only once the CRM has drawn (its kept
 * copy or its first read) — never onto an empty screen — or after HOLD_MAX at the latest. With reduced motion, or where
 * the browser cannot animate, the switch is at once.
 */

/** The system's single curve (the handoff: every tween but the button's press and the dots). */
export const EASE = "cubic-bezier(.2,.8,.2,1)";

/** The handoff's sequence in ms from the tap (its README › Sequence, rebased to the tap). */
export const AT = {
  /** The panel rises 100% → 0, its top corners 40px → 0; the app's screen steps back 1 → .96 under it. */
  cover: 400, coverFor: 550,
  /** "Now opening" and the dots fade in. */
  textIn: 750, textInFor: 250,
  /** The CRM goes in under the curtain; the screen is full size again. */
  swap: 950,
  /** "Revenue" rolls up and out, "CRM" up and in. */
  roll: 1150, rollFor: 400,
  /** "Now opening" and the dots fade out (the word stays) — where the curtain holds until the CRM has drawn. */
  textOut: 1700, textOutFor: 200,
  /** The panel lifts 0 → −100%, its bottom corners 0 → 40px. */
  uncover: 1850, uncoverFor: 500,
  /** The CRM rises 36px → 0. */
  screenIn: 1900, screenInFor: 550,
} as const;

/** The longest the curtain holds for a CRM that has not drawn; then it lifts onto whatever is there. */
export const HOLD_MAX = 6000;

export function ViewSwitchCurtain({ from, to, ready, screen, onSwap, onDone }: {
  from: string;
  to: string;
  /** The CRM has drawn: the curtain may lift. */
  ready: boolean;
  /** The app's screen: it steps back as the curtain rises, and the CRM rises in it as the curtain lifts. */
  screen: RefObject<HTMLElement | null>;
  /** Put the CRM in, under the curtain. */
  onSwap: () => void;
  /** The curtain has lifted: take it away. */
  onDone: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLSpanElement>(null);
  const dots = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const next = useRef<HTMLSpanElement>(null);
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
    const p = panel.current;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!p || typeof p.animate !== "function" || reduce) {
      calls.current.onSwap();
      calls.current.onDone();
      return;
    }
    const anims: Animation[] = [];
    const timers: number[] = [];
    const after = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
    const tween = (delay: number, duration: number): KeyframeAnimationOptions => ({ delay, duration, easing: EASE, fill: "both" });
    const fades = [caption.current, dots.current].filter((el): el is HTMLSpanElement | HTMLDivElement => !!el);

    anims.push(p.animate([{ transform: "translateY(100%)", borderRadius: "40px 40px 0 0" }, { transform: "translateY(0)", borderRadius: "0" }], tween(AT.cover, AT.coverFor)));
    // The screen steps back from a point above its middle (the handoff's origin, 50% 40%).
    if (screen.current) screen.current.style.transformOrigin = "50% 40%";
    const stepBack = screen.current?.animate([{ transform: "scale(1)" }, { transform: "scale(.96)" }], tween(AT.cover, AT.coverFor));
    if (stepBack) anims.push(stepBack);
    for (const el of fades) anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], tween(AT.textIn, AT.textInFor)));
    if (word.current) anims.push(word.current.animate([{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }], tween(AT.roll, AT.rollFor)));
    if (next.current) anims.push(next.current.animate([{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], tween(AT.roll, AT.rollFor)));

    after(AT.swap, () => {
      // The CRM takes the screen's place at full size, under the curtain.
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
        const up = p.animate([{ transform: "translateY(0)", borderRadius: "0" }, { transform: "translateY(-100%)", borderRadius: "0 0 40px 40px" }], { duration: AT.uncoverFor, easing: EASE, fill: "forwards" });
        anims.push(up);
        // The CRM's rise runs on past the curtain (it ends 100ms later): it is the screen's, so it is never cut short.
        screen.current?.animate([{ transform: "translateY(36px)" }, { transform: "translateY(0)" }], { delay: AT.screenIn - AT.uncover, duration: AT.screenInFor, easing: EASE, fill: "backwards" });
        up.finished.then(() => calls.current.onDone(), () => undefined);
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
    <div ref={panel} className={s.curtain} role="status" aria-live="polite" aria-label={`Opening ${to}`}>
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
  );
}
