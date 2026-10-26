# Settings, Customer form, Reports, Leads by ad (fix request · round 3)

## 10 Settings: turn on every lock we control
- **Team inbox alerts** → a normal toggle (default **on**). Managers get alerts only for chats belonging to their own people (same scope as the Inbox).
- **Send auto-reply** → a normal toggle (default **on**). Off = no auto-reply for anyone, even if set in a Profile.
- **Keep locked**:
  - **Reply window (24 h)**: set by Meta, cannot be changed.
  - **Move to Cold leads (24 h)**: follows the reply window. The hours can't change, but the label explains why.

## 08 Customer form: several forms
- **Form picker** at the top of the Pages column (e.g. "Visit booking form"), with **Duplicate** and **Delete** buttons beside it.
- **Duplicate:** copies every page, section and field into a new draft named "{name} (copy)".
- **Delete:** asks to confirm first. It is blocked for the form that is currently in use, with the message "Set another form as active first". Customers' saved answers stay.

## Reports: same design and colours as Ads Performance
`Reports › Ads performance` must render the **same component** as `CRM › Ads Performance` (see `Ads Performance fix - dev note.md`):
- Palette tint cards with a 3px top bar (no solid amber or pink fills).
- Chart lines in ink, rust, brown, amber and `#C29C88`.
- No footnote.
- The Appt rate column shows % only.

The other Reports tabs (Leads by ad, Salespeople, Appointments & show-ups, Lead sources & status) use the same tokens: table header `#FBF4EC`, header text `#6F402C` 11px uppercase, rows `#F4F0EC`, numbers Inter Tight tabular, period control = the segmented style used elsewhere.

## 06b Leads by ad: resizable columns
- Every column header has a resize handle at its right edge (3px `#E3CDB8` grip, `cursor: col-resize`). Drag it to change that column's width.
- **Minimum widths:** Ad 180px, Status 80px, Members 110px, Leads 52px. The Ad column takes the leftover space.
- Remember the widths per user (localStorage key `crm.lba.cols`). Double-click the handle to reset.
- Apply the same handles to every CRM data table (Contacts, Ads Performance, Active members).
