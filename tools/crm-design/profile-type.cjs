// Profile in the Revenue app's own sizes (2026-10-14, the owner, of the two Profiles side by side: "把 CRM 里面的字体大小改得
// 跟 Revenue Apps 一样"). The CRM's Profile page is the Revenue app's Profile — the card (avatar, name, the line under it,
// two facts), the View-as banner, Your workspace and its rows — drawn a step bigger by the CRM's prototypes. Within the page's
// own markup (its main page only — not the sheets and sub-pages after it) each size takes the Revenue app Profile's
// (components/member/app/profile/profile.module.css): name 24 → 20; avatar and Your workspace 20 → 18; a row and the banner
// 17 → 16; a fact's value 16 → 15; the line under the name 14 → 13; a label 13 → 12; a count 12 → 11. Applied to the
// prototype's px, before type-scale.cjs puts the phone's scale on every size.
//   profileType(body, marker): `body` with the region that opens at `marker` (`{!!(x) && (<>`, to its matching `</>)}`) so sized.
const STEP = { 24: 20, 20: 18, 17: 16, 16: 15, 14: 13, 13: 12, 12: 11 };

function region(body, marker) {
  const at = body.indexOf(marker);
  if (at < 0 || body.indexOf(marker, at + 1) >= 0) throw new Error("profile-type: the marker must be there exactly once: " + marker);
  const re = /&& \(<>|<\/>\)\}/g;
  re.lastIndex = at;
  let depth = 0, m;
  while ((m = re.exec(body))) {
    depth += m[0] === "</>)}" ? -1 : 1;
    if (!depth) return [at, m.index + m[0].length];
  }
  throw new Error("profile-type: unbalanced " + marker);
}

module.exports = function profileType(body, marker) {
  const [a, b] = region(body, marker);
  const sized = body.slice(a, b).replace(/fontSize: "(\d+)px"/g, (m, n) => (STEP[n] ? `fontSize: "${STEP[n]}px"` : m));
  return body.slice(0, a) + sized + body.slice(b);
};
module.exports.STEP = STEP;
module.exports.region = region;
