// Changes to the generated desktop CRM (gen-desk.cjs) that the design does not carry. Each is [from, to, why]; each
// must match exactly once in the generated markup, so a regenerated design that moved it fails loudly here.
// Every one is listed for the owner in docs/design/crm-desktop-rev1/BUILD-NOTES.md.
module.exports = [
  [`Not assigned yet · leads wait in Organic Leads</span>`, `Not assigned yet · dealt evenly across teams</span>`,
    "No Organic Leads (the owner, 2026-10-13): an ad nobody set is dealt evenly across the teams; an enquiry from no ad goes to the Revenue Director."],
  // ── The Revenue app's own top bar: its real words and buttons (the prototype draws them as text) ──
  [`borderRadius: "14px", background: "#FFFFFF", fontFamily: "Inter, sans-serif", color: "#3F2B22", WebkitFontSmoothing: "antialiased", boxShadow: "0 1px 2px rgba(63,43,34,.08), 0 12px 40px rgba(63,43,34,.10)" }}`,
    `borderRadius: v.frameRadius, background: "#FFFFFF", fontFamily: "Inter, sans-serif", color: "#3F2B22", WebkitFontSmoothing: "antialiased", boxShadow: v.frameShadow }}`,
    "The prototype's frame is a picture on its canvas (rounded, shadowed); in the app it is the screen itself."],
  [`fontSize: "15px" }}>Good morning, <span`, `fontSize: "15px" }}>{v.greetWord}, <span`, "The greeting follows the time of day, as the Revenue app's does."],
  [`boxSizing: "border-box" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
          </span>Fair view<svg`,
    `boxSizing: "border-box", cursor: v.subCur }} onClick={v.openSubDept}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
          </span>{v.subLabel}<svg`,
    "The sub-department switcher: its real name, and it opens the Revenue app's switcher."],
  [`whiteSpace: "nowrap" }}>Sat 3 Oct 2026 · Q4 2026</span>`, `whiteSpace: "nowrap" }}>{v.dateLine}</span>`, "Today's date (the office's), not the prototype's."],
  [`<span title="Revenue app notifications" style={{ position: "relative", width: "38px", height: "38px", display: "grid", placeItems: "center", color: "#4E2F20" }}>`,
    `<span title="Revenue app notifications" onClick={v.openAppBell} style={{ position: "relative", width: "38px", height: "38px", display: "grid", placeItems: "center", color: "#4E2F20", cursor: "pointer" }}>`,
    "The Revenue app's bell opens the Revenue app's notifications (A2: not the CRM's)."],
  [`<span style={{ position: "absolute", top: "5px", right: "4px", width: "8px", height: "8px", borderRadius: "50%", background: "#BD4A19", boxShadow: "0 0 0 2px #FBF6F2" }}>
          </span>
        </span>`,
    `{!!(v.appBellDot) && (<span style={{ position: "absolute", top: "5px", right: "4px", width: "8px", height: "8px", borderRadius: "50%", background: "#BD4A19", boxShadow: "0 0 0 2px #FBF6F2" }}>
          </span>)}
        </span>`,
    "The bell's dot only when the Revenue app has something unread."],
  [`<span style={{ fontSize: "12.5px", fontWeight: "650", letterSpacing: ".1em", color: "#806B60" }}>SIGN OUT</span>`,
    `<span onClick={v.signOut} style={{ fontSize: "12.5px", fontWeight: "650", letterSpacing: ".1em", color: "#806B60", cursor: "pointer" }}>SIGN OUT</span>`,
    "Sign out signs out (the Revenue app's own)."],
  // ── Controls the design draws but does not wire ──
  [/(\{\(v\.filters\)\.map\(\(f, f_i\) => \(<Fragment key=\{f_i\}>\s*<span) style=\{\{/, `$1 onClick={f.pick} style={{ cursor: "pointer", `,
    "Inbox's status chips filter the list (the design draws them; C1)."],
  [/(\{!!\(o\.off\) && \(<>\s*<span) style=\{\{ height: "28px", lineHeight: "28px", padding: "0 12px", borderRadius: "8px", color: "#806B60", fontSize: "13px", fontWeight: "550", whiteSpace: "nowrap" \}\}>\{o\.label\}/,
    `$1 onClick={o.pick} style={{ height: "28px", lineHeight: "28px", padding: "0 12px", borderRadius: "8px", color: "#806B60", fontSize: "13px", fontWeight: "550", whiteSpace: "nowrap", cursor: "pointer" }}>{o.label}`,
    "Insight's period switch switches (Today / This week / This month / Custom)."],
  [/(\{!!\(v\.showPeriodCompact\) && \(<>\s*<span) style=\{\{/, `$1 onClick={v.cyclePeriod} style={{ cursor: "pointer", `,
    "The compact period chip (Director, 1280) steps through the periods."],
  [`color: "#C9B8AC" }}>Free · 2 per slot</span>`, `color: "#C9B8AC" }}>{v.freeLabel}</span>`, "A free slot says the showroom's own booking limit."],
  [/(<button type="button" onClick=)\{v\.awMenuToggle\}( style=\{\{[^\n]*\n(?:[^\n]*\n){4}\s*<\/span>Customer info<\/button>)/, `$1{v.awInfo}$2`, "Awaiting reply's ⋮ Customer info opens Customer info."],
  [/(<button type="button" onClick=)\{v\.awMenuToggle\}( style=\{\{[^\n]*\n(?:[^\n]*\n){4}\s*<\/span>Appointment<\/button>)/, `$1{v.awBook}$2`, "Awaiting reply's ⋮ Appointment books / changes the visit."],
  [/(<button type="button" onClick=)\{v\.toggleMenu\}( title="Move to someone else")/, `$1{v.toggleMenu}$2`, "Move stays the design's (RS only; not on the Principal / Director's desktop)."],
  [/(<button type="button" onClick=)\{v\.toggleMenu\}( style=\{\{[^\n]*\n(?:[^\n]*\n){4}\s*<\/span>Customer info<\/button>)/, `$1{v.openInfo}$2`, "The chat's ⋮ Customer info opens Customer info (C2)."],
  [/(<button type="button" onClick=)\{v\.toggleMenu\}( style=\{\{([^\n]*)\n(?:[^\n]*\n){4}\s*<\/span>Appointment<\/button>)/,
    "$1{v.openBook}$2",
    "The chat's ⋮ Appointment books / changes / cancels the visit (Add note was taken off by the owner, 2026-10-13)."],
  [/(<span) (style=\{\{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #EBDDD2", color: "#BD4A1[^\n]*?)\}\}>(\s*<svg[^\n]*\n\s*<path d="M12 20h9M16\.5 3\.5a2\.1 2\.1 0 0 1 3 3L7 19l-4 1 1-4Z">)/,
    `$1 onClick={v.editInfo} $2 }}>$3`, "Customer info's Edit edits the customer (the form the Principal / Director set)."],
  // ── Screens the design does not draw, in its style (desk/DeskExtras.tsx) ──
  ["{!!(v.kAlerts) && (<>", "{!!(v.kBook) && (<DeskBook v={v.book} />)}{!!(v.kNote) && (<DeskNote v={v.note} />)}{!!(v.kForm) && (<DeskCustomerForm v={v.cform} />)}{!!(v.kAlerts) && (<>",
    "Booking a visit, a note and editing a customer open in the pane (built in the design's style)."],
  ["{!!(v.isMwtOp) && (<>", "{!!(v.isHistOp) && (<DeskHistory v={v.history} />)}{!!(v.isMwtOp) && (<>", "Settings › History (the owner, 2026-10-13): who changed which setting, when."],
  ...chatPatches("v.chatIn", "v.chatOut", "v.chatText", "v.chatTime", "v.chatReply", "v.msgs", "v.draft", "v.setDraft", "v.draftKey", "v.send", "v.micD", "v.attach", "v.photo", false),
  ...chatPatches("v.aw.inn", "v.aw.out", "v.aw.msg", "v.aw.clock", "v.aw.reply", "v.awMsgs", "v.awDraft", "v.awSetDraft", "v.awDraftKey", "v.awSend", "v.awMicD", "v.awAttach", "v.awPhoto", true),
  // Meta is not connected yet (PROPOSALS.md C, waiting for the owner): the line says so instead of the sample's
  // "Synced from Meta Ads · 9:00 am". The compact page's first, then the full page's (the only one left).
  [/(>Ads Performance<\/strong>\s*<span [^>]*><span style=\{\{ width: "7px", height: "7px", borderRadius: "50%", background: )"#3FA06B"( \}\}>\s*<\/span>)Synced from Meta Ads · 9:00 am/,
    "$1v.metaDot$2{v.metaSync}", "Ads Performance (compact) says whether Meta is connected."],
  [/(<span style=\{\{ width: "7px", height: "7px", borderRadius: "50%", background: )"#3FA06B"( \}\}>\s*<\/span>)Synced from Meta Ads · 9:00 am/,
    "$1v.metaDot$2{v.metaSync}", "Ads Performance says whether Meta is connected."],
  // Full time team editor: the people table and the week keep their full height and the pane scrolls (the owner,
  // 2026-10-13: PEI FEN's row was cut — the scroller squeezed these boxes, whose overflow is hidden; #348 on the phone).
  ['<div style={{ border: "1px solid #E3E8EF", borderRadius: "18px", overflow: "hidden" }}>', '<div style={{ flex: "none", border: "1px solid #E3E8EF", borderRadius: "18px", overflow: "hidden" }}>',
    "The Full time editor's people table keeps its full height."],
  [/<div style=\{\{ display: "flex", flexDirection: "column", gap: "0", border: "1px solid #EBDDD2", borderRadius: "16px", overflow: "hidden" \}\}>(\s*<span [^>]*>WHO GETS EACH DAY<\/span>)/,
    '<div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "0", border: "1px solid #EBDDD2", borderRadius: "16px", overflow: "hidden" }}>$1', "…and so does its week."],
  // Insight › Ads Performance: "+ Metrics · N" before View all picks the cards (the owner, 2026-10-13).
  ['<button type="button" onClick={v.goAdsPerf}', '<DeskCardPicker v={v} />\n                  <button type="button" onClick={v.goAdsPerf}', "Insight's ad cards are picked as Ads Performance's columns are."],
  // Ads Performance: drag a header's right edge to size its column (the owner, 2026-10-13) — resize-patches.cjs.
  ...require("./resize-patches.cjs"),
  // Insight › Ads Performance's table sorts and sizes as Ads Performance's (the owner, 2026-10-13) — insight-table-patches.cjs.
  ...require("./insight-table-patches.cjs"),
  // Customise metrics: drag a row with the pointer (the owner, 2026-10-13: the browser's drag did not move the rows).
  ['<div draggable="true" onDragStart={o.dStart} onDragOver={o.dOver} onDrop={o.dDrop} onDragEnd={o.dEnd} style={{ position: "relative",',
    '<div data-morder="1" onPointerDown={o.pDown} style={{ touchAction: "none", userSelect: "none", position: "relative",', "Column order drags with the pointer."],
];

/**
 * A chat, drawn whole (dev changes C2 / D4 — the design draws one bubble and a reply box that cannot be typed in):
 * the design's own bubbles, kept style for style, repeated over the conversation; its "Today" pill as each day's;
 * its reminder pill (grey, rgba(107,100,90,.12)) as the CRM's own lines; a photo, document or visit card as a link
 * line in the bubble; the tick blue once read, grey before; the reply box an input (Enter sends), + and the camera
 * pick a file, and the voice button sends once something is typed (its icon an arrow then).
 */
// A visit sent to the customer is the salesperson chat's visit card (the owner, 2026-10-13: 跟 RS 一樣).
const CARD = require("./visit-card.cjs");
function chatPatches(inn, out, text, time, reply, list, draft, setDraft, draftKey, send, micD, attach, photo, aw) {
  const e = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const NO = "(?:(?!<span title|\\{!!\\(v\\.)[\\s\\S])*?";
  const SYS = `{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "6px", maxWidth: "86%", margin: "4px 0", padding: "6px 12px", borderRadius: "10px", background: "rgba(107,100,90,.12)", color: "#6B645A", fontSize: "12px", fontWeight: "600", textAlign: "center" }`;
  // 2026-10-13 (the user: a voice note, photo or video came as a document to open): shown as itself, as on the phone.
  // 2026-10-14: the phone chats' markup (chat-media.cjs) — a box its final size before it loads, a tap opens the in-app viewer
  // (photos, videos, a PDF read in place), a document as a tile with its name.
  const MEDIA = require("./chat-media.cjs");
  const BELL = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path></svg>`;
  const bubbles = new RegExp(
    `(<span style=\\{\\{ alignSelf: "center", margin: "4px 0 2px"[^\\n]*?\\}\\}>)(?:Today|\\{v\\.aw\\.time\\})</span>\\s*` +
    `\\{!!\\(${e(inn)}\\) && \\(<>\\s*(<div style=\\{\\{[^\\n]*?\\}\\}>)\\s*<p style=(\\{\\{[^\\n]*?\\}\\})>\\{${e(text)}\\}</p>\\s*<span style=(\\{\\{[^\\n]*?\\}\\})>\\{${e(time)}\\}</span>\\s*</div>\\s*</>\\)\\}\\s*` +
    `\\{!!\\(${e(out)}\\) && \\(<>\\s*(<div style=\\{\\{[^\\n]*?\\}\\}>)\\s*<p style=\\{\\{[^\\n]*?\\}\\}>\\{${e(text)}\\}</p>\\s*<span style=(\\{\\{[^\\n]*?\\}\\})>\\{${e(time)}\\}<svg ([^>]*?)stroke="#3B8FD9"([^>]*)>(${NO})</svg></span>\\s*</div>\\s*</>\\)\\}` +
    (aw ? `\\s*\\{!!\\(v\\.aw\\.reminded\\) && \\(<>${NO}</>\\)\\}` : ""));
  // 2026-10-14 (the owner, WhatsApp's computer app beside ours: "電腦端的聊天邊框再小一些"): a photo, video, album or
  // document sits 3 px inside its bubble, its words and time 7 px in (mediaOf's m.pad / m.inPad, as on the phone).
  const tight = (_m, pill, inDiv, pSt, inTime, outDiv, outTime, ...rest) => loop0(_m, pill,
    // …and a text message's time floats beside its words, as WhatsApp's (shared/chat-media.ts › INLINE_TIME, 2026-10-14).
    inDiv.replace('padding: "10px 13px"', "padding: m.pad").replace("{{ ", '{{ display: "flow-root", '), pSt.replace(/^\{\{ /, "{{ display: m.pShow, padding: m.inPad, "),
    floatTime(inTime.replace('marginTop: "4px",', 'marginTop: m.timeTop, padding: m.inPad,')),
    outDiv.replace('padding: "10px 13px"', "padding: m.pad").replace("{{ ", '{{ display: "flow-root", '), floatTime(outTime.replace('marginTop: "4px",', 'marginTop: m.timeTop, padding: m.inPad,')), ...rest);
  const floatTime = s => s.replace('display: "flex",', "display: m.tDisp, float: m.tFloat, marginLeft: m.tML, marginBottom: m.tMB,");
  const loop = (...a) => tight(...a);
  const loop0 = (_m, pill, inDiv, pSt, inTime, outDiv, outTime, svgA, svgB, svgIn) =>
    `{(${list}).map((m, m_i) => (<Fragment key={m_i}>` +
    `{!!(m.day) && (<>${pill}{m.day}</span></>)}` +
    `{!!(m.sys) && (<><span style={${SYS}}>{!!(m.bell) && (<>${BELL}</>)}{m.sys}</span></>)}` +
    `{!!(m.inn) && (<>${inDiv}${CARD}{!!(m.text) && (<p style=${pSt}>{m.text}</p>)}${MEDIA}{!!(m.media) && (<p style=${pSt}><a href={m.mediaHref || undefined} target="_blank" rel="noreferrer">{m.media}</a></p>)}<span style=${inTime}>{m.time}</span></div></>)}` +
    `{!!(m.out) && (<>${outDiv}${CARD}{!!(m.text) && (<p style=${pSt}>{m.text}</p>)}${MEDIA}{!!(m.media) && (<p style=${pSt}><a href={m.mediaHref || undefined} target="_blank" rel="noreferrer">{m.media}</a></p>)}<span style=${outTime}>{m.time}{!!(m.hasTick) && (<svg ${svgA}stroke={m.tick}${svgB}>${svgIn}</svg>)}{!!(m.failed) && (<span style={{ color: "#A3371A", fontWeight: "600" }}>Not sent</span>)}</span></div></>)}` +
    `</Fragment>))}` +
    // The end of the conversation: shared/stick.ts finds the list by it and opens the chat on its newest message (2026-10-14).
    `<span data-chat-end="1" style={{ display: "none" }}></span>`;
  const composer = new RegExp(
    `<span title="Send a file" style=(\\{\\{[^\\n]*?\\}\\})>(${NO})</span>(\\s*<span style=\\{\\{[^\\n]*?\\}\\}>\\s*)<span style=\\{\\{ flex: "1", minWidth: "0", fontSize: "15px", color: "#757575"[^\\n]*?\\}\\}>\\{${e(reply)}\\}</span>(${NO})` +
    `<span title="Send a photo" style=(\\{\\{[^\\n]*?\\}\\})>(${NO})</span>(\\s*)<span title="Voice note" style=(\\{\\{[^\\n]*?\\}\\})>(${NO})<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3">`);
  const box = (_m, fSt, fIn, mid, rest, pSt, pIn, ws, vSt, vIn) =>
    `<span title="Send a file" onClick={${attach}} style=${fSt.replace(/ \}\}$/, ', cursor: "pointer" }}')}>${fIn}</span>${mid}` +
    `<input value={${draft}} onChange={${setDraft}} onKeyDown={${draftKey}} placeholder={${reply}} style={{ flex: "1", minWidth: "0", fontSize: "15px", color: "#3F2B22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", border: "0", outline: "none", background: "transparent", padding: "0", margin: "0", fontFamily: "inherit" }} />${rest}` +
    `<span title="Send a photo" onClick={${photo}} style=${pSt.replace(/ \}\}$/, ', cursor: "pointer" }}')}>${pIn}</span>${ws}` +
    `<span title="Voice note" onClick={${send}} style=${vSt.replace(/ \}\}$/, ', cursor: "pointer" }}')}>${vIn}<path d={${micD}}>`;
  return [
    [bubbles, loop, `The ${aw ? "Awaiting reply" : "pane's"} chat shows the whole conversation in the design's bubbles (it draws one).`],
    [composer, box, `The ${aw ? "Awaiting reply" : "pane's"} reply box can be typed in and sends; + and the camera attach.`],
];
}
