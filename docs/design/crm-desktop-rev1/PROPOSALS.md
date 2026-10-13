# CRM Desktop rev 1 · 要串接的東西 & 資料庫方案

**你的決定（2026-10-13）：** B1、B2、B3、B4、B5、**B6（備註，要做，只在電腦版）** 都同意。**C（Meta）先等你確認 Meta 那邊**，在那之前 Meta 欄位顯示「—」。D1、D3、D4 照建議；**D2 刪除通知的 Undo 是 30 秒**（跟 Send to 一樣）。Migration 寫好、在本機（PGlite）驗證後，套用到正式資料庫前會再跟你確認一次。

電腦版要「每個按鈕都真的能用」，下面是需要新增的東西。**標「不用改資料庫」的我直接做；標「改資料庫」的要你同意才寫 migration**；標「你要做」的是要你在 Meta 那邊操作的。

## A · 不用改資料庫（直接做）

| # | 功能 | 做法 |
|---|---|---|
| A1 | **Reply 24 h 名單**（B2） | 用現有訊息時間算：客人第一則訊息之後 24 小時內有我方回覆的名單。 |
| A2 | **Team performance 的 Won rate / Lost rate**（B3） | 用現有客人狀態算。 |
| A3 | **通知「To assign」**（H4） | 即時算：在 Organic Leads 等著的客人＋還沒設定分配的廣告，不用存。 |
| A4 | **模板的更多變數**（H2）：{showroom} {salesperson} {visit_date} {visit_time} {ad} {phone} | 送 Meta 審核時轉成 {{1}}、{{2}}…（附範例），送出時從客人資料填入。「自訂變數」就是從這份清單挑選加入，不用存。 |
| A5 | **Showrooms 每天時段、每週休息日、封鎖日期/時段**（G2） | 現有欄位已經支援（slots 可以指定星期幾、weekly、blocks），直接接上。手機的 Book visit **畫面不改**，但它讀同一份資料，所以能選的時段會跟著設定變。 |
| A6 | **Assign to / Send to / Remind 的對象**、**Member work type**、**Full time**、**Ads to teams**、**Cold lead templates** | 全部走現有的資料庫函式和權限（CRM · Manage）。 |

## B · 要改資料庫（等你同意）

| # | 功能 | 方案 | 影響 |
|---|---|---|---|
| B1 | **Chat progress 時間軸**（D6）＋通知「Assign」類型（H4） | 擴充現有的 `crm_events`（現在只記 won / lost / moved / shared），加上：`assigned`（被指派）、`first_reply`（第一次回覆）、`appt_booked` / `appt_changed`（預約/改期）、`visit`（到店）、`status`（狀態變化）。用 trigger 在客人、訊息、預約有變動時**自動記錄**，不改任何寫入函式。舊資料用現有欄位補第一筆（例如 `assigned_at`）。 | 只加資料；讀取權限照現有 `crm_events`。 |
| B2 | **提醒業務員回覆**（C4、D4 Remind） | 新函式 `crm_remind(客人)`：只有 CRM · Manage 能用；記一筆 `reminded` 事件（誰提醒誰、幾點）。被提醒的人在手機 CRM 的通知裡會看到（**手機畫面不改**，它本來就列出事件）；電腦版聊天裡顯示灰色系統行。 | 新事件類型＋一個函式。 |
| B3 | **刪除通知**（H4 Select → Delete） | `crm_staff_prefs` 加一欄 `notif_deleted`（每人自己的，像現在的已讀 `notif_read`）。刪除只影響自己，不影響別人。 | 加一欄。 |
| B4 | **Showroom 照片、地圖連結手動覆寫**（G2） | `crm_showrooms` 加 `photo_path`、`map_google`、`map_waze`；照片放 Supabase Storage 新 bucket `crm-showrooms`（只限登入的 CRM 使用者讀，Manage 才能上傳）。 | 加三欄＋一個 bucket。 |
| B5 | **Forms**（H3） | 新表 `crm_forms`（名稱、sections/fields 設定，JSON），只有 CRM · Manage 能寫。**手機不改**，所以設定先只影響**電腦版**的 Customer info；手機的 Customer info 表單維持現在的欄位，等你決定要不要改手機。 | 新表。 |
| B6 | **備註**（Chat progress 的 note、設計稿的 note box） | 現在 CRM **沒有備註功能**（只有 Lost 的原因）。若要有：新表 `crm_notes`（客人、內容、誰、時間）。**建議先不做**，Chat progress 只顯示 Lost 原因。 | 選做。 |

## B+ · 你後來加的（2026-10-13）

| # | 功能 | 做法 |
|---|---|---|
| B7 | **設定共用**：Principal 和 Director 改的設定彼此看到的是同一份，也作用到 RS / TL / TA | 已經是這樣：設定都存在資料庫，電腦版每 5 秒重新讀（跟手機一樣）。 |
| B8 | **History**（側欄 CRM 分頁最下面的新按鈕） | 讀 portal 現有的變更紀錄 `audit_changes()`，只看 CRM 的設定表（showrooms、ads to teams、full time、member work type、templates、forms），列出誰、何時、改了什麼（改前 → 改後）。這些表**已經有在記錄**。若 Director 的帳號讀不到這些紀錄，要調整讀取權限（小改動，會先告訴你）。設計稿沒有這頁，照同一套樣式做。 |
| B9 | **封鎖時段**（Showrooms 的 Pick a time） | 資料庫的預約檢查現在只認「整天」封鎖；要改成也認時段，RS 手機 Book visit 才會擋掉那幾個時段（手機畫面不變）。屬於 B4 的一部分。 |

## C · Meta 廣告（Ads Performance、Ads to teams 的 Running / Paused / Pending）

**你要做（Meta 那邊）：**
1. 在 Meta App「Houzs Revenue Team CRM」加 **Marketing API** 用途，申請 **`ads_read`** 權限（需要 App Review 的 Advanced Access，Meta 審核通常數天）。
2. 在 Business Settings 把**廣告帳號**指派給 System User「RevTeam CRM」（權限：查看成效）。
3. 重新產生 System User token（勾上 `ads_read`），更新到 Vercel 的 `META_SYSTEM_USER_TOKEN`（你自己貼，不經過我）。
4. 告訴我**廣告帳號 ID**（`act_…`，可以有多個），我設成 `META_AD_ACCOUNT_IDS`。

**我做：**
- **新表**（改資料庫，要你同意）：`crm_meta_ads`（廣告 ID、名稱、Campaign、Ad set、狀態、更新時間）、`crm_meta_ad_daily`（廣告 × 日期 × 各項數字）。只有 CRM · Manage 讀得到。
- **同步**：用現有的每小時排程（`/api/member-queue`，已經用 service role，不新增 service role 的使用者）向 Meta 拉最近 3 天＋今天的數字；Ads Performance 頁有「Sync now」（你決定要不要，見 J3）。
- **對應**：客人身上已經有 Meta 的廣告 ID（`ad_source_id`），所以「花費 ÷ CRM leads」「每個預約成本」這類數字可以直接算。
- **狀態**：Meta 的 ACTIVE → Running、PAUSED → Paused、審核中 → Pending；Ads to teams 的狀態篩選也用這個。
- **下載報表**：Excel / CSV 在瀏覽器產生；PDF 用 portal 現有的 PDF 匯出。內容 = 畫面上看到的。
- **Meta 還沒授權前**：Meta 的欄位顯示「—」，CRM 自己的欄位（Leads、Appointments、Showed up、Won、比率）照常有數字。

## D · 設計稿的開放問題
1. **Reply 24 h 名單** → 用 A1 的做法，可以嗎？
2. **刪除通知要不要 Undo？**（建議要：3 秒 toast 裡有 Undo，跟 Send to 一樣）
3. **Meta 多久同步一次、要不要「Sync now」？**（建議：每小時自動＋Sync now 按鈕）
4. **Send reminder 算不算 Chat progress 的「My actions」？**（建議：算）
