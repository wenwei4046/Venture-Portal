/**
 * Malaysia's postcodes (2026-10-20 — the user: "确保 city、state 还有 postcode 跟 Malaysia 的 database 是一样的 … 不是填的，
 * 应该都是选的"): every state, its cities and each city's postcodes, kept here as `malaysia-postcodes.json` (16 states,
 * 411 cities, 3,215 postcodes; one postcode serves two cities, and seven city names stand in two states). The city is
 * the place's own name, as the government's list (data.gov.my, MCMC — CC BY 4.0) has it — 11060 Paya Terubong, 11500
 * Air Itam — not its post office's (the user, the same evening: "我要的是 Standard 的地址，不是跟着 Post Malaysia 的邮政局命名");
 * the 285 postcodes only Pos Malaysia's list holds are kept under its town (scripts/build-malaysia-postcodes.mjs). An
 * address in Malaysia picks its state, then its city, then its postcode from it ("go with state, city, postcode") — and
 * the server checks the three belong together. Pure: the data is handed in, so a page loads it only when an address is
 * edited (`loadMalaysia`) and the server reads it at once.
 */

/** [state, [[city, [postcode, …]], …]] — states A→Z with the federal territories last, cities A→Z, postcodes ascending. */
export type PostcodeData = ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, readonly string[]]>]>

/** The list as it ships with the portal, fetched on first use (its own chunk: 33 KB, 11 KB on the wire). */
export async function loadMalaysia(): Promise<PostcodeData> {
  const file = await import('./malaysia-postcodes.json')
  return (file.default ?? file).states as unknown as PostcodeData
}

/** The sixteen states, in the list's order. */
export function statesOf(data: PostcodeData): string[] {
  return data.map(([state]) => state)
}

/** A state's cities A→Z; none for a state the list does not have. */
export function citiesOf(data: PostcodeData, state: string): string[] {
  return data.find(([s]) => s === state)?.[1].map(([city]) => city) ?? []
}

/** A city's postcodes, ascending; none for a city the state does not have. */
export function postcodesOf(data: PostcodeData, state: string, city: string): string[] {
  return [...(data.find(([s]) => s === state)?.[1].find(([c]) => c === city)?.[1] ?? [])]
}

/** Where a postcode is: one place, two for the four postcodes two cities share, none for a postcode Malaysia has not. */
export function placesOfPostcode(data: PostcodeData, postcode: string): Array<{ state: string; city: string }> {
  const out: Array<{ state: string; city: string }> = []
  for (const [state, cities] of data) {
    for (const [city, postcodes] of cities) if (postcodes.includes(postcode)) out.push({ state, city })
  }
  return out
}

/** Whether the three are one place on the list — the state has the city, the city the postcode. */
export function belongTogether(data: PostcodeData, place: { state: string; city: string; postcode: string }): boolean {
  return postcodesOf(data, place.state, place.city).includes(place.postcode)
}
