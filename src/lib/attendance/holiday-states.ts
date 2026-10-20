/**
 * The states Settings › Holidays names (2026-10-15: a holiday is 'All', 'All except Sarawak' or one of these, and a
 * location's `state` picks which of them cover its people — `engine.ts` › statesCover), and the one an address's state
 * stands for (2026-10-20, an address in six parts — `lib/address`): Pos Malaysia's list names Penang *Pulau Pinang* and
 * the three federal territories *W.P. Kuala Lumpur*, *W.P. Labuan*, *W.P. Putrajaya*, which share the holidays of
 * *Federal Territory*. Pure.
 */
export const HOLIDAY_STATES = [
  'Federal Territory', 'Selangor', 'Penang', 'Johor', 'Perak', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perlis', 'Terengganu', 'Sabah', 'Sarawak',
] as const

/** The holidays' state for an address's state from the list; null for one it does not stand for (abroad, or none). */
export function holidayStateOf(addressState: string): string | null {
  const s = addressState.trim()
  if (s === 'Pulau Pinang') return 'Penang'
  if (s.startsWith('W.P. ')) return 'Federal Territory'
  return (HOLIDAY_STATES as readonly string[]).includes(s) ? s : null
}
