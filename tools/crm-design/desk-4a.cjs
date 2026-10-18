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
    `<div data-msg={m.id} onClick={m.appt.go} style={{ cursor: "pointer", alignSelf: "flex-end", maxWidth: "78%", padding: "10px 14px 8px", boxSizing: "border-box", borderRadius: "14px 14px 4px 14px", background: "var(--crm-rust)", border: "1px solid var(--crm-rust)", color: "#FFFFFF", display: "flex", flexDirection: "column", gap: "4px" }}>
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
  return body;
};
module.exports.el = el;
module.exports.swap = swap;
module.exports.once = once;
