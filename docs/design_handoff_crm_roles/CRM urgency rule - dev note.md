# CRM reply urgency: change request

File: `src/lib/member/crm.ts`

## What changes
- **Overdue** starts after **9 hours** of waiting (was 24).
- Waiting time is **real elapsed time**. Hours outside opening hours count the same as any other hour.
- Reply soon (3 h) and Urgent (6 h) stay as they are.

## Code edits

1. Line 251, change the Overdue threshold:
   ```ts
   export const URGENCY_THRESHOLDS = { soonMinutes: 3 * 60, urgentMinutes: 6 * 60, overdueMinutes: 9 * 60 };
   ```

2. In `replyUrgency`, measure real elapsed minutes:
   ```ts
   const waitingMinutes = Math.floor((now.getTime() - new Date(last.at).getTime()) / 60_000);
   ```

3. Lines 240–248, rewrite the comment: remove the "Only OPENING HOURS count…" paragraph and describe the 3 h / 6 h / 9 h levels on real time.

4. `openMinutesBetween` and `OPENING_HOURS` have no remaining callers once edit 2 is in. Remove them unless something else imports them (search first).

## Side effects to know about
- `applyAutoFollowUp` moves New leads to Follow up when they become Overdue, so after this change that happens at **9 h** instead of 24.
- `MemberCrm`, `MemberCrmOverview` and `MemberCrmTeam` all read `replyUrgency`, so their overdue counts and badges will rise with no further changes.

## Tests (`src/lib/member/crm.test.ts`)
Update the cases that assume 24 h or opening hours (around lines 74–77 and 346). Suggested cases on real time:
- 2 h → none
- 3 h → soon
- 6 h → urgent
- 9 h → overdue
- 10 pm → 8 am next day (10 h) → overdue. Under the old rule this was 0 h.
- Won / Lost → none
- A reply or a booking after the customer's message → none
