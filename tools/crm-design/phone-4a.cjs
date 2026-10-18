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
    `<div data-letter={p.head} style={{ padding: "14px 0 4px", fontSize: "${F(14)}", fontWeight: "500", color: "var(--crm-rust)" }}>{p.head}</div>`, "contacts letter");
  body = once(body, '<span style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-ink)", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700" }}>{p.ini}</span>',
    `<span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "50%", display: "grid", placeItems: "center", background: p.avBg, color: p.avFg, fontFamily: "${TIGHT}", fontSize: "${F(15)}", fontWeight: "500" }}>{p.ini}</span>`, "contacts avatar");
  body = once(body, 'fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{p.name}</strong>', `fontSize: "${F(16)}", fontWeight: "500", color: "var(--crm-ink)" }}>{p.name}</strong>`, "contacts name");
  body = once(body, '<small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{p.status} · {p.phone}</small>',
    `<small style={{ fontSize: "${F(14)}", color: "var(--crm-faint)", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{p.phone}</small>`, "contacts phone");
  body = once(body, 'style={{ position: "relative", display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", background: "#fff",', 'style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid var(--crm-rule-soft)", background: "#fff",', "contacts row");
  // The status pill; the call button stays (production's), quieter.
  body = once(body, "</a>)}", "</a>", "contacts call end");
  body = swap(body, '{!!p.hasTel && (<a href={p.tel}', "a", s => `<span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px", borderRadius: "14px", background: p.stBg, color: p.stFg, fontSize: "${F(13)}", fontWeight: "500", whiteSpace: "nowrap" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: p.stDot }} />{p.st}</span>` + s.replace('{!!p.hasTel && (', '').replace('width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: "var(--crm-brown)"', 'width: "30px", height: "30px", boxSizing: "border-box", borderRadius: "50%", display: p.hasTel ? "grid" : "none", placeItems: "center", color: "var(--crm-faint)"').replace('<svg width="18" height="18"', '<svg width="16" height="16"'), "contacts call");
  return body;
}

/** M13 · Notifications: the title, All · Unread · Read as 4a's segments with their counts, the updates edge to edge
 * (unread on the pale cream with an orange dot). Invitations, Mark all as read and each row's summary stay. */
function notifs(body) {
  body = once(body, '<h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Notifications</h1>',
    `<h1 style={{ margin: "0", fontFamily: "${TIGHT}", fontSize: "${F(30)}", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Notifications</h1>`, "notifs title");
  body = swap(body, '<div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "var(--crm-field)" }}>\n          {(v.nTabs)', "div",
    `<div style={{ display: "flex", padding: "4px", borderRadius: "22px", background: "var(--crm-field)" }}>{(v.nTabs).map((t, t_i) => (<span key={t_i} onClick={t.pick} style={{ flex: "1", height: "34px", borderRadius: "17px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "${F(14)}", fontWeight: t.on ? "500" : "400", background: t.on ? "var(--crm-rust)" : "transparent", color: t.on ? "#fff" : "var(--crm-muted)", cursor: "pointer" }}>{t.label}<span style={{ fontVariantNumeric: "tabular-nums", color: t.on ? "var(--crm-rust-meta)" : "var(--crm-faint)" }}>{t.cnt}</span></span>))}</div>`, "notifs tabs");
  body = every(body, '<span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".05em", color: "var(--crm-muted)" }}>', `<span style={{ fontSize: "${F(12)}", fontWeight: "500", letterSpacing: "0.12em", color: "var(--crm-faint)" }}>`, "notifs heads");
  body = once(body, '<div style={{ padding: "0 14px", borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)" }}>\n              {(v.notifUpd)', '<div style={{ margin: "0 -20px" }}>\n              {(v.notifUpd)', "notifs list");
  body = once(body, '<div onClick={u.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: u.rule, cursor: "pointer" }}>',
    '<div onClick={u.open} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 20px", background: u.unread ? "var(--crm-hover)" : "transparent", cursor: "pointer" }}>', "notifs row");
  body = once(body, '<span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "50%", background: u.bg, color: u.c, display: "grid", placeItems: "center" }}>\n                    <svg width="16" height="16"',
    '<span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: u.bg, color: u.c, display: "grid", placeItems: "center" }}>\n                    <svg width="18" height="18"', "notifs icon");
  body = once(body, '<span style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: u.weight, lineHeight: "1.3", color: u.fg }}>{u.text}</span>\n                    <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{u.meta}</span>',
    `<span style={{ fontSize: "${F(16)}", fontWeight: u.unread ? "600" : "400", lineHeight: "1.3", color: "var(--crm-ink)" }}>{u.text}</span>\n                    <span style={{ fontSize: "${F(14)}", color: "var(--crm-faint)" }}>{u.meta}</span>`, "notifs text");
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
  return body;
}

/** T01 · the Team's Insight: house · avatar · "Good morning, …", the period card with "vs Sep", the rust 2 × 2 hero, Team
 * performance as a list (a team opens to its people as before). The Comparison card shows once a period is picked. */
function teamInsight(body) {
  const H = '<div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px", padding: "0 4px" }}>';
  body = swap(body, H, "div", s => {
    const bell = s.includes("{!!(v.bellIn)") ? s.slice(s.indexOf("{!!(v.bellIn) && (<>"), s.indexOf("{!!(v.houseOv)")) : "";
    return `<div style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px" }}>{!!(v.houseOv) && (<span onClick={v.exitCrm} title="Back to Revenue app" aria-label="Back to Revenue app" style={{ ${ROUND} }}><Ic name="house" size={18} /></span>)}<span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "var(--crm-ink)", color: "#fff", display: "grid", placeItems: "center", fontFamily: "${TIGHT}", fontSize: "${F(15)}", fontWeight: "500" }}>{v.ov.meIni}</span><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}><h1 style={{ margin: "0", fontFamily: "${TIGHT}", fontSize: "${F(22)}", fontWeight: "500", letterSpacing: "-0.02em", lineHeight: "1.2", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ov.greet}</h1><span style={{ fontSize: "${F(13)}", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ov.meTitle} · {v.accessLbl}</span></span>${bell}</div>`;
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
    `<div onClick={t.toggle} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px 0", cursor: t.cur }}><span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}><span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: t.c }} /><strong style={{ flex: "none", fontSize: "${F(17)}", fontWeight: "500" }}>{t.name}</strong><span style={{ flex: "1", minWidth: "0", fontSize: "${F(14)}", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.who}</span>{!!(t.canOpen) && (<span style={{ display: "flex", color: "var(--crm-faint)", transform: \`rotate(\${t.rot})\`, transition: "transform 150ms" }}><Ic name="chevron-right" size={16} /></span>)}</span><span style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", paddingLeft: "20px", fontSize: "${F(14)}", color: "var(--crm-muted)" }}><span>Leads <b style={{ fontWeight: "500", color: "var(--crm-ink)" }}>{t.leads}</b></span><span>Appt <b style={{ fontWeight: "500", color: "var(--crm-ink)" }}>{t.appt}</b></span><span>Show <b style={{ fontWeight: "500", color: "var(--crm-ink)" }}>{t.show}</b></span></span></div>`, "team row");
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
  b = swap(b, '<span onClick={v.tm.swap}', "span", `<span onClick={v.tm.swap} title={v.tm.title} aria-label={v.tm.title} style={{ flex: "none", height: "40px", padding: "0 14px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px", boxSizing: "border-box", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", fontSize: "${F(13)}", fontWeight: "500", cursor: "pointer" }}><Ic name="users" size={15} />{v.tm.label}</span>`, "team tm");
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
  b = once(b, '<strong style={{ flex: "1", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)" }}>{g.title}</strong>', `<strong style={{ fontSize: "${F(16)}", fontWeight: "500", color: g.hot ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>{g.title}</strong>`, "team column title");
  b = once(b, '<small style={{ minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#fff", color: g.c, display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700" }}>{g.n}</small>',
    `<small style={{ flex: "1", fontSize: "${F(16)}", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{g.n}</small>`, "team column count");
  b = once(b, 'display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "14px", background: "#fff", boxShadow: "0 1px 3px rgba(42,22,12,.06)", cursor: "pointer" }}>',
    'display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", cursor: "pointer" }}>', "team card");
  b = once(b, '<span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "50%", background: r.ownBg, display: "grid", placeItems: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700" }}>{r.ini}</span>',
    `<span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "50%", background: r.avBg, color: r.avFg, display: "grid", placeItems: "center", fontFamily: "${TIGHT}", fontSize: "${F(13)}", fontWeight: "500" }}>{r.ini}</span>`, "team card avatar");
  b = once(b, '<strong style={{ flex: "1", minWidth: "0", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>',
    `<strong style={{ flex: "1", minWidth: "0", fontSize: "${F(16)}", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>`, "team card name");
  b = once(b, 'color: "var(--crm-muted)", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{r.preview}</span>',
    'color: "var(--crm-ink-soft)", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{r.preview}</span>', "team card preview");
  b = once(b, '<span style={{ fontSize: "calc(13px * var(--rv-type, 1))", lineHeight: "18px", maxHeight: "36px",', '<span style={{ fontSize: "' + F(15) + '", lineHeight: "20px", maxHeight: "40px",', "team card preview size");
  b = once(b, 'gap: "8px", paddingTop: "8px", borderTop: "1px solid var(--crm-rule-soft)", fontSize: "calc(12px * var(--rv-type, 1))", lineHeight: "16px" }}>',
    `gap: "8px", fontSize: "${F(14)}", lineHeight: "18px" }}>`, "team card foot");
  b = once(b, 'display: "flex", alignItems: "center", gap: "6px", fontWeight: "600", color: "var(--crm-ink)" }}>', 'display: "flex", alignItems: "center", gap: "8px", fontWeight: "400", color: r.toAssign ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>', "team card owner");
  b = once(b, '<span style={{ flex: "none", fontWeight: "700", color: r.uc, whiteSpace: "nowrap" }}>{r.state}</span>', '<span style={{ flex: "none", fontWeight: "400", color: r.uc, whiteSpace: "nowrap" }}>{r.state}</span>', "team card state");
  return body.slice(0, at) + b + body.slice(end);
}

/** gen-panel-1011.cjs: the whole Control panel. */
function panel(body) {
  // Change list 16 · the bottom bar (T01).
  body = swap(body, '<nav style={{ flex: "none", display: v.navOn ? "flex" : "none", alignItems: "flex-end", height: "62px"', "nav", "<Phone4aBar items={v.nv.nav} hidden={!v.navOn} />", "panel bottom bar");
  body = panelChat(body);
  body = teamInsight(body);
  body = teamInbox(body);
  body = profile(body, 5);
  return body;
}

/** The import lines a screen needs for the 4a parts it mounts. */
function IMPORT(body, from) {
  const names = [...new Set([...body.matchAll(/<(Phone4a\w*)/g)].map(m => m[1]))].sort();
  return (names.length ? `import { ${names.join(", ")} } from "${from}";\n` : "") + (/<Ic[\s/]/.test(body) ? `import { Ic } from "${from.replace(/phone4a$/, "icons4a")}";\n` : "");
}
module.exports = { sales, panel, IMPORT, once, every, swap, F };
