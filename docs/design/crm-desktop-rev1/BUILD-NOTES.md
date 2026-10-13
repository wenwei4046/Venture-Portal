# CRM Desktop rev 1 — 實作紀錄（2026-10-13）

電腦版 Control panel（Principal / Revenue Director 專用）照 `prototypes/CrmFrame.dc.html` 產生，接上手機 CRM 同一份資料、同一套寫入與權限。這份列出**每一個跟設計稿不同、或設計稿沒有而補上的地方**，以及資料庫的變更。

## 1. 跟設計稿一模一樣的驗證

- 畫面由 `tools/crm-design/gen-desk.cjs` 從設計稿直接轉成 `src/components/member/crm/desk/DeskApp.tsx`（顏色、排版、間距、動畫都是設計稿原值，不是手抄）。
- `node tools/crm-design/compare-desk.mjs <資料夾>`：設計稿 14 個畫面（1a–1j、2a–2d）與 App 逐像素比對 → **13 個 0 像素差、2d 1 像素**（反鋸齒雜點）。
- 動畫（menu 的 chevron 0.15 s、hover 顏色、pane 滑入）都在產生的 markup 裡，跟設計稿同一份。

## 2. 跟設計稿不同的地方（每一條都在 `tools/crm-design/desk-patches.cjs`，附原因）

| # | 改了什麼 | 為什麼 |
|---|---|---|
| 1 | 外框不再是圓角＋陰影 | 設計稿是畫布上的一張圖；在 App 裡它就是整個螢幕 |
| 2 | 問候語跟時間變（Good morning / afternoon / evening） | 跟 Revenue app 一樣 |
| 3 | 「Fair view」是真的 sub-department 名稱，按下去開 Revenue app 的切換 | 真資料 |
| 4 | 日期是今天（公司時區） | 設計稿寫死 3 Oct |
| 5–6 | 鈴鐺開 Revenue app 的通知；紅點只在有未讀時出現 | A2 |
| 7 | Sign out 真的登出 | — |
| 8 | Inbox 的狀態 chip 可以篩選 | 設計稿有畫、沒寫行為 |
| 9–10 | Insight 的 Today / This week / This month / Custom 可以切換；1280 寬的小 chip 按一下換下一個 | 同上 |
| 11 | 空時段顯示該 showroom 自己的上限（例：Free · 2 per slot） | 真資料 |
| 12–17 | ⋮ 選單的 Customer info / Appointment 真的打開；Customer info 的 Edit 打開編輯表單（「Add note」依你 2026-10-13 的指示拿掉） | 設計稿只畫了選單 |
| 18 | **補畫面：** Appointment（預約/改期/取消）、Edit customer —— 用設計稿同一套樣式 | 設計稿沒有這幾頁 |
| 19 | **補畫面：History**（在 **Settings** 裡，最後一項），誰、何時、改了哪個設定、改前→改後 | 你 2026-10-13 要求（原放側欄，依你指示移進 Settings） |
| — | Assignment 各頁標題旁的「All assignment ⌄」拿掉 | 你 2026-10-13 要求；右邊選單本來就能切換 |
| — | 視窗小於 1280 × 800 時整頁捲動，不再把清單擠成 0 高 | Chat progress 的列表、Full time 的人員表在小視窗看不到（你 2026-10-13 截圖） |
| — | Insight 的 Ads Performance 卡片旁加「+ Metrics · N」，打開跟 Ads Performance 同一個 Customise metrics 面板：勾選、拖拉排順序、Save 套用（CRM 的數字照 Insight 期間計算，Meta 的「—」） | 你 2026-10-13 要求 |
| — | Insight 的廣告表格跟 Ads Performance 一樣：點表頭排序（▼ ▲ 取消）、拖拉表頭右邊調欄寬、雙擊恢復 | 你 2026-10-13 要求 |
| — | 聊天裡的預約訊息畫成 RS 的預約卡片（日期、時間、showroom、地址；點一下開 Calendar） | 你 2026-10-13：跟 RS 一樣 |
| — | Appointment 打開時已選好目前的 showroom、日期和時間；按鈕寫「Change to Tue 13 Oct, 5:00 pm」／「Pick a time」 | 你 2026-10-13：跟 RS 一樣（原本沒選時間，按鈕是灰的） |
| — | Full time 編輯框的人員表和「Who gets each day」保持完整高度，面板捲動 | 你 2026-10-13：人員被切掉（手機端同樣的修正是 #348） |
| — | Ads Performance 表格欄位可拖拉表頭右邊調寬窄，雙擊恢復；表頭每欄之間有淺色豎線 | 你 2026-10-13 要求 |
| — | Appointment 加 RS 的月份選擇（「Oct 2026 ⌄」選月份）和 Week｜Month 切換（Month 是整月日曆，過去或關閉的日子劃掉） | 你 2026-10-13：跟 RS 一樣 |
| 20–23 | 聊天顯示整段對話（設計稿只畫一則）；輸入框可以打字送出；＋和相機可以傳檔；打字時麥克風變成送出 | 真功能 |
| 24–25 | Ads Performance 的「Synced from Meta Ads · 9:00 am」改成「Meta Ads not connected yet」（灰點） | Meta 還沒接（等你確認），不能假裝已同步 |
| — | 回覆框的提示字顏色 #757575 | portal 的全域樣式會把它變灰藍，已改回設計稿的顏色 |
| — | Urgent / Reply soon / Won / Lost / Cold / No show 的 chip 顏色 | 設計稿只畫了 Overdue；用同一組色（To mark 的琥珀、Follow up 的棕） |
| — | 第 4、5 個 team 的顏色 | 設計稿只有 3 個 team；用設計稿另外兩個色 |
| — | Meta 的欄位（花費、曝光…）顯示「—」，Ads to teams 的 Running/Paused 篩選預設 All | Meta 還沒接 |
| — | Ads Performance › Download report › PDF 由伺服器產生（portal 統一的 PDF 樣式） | PDF 套件不能在瀏覽器跑 |

## 3. 會影響 RS / TL / TA 手機的設定（手機「樣子」不變，「內容」跟著設定）

| 在電腦版設定 | 手機上的效果 |
|---|---|
| Showrooms：開放時間、每週休息、封鎖日期 | 本來就連動（同一張表） |
| **Showrooms：只封鎖某幾個小時**（新，B9） | 手機 Book visit 那幾個時段消失；資料庫也會擋（`crm_slot_check`） |
| Showrooms：照片、Google Maps / Waze 連結（新，B4） | 發給客人的預約卡片用你填的連結（伺服器自己讀，不信任瀏覽器） |
| Assignment（Ads to teams、Full time、Organic 派送） | 本來就連動 |
| Member work type、Cold lead templates | 本來就連動 |
| **Forms（Customer info 表單，新，B5）** | 手機的 Customer details 表單：拿掉的內建題目不再問；新增的題目接在 Budget 後面，用原本的輸入框 / 文字框 / 圓角選項樣式；必填沒填不能存。Customer info 也顯示這些答案。 |
| **Remind（提醒回覆，新，B2）** | 業務員手機的鈴鐺出現「X reminded you to reply」 |
| 刪除通知（新，B3） | 只刪你自己的；你手機上也一起消失 |

Principal 和 Director 看到的是同一份設定（同一個資料庫，每 5 秒重新讀）；**History** 列出誰改了什麼。

## 4. 資料庫變更（`supabase/migrations/20261013100000_crm_desktop_control_panel.sql`，**2026-10-13 已套用到正式環境**，你同意後）

- B1 `crm_events` 多了客人歷程：assigned、first_reply、appt_booked / changed / cancelled、visit、status（trigger 自動記；舊資料用既有欄位補第一筆）
- B2 `crm_remind()` —— 只有 CRM · Manage
- B3 `crm_staff_prefs.notif_deleted` + `crm_delete_notifs()` —— 只動自己的
- B4 `crm_showrooms.photo_path / map_google / map_waze`、私有 bucket `crm-showrooms`、`crm_save_showroom_extras()` —— CRM · Manage
- B5 新表 `crm_forms`、`crm_contacts.extra`、9 個參數的 `crm_save_details()`（原本 8 個的保留）
- B6 新表 `crm_notes` + `crm_add_note()` —— 能處理這位客人的人才能寫
- B8 History：CRM 設定表的變更紀錄開放給 CRM · Manage 讀（`audit_tables.read_keys` 加 `crm_manage`）
- B9 `crm_slot_check()` 認得「某幾個小時」的封鎖
- `crm_slot_check`、`crm_save_details`、權限守門 trigger 都是從**正式環境的函式內容**改寫（md5 已核對）。
- 本機 PGlite 測試：`tests/member-sql/validate-crm-desktop.mjs`（33 項），其他 CRM 測試全部通過。
- 程式在 migration 套用前也能正常開（新欄位/新表讀不到就當作空的）。

## 5. 還沒接 / 等你

- **Meta Ads**（Ads Performance 的花費、曝光、Running/Paused）：等你確認 Meta 那邊。
- 正式環境 migration：`20261013100000` 與修正 `20261013220000`（兩種時段格式都認）都已套用（2026-10-13）。Principal、Director、無權限帳號的試跑（已還原）都照權限走。
- Messenger 卡片若用你填的地圖連結，會直接開那個網址（不經 `/nav.html`）；正式環境上需要實測一次。
