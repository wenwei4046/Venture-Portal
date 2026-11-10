/**
 * Up next's face and the prototype's few colours globals.css has no token for. The owner asked for no NEW colour tokens
 * and for the design 100%: these are the prototype's own values, kept here in one place, none added to --crm-*.
 */
export const UN_TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
/** The rows' top rule in the lower lists (README: #F0EAE4). */
export const UN_RULE_2 = "#F0EAE4";
/** Phone lists' faint (README: #8A7466). */
export const UN_FAINT_PHONE = "#8A7466";
/** The espresso card's team line (README: #E8D9CE). */
export const UN_ESPRESSO_TEXT = "#E8D9CE";
/** The espresso card's Set by you chip (prototype: rgba(255,191,150,.22) / #FFD9BF). */
export const UN_PIN_BG = "rgba(255,191,150,.22)";
export const UN_PIN_FG = "#FFD9BF";

/** v4 handoff (docs/design_handoff_crm_redesign_v4 README "Design tokens") — values the --crm-* set has no exact twin for. */
export const V4 = {
  /** Light on dark: the espresso card's and strip's words. */
  onDark: "#E0CFC4",
  /** The history icon on the espresso card. */
  histIcon: "#C29C88",
  /** A white 12% tile / button on espresso. */
  white12: "#FFFFFF1F",
  /** The live clock's dot, README Green. */
  green: "#2F7A4A",
  /** The segmented control's on shadow. */
  segShadow: "0 1px 2px #2A160C1F",
  /** Assignment's tab rule (13d/13e). */
  tabRule: "#E6DED7",
} as const;
