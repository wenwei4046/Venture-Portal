// Both Profiles look like the Revenue app's Profile — Mine's (2026-10-16, the owner, with the two Profiles side by side: "我要
// mine profile 跟着 profile") and then the Team side's, the Control panel's (the same day: "can change"). profile-type.cjs gave
// each main page the app Profile's sizes; this gives it the rest of the app Profile's look
// (components/member/app/profile/profile.module.css — crm/profile-like-app.test.ts reads the values there):
//   · the peach glow behind the card (--rv-profile-glow over 150 px, edge to edge) and the card 56 px down it, white, radius
//     22, the app's shadow, padded 18 18 14 with 14 between its parts — the prototypes drew the glow inside a bordered card;
//   · a 56 px avatar (64), and the app's display face (Inter Tight, --font-display-rv) on the avatar, the name and Your
//     workspace — the CRM draws everything else in Inter, as the app does;
//   · the facts' box at radius 14, each fact padded 10 14, the values at 650; Your workspace 24 px under the card at 650;
//   · the rows' icons 22 / 1.8, labels at 650, ruled edge to edge in --rv-rule (Mine: an inset #EBDDD2 line; Team: a
//     #EBDDD2 line under every row but the last), the app's 16 px chevron, the count as the app's (10.9 px on the accent,
//     1 px 7 px);
//   · the dark banner (Mine's View my team, Team's View as a team member) as the app's View as entry: 14 padding, radius
//     18, the 40 px icon tile, 650, Mine's 12.5 line in --rv-blush (Mine's is hidden today — vm/profile.ts › hasTeam is
//     false since Team | Mine — but drawn as the app's if it comes back).
// The CRM's own content stays (Mine's three rows have no line under them; Team's banner has no line under its words; the
// app card's Commission scheme / My brand weeks row is the app's own). Applied after profile-type.cjs and before
// type-scale.cjs, so it reads the prototypes' px as profile-type left them. The status-bar strip above the glow, and the
// page white under it on the Team side too, are crm.module.css's (data-prof-glow).
//   profileLikeApp(body, marker) — Mine's (gen-sales.cjs) — and profileLikeApp.team(body, marker) — the Control panel's
//   (gen-panel-1011.cjs): `body` with the region that opens at `marker` so restyled; every swap must match as many times as
//   it says, or the generator stops.
const { region } = require("./profile-type.cjs");

const DISPLAY = 'fontFamily: "var(--font-display-rv)", ';
const GLOW = "linear-gradient(180deg, #F6B48A 0%, #FFD9BC 70%, #FFFFFF 100%)";
// the glow, edge to edge (each main pads 14 20), and the app's card on it
const BAND = '<div data-prof-glow="1" style={{ margin: "-14px -20px 0", padding: "56px 20px 0", background: "' + GLOW + ' top / 100% 150px no-repeat" }}>';
const CARD = 'borderRadius: "22px", background: "#fff", boxShadow: "0 6px 24px rgba(63,43,34,.10)", padding: "18px 18px 14px", display: "flex", flexDirection: "column", gap: "14px"';
// a row's chevron as the app's (icons.tsx › chevronRight at 16 / 1.8 in --rv-sub)
const ROW_CHEVRON = '<svg style={{ flex: "none", color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">';
const ROW_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">';
// the banner's chevron as the app's View as entry's (16 / 1.9 in --rv-blush)
const BANNER_CHEVRON_FROM = '<svg style={{ flex: "none", color: "#D9C7BA" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">';
const BANNER_CHEVRON = '<svg style={{ flex: "none", color: "#F0DDCE" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">';
const TILE_FROM = '<span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "14px", background: "rgba(255,255,255,.12)", color: "#F6B48A", display: "grid", placeItems: "center" }}>';
const TILE = '<span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: "rgba(255,255,255,.12)", color: "#F6B48A", display: "grid", placeItems: "center" }}>';
const COUNT = (v) => '<span style={{ flex: "none", marginRight: "-4px", padding: "1px 7px", borderRadius: "9px", background: "#BD4A19", color: "#fff", fontSize: "10.9px", fontWeight: "700" }}>{' + v + '}</span>';
const label650 = (l) => [`<strong style={{ fontSize: "16px", fontWeight: "700" }}>${l}</strong>`, `<strong style={{ fontSize: "16px", fontWeight: "650" }}>${l}</strong>`];

const SWAPS = [
  // the glow behind the card, edge to edge (main pads 14 20), and the card on it
  ['<div style={{ borderRadius: "24px", background: "linear-gradient(180deg, #F9D9BF 0, #fff 96px)", border: "1px solid #EBDDD2", boxShadow: "0 6px 20px rgba(63,43,34,.06)", padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: "16px" }}>',
    BAND + '\n        <div style={{ ' + CARD + ' }}>'],
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
  [TILE_FROM, TILE],
  ['<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">',
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">'],
  label650("View my team"),
  ['<span style={{ fontSize: "13px", color: "#D9C7BA" }}>{v.teamSub}</span>', '<span style={{ fontSize: "12.5px", color: "#F0DDCE" }}>{v.teamSub}</span>'],
  [BANNER_CHEVRON_FROM, BANNER_CHEVRON],
  // Your workspace: 24 px under the card (main's 16 + 8), its title in the display face at 650, 6 px over the rows
  ['<div style={{ display: "flex", flexDirection: "column" }}>', '<div style={{ display: "flex", flexDirection: "column", marginTop: "8px" }}>'],
  ['<h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: "700", letterSpacing: "-.02em" }}>Your workspace</h2>',
    '<h2 style={{ margin: "0 0 6px", ' + DISPLAY + 'fontSize: "18px", fontWeight: "650", letterSpacing: "-.02em" }}>Your workspace</h2>'],
  // …its rows
  ['<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">', ROW_ICON, 3],
  label650("Notifications"),
  label650("Auto-reply"),
  label650("Quick replies"),
  ['<span style={{ flex: "none", minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700" }}>{v.notifBadge}</span>',
    COUNT("v.notifBadge")],
  ['<svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">', ROW_CHEVRON, 3],
  // the app's chevron (icons.tsx › chevronRight), on the banner and the three rows
  ['<path d="m9 6 6 6-6 6">', '<path d="m9 5 7 7-7 7">', 4],
  ['<div style={{ height: "1px", background: "#EBDDD2", marginLeft: "66px" }}>', '<div style={{ height: "1px", background: "#F1E7DF" }}>', 2],
];

// The Control panel's Profile (Team side): the same look on its own markup — the card keeps `relative` for the bell's corner
// (the bell sits on the Inbox since 2026-10-16, so it is not drawn here), its rows are ruled by their own border.
const TEAM = [
  ['<div style={{ position: "relative", borderRadius: "24px", background: "linear-gradient(180deg, #F9D9BF 0, #fff 96px)", border: "1px solid #EBDDD2", padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: "16px" }}>',
    BAND + '\n          <div style={{ position: "relative", ' + CARD + ' }}>'],
  ["          </div>\n          {!!(v.pf.isFull) && (<>", "          </div>\n          </div>\n          {!!(v.pf.isFull) && (<>"],
  // who
  ['<span style={{ flex: "none", width: "64px", height: "64px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "18px", fontWeight: "650" }}>{v.pf.meIni}</span>',
    '<span style={{ flex: "none", width: "56px", height: "56px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", ' + DISPLAY + 'fontSize: "18px", fontWeight: "650" }}>{v.pf.meIni}</span>'],
  ['<div style={{ minWidth: "0" }}>', '<div style={{ flex: "1", minWidth: "0" }}>'],
  ['<h1 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.pf.meName}</h1>',
    '<h1 style={{ margin: "0", ' + DISPLAY + 'fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.pf.meName}</h1>'],
  // the facts (Title, Access)
  ['<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #EBDDD2", borderRadius: "16px", background: "#fff" }}>',
    '<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>'],
  ['padding: "12px 14px", display: "flex", flexDirection: "column", gap: "2px"', 'padding: "10px 14px", display: "flex", flexDirection: "column", gap: "2px"', 2],
  ['<strong style={{ fontSize: "15px", fontWeight: "700" }}>{v.pf.meTitle}</strong>', '<strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.pf.meTitle}</strong>'],
  ['<strong style={{ fontSize: "15px", fontWeight: "700" }}>{v.pf.meAccess}</strong>', '<strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.pf.meAccess}</strong>'],
  // View as a team member, as the app's View as entry (the app's own words; its line under them stays the app's)
  ['<div onClick={v.pf.openViewAs} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "22px", background: "#3F2B22", color: "#fff", cursor: "pointer" }}>',
    '<div onClick={v.pf.openViewAs} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", borderRadius: "18px", background: "#3F2B22", color: "#fff", cursor: "pointer" }}>'],
  // its icon 20 in the 40 px tile (the rows' icons draw the same 24 / 1.8 svg, so the tile is matched with it)
  [TILE_FROM + '\n                <svg width="24" height="24"', TILE + '\n                <svg width="20" height="20"'],
  label650("View as a team member"),
  [BANNER_CHEVRON_FROM, BANNER_CHEVRON],
  // Your workspace: 24 px under the card (main's 16 + 8), its title in the display face at 650, 6 px over the rows
  ['<div style={{ display: "flex", flexDirection: "column" }}>', '<div style={{ display: "flex", flexDirection: "column", marginTop: "8px" }}>'],
  ['<h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: "700", letterSpacing: "-.02em" }}>Your workspace</h2>',
    '<h2 style={{ margin: "0 0 6px", ' + DISPLAY + 'fontSize: "18px", fontWeight: "650", letterSpacing: "-.02em" }}>Your workspace</h2>'],
  // …its rows: Notifications, then (CRM · Manage) Member work type, Showrooms, Cold lead templates, Ads Performance
  ['<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">', ROW_ICON, 2],
  ['<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">', ROW_ICON, 3],
  ...["Notifications", "Member work type", "Showrooms", "Cold lead templates", "Ads Performance"].map(label650),
  ['<span style={{ flex: "none", minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700" }}>{v.pf.notifUnread}</span>',
    COUNT("v.pf.notifUnread")],
  ['<svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">', ROW_CHEVRON],
  ['<svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">', ROW_CHEVRON, 4],
  ['<path d="m9 6 6 6-6 6">', '<path d="m9 5 7 7-7 7">', 6],
  // a line BETWEEN two rows in --rv-rule, as the app's (none under the last): Notifications alone — a leader's Team side,
  // without CRM · Manage — has none, so each row after it carries the line on its top
  ['padding: "14px 0", borderBottom: "1px solid #EBDDD2", cursor: "pointer"', 'padding: "14px 0", cursor: "pointer"'],
  ['cursor: "pointer", borderBottom: "1px solid #EBDDD2" }}>', 'cursor: "pointer", borderTop: "1px solid #F1E7DF" }}>', 3],
  ['<div onClick={v.pf.openAdsPerf} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer" }}>',
    '<div onClick={v.pf.openAdsPerf} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer", borderTop: "1px solid #F1E7DF" }}>'],
];

function restyle(body, marker, swaps, side) {
  const [a, b] = region(body, marker);
  let s = body.slice(a, b);
  for (const [from, to, times = 1] of swaps) {
    const n = s.split(from).length - 1;
    if (n !== times) throw new Error(`profile-like-app (${side}): expected ${times}, found ${n}: ${from.slice(0, 90)}`);
    s = s.split(from).join(to);
  }
  return body.slice(0, a) + s + body.slice(b);
}

module.exports = function profileLikeApp(body, marker) { return restyle(body, marker, SWAPS, "Mine"); };
module.exports.team = function profileLikeAppTeam(body, marker) { return restyle(body, marker, TEAM, "Team"); };
module.exports.GLOW = GLOW;
