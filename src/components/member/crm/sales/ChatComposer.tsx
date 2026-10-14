"use client";

/**
 * The chat's composer on a real phone (the chat composer handoff, 2026-10-14 — docs/design/chat-composer): SalesComposer
 * draws the prototype; this gives it what only a phone has.
 *
 * - **The keyboard is the phone's own.** The Sticker and Attach panels take its place at its height — the last height
 *   measured through visualViewport (the handoff), kept for the next chat and the next visit, 280 until then — so the
 *   bar never moves when they swap. While the reply box (or the emoji search) has the keyboard, the CRM's screen is fitted
 *   to what the keyboard leaves (the phones keep the page's full height behind it), so the bar sits on the keyboard and
 *   the chat's header stays; a panel replacing the keyboard is drawn at once in its place and the keyboard slides away
 *   over it, and a keyboard coming back slides up over the panel before the panel goes.
 * - **The reply box grows** with its words, to 154px (six lines), then scrolls.
 * - **The mic is held to record** (the owner, 2026-10-14: "放手就送出（像 WhatsApp）"): released, the voice note goes;
 *   released on the bin (or left of it), it is thrown away; a tap shows "Hold to record a voice note", as the prototype's.
 * - **The chat's list pads itself** by the header and the composer (--chat-top / --chat-foot on the chat's <main>), as the
 *   prototype's list does by its fixed numbers.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import SalesComposer from "./SalesComposer";
import { BOX_MAX, BOX_MIN, HOLD_HINT, PANEL_H, composerVM, dropLast, flash, focusBox, togglePanel, type ComposerIn, type ComposerPanel } from "./vm/composer";

/** A press held this long records; shorter is a tap. */
const HOLD_MS = 250;
/** A recording shorter than this is a slip, not a voice note. */
const MIN_VOICE_MS = 700;
const TOAST_MS = 2200;
/** Less than this between the page's height and what is visible is a browser bar, not a keyboard. */
const KB_MIN = 120;
/** How long a panel waits for the keyboard to come up over it before it goes anyway. */
const RISE_MS = 700;
const KB_KEY = "crm-kb-h";

/** The keyboard's last height (px, the home-indicator inset out), kept across chats; null until one is measured. */
let lastKbH: number | null = null;
function storedKbH(): number | null {
  if (lastKbH != null) return lastKbH;
  try { const n = Number(window.localStorage.getItem(KB_KEY)); return n >= 150 && n <= 600 ? (lastKbH = n) : null; } catch { return null; }
}

const isField = (el: Element | null): el is HTMLElement =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);

export default function ChatComposer({ v }: { v: ComposerIn }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const trashRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [taH, setTaH] = useState(BOX_MIN);
  const [kbH, setKbH] = useState<number | null>(null);
  const [capH, setCapH] = useState<number | null>(null);
  /** The panel kept drawn while the keyboard comes up over it. */
  const [rising, setRising] = useState<ComposerPanel>(null);
  const latest = useRef(v);
  latest.current = v;
  const shown: ComposerPanel = v.state.panel ?? rising;
  const shownRef = useRef(shown), risingRef = useRef(rising);
  shownRef.current = shown;
  risingRef.current = rising;
  /** Until when a panel that just took the keyboard's place keeps the screen where it was. */
  const swapUntil = useRef(0);
  const refit = useRef<() => void>(() => {});

  useEffect(() => { setKbH(storedKbH()); }, []);

  // ── The reply box's height: its words, one line to six ──
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const was = ta.style.height;
    ta.style.height = "0px";
    const h = Math.min(BOX_MAX, Math.max(BOX_MIN, ta.scrollHeight));
    ta.style.height = was;
    setTaH(h);
  }, [v.draft, v.state.panel, v.rec, v.warm]);

  // ── The chat's list pads itself by the header and by this composer ──
  useLayoutEffect(() => {
    const stack = anchorRef.current?.parentElement?.querySelector<HTMLElement>("[data-composer]");
    const main = stack?.closest("main");
    if (!stack || !main) return;
    const head = main.querySelector<HTMLElement>("[data-chat-head]");
    const put = () => {
      main.style.setProperty("--chat-foot", `${stack.offsetHeight}px`);
      if (head) main.style.setProperty("--chat-top", `${head.offsetHeight}px`);
    };
    put();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(put);
    ro.observe(stack);
    if (head) ro.observe(head);
    return () => ro.disconnect();
  }, []);

  // ── The phone's keyboard (visualViewport) ──
  useEffect(() => {
    const vv = window.visualViewport;
    const app = anchorRef.current?.closest<HTMLElement>("[data-revenue-app]");
    const stack = anchorRef.current?.parentElement?.querySelector<HTMLElement>("[data-composer]");
    if (!vv || !app || !stack) return;
    let baseH = window.innerHeight, baseW = window.innerWidth, fitted = false, safe = 0;
    const clear = () => {
      if (!fitted) return;
      fitted = false;
      for (const p of ["top", "bottom"]) app.style.removeProperty(p);
      app.style.removeProperty("--safe-bottom");
      setCapH(null);
    };
    const fit = () => {
      const ae = document.activeElement;
      const inBox = ae === taRef.current, inSearch = !!ae && ae.tagName === "INPUT" && stack.contains(ae);
      // Another field (a sheet's form) keeps the browser's own way with the keyboard; so does a zoomed page.
      if ((isField(ae) && !inBox && !inSearch) || vv.scale > 1.01) { clear(); return; }
      if (window.innerWidth !== baseW) { baseW = window.innerWidth; baseH = window.innerHeight; }
      if (!isField(ae)) baseH = Math.max(window.innerHeight, vv.height);
      if (!fitted) safe = parseFloat(getComputedStyle(app).paddingBottom) || 0;
      const kb = Math.max(0, Math.round(baseH - vv.height)), up = kb > KB_MIN, pan = vv.offsetTop;
      if (up && inBox && !shownRef.current && window.innerWidth < window.innerHeight) {
        const h = Math.round(kb - safe);
        if (h >= 150 && Math.abs(h - (lastKbH ?? 0)) > 3) {
          lastKbH = h;
          setKbH(h);
          try { window.localStorage.setItem(KB_KEY, String(h)); } catch { /* private mode */ }
        }
      }
      // The keyboard has come up over the panel it replaces (all the way, when its height is known): the panel goes.
      if (up && inBox && risingRef.current && kb - safe >= (lastKbH ?? 0) - 24) setRising(null);
      const swapping = Date.now() < swapUntil.current;
      if ((!up && pan < 0.5) || !(inBox || inSearch || shownRef.current || swapping)) { clear(); return; }
      // Fitted to the keyboard while it is the reply box's (or the search's); a panel in its place keeps the full height.
      // By its top and bottom, never a height: the screen pads itself by the phone's insets (crm.module.css › .app,
      // content-box), so a height would add them on top.
      const toKb = up && ((inBox && !shownRef.current) || inSearch);
      fitted = true;
      app.style.top = `${pan}px`;
      app.style.bottom = `${Math.round(window.innerHeight - pan - (toKb ? vv.height : window.innerHeight))}px`;
      if (toKb) app.style.setProperty("--safe-bottom", "0px"); else app.style.removeProperty("--safe-bottom");
      // Searching over the keyboard: the panel gives way so the bar and the header both stay on the screen.
      if (inSearch && up) {
        const head = stack.closest("main")?.querySelector<HTMLElement>("[data-chat-head]")?.offsetHeight ?? 0;
        const bar = stack.offsetHeight - (stack.querySelector<HTMLElement>("[data-panel]")?.offsetHeight ?? 0);
        setCapH(Math.max(160, Math.round(vv.height - head - bar - 48)));
      } else setCapH(null);
    };
    refit.current = fit;
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    document.addEventListener("focusin", fit);
    document.addEventListener("focusout", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      document.removeEventListener("focusin", fit);
      document.removeEventListener("focusout", fit);
      refit.current = () => {};
      clear();
    };
  }, []);
  // The panel on screen changed (a swap, a keyboard arriving): the screen follows at once.
  useEffect(() => { refit.current(); }, [shown]);

  // A panel waiting for the keyboard goes anyway if none comes (a computer, a hardware keyboard).
  useEffect(() => {
    if (!rising) return;
    const t = setTimeout(() => setRising(null), RISE_MS);
    return () => clearTimeout(t);
  }, [rising]);
  // Nothing open and no keyboard asked for: nothing is waiting either.
  useEffect(() => { if (!v.state.panel && !v.state.kb) setRising(null); }, [v.state.panel, v.state.kb]);

  // ── The keyboard follows the state (a toast, the list tapped) ──
  useEffect(() => {
    const ta = taRef.current;
    if (!v.state.kb && ta && document.activeElement === ta) ta.blur();
  }, [v.state.kb]);

  // ── The toast: 2.2s ──
  useEffect(() => {
    if (!v.state.toast) return;
    const t = setTimeout(() => latest.current.set(s => (s.toast ? { ...s, toast: "" } : s)), TOAST_MS);
    return () => clearTimeout(t);
  }, [v.state.toast]);

  const touch = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

  /** The reply box took focus: the keyboard comes up over whatever panel was open. */
  const onFocusBox = useCallback(() => {
    const s = latest.current.state;
    if (s.panel && touch()) setRising(s.panel);
    latest.current.set(focusBox);
  }, []);
  const onBlurBox = useCallback(() => {
    latest.current.set(s => (s.kb ? { ...s, kb: false } : s));
  }, []);

  /** Sticker / Attach: the state and the keyboard in one step (focus inside the tap, or the phone opens no keyboard). */
  const swap = useCallback((p: Exclude<ComposerPanel, null>) => {
    const s = latest.current.state, next = togglePanel(s, p), ta = taRef.current;
    if (next.kb) {
      if (s.panel && touch()) setRising(s.panel);
      latest.current.set(() => next);
      ta?.focus({ preventScroll: true });
    } else {
      if (ta && document.activeElement === ta) swapUntil.current = Date.now() + 600;
      latest.current.set(() => next);
      ta?.blur();
    }
  }, []);

  const delKey = useCallback(() => {
    const cur = latest.current;
    cur.setDraft(dropLast(cur.draft));
  }, []);

  // ── Holding the mic ──
  const hold = useRef<{ id: number; timer: ReturnType<typeof setTimeout> | null; starting: boolean; recording: boolean; done: boolean; at: number } | null>(null);
  const mainDown = useCallback((e: RPointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (hold.current) return;
    e.preventDefault();
    const h = { id: e.pointerId, timer: null as ReturnType<typeof setTimeout> | null, starting: false, recording: false, done: false, at: 0 };
    hold.current = h;
    const tap = () => { hold.current = null; latest.current.set(s => flash(s, HOLD_HINT)); };
    h.timer = setTimeout(async () => {
      h.timer = null;
      h.starting = true;
      taRef.current?.blur();
      const ok = await latest.current.voiceStart();
      h.starting = false;
      if (!ok) { hold.current = null; return; }
      // Let go while the microphone was starting: nothing to send.
      if (h.done) { latest.current.voiceStop(false); tap(); return; }
      h.recording = true;
      h.at = Date.now();
    }, HOLD_MS);
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== h.id) return;
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      h.done = true;
      if (h.timer) { clearTimeout(h.timer); h.timer = null; tap(); return; }
      if (h.starting) return;
      hold.current = null;
      if (!h.recording) return;
      const bin = trashRef.current?.getBoundingClientRect();
      const thrown = ev.type === "pointercancel" || (!!bin && ev.clientX <= bin.right + 12);
      if (!thrown && Date.now() - h.at < MIN_VOICE_MS) { latest.current.voiceStop(false); latest.current.set(s => flash(s, HOLD_HINT)); return; }
      latest.current.voiceStop(!thrown);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, []);
  // Leaving the chat while holding: the recording goes nowhere.
  useEffect(() => () => {
    const h = hold.current;
    if (!h) return;
    if (h.timer) clearTimeout(h.timer);
    h.done = true;
    if (h.recording) latest.current.voiceStop(false);
  }, []);
  // A recording no finger holds any more (its release was lost): Send sends it.
  const recTap = useCallback(() => { if (!hold.current) latest.current.voiceStop(true); }, []);

  const base = kbH ?? PANEL_H;
  const p = composerVM(v, {
    taH, panelH: Math.round(capH != null ? Math.min(base, capH) : base), taRef, trashRef, shown,
    focusBox: onFocusBox, blurBox: onBlurBox, swap, mainDown, recTap, delKey,
  });
  return (<>
    {/* Where this composer is in the chat (the stack and the screen are found from it). */}
    <span ref={anchorRef} hidden />
    <SalesComposer p={p} />
  </>);
}
