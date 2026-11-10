# 23 · Desktop Insight › Up next = frame D3a (owner, 2026-11-10)

Spec: D3a in `CRM Optimized Desktop.dc.html`. Source: `desk/DeskUpNext.tsx`, `shared/up-next.ts`. Same data and actions; layout follows phone 9g (notes/14).

## Left column (420px)
- All ads ▾ (34px, `#F7F3EF`) · right "14 in turn" 13px muted.
- #1 card: `#422315`, radius 18, padding 20, gap 16. Last lead line (history icon 14px `#C29C88`, 13px `#E0CFC4`, name 600 white). Number tile 56px radius 16 `#FFFFFF1F` "1" Inter Tight 30px · name Inter Tight 26px · "Team Priya · 3 leads today" 13px. Buttons 42px radius 21: Skip / Pause (`#FFFFFF1F`, white) · Give to… (white, rust text, flex 1.3), icons 15px.
- Under it: Not in turn N › · On leave N › (48px, radius 12, `#F7F3EF`) — each opens today's list.

## Right — the queue table
- Columns `44px 1fr 140px 96px 96px 196px`: # (30px circle `#F7F3EF`, Inter Tight 13px muted) · Next in turn (name 500) · Team (word, no colour) · Leads today (right; 0 grey) · Last lead (right, grey) · actions.
- Header 38px `#FBF7F3` radius 8, sentence case. Rows 56px.
- **Actions only on row hover**, in the reserved 196px column so nothing shifts: Skip · Pause · **Leave** (30px, radius 15, 1px `#E2D8D0`, 12.5px). Leave opens the Add leave sheet (notes/18) with the person set; saved → they move to On leave.
- The In turn / Off / Leave tabs go.
