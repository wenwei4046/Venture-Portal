// The reply mark after our template in the phone chats' heads (2026-11-28, the owner: "同时能不能直接在聊天室做这个记号" —
// "打开的聊天室顶部"): Won · Appt · Replied · No reply (shared/reply-mark.tsx), under the line below the customer's name.
// Run LAST by gen-sales.cjs (SalesChat) and gen-panel-1011.cjs (PanelApp's chat), after phone-4a.cjs, which redraws the head:
// it matches the finished head's line, once, and stops the generator when that line moves.
//   replyMark.sales(name, body) → body · replyMark.panel(body) → body
function once(body, a, b, what) {
  const n = body.split(a).length - 1;
  if (n !== 1) throw new Error(`reply-mark: ${what}: the head's line matched ${n} times`);
  return body.replace(a, b);
}
const MARK = (expr, indent) => `\n${indent}{${expr} && <span style={{ display: "flex", marginTop: "3px" }}><ReplyMark m={${expr}} size={11} /></span>}`;

exports.sales = (name, body) => (name !== "SalesChat" ? body : once(body,
  '{[v.cl.ad, v.cl.chanName].filter(Boolean).join(" · ")}</span>',
  '{[v.cl.ad, v.cl.chanName].filter(Boolean).join(" · ")}</span>' + MARK("v.cl.reply", "          "), "SalesChat"));

exports.panel = body => once(body,
  "{v.ld.ld.sub}</small>",
  "{v.ld.ld.sub}</small>" + MARK("v.ld.ld.reply", "                "), "PanelApp");
