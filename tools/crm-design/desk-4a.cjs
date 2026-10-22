// The desktop CRM in 4a "Espresso & White" (2026-10-18, docs/design_handoff_crm_redesign; the owner: "跟 prototype 里面
// 的呈现方式 … 100% 一模一样"). Run by gen-desk.cjs after every other patch and after palette-4a.cjs, so it matches the
// tokens. Each change swaps a whole element of the v2 markup (found by the start of its opening tag, taken to its
// balanced close) for 4a's, keeping every binding the element had; each says which frame it follows.
//   desk4a(body) → body
function el(body, start, tag, what) {
  const at = body.indexOf(start);
  if (at < 0 || body.indexOf(start, at + 1) >= 0) throw new Error(`desk-4a: ${what}: start not found exactly once`);
  const re = new RegExp(`<(/?)${tag}(?=[\\s>])`, "g"); re.lastIndex = at;
  let depth = 0, m;
  while ((m = re.exec(body))) {
    // a self-closing tag of the same name does not open anything
    const close = body.indexOf(">", m.index);
    if (!m[1] && body[close - 1] === "/") continue;
    depth += m[1] ? -1 : 1;
    if (!depth) return [at, close + 1];
  }
  throw new Error(`desk-4a: ${what}: unbalanced`);
}
function swap(body, start, tag, to, what) {
  const [a, b] = el(body, start, tag, what);
  return body.slice(0, a) + (typeof to === "function" ? to(body.slice(a, b)) : to) + body.slice(b);
}
/** A JSX fragment `{!!(…) && (<> … </>)}` starting with `start`, taken to its own close, swapped for `to`. */
function fragSwap(body, start, to, what) {
  const at = body.indexOf(start);
  if (at < 0 || body.indexOf(start, at + 1) >= 0) throw new Error(`desk-4a: ${what}: start not found exactly once`);
  const re = /\(<>|<\/>\)/g; re.lastIndex = at;
  let depth = 0, m;
  while ((m = re.exec(body))) {
    depth += m[0] === "(<>" ? 1 : -1;
    if (!depth) { const end = body.indexOf("}", m.index) + 1; return body.slice(0, at) + to + body.slice(end); }
  }
  throw new Error(`desk-4a: ${what}: unbalanced`);
}
/** Every occurrence (at least one) — the same markup drawn in more than one place (the Inbox chat, the Awaiting chat). */
function every(body, from, to, what) {
  if (!body.includes(from)) throw new Error(`desk-4a: ${what}: not found`);
  return body.split(from).join(to);
}
function once(body, from, to, what) {
  const n = body.split(from).length - 1;
  if (n !== 1) throw new Error(`desk-4a: ${what}: matched ${n} times`);
  return body.replace(from, to);
}

module.exports = function desk4a(body) {
  // Frame 01–11 · the Revenue sidebar (216, ink) and the CRM nav (212, cream) in place of v2's one 240 px sidebar.
  body = swap(body, '<aside style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "240px"', "aside",
    "<Desk4aSide v={v} />", "sidebar");
  // The 56 px top bar (v2's was 60).
  body = swap(body, '<header style={{ position: "absolute", left: `${v.sbW}px`, right: "0", top: "0", height: "60px"', "header",
    "<Desk4aTop f4={v.f4} left={v.sbW} />", "top bar");
  body = once(body, '<div style={{ position: "absolute", left: `${v.sbW}px`, top: "60px", right: "0", bottom: "0", display: "flex", flexDirection: "column", background: "var(--crm-page)", fontSize: "14px" }}>',
    '<div style={{ position: "absolute", left: `${v.sbW}px`, top: "56px", right: "0", bottom: "0", display: "flex", flexDirection: "column", background: "var(--crm-page)", fontSize: "14px" }}>', "content top");
  // Each page's head: title 30, underline tabs, a muted line, CRM alerts, the page's primary button. v2's own head kept
  // the period switch (now the tabs) and the CRM alerts button (now the outline one).
  body = swap(body, '<div style={{ flex: "0 0 56px", height: "56px", boxSizing: "border-box", display: "flex", alignItems: "stretch"', "div",
    "<Desk4aHead f4={v.f4} />", "page head");
  // The pages' gutter: 36 px a side, the head above (frames 01–11; v2's 20 / 24) — Inbox's columns edge to edge under a rule.
  body = once(body, '<div style={{ flex: "1", minWidth: "0", boxSizing: "border-box", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px", overflow: "auto" }}>',
    '<div style={{ flex: "1", minWidth: "0", boxSizing: "border-box", padding: v.f4.pad, display: "flex", flexDirection: "column", gap: v.f4.gap, overflow: "auto" }}>', "page gutter");
  body = once(body, '<div style={{ flex: "1", minHeight: "0", position: "relative", display: "flex" }}>',
    '<div style={{ flex: "1", minHeight: "0", position: "relative", display: "flex", borderTop: v.f4.bodyTop }}>', "body rule");

  // Frame 02 · the Inbox's list column is 4a's (DeskInboxList4a); its Customer info and Chat progress columns become 4a's
  // Customer info and this chat's Audit log (DeskInboxSide4a, frames 02b / 02c).
  body = fragSwap(body, "{!!(v.kList) && (<>", "{!!(v.kList) && (<DeskInboxList4a v={v} />)}", "inbox list");
  {
    const at = body.indexOf("{!!(v.ibCols) && (<>\n            {!(v.ibInfoShut)");
    if (at < 0) throw new Error("desk-4a: inbox side");
    body = fragSwap(body, "{!!(v.ibCols) && (<>\n            {!(v.ibInfoShut)", "{!!(v.ibCols) && (<DeskInboxSide4a v={v} value={(x, h) => <InfoValue v={x} href={h} />} />)}", "inbox side");
  }

  // Frame 02 · the chat: a plain cream wall (no pattern), padded clear of the floating composer; the day as a small
  // uppercase label; bubbles 14 px round with a 4 px tail, the customer's white on a hairline, yours rust; the visit card
  // inside a rust bubble; the composer a white pill (emoji · words · attach · camera) beside the 50 px mic, floating.
  body = body.replace(/(<div style=\{\{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", )gap: "10px", padding: "10px 20px", backgroundColor: "var\(--crm-cream\)", backgroundImage: "url\('data:image\/svg\+xml[^"]*", backgroundSize: "[^"]*"/g,
    (_, a) => `${a}gap: "8px", padding: "20px 24px 104px", backgroundColor: "var(--crm-cream)"`);
  if (body.includes('padding: "10px 20px", backgroundColor: "var(--crm-cream)", backgroundImage')) throw new Error("desk-4a: chat wall");
  const DAY_OLD = '<span style={{ alignSelf: "center", margin: "4px 0 2px", padding: "5px 12px", borderRadius: "9px", background: "#fff", boxShadow: "rgba(42,22,12,.1) 0 1px 1px", color: "var(--crm-ink)", fontSize: "12px", fontWeight: "600" }}>';
  const DAY_NEW = '<span style={{ alignSelf: "center", padding: "0 0 6px", font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>';
  if (body.split(DAY_OLD).length - 1 < 2) throw new Error("desk-4a: day labels");
  body = body.split(DAY_OLD).join(DAY_NEW);
  body = every(body, 'borderRadius: "16px 16px 16px 4px", boxShadow: "rgba(42,22,12,.1) 0 1px 1px", background: "#fff", color: "var(--crm-ink)" }}>',
    'borderRadius: "14px 14px 14px 4px", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)" }}>', "customer bubble");
  body = every(body, 'borderRadius: "16px 16px 4px 16px", boxShadow: "rgba(42,22,12,.1) 0 1px 1px", background: m.outBg ?? "var(--crm-tint-attention)", color: m.outFg ?? "var(--crm-ink)" }}>',
    'borderRadius: "14px 14px 4px 14px", border: `1px solid ${m.outBg ?? "var(--crm-tint-attention)"}`, background: m.outBg ?? "var(--crm-tint-attention)", color: m.outFg ?? "var(--crm-ink)" }}>', "own bubble");
  body = swap(body, '<div data-msg={m.id} onClick={m.appt.go} style={{ cursor: "pointer", alignSelf: "flex-end", width: "300px"', "div",
    `<div data-msg={m.id} onClick={m.appt.go} style={{ cursor: "pointer", alignSelf: "flex-end", maxWidth: "78%", padding: "10px 14px 8px", boxSizing: "border-box", borderRadius: "14px 14px 4px 14px", background: "var(--crm-rust)", border: "1px solid var(--crm-rust)", color: "#fff", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "2px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", font: "500 10px Inter, sans-serif", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--crm-rust-meta)" }}>Showroom visit · {m.appt.kind}</div>
                          <div style={{ font: "500 16px var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontVariantNumeric: "tabular-nums", textDecoration: m.appt.deco }}>{m.appt.dow} {m.appt.day} {m.appt.mon} · {m.appt.time}</div>
                          <div style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-delta-good)" }}>{m.appt.place}</div>
                        </div>
                        <span style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "4px", font: "400 11px Inter, sans-serif", color: "var(--crm-rust-meta)" }}>{m.appt.sent}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={m.tick} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12.5 6.5 17 15 7.5M10 15.5l1.5 1.5L20 7.5"></path></svg></span>
                      </div>`, "visit card");
  // The composer floats over the wall: the reply bar sits just above it, the pill and the mic 22 px from the foot.
  body = once(body, '<div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px", background: "#fff", borderTop: "1px solid var(--crm-rule)" }}>\n                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px", paddingLeft: "10px", borderLeft: "3px solid var(--crm-rust)" }}>',
    '<div style={{ position: "absolute", left: "24px", right: "24px", bottom: "82px", zIndex: "3", display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "#fff", border: "1px solid var(--crm-line)", borderRadius: "12px", boxShadow: "0 6px 20px rgba(42,22,12,.08)" }}>\n                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px", paddingLeft: "10px", borderLeft: "3px solid var(--crm-rust)" }}>', "reply bar");
  body = swap(body, '<div style={{ flex: "0 0 auto", background: "#fff", padding: "12px 16px", borderTop: "1px solid var(--crm-rule)", display: "flex", alignItems: "center", gap: "6px" }}>\n                    <span style={{ position: "relative", flex: "0 0 auto" }}>', "div",
    `<div style={{ position: "absolute", left: "24px", right: "24px", bottom: "22px", zIndex: "3", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ flex: "1", minWidth: "0", height: "50px", borderRadius: "25px", display: "flex", alignItems: "center", gap: "16px", padding: "0 18px", boxSizing: "border-box", background: "#fff", border: "1px solid var(--crm-line)", boxShadow: "0 6px 20px rgba(42,22,12,.08)", color: "var(--crm-muted)" }}>
                      <span title="Emoji" onClick={v.emojiToggle} style={{ position: "relative", flex: "0 0 auto", display: "grid", placeItems: "center", color: v.emojiFg, cursor: "pointer" }}>
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" x2="9.01" y1="9" y2="9"></line><line x1="15" x2="15.01" y1="9" y2="9"></line></svg>{!!(v.emojiOpen) && (<DeskEmoji v={v.emoji} />)}
                      </span>
                      <input data-draft="1" value={v.draft} onChange={v.setDraft} onKeyDown={v.draftKey} placeholder="Message" aria-label={v.chatReply} style={{ flex: "1", minWidth: "0", font: "400 14px Inter, sans-serif", color: "var(--crm-ink)", border: "0", outline: "none", background: "transparent", padding: "0", margin: "0" }} />
                      <span style={{ position: "relative", flex: "0 0 auto", display: "grid", placeItems: "center" }}>
                        <span title="Attach" onClick={v.attachToggle} style={{ display: "grid", placeItems: "center", cursor: "pointer" }}>
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        </span>
                        {!!(v.attachOpen) && (<>
                          <div onClick={v.attachClose} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                          </div>
                          <div style={{ position: "absolute", bottom: "40px", right: "-40px", zIndex: "8", width: "220px", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column" }}>
                            {(v.attachOpts).map((o, o_i) => (<Fragment key={o_i}>
                              {!!(o.sep) && (<span style={{ height: "1px", margin: "4px 10px", background: "var(--crm-rule-soft)" }}></span>)}
                              <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", height: "38px", padding: "0 10px", border: "0", borderRadius: "7px", background: "transparent", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className="crm4a-row"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={o.d}></path></svg>{o.label}</button>
                            </Fragment>))}
                          </div>
                        </>)}
                      </span>
                      <span title="Send a photo" onClick={v.photo} style={{ flex: "0 0 auto", display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
                      </span>
                    </div>
                    <span title={v.sendTitle} onClick={v.send} style={{ flex: "0 0 auto", width: "50px", height: "50px", borderRadius: "50%", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 6px 20px rgba(42,22,12,.15)" }} className="crm4a-primary">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={v.micD}></path></svg>
                    </span>
                  </div>`, "composer");

  // Frame 02 · the chat's head: 62 px, the avatar in its tint, the name, ad · channel, the wait in oxblood, ⋮ — and no
  // close (×) while the chat sits in Inbox's columns (the list picks another; other panes keep theirs).
  body = once(body, '<div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 16px", background: "#fff", borderBottom: "1px solid var(--crm-rule)" }}>',
    '<div style={{ flex: "0 0 62px", height: "62px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "12px", padding: "0 22px", background: "#fff", borderBottom: "1px solid var(--crm-rule)" }}>', "pane head");
  body = once(body, '<span style={{ flex: "0 0 auto", width: "34px", height: "34px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700", background: "var(--crm-tint-cold)", color: "var(--crm-ink)" }}>{v.ph.avatar}</span>',
    '<span style={{ flex: "0 0 auto", width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", font: "500 12px var(--font-display-rv), \'Inter Tight\', Inter, sans-serif", background: v.ph.avBg ?? "var(--crm-cream)", color: v.ph.avFg ?? "var(--crm-ink)" }}>{v.ph.avatar}</span>', "pane avatar");
  body = once(body, '<strong style={{ fontSize: "15px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ph.title}</strong>\n                    <span style={{ fontSize: "12.5px", color: v.ph.subColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ph.sub}</span>\n                  </span>',
    '<strong style={{ font: "500 15px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ph.title}</strong>\n                    <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ph.sub}</span>\n                  </span>\n                  {!!(v.ph.status) && (<span style={{ flex: "0 0 auto", font: "600 12px Inter, sans-serif", color: v.ph.statusColor, whiteSpace: "nowrap" }}>{v.ph.status}</span>)}', "pane title");
  {
    const start = '<button type="button" onClick={v.closePane} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "cente';
    const at = body.lastIndexOf(start); if (at < 0) throw new Error("desk-4a: pane close");
    const [a, b] = el(body.slice(at), start, "button", "pane close");
    body = body.slice(0, at) + `{!!(!v.ibCols || !v.kChat) && (${body.slice(at + a, at + b)})}` + body.slice(at + b);
  }
  body = once(body, '<button type="button" onClick={v.toggleMenu} title="More" style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid var(--crm-rule)"',
    '<button type="button" onClick={v.toggleMenu} title="More" style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid var(--crm-line)"', "pane menu");

  // Frame 03 · Contacts: 4a's search, filters and table (DeskContacts4a); the rail is 4a's (DeskRail4a) — Breakdown,
  // the page's figures under it, the customer picked — and the Calendar's rail the same component (frame 04).
  body = fragSwap(body, "{!!(v.kPeople) && (<>", "{!!(v.kPeople) && (<DeskContacts4a v={v} pager={<DeskPager v={v.ppPager} />} />)}", "contacts");
  body = once(body, "{!!(v.railOn) && (<DeskRail v={v.rail} />)}", "{!!(v.railOn) && (<DeskRail4a v={v.rail} extra={v.kPeople ? <DeskContactFigures4a v={v.ppStats} /> : <DeskCalFigures4a v={v} />} />)}", "rail");

  // Frame 04 · Calendar: 4a's toolbar and views (DeskCalendar4a) — the week a time grid, visits Came / Booked / No-show.
  body = fragSwap(body, "{!!(v.kCal) && (<>", "{!!(v.kCal) && (<DeskCalendar4a v={v} />)}", "calendar");

  // Frame 05 · Ads Performance: the head carries the period (tabs) and Download PDF; under it production's own controls
  // in 4a's outline (which ads, the range with its date picker and compare, Export) and the info line; the table is
  // 4a's (DeskAdsTable4a) with + for the columns (Customise metrics).
  {
    const k = body.indexOf("{!!(v.kAdsPerf) && (<>");
    if (k < 0) throw new Error("desk-4a: ads");
    const tbStart = '<div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>';
    const t0 = body.indexOf(tbStart, k);
    const [ta, tb] = el(body.slice(t0), tbStart, "div", "ads toolbar");
    const toolbar = body.slice(t0 + ta, t0 + tb);
    const d0 = toolbar.indexOf("{!!(v.dp.open) && (<>");
    let depth = 0, d1 = -1; const re = /\(<>|<\/>\)/g; re.lastIndex = d0;
    for (let m; (m = re.exec(toolbar));) { depth += m[0] === "(<>" ? 1 : -1; if (!depth) { d1 = toolbar.indexOf("}", m.index) + 1; break; } }
    if (d0 < 0 || d1 < 0) throw new Error("desk-4a: ads date picker");
    const dp = toolbar.slice(d0, d1);
    const OUT = 'display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 12px", boxSizing: "border-box", borderRadius: "7px", border: "1px solid var(--crm-line)", background: "transparent", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap"';
    const POP = 'position: "absolute", top: "42px", zIndex: "8", minWidth: "200px", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column"';
    const tb4 = `<div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.apStToggle} style={{ ${OUT} }} className="crm4a-outline"><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.apStCur.dot }}></span>{v.apStCur.label}<span style={{ color: "var(--crm-faint)" }}>{v.apStCur.n}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>
                    {!!(v.apStOpen) && (<><div onClick={v.apStToggle} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}></div><div style={{ ${POP}, left: "0" }}>{(v.apStOpts).map((o, o_i) => (<button key={o_i} type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 10px", border: "0", borderRadius: "7px", background: o.bg, font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", cursor: "pointer", textAlign: "left" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: o.dot }}></span><span style={{ flex: "1" }}>{o.label}</span><span style={{ color: "var(--crm-faint)" }}>{o.n}</span></button>))}</div></>)}
                  </span>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.dpOpen} style={{ ${OUT} }} className="crm4a-outline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path></svg>{v.apRangeLabel}{!!(v.apCmpOn) && (<span style={{ color: "var(--crm-rust)" }}>{v.apCmpLabel}</span>)}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>
                    ${dp}
                  </span>
                  <span style={{ flex: "1" }}></span>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.apToggleDl} style={{ ${OUT} }} className="crm4a-outline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path></svg>Export<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>
                    {!!(v.apDlOpen) && (<><div onClick={v.apToggleDl} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}></div><div style={{ ${POP}, right: "0" }}>{(v.apDl).map((o, o_i) => (<button key={o_i} type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 10px", border: "0", borderRadius: "7px", background: "transparent", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", cursor: "pointer", textAlign: "left" }} className="crm4a-row"><span style={{ minWidth: "30px", height: "18px", padding: "0 5px", borderRadius: "4px", background: o.bg, color: o.fg, font: "600 10px Inter, sans-serif", display: "grid", placeItems: "center" }}>{o.tag}</span>{o.label}</button>))}</div></>)}
                  </span>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", font: "400 13px Inter, sans-serif", color: "var(--crm-ink-soft)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>Ad names, spend and every Meta figure come from Ads Manager for the dates picked; an ad it does not share shows —.</div>`;
    body = body.slice(0, t0 + ta) + tb4 + body.slice(t0 + tb);
    // the table
    const tStart = '<div style={{ flex: "0 0 auto", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "18px", overflowX: "auto" }}>\n                  <div style={{ minWidth: `${v.apMinW}px` }}>';
    body = swap(body, tStart, "div", "<DeskAdsTable4a v={v} />", "ads table");
  }

  // Frame 06 · Assignment: the section is the head's tab, so the sheet's own kicker and title go (its line stays); Ads to
  // teams is 4a's table (DeskAdList4a); the editor docked at its right has 4a's tabs (DeskAdTabs4a) — Split, Ad
  // performance, Audit log in its place, at its width (no strips) — the ad's name in an ink-ruled field with its
  // pencil and Meta's headline under it, and Save · Save and apply to all N ads at its foot.
  body = swap(body, '<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>\n                {!!(v.showKicker) && (<>', "div",
    '{!(v.adList) && !!(v.opSub) && (<span style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>{v.opSub}</span>)}', "sheet head");
  body = fragSwap(body, "{!!(v.adList) && (<>", "{!!(v.adList) && (<DeskAdList4a v={v} />)}", "ad list");
  // The owner, 2026-10-18 ("ads performance, audit log 分开"): Split, Ad performance and the Audit log are three panels,
  // the last two folding to their strips as the Inbox's Customer info and Audit log do — not tabs of one panel.
  body = swap(body, '<div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid var(--crm-rule)" }}>\n                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>\n                    {v.ad.canName', "div",
    `<DeskAdTabs4a v={v} which="split" />
                <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", padding: "20px 24px 4px" }}>
                  <span style={{ font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)" }}>Ad name</span>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", height: "42px", padding: "0 12px", boxSizing: "border-box", borderRadius: "7px", border: "1px solid var(--crm-ink)" }}>
                    {v.ad.canName ? (<input aria-label="Ad name" value={v.ad.nameDraft} onChange={v.ad.onName} onBlur={v.ad.saveName} onKeyDown={v.ad.nameKey} placeholder={v.ad.headline} maxLength={120} style={{ flex: "1", minWidth: "0", margin: "0", padding: "0", border: "0", background: "transparent", font: "500 15px var(--font-display-rv), 'Inter Tight', Inter, sans-serif", color: "var(--crm-ink)", outline: "none" }} />) : (<span style={{ flex: "1", font: "500 15px var(--font-display-rv), 'Inter Tight', Inter, sans-serif", color: "var(--crm-ink)" }}>{v.ad.name}</span>)}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5zM15 5l4 4"></path></svg>
                  </label>
                </div>`, "split head");
  body = swap(body, '<div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "12px", padding: "14px 20px", borderTop: "1px solid var(--crm-rule)" }}>\n                  <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--crm-ink)", cursor: "pointer" }}><input type="checkbox" checked={v.applyChk}', "div",
    `<div style={{ flex: "0 0 auto", display: "flex", gap: "10px", padding: "16px 24px", borderTop: "1px solid var(--crm-rule)" }}>
                  <button type="button" onClick={v.saveOne4} style={{ flex: "0 0 auto", height: "38px", padding: "0 18px", borderRadius: "7px", border: "0", background: "var(--crm-rust)", font: "500 13px Inter, sans-serif", color: "#fff", cursor: "pointer" }} className="crm4a-primary">Save</button>
                  <button type="button" onClick={v.saveAll4} style={{ flex: "1", height: "38px", borderRadius: "7px", border: "1px solid var(--crm-line)", background: "transparent", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", cursor: "pointer" }} className="crm4a-outline">{v.applyLabel}</button>
                </div>`, "split foot");
  // Ad performance and the Audit log: their own head becomes the tabs.
  {
    const p0 = body.indexOf("{!(v.perfShut) && (<><aside style={{ position: \"relative\", flex: `0 1 ${v.perfW}px`");
    const hs = '<div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--crm-rule)" }}>';
    const h0 = body.indexOf(hs, p0);
    if (p0 < 0 || h0 < 0) throw new Error("desk-4a: perf head");
    const [a, b] = el(body.slice(h0), hs, "div", "perf head");
    const head = body.slice(h0 + a, h0 + b);
    // keep its period picker (Ad performance's own range), under the tabs
    const pk0 = head.indexOf('<span style={{ position: "relative" }}>');
    const [pa, pb] = el(head.slice(pk0), '<span style={{ position: "relative" }}>', "span", "perf period");
    const picker = head.slice(pk0 + pa, pk0 + pb);
    body = body.slice(0, h0 + a) + `<DeskAdTabs4a v={v} which="perf" />\n                <div style={{ flex: "none", display: "flex", alignItems: "center", padding: "14px 24px 0" }}>${picker}</div>` + body.slice(h0 + b);
  }
  body = swap(body, '<div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 10px 0 16px", borderBottom: "1px solid var(--crm-rule)" }}>\n                    <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>\n                      <strong style={{ fontSize: "15px", fontWeight: "650" }}>Audit log</strong>\n                      <span style={{ fontSize: "12px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ad.name}</span>', "div",
    '<DeskAdTabs4a v={v} which="audit" />', "audit head");

  // The Audit log folded is a strip with its name, as Ad performance's beside it and the Inbox's (the owner, 2026-10-18: "可收缩式，像inbox一样").
  body = fragSwap(body, "{!!(v.adLogClosed) && (<>", "{!!(v.adLogClosed) && (<DeskFoldRail v={{ title: \"Audit log\", open: v.adLogToggle }} />)}", "audit strip");

  // Frame 07 · Showrooms: one at a time, always open to edit, the weekly slots as a grid (DeskShowrooms4a); Save in the head.
  body = fragSwap(body, "{!!(v.isSrOp) && (<>", "{!!(v.isSrOp) && (<DeskShowrooms4a v={v} />)}", "showrooms");

  // Frame 09 · Channels: Connections grouped by phone number with the message templates beside them (DeskChannels4a);
  // production's other tabs, its API access, webhook and permissions stay under it, in 4a's tabs and rules.
  {
    const k = body.indexOf("{!!(v.kCh) && (<>");
    body = body.slice(0, k) + body.slice(k).replace('<div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1100px" }}>', '<div style={{ display: "flex", flexDirection: "column", gap: "20px", paddingTop: "8px" }}>');
    const s0 = body.indexOf("{(v.chGroups).map((g, g_i) => (<Fragment key={g_i}>", k);
    if (s0 < 0) throw new Error("desk-4a: channel groups");
    const re = /<Fragment key=|<\/Fragment>\)\)\}/g; re.lastIndex = s0; let depth = 0, e0 = -1;
    for (let m; (m = re.exec(body));) { depth += m[0].startsWith("<Fragment") ? 1 : -1; if (!depth) { e0 = m.index + m[0].length; break; } }
    if (e0 < 0) throw new Error("desk-4a: channel groups end");
    body = body.slice(0, s0) + "<DeskChannels4a v={v} />" + body.slice(e0);
  }
  // Underline tabs in 4a's size (Channels and Audit log share the markup): 13 px, the active ink over a 2 px rust line.
  body = body.split('height: "42px", padding: "0 14px", marginBottom: "-1px", border: "0", borderBottom: "2px solid var(--crm-rust)", background: "transparent", font: "inherit", fontSize: "14').join('height: "36px", padding: "0 2px", margin: "0 10px -1px 0", border: "0", borderBottom: "2px solid var(--crm-rust)", background: "transparent", font: "inherit", fontSize: "13');
  body = body.split('height: "42px", padding: "0 14px", marginBottom: "-1px", border: "0", borderBottom: "2px solid transparent", background: "transparent", font: "inherit", fontSize: "14').join('height: "36px", padding: "0 2px", margin: "0 10px -1px 0", border: "0", borderBottom: "2px solid transparent", background: "transparent", font: "inherit", fontSize: "13');

  // Frame 01 · Insight: the hero, Team performance and Leads by status are 4a's (Desk4a.tsx › DeskInsight4a). The Ads
  // Performance part production keeps below them stays, under a 4a section head.
  {
    const start = '<div style={{ flex: "0 0 auto", position: "relative", padding: "26px 30px 0", borderRadius: "26px"';
    const end = '<div style={{ flex: "0 0 auto", display: "flex", alignItems: "baseline", gap: "10px", marginTop: "22px" }}>\n                  <strong style={{ flex: "1", fontSize: "22px", fontWeight: "700", letterSpacing: "-.01em" }}>Ads Performance</strong>';
    const a = body.indexOf(start), b = body.indexOf(end);
    if (a < 0 || b < a || body.indexOf(start, a + 1) >= 0) throw new Error("desk-4a: insight body");
    body = body.slice(0, a) + "<DeskInsight4a v={v} />\n                " + body.slice(b);
    body = once(body, '<strong style={{ flex: "1", fontSize: "22px", fontWeight: "700", letterSpacing: "-.01em" }}>Ads Performance</strong>',
      '<strong style={{ flex: "1", font: "500 18px var(--font-display-rv), \'Inter Tight\', Inter, sans-serif", color: "var(--crm-ink)" }}>Ads Performance</strong>', "insight ads head");
  }
  // Frame 10 · Settings: a General tab first, the frame's two-column groups (Desk4a.tsx › DeskSettings4a); Cold lead
  // templates and Notifications, production's, stay as the head's other two tabs.
  body = once(body, '{!!(v.isNtfOp) && (<>', '{!!(v.isGenOp) && (<DeskSettings4a v={v} />)}{!!(v.isNtfOp) && (<>', "settings general");
  // Frame 11 · Audit log: a search, three menus and the five-column table (Desk4a.tsx › DeskAudit4a). Production's three
  // tabs are the Area menu's areas; its stats band went into the head's count.
  {
    const start = '{!!(v.kAudit) && (<>', a = body.indexOf(start);
    const end = '{!!(v.kAdsPerf) && (<>', b = body.indexOf(end, a);
    if (a < 0 || b < a || body.indexOf(start, a + 1) >= 0) throw new Error("desk-4a: audit");
    body = body.slice(0, a) + "{!!(v.kAudit) && (<DeskAudit4a v={v} />)} " + body.slice(b);
  }
  // Frame 08 · Customer form: pages · sections and fields · live preview (Desk4a.tsx › DeskForm4a), on formpage.ts as before.
  {
    const start = '{!!(v.cfOn) && (<>', a = body.indexOf(start);
    const end = '{!!(v.isFrmOp) && (<>', b = body.indexOf(end, a);
    if (a < 0 || b < a || body.indexOf(start, a + 1) >= 0) throw new Error("desk-4a: customer form");
    body = body.slice(0, a) + "{!!(v.cfOn) && (<DeskForm4a v={v} preview={<DeskPhoneForm v={v.cfReal} scale={v.cfRealScale} />} />)} " + body.slice(b);
  }
  return body;
};
module.exports.el = el;
module.exports.swap = swap;
module.exports.once = once;
