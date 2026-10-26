# Channels: edit the business profile here, sync to Meta (feature request)

Design reference: `CRM Desktop.dc.html` › 09b Channels.

## Behaviour
- Each phone-number group gets an **Edit profile** button that opens a right-hand drawer (460px).
- **"Update on" chips:** WhatsApp and Facebook Page. Both are ticked by default, and either can be unticked.
- **Save to WhatsApp & Facebook:** the server pushes the changes to Meta. Users never open Meta Business Suite.
- **Status:** show "Last synced …" in the footer. If a sync fails, show the error per channel and offer Retry.

## What can be written by API (confirm against Meta docs before building)
**WhatsApp:** Cloud API `POST /{phone-number-id}/whatsapp_business_profile`
- Fields: `about`, `description`, `address`, `email`, `websites[]`, `vertical` (category).
- `profile_picture_handle`: upload the image first with the Resumable Upload API, then send the handle.
- **Display name:** a change is a name request that Meta reviews (usually 1–2 days). Show "In review" until it is approved.
- **Permission:** `whatsapp_business_management`.

**Facebook Page:** Graph API `POST /{page-id}`
- Fields: `about`, `description`, `phone`, `website`, `emails`, `single_line_address` / location, `hours`.
- **Permission:** `pages_manage_metadata` with a Page access token.
- **Profile picture:** writing the Page picture by API may not be allowed. Check this. If it isn't supported, the drawer shows "Facebook photo: change it on Facebook" with a link, and only WhatsApp gets the new photo.

## Field mapping
| Drawer field | WhatsApp | Facebook Page |
|---|---|---|
| Profile photo | profile_picture_handle | (check; see above) |
| Display name | name request (reviewed) | Page name: not changed (Meta rules) |
| About | about (139 chars) | about |
| Description | description | description |
| Address | address | location / single_line_address |
| Email | email | emails[0] |
| Website | websites[0] | website |
| Category | vertical | category: not changed |

Keep a copy of the profile in our DB and record every save in the Audit log (before → after, who, channel, result).
