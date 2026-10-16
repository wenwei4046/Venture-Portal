// Reference implementation of the Revenue → CRM "Peach · Context" curtain (design 2c).
// Timings, easing, colours and copy are final. Adapt to the codebase's patterns.
import React, { useEffect, useRef } from 'react';

export const EASE = 'cubic-bezier(.2,.8,.2,1)';

export const CURTAIN = {
  bg: '#FFF0E4',          // --rv-peach
  edge: 'inset 0 0 0 1px rgba(255,255,255,.25)', // --rv-hero-edge
  word: '#BD4A19',        // --rv-accent
  caption: '#806B60',     // --rv-sub
  dot: '#BD4A19',
  copy: { caption: 'Now opening', from: 'Revenue', to: 'CRM', foot: '24 open leads · 6 to follow up today' },
};

// All times in ms from the moment the curtain starts (tap = -900ms in the prototype, chip ripple runs before).
export const T = {
  coverIn: { start: 0, dur: 550 },    // panel slides up 100% → 0, top radius 40 → 0
  swapAt: 550,                        // mount CRM underneath, hide Revenue
  textIn: { start: 350, dur: 250 },   // caption + dots + foot fade in
  roll: { start: 750, dur: 400 },     // "Revenue" up -100%, "CRM" in from +100%
  textOut: { start: 1300, dur: 200 }, // caption + dots + foot fade out (words stay)
  uncover: { start: 1450, dur: 500 }, // panel slides 0 → -100%, bottom radius 0 → 40
  crmIn: { start: 1500, dur: 550 },   // CRM screen translateY 36px → 0
};

type Props = {
  onSwap: () => void;   // switch the route/view to CRM while covered
  onDone: () => void;   // unmount the curtain
  crmScreenRef?: React.RefObject<HTMLElement>;
  foot?: string;        // live summary line, e.g. "24 open leads · 6 to follow up today"
};

export function ViewSwitchCurtain({ onSwap, onDone, crmScreenRef, foot = CURTAIN.copy.foot }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const w1 = useRef<HTMLSpanElement>(null);
  const w2 = useRef<HTMLSpanElement>(null);
  const fades = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { onSwap(); onDone(); return; }
    const o = (start: number, dur: number) => ({ delay: start, duration: dur, easing: EASE, fill: 'both' as FillMode });
    const anims: Animation[] = [];
    const p = panel.current!;
    anims.push(p.animate(
      [{ transform: 'translateY(100%)', borderRadius: '40px 40px 0 0' }, { transform: 'translateY(0)', borderRadius: '0' }],
      o(T.coverIn.start, T.coverIn.dur)));
    fades.current.forEach(el => {
      anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], o(T.textIn.start, T.textIn.dur)));
    });
    anims.push(w1.current!.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], o(T.roll.start, T.roll.dur)));
    anims.push(w2.current!.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], o(T.roll.start, T.roll.dur)));
    const swap = window.setTimeout(onSwap, T.swapAt);
    const out = window.setTimeout(() => {
      fades.current.forEach(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T.textOut.dur, easing: EASE, fill: 'forwards' }));
    }, T.textOut.start);
    const un = window.setTimeout(() => {
      p.animate([{ transform: 'translateY(0)', borderRadius: '0' }, { transform: 'translateY(-100%)', borderRadius: '0 0 40px 40px' }],
        { duration: T.uncover.dur, easing: EASE, fill: 'forwards' }).finished.then(onDone);
    }, T.uncover.start);
    const crm = window.setTimeout(() => {
      crmScreenRef?.current?.animate([{ transform: 'translateY(36px)' }, { transform: 'translateY(0)' }], { duration: T.crmIn.dur, easing: EASE });
    }, T.crmIn.start);
    return () => { anims.forEach(a => a.cancel()); [swap, out, un, crm].forEach(clearTimeout); };
  }, []);

  const fade = (el: HTMLElement | null) => { if (el && !fades.current.includes(el)) fades.current.push(el); };

  return (
    <div ref={panel} role="status" aria-live="polite" aria-label="Opening CRM"
      style={{ position: 'absolute', inset: 0, zIndex: 50, overflow: 'hidden', background: CURTAIN.bg, boxShadow: CURTAIN.edge,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, pointerEvents: 'auto' }}>
      <span ref={fade} style={{ opacity: 0, fontFamily: 'Inter, sans-serif', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: CURTAIN.caption }}>
        {CURTAIN.copy.caption}
      </span>
      <div style={{ position: 'relative', height: 56, width: 260, overflow: 'hidden', textAlign: 'center', color: CURTAIN.word,
        fontFamily: '"Inter Tight", Inter, sans-serif', fontSize: 46, lineHeight: '56px', fontWeight: 800, letterSpacing: '-.04em' }}>
        <span ref={w1} style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>{CURTAIN.copy.from}</span>
        <span ref={w2} style={{ position: 'absolute', left: 0, right: 0, top: 0, transform: 'translateY(100%)' }}>{CURTAIN.copy.to}</span>
      </div>
      <div ref={fade} style={{ opacity: 0, display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: CURTAIN.dot,
            animation: `rvDot 1005ms linear ${i * 176}ms infinite` }} />
        ))}
      </div>
      <span ref={fade} style={{ opacity: 0, position: 'absolute', left: 0, right: 0, bottom: 64, textAlign: 'center',
        fontFamily: 'Inter, sans-serif', fontSize: 13, color: CURTAIN.caption }}>{foot}</span>
    </div>
  );
}

/* Add once to global CSS (dot pulse = .3 → 1 → .3 opacity, sine, period ≈ 1005ms, each dot offset 176ms):
@keyframes rvDot { 0%,100% { opacity: .3 } 50% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { [style*="rvDot"] { animation: none !important; } }
*/
