# 14 · Team Insight › Up next = frame 9g (owner, 2026-11-10)

> "use 9g"

Spec: frame **9g** in `CRM Optimized Phone.dc.html` (turn-9). Source: `shared/PhoneUpNext.tsx`. Same data and actions as today; layout only. Header and segment as 8b (greeting stays).

## Top row
- `All ads ▾` pill (36px, `#F7F3EF`) on the left; `14 in turn` (12px `#7A6255`) on the right. This replaces the ad picker row and the "· next lead" label.

## #1 card (espresso)
- `#422315`, radius 18, padding 16, gap 14, white text.
- Line 1: history icon 13px `#C29C88` + "Last lead went to **Grace Lee** · 8:40" (12px `#E0CFC4`, name 600 white).
- Line 2: number tile 48×48 radius 14 `#FFFFFF1F` with "1" (Inter Tight 500 26px) · name (Inter Tight 500 22px, −0.02em) · under it "Team Priya · 3 leads today" (12px `#E0CFC4`). Today's count is the person's leads today from Activity; leave it out when 0.
- Line 3: Skip · Pause · Give to… — 40px high, radius 20, gap 8, 13px 600, icons 14px. Skip/Pause `#FFFFFF1F` white text; Give to… white with `#BD4A19` text, flex 1.3.

## Queue (#2 onward)
- Rows 50px, bottom border `#F4F0EC`.
- Number in a 28px circle, `#F7F3EF` background, Inter Tight 500 13px `#7A6255`.
- Name 500 15px (ellipsis). Right: "{team} · {n} today" 12px `#A8968B` (no tags, no team colour).
- Replaces the old #2–#4 chain + "Show more": show the whole in-turn list here.

## Bottom
- Two buttons side by side, flex 1, gap 8: `Not in turn 3 ›` and `On leave 2 ›` — 44px, radius 12, `#F7F3EF`, label 500 13px, count `#A8968B`, chevron 13px `#A8968B`. Each opens its list as today's Off / Leave tabs did.

## Removed
- The In turn / Off / Leave tab control (its lists move behind the two bottom buttons).
- Team-colour rings or dots on people in this screen.

Frames 9a–9f are explorations only; don't build them.

# 14b · Team › Activity = frame 8e (owner, 2026-11-10: "use 8e")

Build the whole 8e frame: header and segment as 8b, one filter row (Everyone ▾ · All ads ▾ · Today ▾, live clock on the right), the espresso figure strip, the table below. No "Team activity" title.

Code today (`shared/team-activity.ts`): rows follow team order unless a header is tapped (`ui.sort`), so people with 0 leads can sit at the top. Avg uses `fmt` → "9h 45m"; Waiting has two formats (`wait` "9h 45m", `waitTxt` "9h45").

- **Default sort** (when `ui.sort` is null): leads high → low, ties by shorter Avg, then name. People with 0 leads always last, drawn like everyone else (not greyed: grey reads as on leave), "—" in empty cells.
- **Show the top 5** of the sorted list; the rest fold behind a "Show N more ▾" row (13px 500 `#BD4A19`, 44px, centred). Hide the row when there are 5 or fewer. Applies with a tapped header too. A tapped header still overrides. Not-in-turn stays folded below.
- **One time format** for Avg and Wait, in `fmt`: under 1 h `4m`; 1 h+ `1h 05m` (minutes padded); 24 h+ `1d 3h`. Drop `waitTxt`. Same in the figure strip (`6m`).
- **Phone columns:** `minmax(0,1fr) 28px 58px 58px 30px 34px`, gap 6, `white-space:nowrap`, tabular numbers. 58px holds "9h 45m" at 13.5px 600; Wait header and values are centred in their column; long names ellipsis instead.
- **Colour (8e):** figure strip `#422315`, radius 16, numbers white, labels `#E0CFC4`, Waiting number `#FFB38A` when any wait is late. No bars under names. Late waits: text `#8A1F0A` 600, no pill; other waits `#A8968B`.
