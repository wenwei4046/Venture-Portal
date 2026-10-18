# Lead View — design handoff (2026-10-18)

> 给 Claude Design 用的交接包：把这份文件和 `screens/` 里的截图一起上传。它说明 Lead View 现在已经做好的样子、每个画面上有什么、哪些规则不能改、还没做的部分。改完设计后，把新的设计稿链接（或导出的画面）交回 Claude Code 实现。

This package describes **what is built and running today** (in a local preview, against the real database) so the redesign starts from the real product, not from the first canvas. Screens are in `screens/` (1440 × 900, scaled).

The first design canvas (approved 2026-10-16) is the Claude Design project **"Lead View"**: https://claude.ai/artifact/8cZ6TsUeWX6AYETkxQudiK. The build follows it, with the changes listed below; it still shows Chinese beside English, the product no longer does.

---

## 1. What Lead View is

A **customer-service inbox** inside the HOUZS Venture Portal for the group's furniture brands — **2990s, 2990s mini, Carress** (more later).

- **Who uses it:** Customer Service (CS) — one person today, more later, each with their own login. Every reply shows who sent it. The Principal opens it from the portal's view switcher ("Lead View").
- **Where enquiries come from:** Facebook **Messenger** and **Instagram** DMs, from ads (click-to-message) or organic. No WhatsApp channel.
- **The goal / CS's KPI:** get the customer's **mobile phone number**, then **hand the lead to that brand's salesperson**. Salespeople are NOT in the system — the hand-over opens WhatsApp on CS's computer with the lead's details filled in; the salesperson follows up on their own phone and books a showroom visit.
- **Desktop first.** Phone is not designed yet.
- **Not live yet.** Meta (Messenger / Instagram) is not connected: conversations come only from *Settings › Test*, replies are "recorded" not sent. Everything you see is test / demo data (marked TEST, "(demo)", "(示範)").

### Brand ↔ Facebook Page (decided 2026-10-18)
| Brand | Facebook Page | Instagram | How a conversation is assigned |
|---|---|---|---|
| 2990s | 2990's | 2990.s_ | Page 2990's, ad not from a "Mini" ad account |
| 2990s mini | *(shares 2990's Page)* | *(shares 2990.s_)* | ad from a "2990's Mini@…" ad account; CS can move it |
| Carress | Carres | carres.global | Page Carres |

Ad accounts are named **brand@showroom** (2990's Mini@Kelana Jaya, 2990's Mini@Puchong, Carres Flagship@Puchong) — so an ad can also tell the customer's **showroom**.

---

## 2. Rules the design must keep

1. **English only** on every screen (the user, 2026-10-18: "改成纯英文，画面太乱了"). Chinese appears only in DATA: what customers type, names, ad titles, and the automations' keywords. The WhatsApp hand-over text to salespeople is English + Simplified Chinese (not a screen).
2. **HOUZS design system** — the portal's own shell and tokens (below). One primary (orange) action per screen; statuses are small chips; page titles in Newsreader.
3. **The phone is the hero.** Getting it, confirming it and handing it over must stay the most obvious thing on the Inbox.
4. **Meta's messaging rules** (campaigns): a customer who wrote in the **last 24 hours** may be messaged free; after that only customers who **agreed to promotions (opt-in)** — and Meta charges per message; never one who **unsubscribed**. The count before sending must say who is left out and why.
5. **AI is a copilot:** it only writes DRAFTS; a person sends, edits or dismisses each. Nothing the AI writes reaches a customer by itself (answering on its own may come later, after hours first).
6. **Permissions:** each page has View and Edit boxes a template ticks (Inbox also Create). Read-only viewers see no edit buttons — designs should work without them.
7. **Meta not connected** states must exist: "Not connected", "Waiting", recorded-not-sent, AI "not connected (no API key)".

---

## 3. Design tokens in use (HOUZS portal, "HR sheet" theme)

Fonts: **Newsreader** (page titles, big names), **Inter** (body), **Chivo Mono** (figures, phone numbers, times, small chips).

| Token | RGB | Used for |
|---|---|---|
| ink | 0 0 0 | text |
| dark | 43 31 23 | dark chips, selected tab, "All" pill |
| cream | 246 238 230 | text on dark |
| accent (orange) | 233 154 83 | the one primary button, title underline — a surface, never text |
| peach | 255 244 231 | selected row, notes, AI draft box |
| orange-text | 160 90 30 | clay chips' text |
| hairline / divider / frame | 229 228 223 / 226 224 218 / 216 210 200 | borders |
| panel / zebra | 246 246 244 / 250 250 249 | panels, chat background |
| brown / note / faint | 117 100 86 / 138 119 101 / 152 142 130 | secondary text |
| blue | 46 92 138 | links, flow buttons, "Every brand" chip |
| ledger (green) | 21 110 78 (bg 222 240 232) | good / done / confirmed phone / phone-rate bars |
| alert (amber) | 150 100 12 (bg 249 238 214) | notices ("Only test conversations…") |
| danger | 176 40 34 (bg 250 228 224) | errors, "not connected" AI |
| info-bg | 238 235 231 | flow / campaign message bubbles |

Brand chips use tones: 2990s **ink** (dark), 2990s mini **clay** (peach + orange text), Carress **blue**.

Shell: left sidebar (HOUZS Venture logo, nav, user at the bottom), a top greeting bar ("Good afternoon, Principal." · Lead View switcher · date · Q4 2026 · SIGN OUT), white sheet with the page.

---

## 4. Navigation

```
Inbox · Leads · Insight · Campaigns
SET UP
Automations · AI Agent · Data Center · Settings
```

---

## 5. Screen by screen (what is on it today)

### 5.1 Inbox — `screens/01-inbox.jpg`
Three columns.
- **Conversations (left):** brand tabs (All · 2990s · 2990s mini · Carress); search (name, phone, message, ad); state tabs with counts — **Waiting** (customer wrote last), **Answered**, **Handed**, **All**. Each row: avatar initials with a channel badge (FB / IG), name, time, last message (↩ when we wrote last), chips: brand, state, "Automation" when a flow is running, the phone when known, TEST.
- **Chat (middle):** header — name, brand · channel · "Ad: <ad name>" or "Organic". A notice when Meta isn't connected / it's a test. Bubbles: customer left (white); ours right — CS dark, **flow / campaign** grey-beige, **AI** peach with orange border; under each: who · CS / Flow · name / Campaign · name / AI Agent, time, "recorded". A customer message with a phone shows a green "Phone found 012-338 4721 → card". Flow questions show their buttons as blue pills.
  - **AI draft:** when the brand's AI is a copilot, a "✦ AI draft" button above the reply box; the draft appears in a peach box with the cards it used, a "a person should take over" flag + note, and **Use · Another · Dismiss**.
  - Reply box: textarea (Ctrl + Enter) + Send.
- **Customer card (right):** name (Newsreader), channel · first contact; **From the ad** block (ad name, channel · campaign › ad set, links "View the ad ↗" "Ads Manager ↗", ad id) or **Source: Organic**; **Phone** (empty hint / detected in peach with *Confirm* / confirmed in green); fields Name, Phone (typed), Interest, Budget, Showroom (suggests the brand's showrooms), When, Note (internal) + Save; **Promotions** consent chip (Not asked / Agreed / Unsubscribed — set by hand only on test conversations); **Hand over to <brand> sales** (disabled until there's a phone) → after it a green "Handed to X" box with Appointment / Came selects and "Hand again"; **Timeline** (came in, phone found, handed, campaign, consent…).
- **Hand-over window:** the brand's salespeople with this week's count (rotation suggests the fewest — "Next"), or CS picks; an editable WhatsApp message (name, phone, interest, budget, showroom, time, source/ad, note, CS name); "Open WhatsApp" → wa.me to the salesperson.

### 5.2 Leads — `screens/02-leads.jpg`
Month picker. Four stat cards: **Phones** (of N conversations · %), **Handed** (n not handed yet), **Booked**, **Came** (reference). Notice while all data is test. Filters: brand tabs, Handed (All / Not yet / Handed), Include tests. Table: Customer (+ channel · TEST), Brand, Source (ad name / Organic), Phone (+ "to confirm"), Interest, Handed to (or "Hand over →"), When, Booked (select), Came (select).

### 5.3 Insight — `screens/03-insight.jpg`
Month picker. Cards: **Phone rate**, Handed, Booked, Came. Tables with bar for phone rate: **By who handed over** (CS), **By brand**, **By ad** (Organic is a row). Tests left out once real data exists.

### 5.4 Campaigns — `screens/04-campaigns.jpg`
Meta's rule notice on top. Left: campaign list (Name, Brand, Status chip Draft / Scheduled <time> / Sent, Sent, Replied, Phones). Right: the editor or a sent campaign's results.
- **Editor:** Name (internal), Brand, Channel (Messenger + Instagram / one); **Who:** talked with us (7 / 30 / 90 / 365 days), interest contains, phone (any / none yet / have), handed (any / not yet / handed), came from (any / ad / organic), include test conversations; **the count** — Match · Will get it · Paid (opt-in) · Left out, with the reasons line; **Message** with "Insert {name}", up to 3 buttons (20 chars), a preview bubble; **When:** schedule (optional) + the "Meta not connected: Send now records, a schedule waits" note; actions **Send now (n)** · Schedule · Save draft · Remove.
- **Results:** Sent · Paid · Replied (%) · Phones (%), the message.

### 5.5 Automations — `screens/05-automations.jpg`, `screens/06-automation-templates.jpg`
Meta-style. Left: **My categories** (All, General, Ads … with counts, rename ✎, delete ✕, + New category). Right: automation cards — icon tile, name, template type, **On/Off switch**, trigger line ("From the ad 'Sofa Week'", "A customer's first message", "Outside opening hours"), category + brand chips, "n this week · n phones", Edit.
- **+ New automation** → template gallery by goal: *Greet customers* (Welcome message, Away message), *Share information* (FAQ, Location, Opening hours, Custom keywords), *Ads* (Ad Q&A), *Manage messages* (Unanswered reminder — coming soon), + Start from scratch.
- **Editor** (not in the screenshots): a short form per template (e.g. FAQ: questions + answers; Away: hours per day + reply + ask for phone; Ad Q&A: ad name contains, 2–3 tap-to-answer questions each saved into the card field Interest / Budget / Showroom / Time, then ask for phone) with a **Try it** phone preview. "Start from scratch" is a step list (question with buttons / message / ask for phone / hand to CS).

### 5.6 AI Agent — `screens/07-ai-agent.jpg`
Brand tabs (● = copilot on). Red notice while no API key. Left: **the soul** — Off / Copilot switch, Agent name, Tone (Warm / Professional / Playful / Concise), Personality, Goal (default: get the mobile number for a showroom visit), Always, Never, Example replies; Save; **Last 30 days**: Drafts · Sent as is · Edited · Used %; "n Data Center cards in use today". Right: **Try it** — a pretend chat as the customer, the draft with Use as our reply / Another.

### 5.7 Data Center — `screens/08-data-center.jpg`
What the AI may tell customers. "+ New card". Filters: All / Every brand / each brand, kind (Promo, Product, FAQ, Showroom, Policy, Note), search. Cards grid: kind chip, brand chip (or Every brand), status chip (In use / Until <date> / From <date> / Ended / Off), title, text (5 lines), who · when, Edit / Remove. Card window: brand, kind, title, text (4,000 chars), from / until dates, On switch.

### 5.8 Settings — `screens/09-settings-brands.jpg`, `10-settings-ads.jpg`, `11-settings-test.jpg`
Tabs **Brands · Ads · Test**.
- **Brands:** a panel per brand — FB Page id / Instagram id with "Not connected" / "Set" chips, Hand-over mode (Suggest in turn / CS picks), **Salespeople** (name, mobile, showroom, this week's count, Edit / Remove, add form); + New brand.
- **Ads:** every ad conversations came from — name (or Meta's headline), "headline" · id · From Meta / Named by X · status, Campaign › Ad set, brand · channel, chats, phones, links (Ad ↗, Ads Manager ↗), **Name** (by hand: name, campaign, ad set, link); **Fetch names from Meta** (needs ads_read). A hand-typed name wins over Meta's.
- **Test:** a fake customer message (brand, channel, name, "from the ad" headline, ad id, message) → lands in the Inbox as TEST; **Connection** checklist (Done / Waiting / Later).

---

## 6. Not built yet (open for design)

- Phone layout of every screen.
- **Unanswered reminder** (customer waiting too long → remind CS).
- Moving a conversation between 2990s and 2990s mini by hand (decided, not built).
- Showroom filled from the ad account (decided, not built).
- AI answering on its own (after hours), photos / files in the Data Center.
- Campaign: Meta cost estimate, send-to-myself test, STOP to unsubscribe.
- Insight by showroom; cost per phone from ad spend (needs ads_read).
- Quick replies / saved replies for CS.

## 7. Data available to a screen (fields)

Conversation: brand, channel (messenger / instagram), name, ad (id, headline, name, campaign, ad set, account, link) or organic, phone + state (none / detected / confirmed), interest, budget, showroom, preferred time, note, hand-over (salesperson, when, by whom), appointment (unknown / booked / not booked), came (unknown / came / no show), last message (time, in/out, text), flow state, promotions consent, TEST flag, timeline events.
Message: in/out, sender (customer / CS / flow / campaign / AI), by name, text, buttons, phone found, delivery (recorded / sent / failed), time.

## 8. How to hand it back

Send Claude Code the new design (the Claude Design link, or exported screens) and say which screens changed. New fields or behaviour (not just layout) should be called out — they may need database changes, which are applied to production only at your yes.
