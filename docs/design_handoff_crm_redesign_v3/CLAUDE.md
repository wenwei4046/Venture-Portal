# Claude Code: how to implement this handoff

1. Use **docs/design_handoff_crm_redesign_v3 only**. It replaces v2. v1 (design_handoff_crm_redesign) is the base for tokens and components only.
2. Read `README.md`, then every file in `notes/` in numeric order.
3. Treat each frame in `CRM Desktop.dc.html` and `CRM Phone.dc.html` as the spec. Lift exact values from the inline styles; don't invent spacing or colours.
4. **Order:** global rules → desktop frames (as in the README table) → phone frames (shared → M10 → M12 → M Insight → T01 → T03 → T04/T04b → T05 → T06/T08 → T07).
5. After each frame, screenshot production at the same size (desktop 1440×900, phone 430×932) and compare it with the frame. Fix every difference and every overlap before moving on.
6. Use the app's existing fonts (Inter, Inter Tight, Noto Sans SC via its CSS variables). Don't load the fonts again.
7. Don't change behaviour that the notes don't mention. When a value is ambiguous, ask.
