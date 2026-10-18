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
  body = swap(body, '<span onClick={v.tm.swap}', "span", `<span onClick={v.tm.swap} title={v.tm.title} aria-label={v.tm.title} style={{ flex: "none", height: "40px", padding: "0 14px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px", boxSizing: "border-box", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", fontSize: "${F(13)}", fontWeight: "500", cursor: "pointer" }}><Ic name="users" size={15} />{v.tm.label}</span>`, "team mine");
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
    `<span style={{ fontSize: "${F(12)}", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.ad}</span>`, "row ad");
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
  return body;
}


/** M04 / M08 · the chat: the header (‹, the customer's tint, "ad · channel"), the status strip (change list 18), a plain cream wall, day labels. */
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

/** gen-sales.cjs: one salesperson screen. */
function sales(name, body) {
  if (name === "SalesNav") body = swap(body, '<nav style={{ flex: "0 0 auto", display: "flex", alignItems: "flex-end", height: "62px"', "nav", "<Phone4aBar items={v.nav3b} />", "sales bottom bar");
  if (name === "SalesInbox") body = inbox(body);
  if (name === "SalesChat") body = chat(body, "v.cl");
  if (name === "SalesProfile") body = profile(body, 3);
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
  return body;
}

/** gen-panel-1011.cjs: the whole Control panel. */
function panel(body) {
  // Change list 16 · the bottom bar (T01).
  body = swap(body, '<nav style={{ flex: "none", display: v.navOn ? "flex" : "none", alignItems: "flex-end", height: "62px"', "nav", "<Phone4aBar items={v.nv.nav} hidden={!v.navOn} />", "panel bottom bar");
  body = panelChat(body);
  body = profile(body, 5);
  return body;
}

/** The import lines a screen needs for the 4a parts it mounts. */
function IMPORT(body, from) {
  const names = [...new Set([...body.matchAll(/<(Phone4a\w*)/g)].map(m => m[1]))].sort();
  return (names.length ? `import { ${names.join(", ")} } from "${from}";\n` : "") + (/<Ic[\s/]/.test(body) ? `import { Ic } from "${from.replace(/phone4a$/, "icons4a")}";\n` : "");
}
module.exports = { sales, panel, IMPORT, once, every, swap, F };
