Collapsible panels · rule for every side panel

- Every side panel has a Collapse button (24px square, chevron-right) next to its close ✕. Collapse is not the same as close.
- Panels covered: Customer info, Audit log, 06 Split, 06b member leads, 03 Contacts Selected.
- Collapsed = the shared 44px rail (#FBF4EC, icon or avatar, vertical label, chevron-left). Click anywhere on the rail to reopen.
- The table or chat next to the panel takes the freed width.
- Remember the state per user and per panel (localStorage crm.panel.{name}).
- Rows that expand inline (06b customer row, 06b ad rows, Split team rows) collapse again with the same chevron. Only one customer row is open at a time.
