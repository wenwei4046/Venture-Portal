/**
 * Channels (CRM Desktop v2, README › 7): the design writes its sample facts as text — the token's renewal, a token's
 * last letters, the webhook's last event and address, the Page's name in the previews, the Ads month. Live, each is the
 * real one (vm/channels.ts); the token itself is never shown (it stays on the server). And the design's buttons Meta does
 * not let the CRM do through its API — Reconnect, Change picture / cover, the WhatsApp profile picture — open the right
 * place in Meta (README: "Where an API doesn't expose a value … show a View in Meta link").
 */
const onClick = (re, fn, why) => [re, (_m, a, b) => `${a} onClick={${fn}}${b}`, why];
module.exports = [
  [`>System user token · renews in 42 days</span>`, `>{v.chTokenLine}</span>`, "API access says whether the system user's token is set — never the token, never a made-up renewal."],
  [`>EAAG••••••••••••••••3fQ</span>`, `>{v.chTokenMask}</span>`, "The token's letters are not shown, not even the last three (the design's sample)."],
  [/(<span style=\{\{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: )"#387557"(, fontWeight: "650" \}\}><span style=\{\{ width: "7px", height: "7px", borderRadius: "50%", background: )"#387557"( \}\}>\s*)<\/span>Receiving · last event 2 min ago<\/span>/,
    "$1v.chHookC$2v.chHookC$3</span>{v.chHookLine}</span>", "Webhook: when the CRM last received anything from Meta (crm_channel_events); green only when it has."],
  [`>https://crm.houzs.my/api/meta/webhook</span>`, `>{v.chHookUrl}</span>`, "Webhook: this site's own addresses Meta sends to."],
  onClick(/(<button type="button")( style=\{\{[^\n]*?\}\}(?: className=\{DH\.h\d+\})?>Reconnect<\/button>)/, "v.chReconnect", "Reconnect opens Meta Business Suite's system user settings (the token is made there)."),
  onClick(/(<button type="button")( style=\{\{[^\n]*?\}\}(?: className=\{DH\.h\d+\})?>Change picture<\/button>)/, "v.chOpenPage", "Change picture opens the Page in Meta (a Page's pictures are not changed through the API)."),
  onClick(/(<button type="button")( style=\{\{[^\n]*?\}\}(?: className=\{DH\.h\d+\})?>Change cover<\/button>)/, "v.chOpenPage", "…and Change cover."),
  onClick(/(<button type="button")( style=\{\{[^\n]*?\}\}(?: className=\{DH\.h\d+\})?>Choose file<\/button>)/, "v.chOpenWaManager", "The WhatsApp profile picture is changed in WhatsApp Manager."),
  [/(<span style=\{\{ width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontWeight: "700", display: "grid", placeItems: "center" \}\}>)H<\/span>(\s*<strong style=\{\{ fontSize: "14px" \}\}>)HOUZS Venture<\/strong>/,
    "$1{v.chPageIni}</span>$2{v.chPageName}</strong>", "The Messenger preview names the Page being edited."],
  [/(<span style=\{\{ width: "72px", height: "72px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontSize: "22px", fontWeight: "700", display: "grid", placeItems: "center" \}\}>)H<\/span>/,
    "$1{v.waPic ? <img src={v.waPic} alt=\"\" style={{ width: \"100%\", height: \"100%\", borderRadius: \"50%\", objectFit: \"cover\" }} /> : v.waIni}</span>", "The WhatsApp profile preview shows the number's own profile picture (read from Meta, 2026-10-29), else the business name's letter."],
  [/(Cover photo · 1640 × 624<span style=\{\{[^\n]*?\}\}>)H<\/span>/, "$1{v.chPageIni}</span>", "The Page's picture placeholder is the Page's letter."],
  [/\{!!\(v\.chRo\) && \(<>(\s*<div style=\{\{ padding: "10px 14px", borderRadius: "10px", background: "#FBF6F2", fontSize: "13px", color: "#806B60" \}\}>)Only Principal and Director can change these\. You can look\.<\/div>/,
    "{!!(v.chNote) && (<>$1{v.chNote}</div>", "The read-only banner also says, in its own style, that Meta is being read or could not be (states the design did not draw)."],
  [`<span>SPEND · OCT</span>`, `<span>SPEND · {v.chMonth}</span>`, "The Ads tab's month is this month."],
];
