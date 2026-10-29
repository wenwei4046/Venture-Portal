/**
 * A chat in the desktop's pane (CRM Desktop v2, README › Inbox › Chat column): the whole conversation in v2's bubbles
 * (ours var(--crm-tint-attention), theirs white, on the chat pattern), each day's pill, the CRM's own lines in v2's system pill
 * ("{name} joined the chat · 9:48 am", "{name} took over this chat", Won / Lost, reminders), a photo / video / voice
 * note / document inside its bubble (the phone's markup and viewer), a visit card sent as v2's reminder card, ticks
 * (blue once read), and — on each message — v2's menu beside the bubble: the six reactions, Reply · Forward · Copy ·
 * Info · Star · Pin · Delete for me. The actions are the phone's own (sales/actions.ts): react, star, hide, setPref
 * (the pinned message), forward; Forward and Info open the phone's dialogs (shared/msg-menu.tsx). The reply box sends
 * through the phone's send (24 h window, Messenger's Human Agent), with the quote a reply answers; the + menu is the
 * phone's + sheet's choices (shared/attach-sheet.tsx › ATTACH_TILES), quick replies and auto replies listed in it.
 */
import { sourceOf } from "@/lib/member/crm-source";
import type { CrmChatMessage, CrmCustomer } from "@/lib/member/crm-data";
import { CRM_LOST_REASONS } from "@/lib/member/crm";
import { first, initials } from "./data";
import type { DeskCtx } from "./ctx";
import { albumsOf, galleryOf, mediaOf, mediaWord, MINE_BG, MINE_TIME, NO_MEDIA, tickColor } from "../../shared/chat-media";
import { MENU_ICON, REACTIONS, openMsgView, openStarred } from "../../shared/msg-menu";
import { forwardChats, messageInfo } from "../../shared/msg-info";
import { ATTACH_TILES, DOC_ACCEPT } from "../../shared/attach-sheet";
import { suggestReplies, waitingWords } from "../../shared/suggest-reply";

const SPARK = "M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z";
import { CATS, ICON as CMP_ICON, emojiView, pushRecent } from "../../sales/vm/composer";
import { adKindLabel } from "../../shared/AdLink";

const DAY = 86_400_000;
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string, now: Date) => { const d = day0(new Date(iso)), T = day0(now);
  return d === T ? "Today" : d === T - DAY ? "Yesterday" : T - d < 7 * DAY ? new Date(iso).toLocaleDateString("en-MY", { weekday: "long" }) : new Date(iso).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" }); };

/** A sent visit card, as v2's reminder card: the day tile, its kind (REMINDER, CONFIRMED …), the time, the showroom. */
export interface ApptCard { dow: string; day: string; mon: string; time: string; place: string; addr: string; sent: string; kind: string; deco: string; go: () => void }
type Ev = { stopPropagation?(): void };
export type Msg = typeof NO_MEDIA & {
  key: string; id: string; day: string; sys: string; inn: boolean; out: boolean; text: string; time: string;
  starred: boolean; hasReaction: boolean; reaction: string; rxGap: string;
  enter: () => void; leave: () => void; hover: boolean; menuToggle: (e?: Ev) => void; menuOpen: boolean; menuClose: () => void;
  reactBar: { e: string; bg: string; pick: () => void }[]; acts: { label: string; d: string; run: () => void; fg: string }[];
  tick: string; hasTick: boolean; failed: boolean; quote: { who: string; text: string } | null; quoteMargin: string; appt: ApptCard | null;
  /** Your own bubble's colours — absent in the prototype harness, which keeps the design's peach. */
  outBg?: string; outFg?: string; outTime?: string;
};
const NOOP = () => {};

/** The conversation, oldest first, with the CRM's own lines between the messages. */
export function messagesOf(ctx: DeskCtx, c: CrmCustomer): Msg[] {
  const { data, nameOf, now, patch, set, ui, act } = ctx;
  type It = { at: string; m?: CrmChatMessage; sys?: string };
  const hidden = new Set(data.hiddenMessages), stars = new Set(data.starredMessages ?? []);
  const pinnedId = data.prefs[c.id]?.pinnedMessageId ?? null;
  const its: It[] = [...c.messages.filter(m => !hidden.has(m.id)).map(m => ({ at: m.at, m })),
    ...data.events.filter(e => e.customerId === c.id).map(e => { const to = nameOf(String(e.data.to ?? e.owner ?? "")), k = e.kind as string;
      const by = e.actor ? nameOf(e.actor) : "";
      // v2's lines: Share → "{name} joined the chat", Move → "{name} took over this chat"; the app's Won / Lost / reminder lines.
      const sys = k === "moved" ? `${to} took over this chat` : k === "shared" ? `${to} joined the chat` : k === "won" ? "Marked as won" : k === "assigned" ? `${by ? `${by} assigned the chat` : "Assigned"} to ${to}`
        : k === "lost" ? `Marked as lost · ${e.data.reason === "other" && e.data.note ? String(e.data.note) : CRM_LOST_REASONS.find(r => r.value === e.data.reason)?.label ?? ""}`
          : k === "reminded" ? `${by || "Principal"} sent ${to} a reminder to reply` : "";
      return { at: e.at, sys: sys ? `${sys} · ${time(e.at)}` : "" }; }).filter(x => !!x.sys),
    ...(data.notes ?? []).filter(n => n.customerId === c.id).map(n => ({ at: n.at, sys: `Note by ${n.by ? nameOf(n.by) : "—"}: ${n.text} · ${time(n.at)}` }))]
    .sort((a, b) => a.at.localeCompare(b.at));
  let prev = "";
  const url = (m: CrmChatMessage) => `/member/crm-media/${m.id}`;
  const withUrl = (m: CrmChatMessage) => (m.media ? { ...m, media: { ...m.media, url: url(m) } } : m);
  const shownMsgs = c.messages.filter(m => !hidden.has(m.id)).map(withUrl);
  const gallery = galleryOf(shownMsgs), al = albumsOf(shownMsgs);
  const sysRow = (day: string, sys: string, key: string): Msg => ({ ...NO_MEDIA, key, id: key, day, sys, inn: false, out: false, text: "", time: "", starred: false, hasReaction: false, reaction: "", rxGap: "0",
    enter: NOOP, leave: NOOP, hover: false, menuToggle: NOOP, menuOpen: false, menuClose: NOOP, reactBar: [], acts: [], tick: "", hasTick: false, failed: false, quote: null, quoteMargin: "0", appt: null });
  return its.map((it, k) => { const d = dayLabel(it.at, now), day = d !== prev ? d : ""; prev = d;
    if (it.sys) return sysRow(day, it.sys, `s${k}`);
    const m = it.m!, mine = m.from === "me", mk = m.media?.kind;
    const hide = al.hidden.has(m.id);
    const card = m.card, cd = card ? new Date(card.start) : null;
    const appt: ApptCard | null = card && cd && !hide ? {
      dow: cd.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase(), day: String(cd.getDate()), mon: cd.toLocaleDateString("en-GB", { month: "short" }).replace("Sept", "Sep").toUpperCase(),
      time: time(card.start).toUpperCase(), place: card.room, addr: card.mode === "online" ? card.link ?? "" : card.addr === card.room ? "" : card.addr, sent: time(m.at), kind: card.kind.toUpperCase(), deco: card.kind === "Cancelled" ? "line-through" : "none",
      go: () => patch({ tab: "calendar", pane: "closed", calView: "month" }),
    } : null;
    const preview = m.text || mediaWord(m);
    const star = stars.has(m.id), pinned = pinnedId === m.id, rx = m.myReaction ?? "";
    const menu = (on: boolean) => patch({ msgMenu: on ? m.id : null });
    const say = (t: string) => patch({ toast: t, msgMenu: null });
    const acts = [
      { label: "Reply", d: MENU_ICON.reply, run: () => patch({ replyTo: m.id, msgMenu: null }) },
      { label: "Forward", d: MENU_ICON.forward, run: () => { patch({ msgMenu: null }); openMsgView({ mine, preview, reaction: rx, react: NOOP, actions: [],
        forward: { chats: forwardChats(data.customers, c.id, nameOf), send: toId => void act.forward(m.id, toId).then(ok => { if (ok) patch({ toast: `Forwarded to ${data.customers.find(x => x.id === toId)?.name ?? "the customer"}` }); }) } }, "forward"); } },
      ...(m.text ? [{ label: "Copy", d: MENU_ICON.copy, run: () => { void navigator.clipboard?.writeText(m.text).catch(() => {}); say("Copied"); } }] : []),
      { label: "Info", d: MENU_ICON.info, run: () => { patch({ msgMenu: null }); openMsgView({ mine, preview, reaction: rx, react: NOOP, actions: [], info: messageInfo(m, c, nameOf) }, "info"); } },
      { label: star ? "Unstar" : "Star", d: MENU_ICON.star, run: () => { say(star ? "Unstarred" : "Starred"); void act.star(m.id, !star); } },
      { label: pinned ? "Unpin" : "Pin", d: MENU_ICON.pin, run: () => { patch({ msgMenu: null }); void act.setPref(c.id, { pinnedMessageId: pinned ? null : m.id }); } },
      { label: "Delete for me", d: MENU_ICON.del, run: () => { patch({ msgMenu: null }); void act.hideMessage(m.id); } },
    ].map(a => ({ ...a, fg: a.label === "Delete for me" ? "var(--crm-oxblood)" : "var(--crm-ink)" }));
    const q = m.replyTo ? c.messages.find(x => x.id === m.replyTo) : undefined;
    const media = mediaOf(withUrl(m), gallery, al.lead.get(m.id));
    return {
      // A photo, video, voice note or document is drawn as on the phone and opens in the viewer; a document is its tile,
      // its name not repeated as words. Words keep v2's bubble: 10 px 13 px, the time under them.
      ...media,
      key: m.id, id: m.id, day: hide ? "" : day, sys: "", inn: !mine && !hide && !appt, out: mine && !hide && !appt,
      text: m.card || (mk === "file" && (!m.text || m.text === m.media?.name)) ? "" : m.text ?? "", time: time(m.at),
      starred: star, hasReaction: !!(rx || m.theirReaction), reaction: rx + (m.theirReaction ?? ""), rxGap: rx || m.theirReaction ? "14px" : "0",
      // The ⌄ button sits 6px outside the bubble: crossing that gap leaves the message, so the button waits a moment before
      // it goes (the owner, 2026-10-15: "mouse 過去，他會消失"); coming back — or reaching the button — keeps it.
      enter: () => { clearTimeout(hoverOut); if (ui.msgHov !== m.id) patch({ msgHov: m.id }); },
      leave: () => { clearTimeout(hoverOut); hoverOut = setTimeout(() => set(u => (u.msgHov === m.id ? { ...u, msgHov: null } : u)), HOVER_GRACE_MS); },
      hover: ui.msgHov === m.id || ui.msgMenu === m.id, menuToggle: () => menu(ui.msgMenu !== m.id), menuOpen: ui.msgMenu === m.id, menuClose: () => menu(false),
      reactBar: REACTIONS.map(e => ({ e, bg: rx === e ? "var(--crm-field)" : "transparent", pick: () => { patch({ msgMenu: null }); void act.react(m.id, rx === e ? "" : e); } })),
      // Your own bubble: the brand's orange, white words, white time and ticks (the owner, 2026-10-16 — the phone's, chat-media.ts).
      outBg: MINE_BG, outFg: "#fff", outTime: MINE_TIME,
      acts, tick: tickColor(m.status), hasTick: mine && m.status !== "failed" && m.status !== "sending", failed: m.status === "failed",
      quote: q ? { who: q.from === "me" ? "You" : c.name, text: q.text || mediaWord(q) } : null, quoteMargin: media.pad === NO_MEDIA.pad ? "0 0 6px" : "0 0 4px", appt,
    };
  });
}

/** How long a message keeps its ⌄ button after the pointer leaves it. */
export const HOVER_GRACE_MS = 400;
let hoverOut: ReturnType<typeof setTimeout> | undefined;

/** One chat's bindings: the conversation, the pinned bar, the reply quote, the + menu and the reply box. */
export function chatVM(ctx: DeskCtx, id: string | null) {
  const { ui, set, patch, act, data } = ctx;
  const c = id ? data.customers.find(x => x.id === id) : undefined;
  const draft = c ? ui.draft[c.id] ?? "" : "";
  const setD = (v: string) => { if (c) set(u => ({ ...u, draft: { ...u.draft, [c.id]: v } })); };
  const replyMsg = c && ui.replyTo ? c.messages.find(m => m.id === ui.replyTo) : undefined;
  const send = () => { if (!c || !draft.trim()) return; const text = draft, rt = replyMsg?.id ?? null; setD(""); patch({ replyTo: null });
    void act.send(c.id, text, rt).then(ok => { if (!ok) setD(text); }); };
  const pick = (accept: string, multiple = false, capture = false) => { if (!c || typeof document === "undefined") return; const inp = document.createElement("input"); inp.type = "file"; inp.accept = accept; inp.multiple = multiple;
    if (capture) inp.setAttribute("capture", "environment");
    inp.onchange = () => { const fs = [...(inp.files ?? [])]; fs.forEach((f, i) => void act.sendMedia(c.id, f, i === 0 ? draft.trim() : "").then(ok => { if (ok && i === 0) setD(""); })); }; inp.click(); };
  const msgs = c ? messagesOf(ctx, c) : [];
  const firstDay = msgs[0]?.day ?? "";
  if (msgs[0]) msgs[0] = { ...msgs[0], day: "" };
  const pinnedId = c ? data.prefs[c.id]?.pinnedMessageId ?? null : null, pinned = c && pinnedId ? c.messages.find(m => m.id === pinnedId) : undefined;
  // The + menu: the phone's + sheet's choices; Quick replies and Auto replies list their texts in the same menu.
  const view = ui.attachView;
  // Auto replies' place is Suggest reply since 2026-10-29 (the owner: "替换 auto replies"): the suggested replies for the
  // customer's waiting words (shared/suggest-reply.ts), as the phone's floating logo offers them.
  const choices = view === "quick" ? data.quickReplies.map(q => ({ label: q.shortcut ? `/${q.shortcut}` : q.message.slice(0, 24), text: q.message }))
    : view === "auto" && c ? suggestReplies(c, data.replyExamples ?? [], data.quickReplies).map(s => ({ label: s.text.replace(/\s+/g, " ").slice(0, 70), text: s.text })) : [];
  const attachOpts = view ? [
    { label: "Back", bg: "var(--crm-muted)", d: "M15 18l-6-6 6-6", sep: false, pick: () => patch({ attachView: "" }) },
    ...(choices.length ? choices.map((x, i) => ({ label: x.label, bg: view === "quick" ? "var(--crm-brown)" : "var(--crm-brown)", d: view === "quick" ? ATTACH_TILES[3][2] : ATTACH_TILES[4][2], sep: i === 0,
      pick: () => { setD(x.text); patch({ attachOpen: false, attachView: "" }); } }))
      : [{ label: view === "quick" ? "No quick replies yet" : "No suggestion for the last message yet", bg: "var(--crm-faint)", d: ATTACH_TILES[view === "quick" ? 3 : 4][2], sep: true, pick: () => {} }]),
  ] : ATTACH_TILES.map(([k, label0, d0, bg0], i) => { const sug = k === "auto"; const label = sug ? "Suggest reply" : label0, d = sug ? SPARK : d0, bg = sug ? "var(--crm-rust)" : bg0; return { label, bg, d, sep: i === 3,
    pick: () => {
      if (k === "quick" || k === "auto") { patch({ attachView: k }); return; }
      patch({ attachOpen: false });
      if (k === "camera") pick("image/*,video/*", false, true); else if (k === "photos") pick("image/*,video/*", true); else pick(DOC_ACCEPT, true);
    } }; });
  // The emoji panel: the phone's Sticker panel's Emoji tab (its categories, Recents and search), as a popover over the
  // sticker icon; a pick goes into the reply box and to the front of one's Recents.
  const emo = ui.emo, mine = ui.recents ?? data.recentEmoji ?? [], ev = emo ? emojiView(emo, mine) : null;
  const emoSet = (o: Partial<NonNullable<typeof emo>>) => patch({ emo: { ...(emo ?? { ecat: "recent", searching: false, q: "" }), ...o } });
  return {
    emojiOpen: !!emo, emojiFg: emo ? "var(--crm-rust)" : "var(--crm-muted)",
    emojiToggle: () => patch({ emo: emo ? null : { ecat: "recent", searching: false, q: "" }, attachOpen: false, attachView: "" }),
    emoji: { label: ev?.label ?? "", searching: !!emo?.searching, q: emo?.q ?? "", close: () => patch({ emo: null }),
      setQ: (e: { target: { value: string } }) => emoSet({ q: e.target.value }), toggleSearch: () => emoSet({ searching: !emo?.searching, q: "" }),
      cats: CATS.map(([id, label, icon]) => ({ label, d: CMP_ICON[icon], on: !emo?.searching && emo?.ecat === id, pick: () => emoSet({ ecat: id, searching: false, q: "" }) })),
      list: (ev?.list ?? []).map(e => ({ e, pick: () => { setD(draft + e); const r = pushRecent(mine, e); patch({ recents: r }); ctx.deskAct.saveRecents(r); } })) },
    c, msgs, firstDay, draft,
    // The suggested replies' floating logo over the reply box (2026-10-29: "电脑版也加漂浮 logo"), as the phone's.
    suggest: c ? suggestReplies(c, data.replyExamples ?? [], data.quickReplies) : undefined, suggestKey: c?.id ?? "", pickSuggest: (text: string) => setD(text),
    suggestLogo: !!c && !!waitingWords(c),
    setDraft: (e: { target: { value: string } }) => setD(e.target.value),
    draftKey: (e: { key: string; shiftKey: boolean; preventDefault(): void }) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } },
    send, micD: draft.trim() ? "M5 12h14M13 6l6 6-6 6" : "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3",
    sendTitle: draft.trim() ? "Send" : "Voice note",
    photo: () => pick("image/*,video/*", true),
    // Where the customer came from: the channel, then the ad (its headline is all Meta sends) — the owner, 2026-10-15:
    // "沒有顯示他是從什麼平台過來".
    // v2 (frame 02): the ad, then the channel — "Mattress Fair · Mid Valley · Messenger"; a video or image ad keeps its kind first.
    head: c ? { avatar: initials(c.name), title: c.name, sub: [sourceOf(c).brandLabel, c.adId && c.adMedia ? adKindLabel(c).replace(/ · .*$/, "") : "", c.ad, c.channel === "whatsapp" ? "WhatsApp" : "Messenger"].filter(Boolean).join(" · "), subColor: "var(--crm-brown)", menu: true } : null,
    owner: c ? (c.assignedTo ? `${ctx.nameOf(c.assignedTo)}'s customer` : "No one yet's customer") : "", reply: c ? `Reply to ${first(c.name)}…` : "",
    // v2: the pinned message's bar, the reply's quote over the box, the + menu.
    pinShown: !!pinned, pinText: pinned ? pinned.text || mediaWord(pinned) : "", unpinMsg: () => { if (c) void act.setPref(c.id, { pinnedMessageId: null }); },
    replyOn: !!replyMsg, replyWho: replyMsg ? (replyMsg.from === "me" ? "You" : c?.name ?? "") : "", replyText: replyMsg ? replyMsg.text || mediaWord(replyMsg) : "",
    cancelReply: () => patch({ replyTo: null }),
    attachOpen: ui.attachOpen, attachToggle: () => patch({ attachOpen: !ui.attachOpen, attachView: "" }), attachClose: () => patch({ attachOpen: false, attachView: "" }), attachOpts,
    starredOpen: () => { if (!c) return; openStarred(c.messages.filter(m => (data.starredMessages ?? []).includes(m.id) && !data.hiddenMessages.includes(m.id))
      .map(m => ({ id: m.id, who: m.from === "me" ? "You" : c.name, text: m.text || mediaWord(m), at: time(m.at) }))); },
    starCount: c ? c.messages.filter(m => (data.starredMessages ?? []).includes(m.id) && !data.hiddenMessages.includes(m.id)).length : 0,
  };
}
export type ChatVM = ReturnType<typeof chatVM>;
