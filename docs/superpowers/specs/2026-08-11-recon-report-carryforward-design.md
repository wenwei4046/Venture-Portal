# Bank Reconciliation Report + cross-month carry-forward — design (2026-08-11)

User request (after finishing May's HLB recon): (1) a reconciliation report per
finished month; (2) while working June, May's still-unreconciled book entries
were invisible.

## Root cause of (2)

The session page's book window is `period_month − 10d .. month-end`. June's
window starts 22 May, but the three BIG MATRIX payments were booked **20 May**
(−430.43 / −1,067.30 / −413.17) and only cleared the bank on 1 June (statement
lines −843.60 = 430.43+413.17, and −1,067.30 — June's 2 remaining unmatched
lines). Two days outside the buffer → never shown.

## User decisions (AskUserQuestion 2026-08-11)

- Outputs: **page + PDF + Excel** (same export stack as Company Statement;
  PDF/exports English-only — react-pdf has no CJK).
- Matched-pair detail: **not in the report anywhere** ("都不要") — balances +
  reconciling items only.
- Pre-April (pre-recon-baseline) entries: **never show again** ("旧系统已对完,
  不想再对了") — excluded from the matching UI entirely, not just collapsed.
  Within-era earlier items (e.g. May lines while working June) show by default.

## Carry-forward window (session page)

`from = min(period_month − 10d, first bank_recon_session month for this bank)`

- June (baseline Apr): window Apr 1 – Jun 30 → 20 May lines appear; Feb/Mar
  legacy (~35 unclaimed lines incl. Kingsley 100k/200k) stays out.
- First session of any bank: unchanged (−10d buffer, survives delete+reupload).
- `ReconReview` `showPrior` defaults to **true** — earlier items are now only
  genuine in-transit candidates.

## Report model (lib/recon-report.ts, pure + unit-tested)

Classic bank reconciliation statement, per session (bank + month):

```
Balance per bank statement (month-end)          81,019.05
Add  outstanding receipts (book, not in bank)        0.00
Less outstanding payments (book, not in bank)   (1,910.90)
Less receipts in bank not in books                   0.00
Add  payments in bank not in books                   0.00
Adjusted balance                                79,108.15
Balance per GL 3010 (month-end)                 79,108.15   ✓ tie
```

Identity (verified live to the sen for Apr, May, and open Jun):
`GL(month-end) = statement_closing + Σ book outstanding − Σ statement items
not in books`. The recon baseline absorbs pre-era history (proven: Apr opening
26,422.51 = Σ pre-Apr unclaimed lines exactly), so no legacy line is needed.

**As-at rule (historical correctness):** a book line counts as outstanding at
month M when it is dated `[baseline .. M-end]`, is not an internal flip, is not
part of a contra group, and its claim is **absent or belongs to a session with
period_month > M**. So after the user matches BIG MATRIX inside June's session,
May's report still shows them outstanding (claimed by June > May) and May's
numbers never drift. Statement side: this bank's sessions with period_month ≤ M,
lines with match_kind null or 'ignored' (ignored flagged in the list).

Contra groups (Σ=0, book-only) never appear and never affect the arithmetic.
Report renders for open sessions too — the identity holds mid-recon (verified
against live June: 16,933.98 − 7,198.37 + 1,910.90 = 11,646.51).

## Pages & files

- `src/lib/recon-report.ts` — pure: `windowStart()`, `buildReconReport()`.
- `src/lib/recon-report-data.ts` — `fetchReconReport(supabase, sessionId)`:
  session + bank, all bank sessions (baseline + ≤M set), statement lines (all
  bank sessions, for claim resolution), matches (paginated, filtered in
  memory), book lines `[baseline .. M-end]` with flip exclusion, GL closing —
  every journal_lines/matches read through `fetchAllRows`.
- `src/app/(portal)/reconciliation/[sessionId]/report/page.tsx` — English
  report page: statement table + item lists (Date | Entry | Description |
  Amount), export buttons, ✓/✗ tie badge.
- `.../report/export/route.tsx` — `?format=xlsx|pdf` via `lib/export/*`
  (buildXlsxBuffer / PdfDocument / PdfTable, portrait A4). Filename
  `recon-<bank>-<YYYY-MM>`.
- `[sessionId]/page.tsx` — window formula; the three unranged reads
  (book window, claimed matches, GL-closing sum) wrapped in `fetchAllRows`
  (1000-row cap risk, same class as the 2026-06-16 Trial Balance bug); Report
  link in the header.
- `ReconReview.tsx` — `showPrior` default true.
- `/reconciliation` index — Report link per session row.
- `src/__tests__/recon-report.test.ts` — tie identity (May/June live numbers),
  as-at later-claim rule, contra exclusion, ignored flag, sign splitting,
  windowStart cases.

## Out of scope

- Cross-bank / all-months combined report (per-session only).
- Surfacing earlier sessions' unmatched *statement* lines inside a later
  session (book side only; not needed for the observed case).
- Matched-pair detail listings in any output (user's explicit choice).

## Implementation order

pure lib → unit tests green → data layer → session-page window + pagination +
ReconReview default → report page → export route → index link → tsc + full
vitest → commit (specific paths) + push (auto-deploy).
