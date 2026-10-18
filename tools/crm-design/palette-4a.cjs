// The CRM's colours, 4a "Espresso & White" (2026-10-18, docs/design_handoff_crm_redesign — change list 1–8): every hex
// the CRM's screens write becomes one of the tokens in src/app/globals.css (`--crm-*`), so the palette lives in one place.
//   palette(code)  → the code with each #RRGGBB (and #RRGGBBAA) a `var(--crm-…)`; an unmapped colour stops the run.
// Run by every generator after its patches (which match the prototypes' own hex) and before type-scale.cjs; and once,
// by hand, over the hand-written view models and parts:
//   node tools/crm-design/palette-4a.cjs --apply <file…>
// The old palette (rev 1010 / 1011 / desktop v2) was warm cream with green, blue, purple and amber accents; 4a is
// espresso and white with orange accents, so each old colour goes to the 4a token that plays its part: inks to ink,
// hairlines to the rules, cream fills to white or the field, rust to rust, danger reds to oxblood, the old greens /
// blues / purples (statuses, teams, success) to the browns and tints the README gives those parts. Statuses, teams,
// avatars and channels are chosen by meaning in crm/shared/palette.ts, not here.
const T = n => `var(--crm-${n})`;

/** old hex (upper case) → token name */
const MAP = {
  // inks
  "3F2B22": "ink", "4E2F20": "ink", "5A3826": "ink", "5A3828": "ink", "3A2218": "deep", "2A1F1A": "deep", "2A211D": "deep", "3A302B": "deep", "201814": "deep",
  "6B574C": "ink-soft", "6B645A": "ink-soft", "806B60": "muted", "7A6457": "muted", "757575": "muted", "65676B": "muted", "525659": "muted", "54656F": "muted", "667781": "muted", "6B7B8C": "muted",
  "A08E82": "faint", "A8968B": "faint", "B5A398": "faint", "A57F68": "faint", "B4A396": "faint", "B9A89B": "faint", "B4AEA4": "faint",
  "C9B8AC": "faint-2", "C9B5A8": "faint-2", "C9B8AB": "faint-2", "C9B6A8": "faint-2", "C9B3A4": "faint-2", "C9BFB7": "faint-2", "CDBCAE": "faint-2", "D3C4B8": "faint-2", "D3C5BA": "faint-2",
  // lines
  "E2CFC1": "line", "D9C7BA": "line", "D9C6B8": "line", "D9C9BD": "line", "DCCBBF": "line", "D8C9BE": "line", "DCC6B6": "line", "DCCFC5": "line",
  "EBDDD2": "rule", "E2D6CC": "rule", "E2D5CB": "rule", "E3D6CC": "rule", "E8DBD0": "rule", "E9DCD2": "rule", "E6DDD5": "rule",
  "EFE3D9": "rule-soft", "F0E6DE": "rule-soft", "EFE4DA": "rule-soft", "EFE2D7": "rule-soft", "F0E4DA": "rule-soft", "F1E4DA": "rule-soft", "EEE6DF": "rule-soft",
  "EFE6DF": "rule-soft", "EFE5DC": "rule-soft", "ECE8E4": "rule-soft", "F2ECE6": "rule-soft", "F3EAE2": "rule-soft", "F3E9E1": "rule-soft", "F3E7DD": "rule-soft",
  // surfaces: the cream page is white now; tinted fills are the field; selection is cream; the folded rails the nav's cream
  "FBF7F3": "page", "FFFFFF": "page", "FFFBF7": "page", "FFFAF6": "page", "FDFAF7": "page", "FAF7F4": "page",
  "FBF6F2": "cream-nav",
  "F1E7DF": "field", "F5EBE3": "field", "F5EEE8": "field", "F5EEE9": "field", "F5F0EC": "field", "F7F3EF": "field", "F8F3EF": "field", "F7F0EA": "field",
  "F2EDE9": "field", "F2F0EB": "field", "F2F1EF": "field", "F0F2F5": "field",
  "FFF5EC": "cream", "FFF8F2": "cream", "FFF6EE": "cream", "FFF3E9": "cream", "FFF8F1": "cream", "FBF4EE": "cream", "FBF1EC": "cream", "EFE7DE": "cream",
  "FFF0E4": "tint-attention", "FFF1E6": "tint-attention", "FCE6D6": "tint-attention", "FFE5CF": "tint-attention", "FBE9DD": "tint-attention", "F9D5B8": "tint-attention",
  "FCD6B8": "tint-attention", "FFD9BC": "peach-soft", "F3D9C4": "tint-attention", "F0DDCE": "tint-attention", "F3DCC4": "tint-attention", "F6D9C4": "tint-attention", "E9D3C3": "tint-attention",
  // rust and the reds
  "BD4A19": "rust", "BE4A1A": "rust", "B9461A": "rust", "963A14": "rust-press",
  "A3371A": "oxblood", "B3261E": "oxblood", "C8402A": "oxblood", "C8452A": "oxblood", "B2452A": "oxblood", "C0392B": "oxblood", "D93025": "oxblood",
  "F8E1D8": "tint-attention", "FBE4DE": "tint-attention", "FBEAE6": "tint-attention", "FBE9E4": "tint-attention", "FBE7E2": "tint-attention", "FDF3EF": "tint-attention",
  "F0C9BC": "tint-attention", "F0CFC7": "tint-attention", "FFD3C7": "tint-attention", "F3D9CE": "tint-attention", "F3E4DE": "tint-attention", "F3B9A0": "rust-meta", "F2A08A": "rust-meta",
  // oranges and tans
  "C9785A": "orange", "DE6A30": "orange", "D9672F": "orange", "F08C52": "orange", "EE9A63": "orange",
  "F6B48A": "peach", "E9A27A": "st-won", "E9BFA0": "st-won", "E2B79C": "st-won", "D9A88A": "st-won", "D9B79F": "st-won", "C98F6E": "st-won", "C9A48C": "st-won", "D8B7AC": "st-won",
  // the old greens (success, Won, Appointment, the Director) → brown and its tint
  "387557": "brown", "2E6B4C": "brown", "2E6B4E": "brown", "1F7A4D": "brown", "3FA06B": "brown",
  "E8F3ED": "tint-follow", "E4F1E8": "tint-follow", "E4F1EA": "tint-follow", "D6E6DC": "tint-follow", "CFE3D6": "tint-follow", "EEF3EF": "tint-follow", "E6F0EA": "tint-follow",
  "D8E3DC": "tint-follow", "F2F8F4": "tint-follow", "EEF5F0": "tint-follow", "F4F9F5": "tint-follow", "E3F2EA": "tint-follow", "B5C4BA": "faint-2", "9FD1B4": "st-won",
  // the old blues (links, Won, Appointment, a team) → ink-soft, the cold leads' grey, the neutral tints
  "2F6FB5": "ink-soft", "2F5E8C": "ink-soft", "5B7FA6": "ink-soft", "3B8FD9": "ink-soft", "2F8FD8": "ink-soft",
  "3E5C7A": "muted", "3D5A75": "muted", "2E4760": "ink-soft", "4E6478": "muted",
  "E4EDF8": "tint-cold", "DCE6F2": "tint-cold", "EEF3F9": "tint-cold", "F4F8FC": "tint-cold", "E3EAF1": "tint-cold", "C9D6E6": "faint-2", "E3EEF9": "tint-cold", "E8EEF4": "tint-cold",
  "D9E2EA": "tint-cold", "B9CCE3": "faint-2", "9DB3CC": "faint-2", "8FB8E8": "faint-2",
  // the old ambers (Follow up, To mark) → brown and the appointment tint; bright ones → amber
  "A46312": "brown", "8A5A12": "brown", "C08A2A": "brown", "9C6B3E": "brown", "9A5A2E": "brown", "E0A93B": "amber", "E1B04F": "amber",
  "FFF0CC": "tint-appt", "FFF3D6": "tint-appt", "FDF1D8": "tint-appt", "FBF1D9": "tint-appt", "FBF1E3": "tint-appt", "F6D58A": "amber-line", "E9D49A": "amber-line",
  // the old purples (New, Share, a team) → ink and the New tint
  "8E4B6E": "ink-soft", "7A4FB0": "st-new", "C9A2D8": "faint-2", "F3E8EF": "tint-new", "EEDCE6": "tint-new", "FAF3F7": "tint-new", "F1EBF8": "tint-new",
  // what keeps its own colour
  "25D366": "whatsapp", "1877F2": "messenger", "0866FF": "messenger", "A6DBFF": "tick-read", "000000": "black", "050505": "black",
  "33CCFF": "brand-waze", "34A853": "brand-maps", "C13584": "brand-instagram",
};

/** A token's own hex (for the 8-digit, alpha forms: rgba of the token's value). */
const TOKEN_HEX = {
  ink: "422315", "ink-soft": "5A4034", muted: "7A6255", faint: "A8968B", "faint-2": "CDBFB5", line: "E2D8D0", rule: "EEE8E3", "rule-soft": "F4F0EC",
  page: "FFFFFF", field: "F7F3EF", cream: "FCEEE2", "cream-nav": "FBF4EC", rust: "BD4A19", oxblood: "8A1F0A", brown: "6F402C", deep: "2A160C", black: "000000",
};

function convert(hex, where) {
  const h = hex.toUpperCase();
  if (h.length === 6) {
    const t = MAP[h];
    if (!t) throw new Error(`palette-4a: no 4a token for #${h}${where ? " in " + where : ""}`);
    return T(t);
  }
  // #RRGGBBAA → the token's colour at that alpha (CSS can't add alpha to a var(); the value is the token's own).
  const t = MAP[h.slice(0, 6)], base = t && TOKEN_HEX[t];
  if (!base) throw new Error(`palette-4a: no 4a token for #${h}${where ? " in " + where : ""}`);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(base.slice(i, i + 2), 16)), a = +(parseInt(h.slice(6), 16) / 255).toFixed(3);
  return `rgba(${r},${g},${b},${a})`;
}

/** The old ink's rgba (shadows, scrims) → 4a's deep brown at the same alpha (the prototypes' shadow colour). */
const inkRgba = s => s.replace(/rgba\(\s*(?:63\s*,\s*43\s*,\s*34|40\s*,\s*25\s*,\s*18)\s*,/g, "rgba(42,22,12,");

/** A line marked `palette:keep` keeps its hex (a colour drawn on a canvas — the service worker's notice icon — needs it). */
function palette(code, where) {
  return code.split("\n").map(line => line.includes("palette:keep") ? line
    : inkRgba(line.replace(/#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6})(?![0-9A-Za-z])/g, (_, hex) => convert(hex, where)))).join("\n");
}

module.exports = palette;
module.exports.MAP = MAP;

if (require.main === module) {
  const fs = require("fs");
  const args = process.argv.slice(2);
  if (args[0] !== "--apply" || args.length < 2) { console.error("usage: node tools/crm-design/palette-4a.cjs --apply <file…>"); process.exit(1); }
  for (const f of args.slice(1)) {
    const before = fs.readFileSync(f, "utf8"), after = palette(before, f);
    if (after !== before) { fs.writeFileSync(f, after); console.log("palette", f); }
  }
}
