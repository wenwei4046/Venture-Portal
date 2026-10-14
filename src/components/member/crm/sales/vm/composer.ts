/**
 * The chat's composer (the owner's Claude Design handoff "Typing bar UI mobile chat design", 2026-10-14 —
 * docs/design/chat-composer): the One pill typing bar — Sticker, the reply box, Attach and Camera in one pill, the mic
 * that becomes Send while there is a draft — and, in the phone keyboard's place at its height, the Sticker panel and the
 * Attach panel. Everything here is the prototype's own logic class (its names too, so SalesComposer — generated from it —
 * reads them unchanged); sales/ChatComposer.tsx adds what only a real phone has (its keyboard, the box's height, holding
 * the mic). The Sticker panel's GIF and Sticker tabs are not live (the owner: "这2个分页就不用上线先") — Emoji is its tab.
 */
import type { ChangeEvent, MouseEvent, PointerEvent as RPointerEvent, Ref } from "react";

/** null: the keyboard or nothing under the bar. */
export type ComposerPanel = null | "sticker" | "attach";

/** What the composer holds on screen (SalesUi.cmp); the keyboard is the reply box's focus. */
export interface ComposerState {
  panel: ComposerPanel;
  /** The phone's keyboard is up for the reply box (the prototype's kb). */
  kb: boolean;
  /** The keyboard was up when a panel took its place — brought back when Attach closes (the prototype's prevKb). */
  prevKb: boolean;
  searching: boolean;
  q: string;
  /** The emoji category (CATS). */
  ecat: string;
  toast: string;
}
export const initialComposer = (): ComposerState => ({ panel: null, kb: false, prevKb: false, searching: false, q: "", ecat: "recent", toast: "" });

// ── The prototype's content ──

/** Icon paths, 24-unit viewBox (the handoff's Icons). */
export const ICON = {
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  smile: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8.5 14.5a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
  hand: "M7 10v10H4V10h3Zm0 0 4-7a2 2 0 0 1 3 2l-1 4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7",
  home: "M4 11 12 4l8 7M6 9.5V20h12V9.5",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z",
  stk: "M20 13V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6l7-7Zm0 0h-4a3 3 0 0 0-3 3v4",
  kb: "M3 6h18v12H3V6Zm4 3h.01M10 9h.01M13 9h.01M16 9h.01M7 12h.01M10 12h.01M13 12h.01M16 12h.01M8 15h8",
  send: "M4 12 20 4l-4 16-4-7-8-1Zm8 1 8-9",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3",
} as const;

/** The emoji categories: id, label, icon, the 24 emoji (the prototype's CATS, as written). */
export const CATS: readonly (readonly [string, string, keyof typeof ICON, string])[] = [
  ["recent", "Recents", "clock", "👍🙏😂😊👌❤️🔥✅😅🎉💪😍🤝😮😢⭐🥰😎🙌👋💯✨😴🤔"],
  ["smileys", "Smileys", "smile", "😀😃😄😁😆😅😂🙂😉😊😇🥰😍😘😋😎🤔🤨😐😴😮😢😭😤"],
  ["gestures", "Gestures", "hand", "👍👎👌✌️🤞🤝🙏👏🙌💪👋☝️👉👈✋🤙🫶👊🤌🖐️🫡🙇💁🤷"],
  ["home", "Home", "home", "🛏️🛋️🪑🏠🏡🛁🚪🪟🖼️💡📦🚚🗓️📅🕙💳🧸🪴🕯️🧺🛒🏷️🔑☕"],
  ["symbols", "Symbols", "heart", "❤️🧡💛💚💙💜✨⭐🔥✅❌⚠️💯🎉🎁📌💬❓❗🆕🆓🔔💤➕"],
];

/** Emoji search: English keywords (the prototype's NAMES). */
export const NAMES: Readonly<Record<string, string>> = { bed: "🛏️", mattress: "🛏️", sofa: "🛋️", chair: "🪑", thanks: "🙏", thank: "🙏", ok: "👌", like: "👍", yes: "✅", done: "✅", no: "❌", love: "❤️", heart: "❤️", home: "🏠", house: "🏡", deliver: "🚚", truck: "🚚", box: "📦", date: "📅", calendar: "🗓️", time: "🕙", pay: "💳", card: "💳", fire: "🔥", happy: "😊", smile: "🙂", laugh: "😂", sad: "😢", cry: "😭", party: "🎉", gift: "🎁", deal: "🤝", strong: "💪", star: "⭐", wow: "😮", cool: "😎", think: "🤔", key: "🔑", coffee: "☕", sale: "🏷️", new: "🆕", free: "🆓", sleep: "💤", wave: "👋", sorry: "🙇" };

/** The panel's tabs: Emoji alone while GIF and Sticker wait (the owner, 2026-10-14). */
export const TABS: readonly (readonly [string, string, string])[] = [["emoji", "Emoji", ICON.smile]];

/** The Attach panel's tiles (the prototype's TILES) — the CRM's own Photos, Document, Quick replies, Auto replies. */
export const TILES = [
  ["Photos", "M4 5h16v14H4V5Zm0 10 4-4 4 4 3-3 5 5M15 9h.01", "#2F8FD8"],
  ["Document", "M7 3h7l5 5v13H7V3Zm7 0v5h5", "#BD4A19"],
  ["Quick replies", "M13 2 4 14h7l-1 8 9-12h-7l1-8Z", "#A46312"],
  ["Auto replies", "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "#387557"],
] as const;
export type TileLabel = (typeof TILES)[number][0];

/** How many emoji Recents holds — one category's worth, three rows of eight. */
export const RECENT_MAX = 24;
/** The keyboard area's height before the phone's keyboard has been measured (the handoff: 280, its top padding in). */
export const PANEL_H = 280;
/** The tallest the reply box grows before it scrolls (the handoff: 154px — six lines). */
export const BOX_MAX = 154;
/** One line of the reply box: 12px padding, a 22px line, 12px padding. */
export const BOX_MIN = 46;
/** What a tap on the mic says (the prototype's toast): it is held to record. */
export const HOLD_HINT = "Hold to record a voice note";

const RUST = "#BD4A19", SUB = "rgb(128 107 96)", MUTED = "#806B60";

/** A string's user-perceived characters — a flag, a family or a skin tone is one (the prototype's split). */
export function graphemes(s: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) return [...new Intl.Segmenter().segment(s)].map(x => x.segment);
  return Array.from(s);
}
/** The draft less its last character, a multi-codepoint emoji whole (the Delete key). */
export const dropLast = (s: string) => graphemes(s).slice(0, -1).join("");

/** Recents as shown: one's own, most recent first, then the design's set, 24 in all (an emoji once). */
export function recentList(mine: readonly string[]): string[] {
  const out: string[] = [];
  for (const e of [...mine, ...graphemes(CATS[0][3])]) if (e && !out.includes(e)) out.push(e);
  return out.slice(0, RECENT_MAX);
}
/** One's recents after picking `e`: it goes first, once, 24 at most. */
export const pushRecent = (mine: readonly string[], e: string) => [e, ...mine.filter(x => x !== e)].slice(0, RECENT_MAX);

/** The emoji grid's label and emoji: the category's, or — searching — every emoji a keyword holds the query in. */
export function emojiView(s: Pick<ComposerState, "searching" | "q" | "ecat">, mine: readonly string[]): { label: string; list: string[] } {
  const ql = s.searching ? s.q.trim().toLowerCase() : "";
  if (ql) {
    const list = [...new Set(Object.entries(NAMES).filter(([n]) => n.includes(ql)).map(([, e]) => e))];
    return { label: list.length ? "Results" : `No emoji match “${s.q.trim()}”`, list };
  }
  const c = CATS.find(x => x[0] === s.ecat) ?? CATS[0];
  return { label: c[1], list: c[0] === "recent" ? recentList(mine) : graphemes(c[3]) };
}

// ── The prototype's state changes ──

/** Sticker or Attach tapped (the prototype's set): the same one closes — Sticker brings the keyboard back, Attach only if
 *  it was up before; another takes the keyboard's (or the other panel's) place. */
export function togglePanel(s: ComposerState, p: Exclude<ComposerPanel, null>): ComposerState {
  return s.panel === p ? { ...s, panel: null, kb: p === "sticker" ? true : s.prevKb } : { ...s, panel: p, prevKb: s.kb || (s.prevKb && !!s.panel), kb: false };
}
/** The reply box takes focus: the keyboard opens and any panel closes. */
export const focusBox = (s: ComposerState): ComposerState => (s.kb ? s : { ...s, kb: true, panel: null });
/** The message list tapped: everything closes. */
export const dismiss = (s: ComposerState): ComposerState => ({ ...s, kb: false, panel: null, prevKb: false });
/** A toast (the mic tapped): it shows, and everything closes (the prototype's flash). */
export const flash = (s: ComposerState, toast: string): ComposerState => ({ ...s, toast, panel: null, kb: false });
/** Sent: the Sticker panel stays if it was open; Attach closes. */
export const afterSend = (s: ComposerState): ComposerState => ({ ...s, panel: s.panel === "sticker" ? "sticker" : null });
export const toggleSearch = (s: ComposerState): ComposerState => ({ ...s, searching: !s.searching, q: "" });
/** A category picked: it shows, and search mode ends. */
export const pickCat = (s: ComposerState, id: string): ComposerState => ({ ...s, ecat: id, searching: false, q: "" });

/** The strip under the composer takes the colour of what sits above it. */
export const homeBg = (panel: ComposerPanel) => (panel === "sticker" ? "#fff" : panel === "attach" ? "#FBF7F3" : "transparent");

// ── The binding surface SalesComposer reads (every p.<name>; tools/crm-design/composer-bindings.txt) ──

type Click = (e: MouseEvent<HTMLElement>) => void;
export interface ComposerVM {
  isA: boolean; recOn: boolean; chatCold: boolean;
  draft: string; noDraft: boolean; placeholder: string; taH: string; taRef: Ref<HTMLTextAreaElement>;
  onDraft: (e: ChangeEvent<HTMLTextAreaElement>) => void; focus: () => void; blur: () => void;
  toggleSticker: Click; stkFg: string; stkIcon: string;
  toggleAttach: Click; attFg: string; camera: Click;
  mainAct: Click; mainTitle: string; mainIcon: string; mainDown: (e: RPointerEvent<HTMLElement>) => void; noMenu: Click; keep: Click;
  sticker: boolean; attach: boolean; panelH: string;
  searching: boolean; notSearching: boolean; q: string; onQ: (e: ChangeEvent<HTMLInputElement>) => void; searchPh: string; searchBg: string; searchFg: string; toggleSearch: Click;
  tabs: { label: string; icon: string; bg: string; sh: string; fg: string; pick: Click }[];
  delKey: Click;
  isEmoji: boolean; emoLabel: string; emojis: { e: string; pick: Click }[];
  barIcons: boolean; bar: { label: string; icon: string; fg: string; sw: number; line: string; pick: Click }[];
  tiles: { label: string; icon: string; color: string; go: Click }[];
  homeBg: string; toast: string;
  replyText: string; replyWho: string; cancelReply: Click;
  slashOpen: boolean; slashQ: string; slashEmpty: boolean; slashList: { title: string; text: string; rule: string; pick: () => void }[]; qrEdit: Click;
  openTpl: Click;
  recTime: string; recCancel: Click; trashRef: Ref<HTMLSpanElement>;
}

/** What the chat hands the composer (vm/chat.ts › cmp): its draft and sends, its other rows, the CRM's own actions. */
export interface ComposerIn {
  /** The chat's id: the composer starts afresh in another chat. */
  key: string;
  state: ComposerState;
  set: (f: (s: ComposerState) => ComposerState) => void;
  /** "Reply to Lim…". */
  placeholder: string;
  draft: string;
  setDraft: (text: string) => void;
  /** Words to send, and nothing being sent. */
  canSend: boolean;
  send: () => void;
  warm: boolean;
  openTpl: () => void;
  reply: { who: string; text: string } | null;
  cancelReply: () => void;
  slash: { q: string; empty: boolean; list: { title: string; text: string; rule: string; pick: () => void }[] } | null;
  qrEdit: () => void;
  /** A voice note being recorded: its clock. */
  rec: { time: string } | null;
  /** Start recording; false when the phone said no (the reason is already on screen). */
  voiceStart: () => Promise<boolean>;
  /** Stop recording: send it, or throw it away. */
  voiceStop: (send: boolean) => void;
  camera: () => void;
  tile: (label: TileLabel) => void;
  /** One's recent emoji (crm_staff_prefs.recent_emoji), most recent first. */
  recents: readonly string[];
  saveRecents: (list: string[]) => void;
}

/** What only the phone knows, measured by ChatComposer. */
export interface ComposerDom {
  taH: number;
  panelH: number;
  taRef: Ref<HTMLTextAreaElement>;
  trashRef: Ref<HTMLSpanElement>;
  /** The panel on screen: the state's, or the one being left while the keyboard comes up over it. */
  shown: ComposerPanel;
  focusBox: () => void;
  blurBox: () => void;
  /** Sticker / Attach: change the state and the keyboard in one step. */
  swap: (p: Exclude<ComposerPanel, null>) => void;
  mainDown: (e: RPointerEvent<HTMLElement>) => void;
  /** The main button tapped while a recording runs that no finger holds (Send). */
  recTap: () => void;
  delKey: () => void;
}

const noop = () => {};
const keep: Click = e => e.preventDefault();
const noMenu: Click = e => e.preventDefault();

/** The bindings: the prototype's phone(k), on the chat's live draft and the phone's measurements. */
export function composerVM(v: ComposerIn, d: ComposerDom): ComposerVM {
  const s = v.state, set = v.set, has = !!v.draft.trim(), shown = d.shown;
  const emo = emojiView(s, v.recents);
  const add = (e: string) => {
    v.setDraft(v.draft + e);
    v.saveRecents(pushRecent(v.recents, e));
  };
  return {
    // The bar's row stays while recording — its pill gives way to the recording row and the main button is Send.
    isA: v.warm, recOn: v.warm && !!v.rec, chatCold: !v.warm,
    draft: v.draft, noDraft: !has, placeholder: v.placeholder, taH: `${d.taH}px`, taRef: d.taRef,
    onDraft: e => v.setDraft(e.target.value), focus: d.focusBox, blur: d.blurBox,
    toggleSticker: () => d.swap("sticker"), stkIcon: shown === "sticker" ? ICON.kb : ICON.stk, stkFg: shown === "sticker" ? RUST : SUB,
    toggleAttach: () => d.swap("attach"), attFg: shown === "attach" ? RUST : SUB,
    camera: () => { set(x => ({ ...x, panel: null, kb: false })); v.camera(); },
    // Send: the message goes, the box empties (the chat's own send); the Sticker panel stays if open. With no words the
    // mic is held (ChatComposer › mainDown); a tap only says so.
    mainAct: has ? () => { if (!v.canSend) return; set(afterSend); v.send(); } : v.rec ? d.recTap : noop,
    mainTitle: v.rec ? "Send voice note" : has ? "Send" : "Voice note", mainIcon: has || v.rec ? ICON.send : ICON.mic,
    mainDown: has ? noop : d.mainDown, noMenu, keep,
    sticker: shown === "sticker", attach: shown === "attach", panelH: `${d.panelH}px`,
    searching: s.searching, notSearching: !s.searching, q: s.q, onQ: e => set(x => ({ ...x, q: e.target.value })),
    searchPh: "Search emoji", searchBg: s.searching ? "#FFE5CF" : "#F3EAE2", searchFg: s.searching ? RUST : "#3F2B22",
    toggleSearch: () => set(toggleSearch),
    tabs: TABS.map(([, label, icon]) => ({ label, icon, bg: "#fff", sh: "0 1px 3px rgba(63,43,34,.14)", fg: RUST, pick: noop })),
    delKey: d.delKey,
    isEmoji: true, emoLabel: emo.label, emojis: emo.list.map(e => ({ e, pick: () => add(e) })),
    barIcons: true,
    bar: CATS.map(([id, label, ic]) => {
      const a = s.ecat === id && !(s.searching && s.q.trim());
      return { label, icon: ICON[ic], fg: a ? RUST : MUTED, sw: a ? 2 : 1.7, line: a ? RUST : "transparent", pick: () => set(x => pickCat(x, id)) };
    }),
    tiles: TILES.map(([label, icon, color]) => ({ label, icon, color, go: () => { set(x => ({ ...x, panel: null, kb: false })); v.tile(label); } })),
    homeBg: homeBg(shown), toast: s.toast,
    replyText: v.reply?.text ?? "", replyWho: v.reply?.who ?? "", cancelReply: () => v.cancelReply(),
    slashOpen: !!v.slash, slashQ: v.slash ? `/${v.slash.q}` : "", slashEmpty: !!v.slash?.empty, slashList: v.slash?.list ?? [], qrEdit: () => v.qrEdit(),
    openTpl: () => v.openTpl(),
    recTime: v.rec?.time ?? "", recCancel: () => v.voiceStop(false), trashRef: d.trashRef,
  };
}
