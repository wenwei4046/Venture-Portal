/**
 * Team | Mine as one round button beside the house (2026-10-14, the owner's design "Team · Mine toggle — 1a Single swap
 * circle"; the markup is tools/crm-design/team-mine-swap.cjs). Its icon is the side one is on — Team's two people (the
 * Control panel's own, as on its Contacts button), Mine's one — and a tap goes to the other side.
 */
export const TEAM_ICON = "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8";
export const MINE_ICON = "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z";

export type TeamMineSwap = { on: boolean; icon: string; title: string; swap: () => void };

/** The button on `side`; off (`on: false`) for whoever has no other side to go to. */
export function teamMineSwap(side: "team" | "mine", toOther: (() => void) | undefined): TeamMineSwap {
  const team = side === "team";
  return {
    on: !!toOther,
    icon: team ? TEAM_ICON : MINE_ICON,
    title: team ? "Team · switch to Mine" : "Mine · switch to Team",
    swap: () => toOther?.(),
  };
}
