# Prompt for Claude Design

Paste everything below the line into a new Claude Design project, after uploading `design-brief.md`, the screenshots
in `desktop/` and `rs-phone/`, and the HTML snapshots in `html/`.

---

I'm designing the **desktop version of our CRM** for HOUZS's Revenue team. It opens inside our Revenue app when it is
used on a computer; on a phone the CRM stays as it is. A first working version is already built. The attached
screenshots (`desktop/01`–`20`) and HTML snapshots (`html/`) show it exactly as it runs today, on demo data. Use them
as the starting point; don't start over.

Read **`design-brief.md`** first. It says what each screen is for, **which data exists** (use only that, or mark
anything else **NEW DATA**), what must stay the same (who sees what, the rules, the colours, Inter), and the known
problems to solve.

Please do this, in order:

1. **The shared frame**: the CRM's head (title, page tabs with counts, period, Team | Mine, the CRM bell) and the right
   side pane where chats and editors open (its width, when it shows, how it closes). Both the Control panel and the
   salesperson desktop use it. The Revenue app's own 240px sidebar and top bar stay around it; the CRM area is
   1200 × 840 at 1440 × 900 and 1040 × 740 at 1280 × 800.
2. **The Control panel** (Principal and Revenue Director), five tabs: **Insight, Inbox, Assignment, Calendar,
   Settings**. Keep what each shows (brief §3); improve layout, hierarchy and density for a big screen, and solve
   the known issues (brief §4).
3. **The salesperson desktop (RS)**: Inbox with the chat, Contacts, Calendar, Insight, Profile, from the phone screens in
   `rs-phone/` and the data in brief §5. Include Team | Mine for leaders and the Director.

For each screen, show: the normal state, empty, many rows, the side pane open and closed, and 1280 × 800 for Insight,
Inbox and RS Inbox. UI text in English.

When done, hand back:
- one `.dc.html` prototype with a frame per screen and state;
- **`CRM Desktop rev 1 dev changes.md`** in the style of our rev 1010 / 1011 lists: numbered items, each naming the
  screen, what changes (sizes, colours, order, behaviour), whether it is **desktop only** or **phone too**, **NEW DATA**
  if it needs data we don't have, and an **acceptance** line;
- any new icons or images as files.
