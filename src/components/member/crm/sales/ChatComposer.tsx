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
/** Slid this far left while holding the mic, the recording is thrown away. */
const SLIDE_CANCEL = 110;

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
  const [slide, setSlide] = useState(0);
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
  const putInsets = useRef<() => void>(() => {});
  const alive = useRef(true);

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
    putInsets.current = put;
    put();
    if (typeof ResizeObserver === "undefined") return;
    // A size change of either that the composer did not make (the header's pinned message, a font arriving).
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
    };
    // A panel never runs past the header (a phone on its side, a search over the keyboard): it gives way, the bar and the
    // header both stay on the screen, 24px of the chat between them.
    const capPanel = () => {
      const main = stack.closest("main"), panel = stack.querySelector<HTMLElement>("[data-panel]");
      if (!main || !panel) return;
      const head = main.querySelector<HTMLElement>("[data-chat-head]")?.offsetHeight ?? 0;
      const strip = (stack.lastElementChild as HTMLElement | null)?.offsetHeight ?? 0;
      const rest = stack.offsetHeight - panel.offsetHeight - strip;
      setCapH(Math.max(160, Math.round(main.clientHeight - head - rest - 24)));
    };
    const place = () => {
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
      // Typing with no keyboard reported, the phone keeps its own way (the owner, 2026-10-15: "打字看不到自己輸入的字，昨天都沒
      // 這個問題" — since the composer took the keyboard over on 2026-10-14, an iPhone on iOS 26 that lifts the page to the
      // keyboard without shrinking visualViewport had that lift read as a stray pan and put back, the bar behind the
      // keyboard): only a keyboard the phone reports is fitted; a pan is kept only for a panel in the keyboard's place.
      if ((!up && (pan < 0.5 || inBox || inSearch)) || !(inBox || inSearch || shownRef.current || swapping)) { clear(); return; }
      // Fitted to the keyboard while it is the reply box's (or the search's); a panel in its place keeps the full height.
      // By its top and bottom, never a height: the screen pads itself by the phone's insets (crm.module.css › .app,
      // content-box), so a height would add them on top.
      // Attach floats over the chat, so with it open the screen still fits the keyboard.
      const toKb = up && ((inBox && (!shownRef.current || shownRef.current === "attach")) || inSearch);
      fitted = true;
      app.style.top = `${pan}px`;
      app.style.bottom = `${Math.round(window.innerHeight - pan - (toKb ? vv.height : window.innerHeight))}px`;
      if (toKb) app.style.setProperty("--safe-bottom", "0px"); else app.style.removeProperty("--safe-bottom");
    };
    const fit = () => { place(); capPanel(); };
    refit.current = fit;
    fit();
    // For a while after a focus change the screen is fitted every frame too (the owner, 2026-10-15, an iPhone on the new
    // keyboard: "打字的時候看不到我已經輸入的字" — the bar stayed behind the keyboard): a phone may move its keyboard
    // without telling visualViewport's resize, and only a later scroll or tap fitted the screen.
    let raf = 0, until = 0;
    const tick = () => { fit(); raf = Date.now() < until ? requestAnimationFrame(tick) : 0; };
    const watch = () => { fit(); until = Date.now() + 1200; if (!raf) raf = requestAnimationFrame(tick); };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    document.addEventListener("focusin", watch);
    document.addEventListener("focusout", watch);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      document.removeEventListener("focusin", watch);
      document.removeEventListener("focusout", watch);
      refit.current = () => {};
      clear();
    };
  }, []);
  // The panel on screen changed (a swap, a keyboard arriving): the screen follows in the same frame.
  useLayoutEffect(() => { refit.current(); }, [shown]);
  // …and the chat's list pads itself by the composer in that frame too, so the newest message never slips under a panel
  // or a growing reply box (a ResizeObserver alone would answer a frame later: the list sits beside the composer).
  // (What changes its height, not every keystroke's new objects.)
  const hasReply = !!v.reply, slashRows = v.slash ? v.slash.list.length : -1, recording = !!v.rec;
  useLayoutEffect(() => { putInsets.current(); }, [shown, taH, capH, kbH, hasReply, slashRows, recording, v.warm]);

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

  /**
   * The reply box took focus: the panel goes and the screen fits the keyboard at once (the owner, 2026-10-15, a screenshot
   * with the bar behind the keyboard: "我點 keyboard 變成這樣了"). A panel kept drawn while the keyboard rose over it waited
   * for the keyboard to reach its last measured height; one that stopped shorter (another keyboard, its strip) left the
   * screen at full height, the bar under the keyboard.
   */
  const onFocusBox = useCallback(() => {
    setRising(null);
    latest.current.set(focusBox);
  }, []);
  const onBlurBox = useCallback(() => {
    // The window itself lost focus (another app, another window): the box keeps its focus, and the state its keyboard.
    if (document.activeElement === taRef.current) return;
    latest.current.set(s => (s.kb ? { ...s, kb: false } : s));
  }, []);

  /** Sticker / Attach: the state and the keyboard in one step (focus inside the tap, or the phone opens no keyboard). */
  const swap = useCallback((p: Exclude<ComposerPanel, null>) => {
    const s = latest.current.state, next = togglePanel(s, p), ta = taRef.current;
    if (next.kb) {
      setRising(null);
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
  type Hold = { id: number; timer: ReturnType<typeof setTimeout> | null; starting: boolean; recording: boolean; done: boolean; hinted: boolean; at: number; x: number; up: (ev: PointerEvent) => void; move: (ev: PointerEvent) => void };
  const hold = useRef<Hold | null>(null);
  /** When the last press ended: the click a browser sends after it is not a second Send. */
  const releasedAt = useRef(0);
  /** The press is over, whichever way it ended: its listeners and its timer go, and the next press may start. */
  const finish = useCallback((h: Hold) => {
    window.removeEventListener("pointerup", h.up);
    window.removeEventListener("pointercancel", h.up);
    window.removeEventListener("pointermove", h.move);
    if (h.timer) { clearTimeout(h.timer); h.timer = null; }
    h.done = true;
    setSlide(0);
    if (hold.current === h) hold.current = null;
    releasedAt.current = Date.now();
  }, []);
  const mainDown = useCallback((e: RPointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (hold.current) return;
    e.preventDefault();
    const h: Hold = { id: e.pointerId, timer: null, starting: true, recording: false, done: false, hinted: false, at: 0, x: e.clientX, up: () => {}, move: () => {} };
    hold.current = h;
    const hint = () => { if (alive.current && !h.hinted) { h.hinted = true; latest.current.set(s => flash(s, HOLD_HINT)); } };
    // The microphone starts at the press, not after it (the owner, 2026-10-15: "when press the mic, it has a little bit
    // delay when start recording"); a press shorter than HOLD_MS is still a tap, and what it recorded is dropped.
    h.timer = setTimeout(() => { h.timer = null; }, HOLD_MS);
    taRef.current?.blur();
    void latest.current.voiceStart().then(ok => {
      h.starting = false;
      if (!ok) { if (!h.done) finish(h); return; }
      // Let go (a tap, or the chat left) while the microphone was starting: nothing to send.
      if (h.done) { latest.current.voiceStop(false); hint(); return; }
      h.recording = true;
      h.at = Date.now();
    });
    // Slid left past the line: thrown away there and then, as WhatsApp's.
    h.move = (ev: PointerEvent) => {
      if (ev.pointerId !== h.id || h.done) return;
      const dx = Math.min(0, ev.clientX - h.x);
      setSlide(Math.max(-SLIDE_CANCEL, dx));
      if (dx > -SLIDE_CANCEL) return;
      const was = h.recording;
      finish(h);
      try { navigator.vibrate?.(15); } catch { /* no buzz */ }
      if (was) latest.current.voiceStop(false);
    };
    h.up = (ev: PointerEvent) => {
      if (ev.pointerId !== h.id) return;
      const tap = !!h.timer, starting = h.starting, recording = h.recording;
      finish(h);
      if (tap) { if (recording) latest.current.voiceStop(false); hint(); return; }
      // Still starting: the start's own answer settles it (h.done is set).
      if (starting || !recording) return;
      const bin = trashRef.current?.getBoundingClientRect();
      const thrown = ev.type === "pointercancel" || (!!bin && ev.clientX <= bin.right + 12);
      if (!thrown && Date.now() - h.at < MIN_VOICE_MS) { latest.current.voiceStop(false); hint(); return; }
      latest.current.voiceStop(!thrown);
    };
    window.addEventListener("pointerup", h.up);
    window.addEventListener("pointercancel", h.up);
    window.addEventListener("pointermove", h.move);
  }, [finish]);
  // Leaving the chat while holding (or with a recording no finger holds): the press ends and the recording goes nowhere —
  // the phone's microphone never stays on behind a closed chat. Set again on mount: React's development double mount.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const h = hold.current, recording = !!h?.recording || !!latest.current.rec;
      if (h) finish(h);
      if (recording) latest.current.voiceStop(false);
    };
  }, [finish]);
  // The bin, tapped: the recording is thrown away and any press it belonged to is over.
  const recCancel = useCallback(() => {
    const h = hold.current;
    if (h) finish(h);
    latest.current.voiceStop(false);
  }, [finish]);
  // Send, tapped while a recording runs that no finger holds any more (its release was lost): it goes. Not the click a
  // browser sends right after the release that already sent it.
  const recTap = useCallback(() => {
    if (Date.now() - releasedAt.current < 500) return;
    const h = hold.current;
    if (h) finish(h);
    latest.current.voiceStop(true);
  }, [finish]);

  const base = kbH ?? PANEL_H;
  const p = composerVM(v, {
    taH, panelH: Math.round(capH != null ? Math.min(base, capH) : base), slide, taRef, trashRef, shown,
    focusBox: onFocusBox, blurBox: onBlurBox, swap, mainDown, recTap, recCancel, delKey,
  });
  return (<>
    {/* Where this composer is in the chat (the stack and the screen are found from it). */}
    <span ref={anchorRef} hidden />
    <SalesComposer p={p} />
  </>);
}
