/**
 * The Inbox chat (CRM Desktop v2), drawn whole. v2 draws ONE sample message — its bubble with the ★ by the time, the
 * reaction chip under it, the 28 px round chevron a pointer shows beside it and the message menu (reactions, then
 * Reply · Copy · Star · Pin · Delete for me) — then the visit reminder card. Live, every message of the conversation is
 * drawn with exactly that markup (the loop below takes the design's own blocks and binds them to the message, `m`),
 * with the CRM's own lines (taken over, joined, reminded …) in the design's system pill, each day's pill, a photo /
 * video / voice note / document inside the bubble (the phone's markup, chat-media.cjs) and the quote a reply answers.
 * A visit card sent to the customer is v2's reminder card (its tag the card's kind). The pinned bar shows the pinned
 * message. The reply box is an input (Enter sends), the camera picks a photo, the round button sends what is typed.
 * Each patch must match once (gen-desk.cjs); every difference is in docs/design_handoff_crm_desktop_v2/BUILD-NOTES.md.
 */
const MEDIA = require("./chat-media.cjs");

/** The block that opens at `start` in `s`, through its matching `</>)}` (blocks nest). */
function block(s, start) {
  const i = s.indexOf(start);
  if (i < 0) throw new Error("desk-chat-v2: no block " + start);
  let depth = 0, k = i;
  const OPEN = "(<>", CLOSE = "</>)}";
  while (k < s.length) {
    const o = s.indexOf(OPEN, k), c = s.indexOf(CLOSE, k);
    if (c < 0) throw new Error("desk-chat-v2: unclosed " + start);
    if (o >= 0 && o < c) { depth++; k = o + OPEN.length; continue; }
    depth--; k = c + CLOSE.length;
    if (depth === 0) return s.slice(i, k);
  }
  throw new Error("desk-chat-v2: unbalanced " + start);
}
const must = (s, a, b) => { if (!s.includes(a)) throw new Error("desk-chat-v2: missing " + a.slice(0, 80)); return s.split(a).join(b); };

// A reply's quote inside its bubble (the phone's chats draw it; v2's composer quote bar, smaller).
const QUOTE = `{!!(m.quote) && (<span style={{ display: "flex", flexDirection: "column", gap: "1px", margin: m.quoteMargin, padding: "6px 10px", borderRadius: "10px", borderLeft: "3px solid #BD4A19", background: "rgba(63,43,34,.06)" }}><strong style={{ fontSize: "12px", fontWeight: "650", color: "#BD4A19" }}>{m.quote.who}</strong><span style={{ fontSize: "13px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.quote.text}</span></span>)}`;

function bubble(b, side) {
  b = must(b, `{!!(v.chat${side}) && (<>`, `{!!(m.${side === "In" ? "inn" : "out"}) && (<>`);
  // The bubble: the phone's media padding (a photo 3 px inside, words 7 px in) and WhatsApp's floating time.
  b = b.replace(/<div style=\{\{ padding: "10px 13px", /, `<div data-msg={m.id} style={{ display: "flow-root", padding: m.pad, `);
  b = b.replace(/<p style=\{\{ ([^}]*?) \}\}>\{v\.chatText\}<\/p>/, (_x, st) => `${QUOTE}${MEDIA}{!!(m.text) && (<p style={{ display: m.pShow, padding: m.inPad, ${st} }}>{m.text}</p>)}`);
  b = b.replace(/<span style=\{\{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: "4px", /,
    `<span style={{ display: m.tDisp, float: m.tFloat, marginLeft: m.tML, marginBottom: m.tMB, alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: m.timeTop, padding: m.inPad, `);
  for (const [a, z] of [["v.chatTime", "m.time"], ["v.msgStarred", "m.starred"], ["v.hasReaction", "m.hasReaction"], ["v.reaction", "m.reaction"], ["v.rxGap", "m.rxGap"],
    ["v.msgEnter", "m.enter"], ["v.msgLeave", "m.leave"], ["v.msgHover", "m.hover"], ["v.msgMenuToggle", "m.menuToggle"], ["v.msgMenuOpen", "m.menuOpen"],
    ["v.msgMenuClose", "m.menuClose"], ["v.reactBar", "m.reactBar"], ["v.msgActs", "m.acts"]]) b = must(b, a, z);
  if (side === "Out") {
    // The tick: blue once read, grey before, none while sending or failed; a failed message says so.
    b = b.replace(/\{m\.time\}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B8FD9"([^>]*)>([\s\S]*?)<\/svg><\/span>/,
      (_x, rest, inner) => `{m.time}{!!(m.hasTick) && (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={m.tick}${rest}>${inner}</svg>)}{!!(m.failed) && (<span style={{ color: "#A3371A", fontWeight: "600" }}>Not sent</span>)}</span>`);
  }
  return b;
}

const CHAT = [
  /<span style=\{\{ alignSelf: "center", margin: "4px 0 2px"[^\n]*\}\}>Today<\/span>[\s\S]*?\{!!\(v\.chatAppt\) && \(<>[\s\S]*?<\/>\)\}/,
  region => {
    const pill = region.match(/^<span style=\{\{[^\n]*?\}\}>/)[0];
    const pin = must(block(region, "{!!(v.pinShown) && (<>"), "{v.chatText}", "{v.pinText}");
    const sysLoop = region.slice(region.indexOf("{(v.sysLines)"), region.indexOf("{!!(v.msgShown)"));
    const sys = sysLoop.match(/<span style=\{\{[^\n]*?\}\}>/)[0];
    const shown = block(region, "{!!(v.msgShown) && (<>");
    const inn = bubble(block(shown, "{!!(v.chatIn) && (<>"), "In"), out = bubble(block(shown, "{!!(v.chatOut) && (<>"), "Out");
    let appt = block(region, "{!!(v.chatAppt) && (<>");
    appt = must(appt, "{!!(v.chatAppt) && (<>", "{!!(m.appt) && (<>");
    appt = must(appt, "v.appt.", "m.appt.");
    appt = must(appt, ">REMINDER<", ">{m.appt.kind}<");
    appt = appt.replace(/<div style=\{\{ alignSelf: "flex-end", /, `<div data-msg={m.id} onClick={m.appt.go} style={{ cursor: "pointer", alignSelf: "flex-end", `);
    appt = appt.replace(/(<strong style=\{\{ fontSize: "16px", fontWeight: "650", fontVariantNumeric: "tabular-nums")( \}\}>\{m\.appt\.time\})/, `$1, textDecoration: m.appt.deco$2`);
    appt = appt.replace(/\{m\.appt\.sent\}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B8FD9"/, `{m.appt.sent}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={m.tick}`);
    return `{!!(v.firstDay) && (<>${pill}{v.firstDay}</span></>)}${pin}${sysLoop}` +
      `{(v.msgs).map((m, m_i) => (<Fragment key={m.key}>` +
      `{!!(m.day) && (<>${pill}{m.day}</span></>)}` +
      `{!!(m.sys) && (<>${sys}{m.sys}</span></>)}` +
      `${inn}${out}${appt}</Fragment>))}` +
      // The end of the conversation: shared/stick.ts finds the list by it and opens the chat on its newest message (2026-10-14).
      `<span data-chat-end="1" style={{ display: "none" }}></span>`;
  },
  "The chat draws every message in v2's bubble with its own menu, reactions, star and quote; the CRM's lines in v2's pill; a sent visit card as v2's reminder card.",
];

const COMPOSER = [
  /<span style=\{\{ flex: "1", minWidth: "0", fontSize: "15px", color: "#757575", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" \}\}>\{v\.chatReply\}<\/span>([\s\S]*?)<span title="Send a photo" style=\{\{([^\n]*?) \}\}>([\s\S]*?)<\/span>(\s*)<span title="Voice note" style=\{\{([^\n]*?) \}\}>([\s\S]*?)<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3">/,
  (_x, mid, pSt, pIn, ws, vSt, vIn) =>
    `<input data-draft="1" value={v.draft} onChange={v.setDraft} onKeyDown={v.draftKey} placeholder={v.chatReply} style={{ flex: "1", minWidth: "0", fontSize: "15px", color: "#3F2B22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", border: "0", outline: "none", background: "transparent", padding: "0", margin: "0", fontFamily: "inherit" }} />${mid}` +
    `<span title="Send a photo" onClick={v.photo} style={{${pSt}, cursor: "pointer" }}>${pIn}</span>${ws}` +
    `<span title={v.sendTitle} onClick={v.send} style={{${vSt}, cursor: "pointer" }}>${vIn}<path d={v.micD}>`,
  "The reply box can be typed in (Enter sends); the camera picks a photo; the round button sends what is typed.",
];

const EMOJI = [
  /(<input data-draft="1"[^\n]*\/>\s*)<span style=\{\{ flex: "0 0 auto", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "#806B60" \}\}>(\s*<svg width="18" height="18"[^\n]*>\s*<path d="M20 13V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6l7-7Zm0 0h-4a3 3 0 0 0-3 3v4">\s*<\/path>\s*<\/svg>)/,
  '$1<span title="Emoji" onClick={v.emojiToggle} style={{ position: "relative", flex: "0 0 auto", width: "32px", height: "32px", display: "grid", placeItems: "center", color: v.emojiFg, cursor: "pointer" }}>$2{!!(v.emojiOpen) && (<DeskEmoji v={v.emoji} />)}',
  "The sticker icon opens the phone's emoji panel (its Emoji tab, Recents and search — #425) as a popover; the design drew the icon alone.",
];

const REPLY_QUOTE = [
  /(\{!!\(v\.replyOn\) && \(<>[\s\S]*?\{v\.replyWho\}<\/strong>\s*<span style=\{\{[^\n]*?\}\}>)\{v\.chatText\}/,
  "$1{v.replyText}",
  "The quote over the reply box is the message being answered (the design shows its one sample message).",
];

module.exports = [CHAT, COMPOSER, EMOJI, REPLY_QUOTE];
