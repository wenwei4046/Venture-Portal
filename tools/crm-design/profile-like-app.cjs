// Mine's Profile looks like the Revenue app's Profile (2026-10-16, the owner, with the two Profiles side by side: "我要mine
// profile 跟着 profile"). profile-type.cjs gave the main page the app Profile's sizes; this gives it the rest of the app
// Profile's look (components/member/app/profile/profile.module.css — crm/profile-like-app.test.ts reads the values there):
//   · the peach glow behind the card (--rv-profile-glow over 150 px, edge to edge) and the card 56 px down it, white, radius
//     22, the app's shadow, padded 18 18 14 with 14 between its parts — the prototype drew the glow inside a bordered card;
//   · a 56 px avatar (64), and the app's display face (Inter Tight, --font-display-rv) on the avatar, the name and Your
//     workspace — the CRM draws everything else in Inter, as the app does;
//   · the facts' box at radius 14, each fact padded 10 14, the values at 650; Your workspace 24 px under the card at 650;
//   · the rows' icons 22 / 1.8, labels at 650, ruled edge to edge in --rv-rule (an inset #EBDDD2 line), the app's 16 px
//     chevron, the count as the app's (10.9 px on the accent, 1 px 7 px);
//   · View my team as the app's View as entry: 14 padding, radius 18, the 40 px icon tile, 650, its 12.5 line in --rv-blush
//     (hidden today — vm/profile.ts › hasTeam is false since Team | Mine — but drawn as the app's if it comes back).
// The CRM's own content stays (its three rows have no line under them). Applied after profile-type.cjs and before
// type-scale.cjs, so it reads the prototype's px as profile-type left them. The status-bar strip above the glow is
// crm.module.css's (data-prof-glow).
//   profileLikeApp(body, marker): `body` with the region that opens at `marker` so restyled; every swap must match as
//   many times as it says, or the generator stops.
const { region } = require("./profile-type.cjs");

const DISPLAY = 'fontFamily: "var(--font-display-rv)", ';
const GLOW = "linear-gradient(180deg, #F6B48A 0%, #FFD9BC 70%, #FFFFFF 100%)";

const SWAPS = [
  // the glow behind the card, edge to edge (main pads 14 20), and the card on it
  ['<div style={{ borderRadius: "24px", background: "linear-gradient(180deg, #F9D9BF 0, #fff 96px)", border: "1px solid #EBDDD2", boxShadow: "0 6px 20px rgba(63,43,34,.06)", padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: "16px" }}>',
    '<div data-prof-glow="1" style={{ margin: "-14px -20px 0", padding: "56px 20px 0", background: "' + GLOW + ' top / 100% 150px no-repeat" }}>\n'
    + '        <div style={{ borderRadius: "22px", background: "#fff", boxShadow: "0 6px 24px rgba(63,43,34,.10)", padding: "18px 18px 14px", display: "flex", flexDirection: "column", gap: "14px" }}>'],
  ["        </div>\n        {!!(v.hasTeam) && (<>", "        </div>\n        </div>\n        {!!(v.hasTeam) && (<>"],
  // who: the avatar 56 in the display face; the name in the display face
  ['<span style={{ flex: "none", width: "64px", height: "64px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "18px", fontWeight: "650" }}>{v.meIniX}</span>',
    '<span style={{ flex: "none", width: "56px", height: "56px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", ' + DISPLAY + 'fontSize: "18px", fontWeight: "650" }}>{v.meIniX}</span>'],
  ['<div style={{ minWidth: "0" }}>', '<div style={{ flex: "1", minWidth: "0" }}>'],
  ['<h1 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.meNameX}</h1>',
    '<h1 style={{ margin: "0", ' + DISPLAY + 'fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.meNameX}</h1>'],
  // the facts
  ['<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #EBDDD2", borderRadius: "16px", background: "#fff" }}>',
    '<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>'],
  ['padding: "12px 14px", display: "flex", flexDirection: "column", gap: "2px"', 'padding: "10px 14px", display: "flex", flexDirection: "column", gap: "2px"', 2],
  ['<strong style={{ fontSize: "15px", fontWeight: "700", lineHeight: "1.25" }}>{v.meTitleX}</strong>', '<strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.meTitleX}</strong>'],
  ['<strong style={{ fontSize: "15px", fontWeight: "700" }}>{v.meRankX}</strong>', '<strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.meRankX}</strong>'],
  // View my team, as the app's View as entry
  ['<div onClick={v.openTeam} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "22px", background: "#3F2B22", color: "#fff", cursor: "pointer" }}>',
    '<div onClick={v.openTeam} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", borderRadius: "18px", background: "#3F2B22", color: "#fff", cursor: "pointer" }}>'],
  ['<span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "14px", background: "rgba(255,255,255,.12)", color: "#F6B48A", display: "grid", placeItems: "center" }}>',
    '<span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: "rgba(255,255,255,.12)", color: "#F6B48A", display: "grid", placeItems: "center" }}>'],
  ['<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">',
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">'],
  ['<strong style={{ fontSize: "16px", fontWeight: "700" }}>View my team</strong>', '<strong style={{ fontSize: "16px", fontWeight: "650" }}>View my team</strong>'],
  ['<span style={{ fontSize: "13px", color: "#D9C7BA" }}>{v.teamSub}</span>', '<span style={{ fontSize: "12.5px", color: "#F0DDCE" }}>{v.teamSub}</span>'],
  ['<svg style={{ flex: "none", color: "#D9C7BA" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">',
    '<svg style={{ flex: "none", color: "#F0DDCE" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">'],
  // Your workspace: 24 px under the card (main's 16 + 8), its title in the display face at 650, 6 px over the rows
  ['<div style={{ display: "flex", flexDirection: "column" }}>', '<div style={{ display: "flex", flexDirection: "column", marginTop: "8px" }}>'],
  ['<h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: "700", letterSpacing: "-.02em" }}>Your workspace</h2>',
    '<h2 style={{ margin: "0 0 6px", ' + DISPLAY + 'fontSize: "18px", fontWeight: "650", letterSpacing: "-.02em" }}>Your workspace</h2>'],
  // …its rows
  ['<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">',
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">', 3],
  ['<strong style={{ fontSize: "16px", fontWeight: "700" }}>Notifications</strong>', '<strong style={{ fontSize: "16px", fontWeight: "650" }}>Notifications</strong>'],
  ['<strong style={{ fontSize: "16px", fontWeight: "700" }}>Auto-reply</strong>', '<strong style={{ fontSize: "16px", fontWeight: "650" }}>Auto-reply</strong>'],
  ['<strong style={{ fontSize: "16px", fontWeight: "700" }}>Quick replies</strong>', '<strong style={{ fontSize: "16px", fontWeight: "650" }}>Quick replies</strong>'],
  ['<span style={{ flex: "none", minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700" }}>{v.notifBadge}</span>',
    '<span style={{ flex: "none", marginRight: "-4px", padding: "1px 7px", borderRadius: "9px", background: "#BD4A19", color: "#fff", fontSize: "10.9px", fontWeight: "700" }}>{v.notifBadge}</span>'],
  ['<svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">',
    '<svg style={{ flex: "none", color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">', 3],
  // the app's chevron (icons.tsx › chevronRight), on the banner and the three rows
  ['<path d="m9 6 6 6-6 6">', '<path d="m9 5 7 7-7 7">', 4],
  ['<div style={{ height: "1px", background: "#EBDDD2", marginLeft: "66px" }}>', '<div style={{ height: "1px", background: "#F1E7DF" }}>', 2],
];

module.exports = function profileLikeApp(body, marker) {
  const [a, b] = region(body, marker);
  let s = body.slice(a, b);
  for (const [from, to, times = 1] of SWAPS) {
    const n = s.split(from).length - 1;
    if (n !== times) throw new Error(`profile-like-app: expected ${times}, found ${n}: ${from.slice(0, 90)}`);
    s = s.split(from).join(to);
  }
  return body.slice(0, a) + s + body.slice(b);
};
module.exports.GLOW = GLOW;
