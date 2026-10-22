// The phone CRM's 4a (2026-10-18, docs/design_handoff_crm_redesign — change list 16–20, frames M01–M14, T01–T07): the
// parts of the generated phone screens that 4a redraws, restyled in place (every handler kept) or replaced by the
// hand-written components in src/components/member/crm/shared/phone4a.tsx. Run by gen-sales.cjs (per screen) and
// gen-panel-1011.cjs, LAST — after the palette and the type scale, so it matches the screens as they are written out.
// Each swap must match exactly once, so a changed prototype or patch stops the build.
const { el } = require("./desk-4a.cjs");

function once(body, a, b, what) {
  const n = body.split(a).length - 1;
  if (n !== 1) throw new Error(`phone-4a: ${what} matched ${n} times`);
  return body.replace(a, b);
}
function every(body, a, b, what) {
  if (!body.includes(a)) throw new Error(`phone-4a: ${what} not found`);
  return body.split(a).join(b);
}
/** The whole element starting at `start`, replaced by `to` (a function gets the element's text). */
function swap(body, start, tag, to, what) {
  const [a, b] = el(body, start, tag, what);
  return body.slice(0, a) + (typeof to === "function" ? to(body.slice(a, b)) : to) + body.slice(b);
}
/** A frame's on-screen px as the app writes it (shared/phone4a.tsx › fs — the handoff's sizes are final px; ÷ .92). */
function F(px) {
  const n = Math.round((px / 0.92) * 100) / 100, s = `calc(${n}px * var(--rv-type, 1))`;
  return n * 0.92 >= 10 ? s : n >= 10 ? `max(10px, ${s})` : `${n}px`;
}
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const ROUND = 'flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer"';

/** M01 · the Inbox: title row (Team | Mine pill, house, bell with a dot), All ads beside the search, 4a chips and rows. */
function inbox(body) {
  // M02 (the owner, 2026-10-18 — the swipe states checked against the frame): Assign is the frame's person-plus, More's
  // three dots as heavy as the frame's.
  body = once(body, '<path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3" />', '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" />', "assign icon");
  body = once(body, 'strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">\n                <path d="M5 12h.01M12 12h.01M19 12h.01">',
    'strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">\n                <path d="M5 12h.01M12 12h.01M19 12h.01">', "more dots");
  body = once(body, '<h1 style={{ flex: "1 0 auto", margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Inbox</h1>',
    `<h1 style={{ flex: "1 0 auto", margin: "0", fontFamily: "${TIGHT}", fontSize: "${F(30)}", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Inbox</h1>`, "inbox title");
  // All ads leaves the title row for the search row (M01: "All ads ▾ + search").
  body = swap(body, '<span onClick={v.openAd} style={{', "span", "", "inbox ad pill");
  const adPill = `<span onClick={v.openAd} style={{ flex: "0 1 auto", minWidth: "0", maxWidth: "170px", height: "40px", padding: "0 12px", boxSizing: "border-box", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px", fontSize: "${F(13)}", fontWeight: "500", whiteSpace: "nowrap", background: "var(--crm-cream)", color: "var(--crm-ink)", cursor: "pointer" }}><span style={{ minWidth: "0", overflow: "hidden", textOverflow: "ellipsis" }}>{v.adLabel}</span><Ic name="chevron-down" size={13} /></span>`;
  body = swap(body, '<label style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 14px"', "label", s => {
    s = once(s, 'style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 14px", boxSizing: "border-box", borderRadius: "22px", background: "var(--crm-field)", color: "var(--crm-muted)" }}',
      'style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 14px", boxSizing: "border-box", borderRadius: "20px", background: "var(--crm-field)", color: "var(--crm-faint)" }}', "search box");
    s = once(s, '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">', "search icon");
    return `<div style={{ flex: "none", display: "flex", gap: "8px" }}>${adPill}${s}</div>`;
  }, "inbox search");
  body = once(body, 'style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>\n        <h1', 'style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "-2px" }}>\n        <h1', "inbox title row");
  // Team | Mine is the pill with the side one is on; the house and the bell are 40 px outline circles; the bell has a dot.
  body = swap(body, '<span onClick={v.tm.swap}', "span", `<span onClick={v.tm.swap} title={v.tm.title} aria-label={v.tm.title} style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", boxSizing: "border-box", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", cursor: "pointer" }}><Ic name={v.tm.label === "Team" ? "users" : "user-round"} size={18} /></span>`, "team mine");
  body = swap(body, '<span onClick={v.exitCrm} title="Back to Revenue app"', "span", `<span onClick={v.exitCrm} title="Back to Revenue app" aria-label="Back to Revenue app" style={{ ${ROUND} }}><Ic name="house" size={18} /></span>`, "house");
  body = swap(body, '<span onClick={v.tb.open} title="Notifications"', "span", `<span onClick={v.tb.open} title="Notifications" aria-label={v.tb.has ? \`Notifications · \${v.tb.n} new\` : "Notifications"} style={{ position: "relative", ${ROUND} }}><Ic name="bell" size={18} />{!!(v.tb.has) && (<span style={{ position: "absolute", top: "8px", right: "9px", width: "8px", height: "8px", boxSizing: "content-box", borderRadius: "50%", background: "var(--crm-orange)", border: "2px solid #fff" }} />)}</span>`, "bell");
  // Chips (change list 17).
  body = once(body, 'gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -16px", padding: "0 16px", cursor: "grab"', 'gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px", cursor: "grab"', "chip strip");
  body = swap(body, '<span onClick={c.pick} style={{', "span", '<Phone4aChip label={c.label} count={c.n} on={c.on} hot={c.label === "Attention"} onClick={c.pick} />', "inbox chip");
  // Rows run edge to edge, a hairline over each.
  body = once(body, '<section style={{ flex: "none", borderTop: "1px solid rgb(235 221 210)", paddingTop: "10px" }}>', '<section style={{ flex: "none", margin: "-4px -20px 0" }}>', "rows section");
  body = once(body, '<div data-inbox-row="1" style={{ position: "relative", overflow: "hidden", borderTop: l.rule }}>', '<div data-inbox-row="1" style={{ position: "relative", overflow: "hidden", borderTop: "1px solid var(--crm-rule-soft)" }}>', "row rule");
  body = once(body, 'position: "relative", display: "flex", gap: "12px", padding: "14px 0", background: "#fff",', 'position: "relative", display: "flex", gap: "12px", padding: "13px 20px", background: "#fff",', "row padding");
  body = once(body, 'position: "absolute", right: l.iconRight,', 'position: "absolute", right: `calc(${l.iconRight} + 20px)`,', "row icons");
  body = once(body, '<span style={{ position: "absolute", right: "0", top: "50%", transform: "translateY(-50%)", minWidth: "20px", height: "20px", padding: "0 7px", boxSizing: "border-box", borderRadius: "10px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--crm-rust)", color: "#fff", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600" }}>{l.unread}</span>',
    `<span style={{ position: "absolute", right: "20px", top: "50%", transform: "translateY(-50%)", minWidth: "22px", height: "22px", padding: "0 6px", boxSizing: "border-box", borderRadius: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--crm-rust)", color: "#fff", fontFamily: "${TIGHT}", fontSize: "${F(12)}", fontWeight: "600" }}>{l.unread}</span>`, "unread pill");
  // Swiped left: Assign (amber, ink words) · More (ink) — M02.
  body = once(body, '<span onClick={l.assign} style={{ position: "absolute", top: "0", bottom: "0", right: "84px", width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--crm-ink-soft)", color: "#fff",',
    '<span onClick={l.assign} style={{ position: "absolute", top: "0", bottom: "0", right: "84px", width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--crm-amber)", color: "var(--crm-deep)",', "swipe assign");
  body = once(body, 'width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--crm-muted)", color: "#fff",', 'width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--crm-ink)", color: "var(--crm-on-light)",', "swipe more");
  // The avatar: 48 px in the customer's tint, Inter Tight; the channel badge 18 px with a white glyph.
  body = once(body, '<span style={{ flex: "none", position: "relative", width: "44px", height: "44px" }}>', '<span style={{ flex: "none", position: "relative", width: "48px", height: "48px" }}>', "avatar box");
  body = once(body, '<span style={{ width: "44px", height: "44px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600" }}>{l.ini}</span>',
    `<span style={{ width: "48px", height: "48px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: l.avBg, color: l.avFg, fontFamily: "${TIGHT}", fontSize: "${F(15)}", fontWeight: "500" }}>{l.ini}</span>`, "avatar");
  body = once(body, 'right: "-3px", bottom: "-3px", width: "20px", height: "20px",', 'right: "-2px", bottom: "-2px", width: "18px", height: "18px",', "channel badge");
  body = swap(body, '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">', "svg", '<Ic name={l.chanIc} size={10} sw={2.4} />', "channel glyph");
  // Name 16 (600 unread), time rust when unread, the ad faint, the last message ink-soft.
  body = once(body, 'style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0", flex: "1" }}', 'style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0", flex: "1" }}', "row text gap");
  body = once(body, '<strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</strong>',
    `<strong style={{ fontSize: "${F(16)}", fontWeight: l.nameW, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</strong>`, "row name");
  body = once(body, '<span style={{ flex: "none", fontVariantNumeric: "tabular-nums", fontSize: "calc(11px * var(--rv-type, 1))", color: "rgb(128 107 96)" }}>{l.when}</span>',
    `<span style={{ flex: "none", fontVariantNumeric: "tabular-nums", fontSize: "${F(12)}", fontWeight: "500", color: l.whenC }}>{l.when}</span>`, "row time");
  body = once(body, '<span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-brown)" }}>{l.ad}</span>',
    `<span style={{ fontSize: "${F(12)}", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: l.padR }}>{l.ad}</span>`, "row ad"); // clear of the unread pill (2026-10-22: "overlap")
  body = once(body, '<span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "rgb(128 107 96)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: l.padR }}>{l.preview}</span>',
    `<span style={{ fontSize: "${F(14)}", color: "var(--crm-ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: l.padR }}>{l.preview}</span>`, "row preview");
  // The urgency line has an icon (clock · triangle for Overdue), the first visit a calendar, a cold chat a lock.
  body = once(body, 'style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "4px" }}', 'style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "1px" }}', "row notes");
  body = swap(body, '<span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: l.urg3b }}>', "span",
    `<span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "${F(12)}", fontWeight: l.urgW, color: l.urg3b }}><Ic name={l.urgIc} size={12} />{l.urg}</span>`, "row urgency");
  body = once(body, '<span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>1st visit {l.firstVisit}</span>',
    `<span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "${F(12)}", fontWeight: "500", color: "var(--crm-brown)" }}><Ic name="calendar-check" size={12} />1st visit {l.firstVisit}</span>`, "row first visit");
  body = swap(body, '<span style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 6px", borderRadius: "4px", background: "var(--crm-tint-cold)"', "span",
    `<span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "${F(12)}", fontWeight: "500", color: "var(--crm-faint)", whiteSpace: "nowrap" }}><Ic name="lock" size={12} />Cold lead</span>`, "row cold");
  // M03: a filter with nothing in it shows the frame's empty state under the chips.
  body = once(body, '<section style={{ flex: "none", margin: "-4px -20px 0" }}>', '{!!(v.empty4) && (<Phone4aEmpty e={v.empty4} />)}<section style={{ flex: "none", margin: "-4px -20px 0" }}>', "inbox empty");
  return body;
}


/** M04 / M08 · the chat: the header (‹, the customer's tint, "ad · channel"), the status strip (change list 18), a plain cream wall, day labels. */

/** M04 (2026-10-18, measured against the frame): the chat header's name 16 px / 600 and its line 12 px. */
function chatHead(b) {
  b = once(b, '<strong style={{ fontSize: "calc(18.48px * var(--rv-type, 1))", fontWeight: "500", whiteSpace: "nowrap"', `<strong style={{ fontSize: "${F(16)}", fontWeight: "600", whiteSpace: "nowrap"`, "chat head name");
  b = once(b, '<span style={{ fontSize: "calc(14.13px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap"', `<span style={{ fontSize: "${F(12)}", color: "var(--crm-muted)", whiteSpace: "nowrap"`, "chat head line");
  return b;
}
function chat(body, v) {
  body = once(body, `<div data-chat-head="" style={{ position: "absolute", left: "0", right: "0", top: "0", zIndex: "4", background: "rgba(255,255,255,.96)", borderBottom: "1px solid rgb(235 221 210)" }}>`,
    `<div data-chat-head="" style={{ position: "absolute", left: "0", right: "0", top: "0", zIndex: "4", background: "#fff", borderBottom: "1px solid var(--crm-rule)" }}>`, "chat head");
  body = swap(body, '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">\n            <path d="M19 12H5m6-6-6 6 6 6">', "svg", '<Ic name="chevron-left" size={24} />', "chat back");
  body = once(body, `<span style={{ width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650" }}>{${v}.ini}</span>`,
    `<span style={{ width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", background: ${v}.avBg, color: ${v}.avFg, fontFamily: "${TIGHT}", fontSize: "${F(15)}", fontWeight: "500" }}>{${v}.ini}</span>`, "chat avatar");
  body = swap(body, '<span style={{ position: "absolute", right: "-3px", bottom: "-3px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "50%", border: "2px solid #fff", background: "var(--crm-brown)" }}>', "span", "", "chat avatar dot");
  body = once(body, `<strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{${v}.name}</strong>`,
    `<strong style={{ fontSize: "${F(17)}", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{${v}.name}</strong>`, "chat name");
  body = once(body, `<span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-brown)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{${v}.ad}</span>`,
    `<span style={{ fontSize: "${F(13)}", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[${v}.ad, ${v}.chanName].filter(Boolean).join(" · ")}</span>`, "chat sub");
  // The strip closes the header: after its first row.
  const head = body.indexOf('<div data-chat-head=""'), row = body.indexOf('<div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "2px 16px 12px" }}>', head);
  if (head < 0 || row < 0) throw new Error("phone-4a: chat head row");
  const [, rowEnd] = el(body, body.slice(row, row + 120), "div", "chat head row");
  body = body.slice(0, rowEnd) + `<Phone4aStrip s={${v}.strip} />` + body.slice(rowEnd);
  body = once(body, '<span style={{ alignSelf: "center", margin: "6px 0 2px", padding: "5px 12px", borderRadius: "9px", background: "var(--crm-page)", boxShadow: "0 1px 1px rgba(42,22,12,.10)", color: "var(--crm-ink)", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600" }}>{m.sep}</span>',
    `<span style={{ alignSelf: "center", margin: "6px 0 2px", padding: "4px 10px", borderRadius: "12px", background: "rgba(255,255,255,.7)", color: "var(--crm-muted)", fontSize: "${F(12)}", fontWeight: "500", letterSpacing: "0.08em", textTransform: "uppercase" }}>{m.sep}</span>`, "chat day");
  body = chatHead(body);
  // M08: the cold note is the composer's card at the foot now; the grey bar under the strip goes (the demo keeps its
  // "simulate a reply" button there).
  body = once(body, '{!!(v.chatCold) && (<>', '{!!(v.chatCold && v.simReplyShow) && (<>', "cold note demo only");
  body = once(body, '<span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600" }}>Cold lead · {v.coldMsg}</span>', "", "cold note words");
  return body;
}


/** Change list 20 · Profile keeps the Revenue app Profile's structure (§6.8) in 4a's look: a stronger radial orange glow,
 * a rust avatar, the workspace rows' icons rust on the pale orange. `rows` is how many workspace icons follow the glow. */
function profile(body, rows) {
  const G = 'background: "linear-gradient(180deg, var(--crm-peach) 0%, var(--crm-peach-soft) 70%, var(--crm-page) 100%) top / 100% 150px no-repeat"';
  const at = body.indexOf('<div data-prof-glow="1"');
  if (at < 0) throw new Error("phone-4a: profile glow");
  let head = body.slice(0, at), rest = body.slice(at);
  rest = once(rest, G, 'background: "radial-gradient(130% 100% at 50% 0%, var(--crm-peach) 0%, var(--crm-peach-soft) 48%, var(--crm-page) 100%) top / 100% 150px no-repeat"', "profile glow");
  rest = once(rest.slice(0, 4000), 'width: "56px", height: "56px", borderRadius: "50%", background: "var(--crm-ink)"', 'width: "56px", height: "56px", borderRadius: "50%", background: "var(--crm-rust)"', "profile avatar") + rest.slice(4000);
  const re = /width: "52px", height: "52px", borderRadius: "50%", background: "var\(--crm-[a-z-]+\)", color: "var\(--crm-[a-z-]+\)", display: "grid", placeItems: "center" \}\}>/g;
  let n = 0;
  rest = rest.replace(re, m => (n++ < rows ? 'width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center" }}>' : m));
  if (n < rows) throw new Error(`phone-4a: profile rows ${n} < ${rows}`);
  return head + rest;
}

/** M10 · Mine's Calendar: "Calendar" with its views, the month as dots, Today / Did they come? / Upcoming on cream.
 * The Week and Day views, the outcome and celebration sheets and Customer info stay as they are. */
function calendar(body) {
  body = swap(body, '<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>', "div", "<Phone4aCalHead v={v} />", "calendar head");
  body = swap(body, '<div style={{ display: "flex", gap: "4px", margin: "0 20px", padding: "3px", borderRadius: "12px", background: "var(--crm-field)" }}>', "div", "", "calendar views");
  body = swap(body, '<div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", padding: "0 20px", userSelect: "none" }}>', "div", "<Phone4aCalMonth v={v} />", "calendar months");
  body = swap(body, '<div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", padding: "4px 6px 0", borderBottom: "1px solid var(--crm-rule)" }}>', "div", "", "calendar weekdays");
  body = swap(body, '<div onPointerDown={v.calSwDown} onPointerUp={v.calSwUp} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", padding: "0 6px", marginTop: "-10px"', "div", "", "calendar cells");
  const a = body.indexOf("{!!(v.hasToday) && (<>"), up = '<section style={{ display: "flex", flexDirection: "column", padding: "12px 20px 0" }}>', u = body.indexOf(up, a);
  if (a < 0 || u < 0) throw new Error("phone-4a: calendar lists");
  const [, ue] = el(body.slice(u), up, "section", "calendar upcoming");
  body = body.slice(0, a) + "<Phone4aCalLists v={v} />" + body.slice(u + ue);
  return body;
}

/** M09 · Contacts: the title with its count, a rounder search, tinted avatars and the status as a pill on the right. */
function contacts(body) {
  body = once(body, '<h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Contacts</h1>',
    `<h1 style={{ margin: "0", display: "flex", alignItems: "baseline", gap: "10px", fontFamily: "${TIGHT}", fontSize: "${F(30)}", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Contacts<span style={{ fontFamily: "Inter, sans-serif", fontSize: "${F(15)}", fontWeight: "400", letterSpacing: "0", color: "var(--crm-faint)" }}>{v.cCount}</span></h1>`, "contacts title");
  body = once(body, 'height: "44px", padding: "0 14px", boxSizing: "border-box", borderRadius: "14px", background: "var(--crm-field)", color: "var(--crm-muted)" }}>', 'height: "40px", padding: "0 14px", boxSizing: "border-box", borderRadius: "20px", background: "var(--crm-field)", color: "var(--crm-faint)" }}>', "contacts search");
  body = once(body, '<div data-letter={p.head} style={{ padding: "14px 0 4px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-rust)" }}>{p.head}</div>',
    `<div data-letter={p.head} style={{ padding: "14px 0 4px", fontSize: "${F(13)}", fontWeight: "500", color: "var(--crm-rust)" }}>{p.head}</div>`, "contacts letter");
  body = once(body, '<span style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-ink)", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700" }}>{p.ini}</span>',
    `<span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "50%", display: "grid", placeItems: "center", background: p.avBg, color: p.avFg, fontFamily: "${TIGHT}", fontSize: "${F(15)}", fontWeight: "500" }}>{p.ini}</span>`, "contacts avatar");
  body = once(body, 'fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{p.name}</strong>', `fontSize: "${F(14.5)}", fontWeight: "500", color: "var(--crm-ink)" }}>{p.name}</strong>`, "contacts name");
  body = once(body, '<small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{p.status} · {p.phone}</small>',
    `<small style={{ fontSize: "${F(12.5)}", color: "var(--crm-faint)", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{p.phone}</small>`, "contacts phone");
  body = once(body, 'style={{ position: "relative", display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", background: "#fff",', 'style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid var(--crm-rule-soft)", background: "#fff",', "contacts row");
  // The status pill; the call button stays (production's), quieter.
  body = once(body, "</a>)}", "</a>", "contacts call end");
  body = swap(body, '{!!p.hasTel && (<a href={p.tel}', "a", s => `<span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px", borderRadius: "14px", background: p.stBg, color: p.stFg, fontSize: "${F(12)}", fontWeight: "500", whiteSpace: "nowrap" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: p.stDot }} />{p.st}</span>` + s.replace('{!!p.hasTel && (', '').replace('width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: "var(--crm-brown)"', 'width: "30px", height: "30px", boxSizing: "border-box", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-faint)", opacity: p.hasTel ? 1 : 0.5, pointerEvents: p.hasTel ? "auto" : "none"').replace('<svg width="18" height="18"', '<svg width="16" height="16"')
    // No number: the phone stays, struck through, so every status sits in one line (the owner, 2026-10-18: "状态一排…电话斜杠").
    .replace('</path>', '</path>{!p.hasTel && (<path d="M3 3l18 18" />)}'), "contacts call");
  return body;
}

/** M13 · Notifications: the title, All · Unread · Read as 4a's segments with their counts, the updates edge to edge
 * (unread on the pale cream with an orange dot). Invitations, Mark all as read and each row's summary stay. */
function notifs(body) {
  body = once(body, '<h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Notifications</h1>',
    `<h1 style={{ margin: "0", fontFamily: "${TIGHT}", fontSize: "${F(30)}", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Notifications</h1>`, "notifs title");
  body = swap(body, '<div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "var(--crm-field)" }}>\n          {(v.nTabs)', "div",
    `<div style={{ display: "flex", padding: "4px", borderRadius: "22px", background: "var(--crm-field)" }}>{(v.nTabs).map((t, t_i) => (<span key={t_i} onClick={t.pick} style={{ flex: "1", height: "34px", borderRadius: "17px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "${F(13)}", fontWeight: t.on ? "500" : "400", background: t.on ? "var(--crm-rust)" : "transparent", color: t.on ? "#fff" : "var(--crm-muted)", cursor: "pointer" }}>{t.label}<span style={{ fontVariantNumeric: "tabular-nums", color: t.on ? "var(--crm-rust-meta)" : "var(--crm-faint)" }}>{t.cnt}</span></span>))}</div>`, "notifs tabs");
  body = every(body, '<span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".05em", color: "var(--crm-muted)" }}>', `<span style={{ fontSize: "${F(12)}", fontWeight: "500", letterSpacing: "0.12em", color: "var(--crm-faint)" }}>`, "notifs heads");
  body = once(body, '<div style={{ padding: "0 14px", borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)" }}>\n              {(v.notifUpd)', '<div style={{ margin: "0 -20px" }}>\n              {(v.notifUpd)', "notifs list");
  body = once(body, '<div onClick={u.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: u.rule, cursor: "pointer" }}>',
    '<div onClick={u.open} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 20px", background: u.unread ? "var(--crm-hover)" : "transparent", cursor: "pointer" }}>', "notifs row");
  body = once(body, '<span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "50%", background: u.bg, color: u.c, display: "grid", placeItems: "center" }}>\n                    <svg width="16" height="16"',
    '<span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: u.bg, color: u.c, display: "grid", placeItems: "center" }}>\n                    <svg width="18" height="18"', "notifs icon");
  body = once(body, '<span style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: u.weight, lineHeight: "1.3", color: u.fg }}>{u.text}</span>\n                    <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{u.meta}</span>',
    `<span style={{ fontSize: "${F(14.5)}", fontWeight: u.unread ? "600" : "400", lineHeight: "1.3", color: "var(--crm-ink)" }}>{u.text}</span>\n                    <span style={{ fontSize: "${F(12.5)}", color: "var(--crm-faint)" }}>{u.meta}</span>`, "notifs text");
  body = once(body, '<span style={{ flex: "none", width: "9px", height: "9px", borderRadius: "50%", background: "var(--crm-rust)" }}>\n                    </span>',
    '<span style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: "var(--crm-orange)" }}>\n                    </span>', "notifs dot");
  return body;
}

/** gen-sales.cjs: one salesperson screen. */
function sales(name, body) {
  if (name === "SalesNav") body = swap(body, '<nav style={{ flex: "0 0 auto", display: "flex", alignItems: "flex-end", height: "62px"', "nav", "<Phone4aBar items={v.nav3b} />", "sales bottom bar");
  if (name === "SalesInbox") body = inbox(body);
  if (name === "SalesChat") body = chat(body, "v.cl");
  if (name === "SalesProfile") body = notifs(profile(body, 3));
  if (name === "SalesCalendar") body = calendar(body);
  if (name === "SalesContacts") body = contacts(body);
  // M11 · Insight (change list 19): the page itself is 4a's; its sheets (Range, the lists, Customer info, the form) stay.
  if (name === "SalesInsight") body = swap(body, '<main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>', "main", "<Phone4aInsightMine v={v} />", "insight page");
  return body;
}


/** T · the Team side's chat: the same header and strip as Mine's (M04). */
function panelChat(body) {
  const H = '<div data-chat-head="" style={{ position: "absolute", left: "0", right: "0", top: "0", zIndex: "4", background: "rgba(255,255,255,.96)", borderBottom: "1px solid rgb(235 221 210)" }}>';
  body = once(body, H, '<div data-chat-head="" style={{ position: "absolute", left: "0", right: "0", top: "0", zIndex: "4", background: "#fff", borderBottom: "1px solid var(--crm-rule)" }}>', "team chat head");
  body = swap(body, '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">\n                  <path d="M19 12H5m6-6-6 6 6 6">', "svg", '<Ic name="chevron-left" size={24} />', "team chat back");
  body = once(body, '<span style={{ width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ld.ld.ini}</span>',
    `<span style={{ width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", background: v.ld.ld.avBg, color: v.ld.ld.avFg, fontFamily: "${TIGHT}", fontSize: "${F(15)}", fontWeight: "500" }}>{v.ld.ld.ini}</span>`, "team chat avatar");
  const dot = body.indexOf('<span style={{ position: "absolute", right: "-3px", bottom: "-3px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "50%", border: "2px solid #fff", background: "var(--crm-brown)" }}>', body.indexOf('data-chat-head=""'));
  const [d0, d1] = el(body.slice(dot), '<span style={{ position: "absolute", right: "-3px"', "span", "team chat dot");
  body = body.slice(0, dot + d0) + body.slice(dot + d1);
  body = once(body, '<strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.name}</strong>',
    `<strong style={{ fontSize: "${F(17)}", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.name}</strong>`, "team chat name");
  body = once(body, '<small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-brown)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.ad}</small>',
    `<small style={{ fontSize: "${F(13)}", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.sub}</small>`, "team chat sub");
  const head = body.indexOf('<div data-chat-head=""'), rs = '<div style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", padding: "2px 16px 12px" }}>', row = body.indexOf(rs, head);
  if (row < 0) throw new Error("phone-4a: team chat head row");
  const [, rowEnd] = el(body.slice(row), rs, "div", "team chat head row");
  body = body.slice(0, row + rowEnd) + "<Phone4aStrip s={v.ld.ld.strip} />" + body.slice(row + rowEnd);
  body = once(body, '<span style={{ alignSelf: "center", margin: "4px 0 2px", padding: "5px 12px", borderRadius: "9px", background: "var(--crm-page)", boxShadow: "0 1px 1px rgba(42,22,12,.10)", color: "var(--crm-ink)", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600" }}>{m.sep}</span>',
    `<span style={{ alignSelf: "center", margin: "4px 0 2px", padding: "4px 10px", borderRadius: "12px", background: "rgba(255,255,255,.7)", color: "var(--crm-muted)", fontSize: "${F(12)}", fontWeight: "500", letterSpacing: "0.08em", textTransform: "uppercase" }}>{m.sep}</span>`, "team chat day");
  // 4a (M04): a plain cream wall, as Mine's (sales/wall.ts).
  const wall = /backgroundColor: "var\(--crm-cream\)", backgroundImage: "url\('data:image\/svg\+xml[^"]*", backgroundSize: "240px 240px"/;
  if (!wall.test(body)) throw new Error("phone-4a: team chat wall");
  body = body.replace(wall, 'backgroundColor: "var(--crm-cream)"');
  // M04: the message words 15 px (the frame), as Mine's chat (vm/chat.ts).
  body = once(body, 'fontSize: "calc(14px * var(--rv-type, 1))", lineHeight: "1.45" }}>{m.text}</p>', `fontSize: "${F(15)}", lineHeight: "1.45" }}>{m.text}</p>`, "panel bubble words");
  // M04: the Team chat's header as Mine's — the name 16 px / 600, its line 12 px (the owner, 2026-10-18).
  body = once(body, '<strong style={{ fontSize: "calc(18.48px * var(--rv-type, 1))", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.name}',
    `<strong style={{ fontSize: "${F(16)}", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.name}`, "team chat name");
  body = once(body, '<small style={{ fontSize: "calc(14.13px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.sub}',
    `<small style={{ fontSize: "${F(12)}", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.sub}`, "team chat line");
  // M08: the cold note is the composer's card at the foot now; the grey box under the strip goes.
  { const k = body.indexOf("{!!(v.ld.lx.cold) && (<>"); if (k < 0) throw new Error("phone-4a: team cold note");
    const e = body.indexOf("</>)}", k) + "</>)}".length; body = body.slice(0, k) + body.slice(e); }
  return body;
}

/** T01 · the Team's Insight: house · avatar · "Good morning, …", the period card with "vs Sep", the rust 2 × 2 hero, Team
 * performance as a list (a team opens to its people as before). The Comparison card shows once a period is picked. */
function teamInsight(body) {
  const H = '<div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px", padding: "0 4px" }}>';
  body = swap(body, H, "div", s => {
    const bell = s.includes("{!!(v.bellIn)") ? s.slice(s.indexOf("{!!(v.bellIn) && (<>"), s.indexOf("{!!(v.houseOv)")) : "";
    return `<div style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px" }}><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}><h1 style={{ margin: "0", fontFamily: "${TIGHT}", fontSize: "${F(22)}", fontWeight: "500", letterSpacing: "-0.02em", lineHeight: "1.2", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ov.greet}</h1><span style={{ fontSize: "${F(13)}", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ov.meTitle} · {v.accessLbl}</span></span>${bell}{!!(v.houseOv) && (<span onClick={v.exitCrm} title="Back to Revenue app" aria-label="Back to Revenue app" style={{ ${ROUND} }}><Ic name="house" size={18} /></span>)}<span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "var(--crm-ink)", color: "#fff", display: "grid", placeItems: "center", fontFamily: "${TIGHT}", fontSize: "${F(15)}", fontWeight: "500" }}>{v.ov.meIni}</span></div>`;
  }, "team insight head");
  // "vs Sep" on the period card: it picks the period the hero compares with (production's Comparison).
  const pc = body.indexOf('<div onClick={v.ov.ovOpenPeriod}');
  const chev = body.indexOf('<svg style={{ flex: "none", color: "var(--crm-muted)" }} width="16" height="16"', pc);
  if (pc < 0 || chev < 0) throw new Error("phone-4a: team period card");
  const [, ce] = el(body.slice(chev, chev + 600), '<svg style={{ flex: "none", color: "var(--crm-muted)" }} width="16" height="16"', "svg", "team period chevron");
  body = body.slice(0, chev + ce) + `<span onClick={e => { e.stopPropagation(); v.ov.cmpPick(); }} style={{ flex: "none", height: "32px", padding: "0 12px", borderRadius: "16px", display: "grid", placeItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", fontSize: "${F(13)}", fontWeight: "500", cursor: "pointer" }}>{v.ov.vsLabel}</span>` + body.slice(chev + ce);
  body = swap(body, '<div style={{ flex: "none", padding: "24px 22px", borderRadius: "26px", background: "linear-gradient(150deg, var(--crm-orange) 0%, var(--crm-orange) 45%, var(--crm-rust) 100%)"', "div", "<Phone4aHero items={v.ov.hero4} cols={2} />", "team hero");
  body = once(body, "{!!(v.ov.cmpOn) && (<>", "{!!(v.ov.cmpOn && v.ov.cmpHas) && (<>", "team comparison");
  body = once(body, '<h2 style={{ flex: "none", margin: "4px 4px -10px", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Team performance</h2>',
    `<div style={{ flex: "none", display: "flex", alignItems: "baseline", gap: "10px", margin: "4px 0 -14px" }}><h2 style={{ flex: "1", margin: "0", fontFamily: "${TIGHT}", fontSize: "${F(19)}", fontWeight: "500", letterSpacing: "-0.01em" }}>Team performance</h2><span style={{ fontSize: "${F(13)}", color: "var(--crm-muted)" }}>Tap a team for its people</span></div>`, "team perf title");
  body = once(body, '<section style={{ flex: "none", padding: "20px 18px 16px", borderRadius: "22px", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.04), 0 6px 18px rgba(42,22,12,.06)", display: "flex", flexDirection: "column", gap: "6px" }}>',
    '<section style={{ flex: "none", display: "flex", flexDirection: "column" }}>', "team perf section");
  body = swap(body, '<div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 50px 54px", gap: "6px", alignItems: "baseline", paddingBottom: "6px" }}>', "div", "", "team perf header");
  body = once(body, '<div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--crm-rule)" }}>\n                <div onClick={t.toggle}', '<div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--crm-rule)" }}>\n                <div onClick={t.toggle}', "team row rule");
  body = swap(body, '<div onClick={t.toggle} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 50px 54px"', "div",
    `<div onClick={t.toggle} style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "11px 0", cursor: t.cur }}><span style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: "0" }}><span style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: t.c }} /><strong style={{ flex: "none", fontSize: "${F(15)}", fontWeight: "500" }}>{t.name}</strong><span style={{ flex: "1", minWidth: "0", fontSize: "${F(14)}", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.who}</span>{!!(t.canOpen) && (<span style={{ display: "flex", color: "var(--crm-faint)", transform: \`rotate(\${t.rot})\`, transition: "transform 150ms" }}><Ic name="chevron-right" size={16} /></span>)}</span><span style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", paddingLeft: "17px", fontSize: "${F(12.5)}", color: "var(--crm-muted)" }}><span>Leads <b style={{ fontWeight: "500", color: "var(--crm-ink)" }}>{t.leads}</b></span><span>Appt <b style={{ fontWeight: "500", color: "var(--crm-ink)" }}>{t.appt}</b></span><span>Show <b style={{ fontWeight: "500", color: "var(--crm-ink)" }}>{t.show}</b></span></span></div>`, "team row");
  // The owner, 2026-10-18 (circled "Own customers · PETER", "TL ANTHONY"): no line after a team's name.
  body = once(body, '<span style={{ flex: "1", minWidth: "0", fontSize: "calc(15.22px * var(--rv-type, 1))", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.who}</span>', '<span style={{ flex: "1", minWidth: "0" }} />', "team who");
  return body;
}

/** T02 · the Team's Inbox board: Team pill · bell · Contacts (a round button), the who chips, the status as underline
 * tabs that slide the board, columns on the pale cream, white cards with the owner and urgency under the message. */
function teamInbox(body) {
  const at = body.indexOf("{!!(v.show.ib) && (<>"), end = body.indexOf("{!!(v.show.ld) && (<>", at);
  if (at < 0 || end < 0) throw new Error("phone-4a: team inbox");
  let b = body.slice(at, end);
  b = once(b, '<h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Inbox</h1>',
    `<h1 style={{ margin: "0", fontFamily: "${TIGHT}", fontSize: "${F(30)}", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Inbox</h1>`, "team inbox title");
  b = swap(b, '<span onClick={v.ib.openPc} style={{ order: "1"', "span", `<span onClick={v.ib.openPc} title="Contacts" aria-label="Contacts" style={{ order: "1", ${ROUND} }}><Ic name="contact" size={18} /></span>`, "team contacts");
  b = swap(b, '<span onClick={v.tm.swap}', "span", `<span onClick={v.tm.swap} title={v.tm.title} aria-label={v.tm.title} style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", boxSizing: "border-box", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", cursor: "pointer" }}><Ic name={v.tm.label === "Team" ? "users" : "user-round"} size={18} /></span>`, "team tm");
  b = swap(b, '<span onClick={v.bl.openNotifs} title="Notifications"', "span", `<span onClick={v.bl.openNotifs} title="Notifications" style={{ position: "relative", ${ROUND} }}><Ic name="bell" size={18} />{!!(v.bl.notifUnread) && (<span style={{ position: "absolute", top: "8px", right: "9px", width: "8px", height: "8px", boxSizing: "content-box", borderRadius: "50%", background: "var(--crm-orange)", border: "2px solid #fff" }} />)}</span>`, "team bell");
  b = swap(b, '<span onClick={c.pick} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px"', "span",
    '<Phone4aChip label={c.label} count={c.n} on={c.on} onClick={c.pick}>{c.dot && c.label !== "All" ? <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.on ? "#fff" : c.dot }} /> : null}</Phone4aChip>', "team who chips");
  b = swap(b, '<span onClick={c.pick} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", height: "30px"', "span", '<Phone4aChip label={c.label} count={c.n} on={c.on} onClick={c.pick} />', "team people chips");
  b = once(b, 'margin: "-4px -16px 0", padding: "0 16px", userSelect: "none" }}>\n              {(v.ib.inbWhoChips)', 'margin: "-4px -20px 0", padding: "0 20px", userSelect: "none" }}>\n              {(v.ib.inbWhoChips)', "team people strip");
  // The status row: underline tabs.
  b = once(b, '<div data-drag-scroll="1" style={{ flex: "0 0 auto", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "-4px -16px 0", padding: "0 16px", userSelect: "none" }}>\n            {(v.ib.inbCols).map((g, g_i) => (<Fragment key={g_i}><span onClick={g.jump}',
    '<div data-drag-scroll="1" style={{ flex: "0 0 auto", display: "flex", gap: "20px", overflowX: "auto", scrollbarWidth: "none", margin: "-4px -20px 0", padding: "0 20px", borderBottom: "1px solid var(--crm-rule)", userSelect: "none" }}>\n            {(v.ib.inbCols).map((g, g_i) => (<Fragment key={g_i}><span onClick={g.jump}', "team status row");
  b = swap(b, '<span onClick={g.jump} style={{', "span", `<span onClick={g.jump} style={{ flex: "none", height: "36px", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "-1px", borderBottom: g.on ? "2px solid var(--crm-rust)" : "2px solid transparent", fontSize: "${F(15)}", fontWeight: g.on ? "500" : "400", color: g.on ? "var(--crm-ink)" : "var(--crm-muted)", whiteSpace: "nowrap", cursor: "pointer" }}>{g.title} <span style={{ fontVariantNumeric: "tabular-nums" }}>{g.n}</span></span>`, "team status tab");
  // The board on the pale cream, edge to edge; columns 300 px with a plain head.
  b = once(b, 'gap: "10px", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px 4px", scrollSnapType: "x mandatory"', 'gap: "12px", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", margin: "-14px -20px -14px", padding: "14px 16px 14px", background: "var(--crm-hover)", scrollSnapType: "x mandatory"', "team board");
  b = once(b, '<div style={{ flex: "0 0 264px", height: "100%", scrollSnapAlign: "start", display: "flex", flexDirection: "column", gap: "8px", padding: "10px", boxSizing: "border-box", borderRadius: "18px", background: g.bg, overflowY: "auto", scrollbarWidth: "none" }}>',
    '<div style={{ flex: "0 0 300px", height: "100%", scrollSnapAlign: "start", display: "flex", flexDirection: "column", gap: "10px", boxSizing: "border-box", overflowY: "auto", scrollbarWidth: "none" }}>', "team column");
  b = once(b, '<span style={{ width: "9px", height: "9px", borderRadius: "50%", background: g.c }}>', '<span style={{ width: "9px", height: "9px", borderRadius: "2px", background: g.c }}>', "team column dot");
  b = once(b, '<strong style={{ flex: "1", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)" }}>{g.title}</strong>', `<strong style={{ fontSize: "${F(14)}", fontWeight: "500", color: g.hot ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>{g.title}</strong>`, "team column title");
  b = once(b, '<small style={{ minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#fff", color: g.c, display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700" }}>{g.n}</small>',
    `<small style={{ flex: "1", fontSize: "${F(14)}", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{g.n}</small>`, "team column count");
  b = once(b, 'display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "14px", background: "#fff", boxShadow: "0 1px 3px rgba(42,22,12,.06)", cursor: "pointer" }}>',
    'display: "flex", flexDirection: "column", gap: "6px", padding: "11px 12px", borderRadius: "14px", border: "1px solid var(--crm-line)", background: "#fff", cursor: "pointer" }}>', "team card");
  b = once(b, '<span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "50%", background: r.ownBg, display: "grid", placeItems: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700" }}>{r.ini}</span>',
    `<span style={{ flex: "none", width: "28px", height: "28px", borderRadius: "50%", background: r.avBg, color: r.avFg, display: "grid", placeItems: "center", fontFamily: "${TIGHT}", fontSize: "${F(11.5)}", fontWeight: "500" }}>{r.ini}</span>`, "team card avatar");
  b = once(b, '<strong style={{ flex: "1", minWidth: "0", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>',
    `<strong style={{ flex: "1", minWidth: "0", fontSize: "${F(14)}", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>`, "team card name");
  b = once(b, 'color: "var(--crm-muted)", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{r.preview}</span>',
    'color: "var(--crm-ink-soft)", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{r.preview}</span>', "team card preview");
  b = once(b, '<span style={{ fontSize: "calc(13px * var(--rv-type, 1))", lineHeight: "18px", maxHeight: "36px",', '<span style={{ fontSize: "' + F(13) + '", lineHeight: "18px", maxHeight: "36px",', "team card preview size");
  b = once(b, 'gap: "8px", paddingTop: "8px", borderTop: "1px solid var(--crm-rule-soft)", fontSize: "calc(12px * var(--rv-type, 1))", lineHeight: "16px" }}>',
    `gap: "8px", fontSize: "${F(12)}", lineHeight: "16px" }}>`, "team card foot");
  b = once(b, 'display: "flex", alignItems: "center", gap: "6px", fontWeight: "600", color: "var(--crm-ink)" }}>', 'display: "flex", alignItems: "center", gap: "8px", fontWeight: "400", color: r.toAssign ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>', "team card owner");
  b = once(b, '<span style={{ flex: "none", fontWeight: "700", color: r.uc, whiteSpace: "nowrap" }}>{r.state}</span>', '<span style={{ flex: "none", fontWeight: "400", color: r.uc, whiteSpace: "nowrap" }}>{r.state}</span>', "team card state");
  return body.slice(0, at) + b + body.slice(end);
}

/** T03 · Assignment: the title and its sections as underline tabs, a legend of team colours, every ad as a card. */
function teamAssign(body) {
  const at = body.indexOf("{!!(v.show.as) && (<>");
  if (at < 0) throw new Error("phone-4a: team assign");
  const home = body.indexOf("{!!(v.asx.onHome) && (<>", at);
  const [, h1e] = el(body.slice(home), '<div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: "8px" }}>', "div", "assign head");
  const head = `<div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "14px" }}><div style={{ display: "flex", alignItems: "center", gap: "10px" }}><h1 style={{ margin: "0", fontFamily: "${TIGHT}", fontSize: "${F(30)}", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Assignment</h1>{!!(v.asx.onAct) && (<Phone4aActiveSave v={v.asx.act} />)}</div><div style={{ display: "flex", gap: "22px", borderBottom: "1px solid var(--crm-rule)" }}>{(v.asx.tabs4).map((t, t_i) => (<span key={t_i} onClick={t.pick} style={{ height: "36px", display: "inline-flex", alignItems: "center", marginBottom: "-1px", borderBottom: t.on ? "2px solid var(--crm-rust)" : "2px solid transparent", fontSize: "${F(15)}", fontWeight: t.on ? "500" : "400", color: t.on ? "var(--crm-ink)" : "var(--crm-faint)", whiteSpace: "nowrap", cursor: "pointer" }}>{t.label}</span>))}</div></div>`;
  // The home's title block becomes the tabs, shown on every section (onHome is false now — draw it unconditionally).
  const blockEnd = body.indexOf("</>)}", home + h1e);
  body = body.slice(0, home) + head + body.slice(blockEnd + 5);
  // The Ads section: no tinted box or its own title; a legend; each ad a 4a card.
  const ads = body.indexOf("{!!(v.asx.onAds) && (<>", at);
  if (ads < 0) throw new Error("phone-4a: assign ads");
  let rest = body.slice(ads);
  rest = every(rest, '<section style={{ flex: "none", position: "relative", padding: "16px 16px 16px 20px", borderRadius: "20px", background: "var(--crm-tint-cold)", border: "1px solid var(--crm-tint-cold)", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>',
    '<section style={{ flex: "none", display: "flex", flexDirection: "column", gap: "12px" }}>', "assign ads box");
  rest = every(rest, '<span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "5px", background: "var(--crm-ink-soft)" }}>\n                </span>', "", "assign ads bar");
  for (let k = rest.indexOf('<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>\n                  <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "var(--crm-ink-soft)"'); k >= 0; k = rest.indexOf('<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>\n                  <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "var(--crm-ink-soft)"', k + 1)) { const sub = rest.slice(k, k + 3000); const [ta, tb] = el(sub, '<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>\n                  <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "var(--crm-ink-soft)"', "div", "assign ads title");
  rest = rest.slice(0, k) + `<div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "999px", background: "var(--crm-tint-cold)" }}>{(v.as.adTabs).map((t, t_i) => (<span key={t_i} onClick={t.pick} style={{ flex: "1", height: "30px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "5px", borderRadius: "999px", background: t.on ? "#fff" : "transparent", boxShadow: t.on ? "0 1px 2px rgba(0,0,0,.08)" : "none", fontSize: "${F(13)}", fontWeight: t.on ? "500" : "400", color: t.on ? "var(--crm-ink)" : "var(--crm-faint)", cursor: "pointer" }}>{t.label}<span style={{ color: "var(--crm-faint)", fontSize: "${F(12)}" }}>{t.n}</span></span>))}</div>{!!(v.as.adsEmpty) && (<div style={{ padding: "18px 0", textAlign: "center", fontSize: "${F(13)}", color: "var(--crm-faint)" }}>{v.as.adsEmpty}</div>)}<div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", margin: "-2px 0 2px" }}>{(v.as.adLegend).map((l, l_i) => (<span key={l_i} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "${F(14)}", color: "var(--crm-ink-soft)" }}><span style={{ width: "9px", height: "9px", borderRadius: "2px", background: l.c }} />{l.name}</span>))}</div>` + rest.slice(k + tb); }
  for (let k = rest.indexOf('<div onClick={a.edit} style={{ padding: "12px 14px", borderRadius: "14px", background: "#fff", border: "1px solid var(--crm-tint-cold)"'); k >= 0; k = rest.indexOf('<div onClick={a.edit} style={{ padding: "12px 14px", borderRadius: "14px", background: "#fff", border: "1px solid var(--crm-tint-cold)"', k + 1)) { const nx = rest.indexOf('<div onClick={a.edit}', k + 1); const [ca, cb] = el(rest.slice(k, nx > 0 ? nx : undefined), '<div onClick={a.edit} style={{ padding: "12px 14px", borderRadius: "14px", background: "#fff", border: "1px solid var(--crm-tint-cold)"', "div", "assign ad card"); rest = rest.slice(0, k + ca) + "<Phone4aAdCard a={a} />" + rest.slice(k + cb); }
  return body.slice(0, ads) + rest;
}

/** T04 · Split leads: "‹ Split leads", the ad's name in a boxed field (typed in place), Meta's headline under it, the
 * segments rust, Save (rust) over "Save and apply to all N ads"; the ‹ closes, as Cancel did. */
function teamSplit(body) {
  const at = body.indexOf("{!!(v.as.adEdOpen) && (<>");
  if (at < 0) throw new Error("phone-4a: split");
  let b = body.slice(at);
  b = once(b, '<div style={{ flex: "none", padding: "10px 20px 14px", display: "flex", flexDirection: "column", gap: "10px", borderBottom: "1px solid var(--crm-tint-cold)" }}>',
    '<div style={{ flex: "none", padding: "10px 20px 6px", display: "flex", flexDirection: "column", gap: "12px" }}>', "split head");
  b = swap(b, '<span onClick={v.as.ae.close} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "32px"', "span",
    `<span onClick={v.as.ae.close} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "8px", marginLeft: "-4px", color: "var(--crm-ink)", cursor: "pointer" }}><Ic name="chevron-left" size={26} /><span style={{ fontFamily: "${TIGHT}", fontSize: "${F(30)}", fontWeight: "500", letterSpacing: "-0.025em" }}>Split leads</span></span>`, "split back");
  b = once(b, 'padding: "2px 0 4px", border: "0", borderBottom: "1px dashed var(--crm-line)", borderRadius: "0", background: "transparent", font: "inherit", fontSize: "calc(22px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em", color: "var(--crm-ink)", outline: "none" }} />)',
    `padding: "0 44px 0 14px", height: "50px", border: "1px solid var(--crm-ink)", borderRadius: "12px", background: "#fff", font: "inherit", fontFamily: "${TIGHT}", fontSize: "${F(20)}", fontWeight: "500", letterSpacing: "-0.01em", color: "var(--crm-ink)", outline: "none" }} />)`, "split name");
  b = once(b, '<small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.as.ae.page} · Total leads {v.as.ae.leads}</small>',
    "", "split sub");
  b = once(b, '<div style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "var(--crm-tint-cold)" }}>\n                  {(v.as.ae.modes)',
    '<div style={{ display: "flex", gap: "2px", padding: "4px", borderRadius: "22px", background: "var(--crm-field)" }}>\n                  {(v.as.ae.modes)', "split modes");
  b = once(b, '<span onClick={m.pick} style={{ flex: "1", height: "34px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: m.w,',
    `<span onClick={m.pick} style={{ flex: "1", height: "36px", borderRadius: "18px", display: "grid", placeItems: "center", fontSize: "${F(14)}", fontWeight: m.w,`, "split mode");
  b = once(b, 'padding: "12px 20px 26px", borderTop: "1px solid var(--crm-tint-cold)", background: "#fff", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "8px" }}>',
    'padding: "12px 20px 26px", borderTop: "1px solid var(--crm-rule)", background: "#fff", display: "flex", flexDirection: "column-reverse", gap: "8px" }}>', "split foot");
  b = swap(b, '<span onClick={v.as.ae.close} style={{ height: "48px", boxSizing: "border-box", borderRadius: "24px", border: "1px solid var(--crm-tint-cold)"', "span", "", "split cancel");
  b = once(b, '<span onClick={v.as.ae.save} style={{ height: "48px", borderRadius: "24px", background: v.as.ae.saveBg,', '<span onClick={v.as.ae.save} style={{ height: "50px", borderRadius: "25px", background: v.as.ae.save ? "var(--crm-rust)" : "var(--crm-faint-2)",', "split save");
  // Why Save is off, above it (the owner, 2026-10-18: "为什么我调整后，save处于灰色？" — a team's own split was the reason, out of sight).
  {
    const i = b.indexOf("<span onClick={v.as.ae.save}");
    const [, e] = el(b.slice(i), "<span onClick={v.as.ae.save}", "span", "split save end");
    b = b.slice(0, i + e) + `{!!(v.as.ae.why) && (<span role="status" style={{ fontSize: "${F(13)}", lineHeight: "1.4", color: "var(--crm-oxblood)", textAlign: "center" }}>{v.as.ae.why}</span>)}` + b.slice(i + e);
  }
  // A locked person stays in the list, grey with a lock instead of the box (the owner, 2026-10-22: "不要消失在 assignment list
  // 里面，而是改成小锁头，灰色，不能 edit"; vm/assign-1011.ts appends them with `locked`).
  b = once(b, 'gap: "8px", paddingTop: "8px", borderTop: "1px solid var(--crm-tint-cold)" }}>', 'gap: "8px", paddingTop: "8px", borderTop: "1px solid var(--crm-tint-cold)", opacity: p.locked ? 0.55 : 1 }}>', "split locked row");
  {
    const i = b.indexOf("<input value={p.v} onChange={p.set}"), e = b.indexOf(" />", i);
    if (i < 0 || e < 0) throw new Error("phone-4a: split person box");
    b = b.slice(0, i) + '{p.locked ? (<span aria-label="Locked" style={{ width: "46px", height: "34px", display: "grid", placeItems: "center", color: "var(--crm-faint)" }}><Ic name="lock" size={15} /></span>) : (' + b.slice(i, e + 3) + ")}" + b.slice(e + 3);
  }
  b = once(b, "color: \"var(--crm-muted)\" }}>{g.unit}</span>", "color: \"var(--crm-muted)\" }}>{p.locked ? \"\" : g.unit}</span>", "split locked unit");
  // A long team name takes two lines (the owner, 2026-10-22: "名字太长的你就分 2 行").
  b = once(b, 'color: r.c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.team}</strong>', 'color: r.c, lineHeight: "1.2", overflowWrap: "anywhere" }}>{r.team}</strong>', "split team name wraps");
  // The split card and Inside each team a step smaller (2026-10-22, the owner: "下方的设计，字小点"): every size between the
  // modes and the foot 1.5 px down (11 px the least, so .92 keeps it over 10), bold 700 → 600.
  {
    const from = b.indexOf("Split across teams"), to = b.indexOf('padding: "12px 20px 26px"');
    if (from < 0 || to < from) throw new Error("phone-4a: split sizes");
    const mid = b.slice(from, to)
      .replace(/fontSize: "calc\((\d+(?:\.\d+)?)px \* var\(--rv-type, 1\)\)"/g, (_, n) => `fontSize: "calc(${Math.max(11, Number(n) - 1.5)}px * var(--rv-type, 1))"`)
      .replace(/fontWeight: "700"/g, 'fontWeight: "600"');
    const head = b.lastIndexOf("<strong", from);
    b = b.slice(0, head) + b.slice(head, from).replace('fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700"', 'fontSize: "calc(12.5px * var(--rv-type, 1))", fontWeight: "600"') + mid + b.slice(to);
  }
  return body.slice(0, at) + b;
}

/** T05 · the Team's Calendar: the title, chips and segments rust, each day's visits as white cards on the pale cream
 * (a team colour bar, the time, customer, person · showroom and the state on the right). */
function teamCalendar(body) {
  const at = body.indexOf("{!!(v.show.cal) && (<>");
  if (at < 0) throw new Error("phone-4a: team calendar");
  let b = body.slice(at);
  b = once(b, '<h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Calendar</h1>',
    `<h1 style={{ margin: "0", fontFamily: "${TIGHT}", fontSize: "${F(30)}", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Calendar</h1>`, "team cal title");
  b = once(b, '<span onClick={c.pick} style={{ flex: "none", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px",', '<span onClick={c.pick} style={{ flex: "none", height: "32px", padding: "0 12px", boxSizing: "border-box", borderRadius: "16px",', "team cal chip");
  b = once(b, '<div style={{ flex: "none", display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "var(--crm-field)" }}>\n              {(v.cal.cViews)', '<div style={{ flex: "none", display: "flex", gap: "2px", padding: "4px", borderRadius: "22px", background: "var(--crm-field)" }}>\n              {(v.cal.cViews)', "team cal views");
  b = once(b, '<span onClick={vi.pick} style={{ flex: "none", height: "32px", padding: "0 12px", borderRadius: "9px",', '<span onClick={vi.pick} style={{ flex: "none", height: "32px", padding: "0 14px", borderRadius: "16px",', "team cal view");
  b = once(b, '<div style={{ flex: "none", display: "flex", flexDirection: "column", padding: "4px 14px", borderRadius: "18px", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.04), 0 6px 18px rgba(42,22,12,.06)" }}>',
    '<div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>', "team cal day");
  b = once(b, '<span style={{ padding: "10px 0 8px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "700", color: d.color }}>{d.day}</span>',
    `<span style={{ padding: "6px 2px 2px", fontFamily: "${TIGHT}", fontSize: "${F(18)}", fontWeight: "500", color: d.color }}>{d.day}</span>`, "team cal day head");
  b = once(b, '<div onClick={a.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: a.rule, cursor: "pointer" }} className={H.hov3}>',
    '<div onClick={a.open} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px 18px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", cursor: "pointer" }}>', "team cal item");
  b = once(b, '<span style={{ flex: "none", minWidth: "64px", whiteSpace: "nowrap", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{a.time}</span>',
    `<span style={{ flex: "none", order: "-1", minWidth: "70px", whiteSpace: "nowrap", fontFamily: "${TIGHT}", fontSize: "${F(17)}", fontWeight: "500", fontVariantNumeric: "tabular-nums" }}>{a.time}</span>`, "team cal time");
  b = once(b, '<strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{a.name}</strong>\n                    <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)",',
    `<strong style={{ fontSize: "${F(17)}", fontWeight: "500" }}>{a.name}</strong>\n                    <small style={{ fontSize: "${F(14)}", color: "var(--crm-muted)",`, "team cal name");
  b = once(b, '<span style={{ flex: "none", padding: "3px 8px", borderRadius: "6px", background: a.sBg, color: a.sFg, fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700" }}>{a.status}</span>',
    `<span style={{ flex: "none", color: a.sFg, fontSize: "${F(14)}", fontWeight: "500" }}>{a.status}</span>`, "team cal state");
  return body.slice(0, at) + b;
}

/** T07 · Showrooms: ‹ 1 / 2 › as round buttons, a rust +, and each showroom as the 4a page (Desk-like, edited in place). */
function teamRooms(body) {
  const ROUND36 = ROUND.replace('width: "40px", height: "40px"', 'width: "36px", height: "36px"');
  const v0 = body.indexOf("{!!(r.view) && (<>"), e0 = body.indexOf("{!!(r.editing) && (<>", v0);
  if (v0 < 0 || e0 < 0) throw new Error("phone-4a: rooms view");
  body = body.slice(0, v0) + "{!!(r.view) && (<Phone4aRoom r={r} />)}\n            " + body.slice(e0);
  body = once(body, '<section style={{ flex: "none", borderRadius: "18px", border: "1px solid var(--crm-rule)", background: "#fff", overflow: "hidden", boxShadow: "0 2px 8px rgba(42,22,12,.04)" }}>\n            {!!(r.view)',
    '<section style={{ flex: "none", borderRadius: r.view ? "0" : "18px", border: r.view ? "0" : "1px solid var(--crm-rule)", background: "#fff", overflow: r.view ? "visible" : "hidden", boxShadow: r.view ? "none" : "0 2px 8px rgba(42,22,12,.04)" }}>\n            {!!(r.view)', "rooms section");
  // The pager: two round buttons with the count between, and the + filled rust.
  const a = body.indexOf('{!!(v.rm.rmPager) && (<span style={{ flex: "none", display: "inline-flex", alignItems: "center", height: "40px"');
  const b = body.indexOf('<span onClick={v.rm.rmAdd}', a), c = body.indexOf('</span></div>', b);
  if (a < 0 || b < 0 || c < 0) throw new Error("phone-4a: rooms pager");
  body = body.slice(0, a) + `{!!(v.rm.rmPager) && (<span style={{ flex: "none", display: "flex", alignItems: "center", gap: "6px" }}><span onClick={v.rm.rmPrev} role="button" aria-label="Previous showroom" style={{ ${ROUND36}, opacity: v.rm.rmPrevOp }}><Ic name="chevron-left" size={16} /></span><span style={{ minWidth: "34px", textAlign: "center", fontSize: "${F(15)}", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{v.rm.rmPos}</span><span onClick={v.rm.rmNext} role="button" aria-label="Next showroom" style={{ ${ROUND36}, opacity: v.rm.rmNextOp }}><Ic name="chevron-right" size={16} /></span></span>)}<span onClick={v.rm.rmAdd} role="button" aria-label="Add showroom" title="Add showroom" style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}><Ic name="plus" size={20} /></span>` + body.slice(c + "</span>".length);
  return body;
}

/** gen-panel-1011.cjs: the whole Control panel. */
function panel(body) {
  // Change list 16 · the bottom bar (T01).
  body = swap(body, '<nav style={{ flex: "none", display: v.navOn ? "flex" : "none", alignItems: "flex-end", height: "62px"', "nav", "<Phone4aBar items={v.nv.nav} hidden={!v.navOn} />", "panel bottom bar");
  body = panelChat(body);
  body = teamInsight(body);
  body = teamInbox(body);
  body = teamAssign(body);
  body = teamSplit(body);
  // Assignment › Active (2026-10-22, the owner: "把这个 active member 的功能独立在" Ads to teams 后面): every team, each
  // person Active or Locked (shared/locked.ts › activeGroups, crm_set_locked).
  body = once(body, "{!!(v.asx.onFt) && (<>", "{!!(v.asx.onAct) && (<Phone4aActive v={v.asx.act} />)}{!!(v.asx.onFt) && (<>", "assign active");
  body = teamCalendar(body);
  body = once(body, '<input type="range" min="0" max="100" step="5" value={r.v} onChange={r.set} style={{ width: "100%", margin: "0", accentColor: r.c }} />',
    '<input type="range" data-crm-range="" min="0" max="100" step="5" value={r.range} onChange={r.set} style={{ width: "100%", height: "8px", margin: "0", appearance: "none", WebkitAppearance: "none", borderRadius: "4px", border: "1px solid var(--crm-line)", boxSizing: "border-box", background: `linear-gradient(to right, ${r.c} ${r.range}%, #fff ${r.range}%)`, ["--thumb" as string]: r.c }} />', "split slider");
  // A team's share is typed to the hundredth (2026-10-22, the owner: "帮我调整成可输入，并且能小数点 .00"): the decimal keypad and room for "33.33".
  body = once(body, 'inputMode="numeric" pattern="[0-9]*" value={r.v} onChange={r.setN}', 'inputMode="decimal" value={r.v} onChange={r.setN}', "split share decimal");
  { const i = body.indexOf('inputMode="decimal" value={r.v} onChange={r.setN}'), w = body.indexOf('width: "30px"', i);
    if (w < 0 || w - i > 400) throw new Error("phone-4a: split share width");
    body = body.slice(0, w) + 'width: "54px"' + body.slice(w + 'width: "30px"'.length); }
  body = teamRooms(body);
  // T07 · Showrooms: the title in 4a's face (the page keeps production's card and Edit — see CHECKLIST).
  body = once(body, '<h1 style={{ flex: "1", minWidth: "0", margin: "0", fontSize: "calc(30px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>Showrooms</h1>', `<h1 style={{ flex: "1", minWidth: "0", margin: "0", fontFamily: "${TIGHT}", fontSize: "${F(30)}", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.15" }}>Showrooms</h1>`, "showrooms title");
  // The owner, 2026-10-18: Member work type is Assignment's Work type tab; its row on Profile goes.
  { const a = body.indexOf('<div onClick={v.fts.openPage}'); if (a < 0) throw new Error("phone-4a: work type row");
    const [x, y] = el(body.slice(a, a + 4000), '<div onClick={v.fts.openPage}', "div", "work type row"); body = body.slice(0, a + x) + body.slice(a + y); }
  body = profile(body, 4);
  // Member work type saves on Save (the owner, 2026-10-18: "新加save按钮"): Cancel · Save N changes at the page's foot
  // once a switch is changed (vm/profile-1011.ts › memberWorkTypeVM).
  {
    const f = body.indexOf("{!!(v.fts.open) && (<>");
    const S = '<div style={{ flex: "1", minHeight: "0", overflowY: "auto"';
    const s0 = body.indexOf(S, f);
    if (f < 0 || s0 < 0) throw new Error("phone-4a: work type list");
    const end = body.indexOf("{!!(v.tp.open) && (<>", s0);
    const [, e] = el(body.slice(s0, end > 0 ? end : undefined), S, "div", "work type list");
    body = body.slice(0, s0 + e) + `{!!(v.fts.dirty) && (<div style={{ flex: "none", display: "flex", gap: "10px", padding: "12px 20px calc(14px + var(--safe-bottom, 0px))", borderTop: "1px solid var(--crm-rule)", background: "#fff" }}><span onClick={v.fts.cancel} role="button" style={{ flex: "0 0 auto", height: "48px", padding: "0 20px", boxSizing: "border-box", borderRadius: "24px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", fontSize: "${F(15)}", fontWeight: "500", color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</span><span onClick={v.fts.save} role="button" style={{ flex: "1", height: "48px", borderRadius: "24px", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", fontSize: "${F(15)}", fontWeight: "600", cursor: "pointer" }}>{v.fts.saveLabel}</span></div>)}` + body.slice(s0 + e);
  }
  return body;
}

/** The import lines a screen needs for the 4a parts it mounts. */
function IMPORT(body, from) {
  const names = [...new Set([...body.matchAll(/<(Phone4a\w*)/g)].map(m => m[1]))].sort();
  return (names.length ? `import { ${names.join(", ")} } from "${from}";\n` : "") + (/<Ic[\s/]/.test(body) ? `import { Ic } from "${from.replace(/phone4a$/, "icons4a")}";\n` : "");
}
module.exports = { sales, panel, IMPORT, once, every, swap, F };
