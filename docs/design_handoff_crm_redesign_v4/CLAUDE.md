# Claude Code: how to implement this handoff

1. Use **docs/design_handoff_crm_redesign_v4** for this round (on top of v3, which stays the base; v1 for tokens and components only).
2. Read `README.md`, then every file in `notes/` in numeric order (v4: notes 09–25). Build only frames marked Chosen / Kept / Approved.
3. Treat each chosen frame in `CRM Optimized Desktop.dc.html` and `CRM Optimized Phone.dc.html` as the spec (PNGs in `screenshots/` are a guide; icons render as squares there). Lift exact values from the inline styles; don't invent spacing or colours.
4. **Order:** global/behaviour notes (09–13, 15, 18-B) → phone screens → desktop screens, as in the README tables.
5. After each frame, screenshot production at the same size (desktop 1440×900, phone 430×932) and compare it with the frame. Fix every difference and every overlap before moving on.
6. Use the app's existing fonts (Inter, Inter Tight, Noto Sans SC via its CSS variables). Don't load the fonts again.
7. Don't change behaviour that the notes don't mention. When a value is ambiguous, ask.
