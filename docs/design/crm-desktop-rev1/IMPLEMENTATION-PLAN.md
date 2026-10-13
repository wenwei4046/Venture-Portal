# CRM Desktop rev 1 · 實作計畫（2026-10-13）

設計稿：`prototypes/CrmFrame.dc.html`（frames 2a–2d 為準）＋ `CRM Desktop rev 1 dev changes.md`（變更清單優先於原型）。

## 1 · 怎麼做到「跟原型一模一樣」

- **畫面直接從原型生成**：用 repo 現有的轉換器 `tools/crm-design/dc2jsx.cjs`（rev 1011 Control panel 就是這樣做的），把 `CrmFrame.dc.html` 的模板（1–1326 行）原封不動轉成 React（`crm/desk/DeskApp.tsx`）。顏色、字級、間距、圓角、陰影、hover 全部是原型的原值，不手抄。
- **邏輯改寫成 view model**：原型 1327–2407 行的邏輯（示範資料 + 畫面狀態）改寫成 TypeScript（`crm/desk/vm/*.ts`），資料改讀正式的 CrmData，綁定名稱和原型一模一樣。寫入一律走現有的 `crmWrite` / actions 和資料庫函式（權限照 CRM · View / Edit / Manage）。
- **動態效果**：原型只有一種動畫——展開箭頭旋轉 `transform .15s`；其他都是 hover 換色（`style-hover`）。右側選單沒有滑入動畫。照做，不多加。
- **比對方式**：做一個 fixture，把原型自己的示範資料餵進正式畫面（像 Revenue app 的 `?app=proto`），用 headless Chrome 截原型的每個 frame 和正式畫面的同一狀態（1440×900、1280×800），做**逐像素比對**，差異圖給你看。另外逐項點一遍 hover、展開、選單、Esc、↑↓ 鍵。

## 0 · 你的決定（2026-10-13）

- **入口**：正式站 Revenue app › Profile › **My leads & appointments**，在電腦上（寬 ≥ 1024 px）打開的畫面；規格照設計稿 1440 × 900 / 1280 × 800。
- **只做 Principal + Revenue Director 的電腦版**。Team leader、RS 和 View as 維持手機畫面。
- **手機版完全不改**（任何畫面、任何行為）。
- **側欄**：只在 CRM 裡照設計稿（CRM 分頁在 Profile 底下、可收成 72 px）；Revenue app 其他頁的側欄不變。
- **Meta Ads 現在一起做**：先寫整合方案給你同意。
- **需要改資料庫的功能**：方案同意前顯示空狀態。

**因為「手機不改」，設計稿這兩項要調整（請確認）：**
- **G2 Showrooms 的時段／星期**：手機的 Book visit 畫面不改，但它本來就讀資料庫的時段和封鎖，所以電腦版改了設定，手機能選的時段**會跟著變**（這是資料變，不是畫面變）。若連這個都不要，電腦版的時段設定就只能顯示、不能存。
- **H3 Forms**：設計稿說手機的 Customer info 表單要改讀這份設定。手機不改的話，Forms 存了也不會影響手機。建議：Forms 先只做空狀態，等你決定要不要改手機再做。

## 2 · 需要你決定的事（S1–S3 已決定，見第 0 節）

### 2.1 範圍
| # | 問題 | 原因 |
|---|---|---|
| S1 | 電腦版要開給 **Team leader 和 RS** 嗎？ | 之前決定只給 Principal + Director；設計稿有 Team leader（1f）和 RS（2d）的畫面，Chat progress 也寫「Principal + team leaders」。 |
| S2 | **Revenue app 的側欄**要改嗎？ | A1/A2：CRM 分頁放進 Revenue app 側欄的 Profile 底下，側欄可收成 72 px，Inbox/Assignment/Calendar 不顯示數字。這會改到整個 Revenue app 電腦版的側欄（不只 CRM）。 |
| S3 | **Ads Performance 接 Meta Ads API**（F1–F4、D2 的 Running/Paused/Pending） | 要新的 Meta 權限（`ads_read`）、廣告帳號、同步排程和新表。工作量大，建議分到第三階段；第一階段 Ads Performance 先只顯示 CRM 自己有的數字（Leads、Appt、Show-up）。 |

### 2.2 NEW DATA（需要改資料庫，先提方案、你同意才寫）
| # | 項目 | 建議做法（細節會另外寫方案） |
|---|---|---|
| N1 | Chat progress 的事件紀錄（D6）：指派、移轉、分享、第一次回覆、預約/改期、到店、備註、Lost 原因、狀態變化 | 擴充現有的 `crm_events`，用 trigger 自動記錄；舊資料用現有欄位補第一筆 |
| N2 | 提醒業務員回覆（C4、D4 Remind）＋聊天裡的系統行 | 新事件類型 `remind` ＋ 通知被提醒的人 |
| N3 | 通知：To assign、Assign 兩種新類型、刪除（每人自己的） | 新事件類型＋每人一份「已刪除」紀錄（像現在的已讀） |
| N4 | Reply 24 h 名單（B2） | 用現有訊息時間算「24 小時內回覆」，可能不需要新表，確認後告訴你 |
| N5 | Showrooms：照片、地圖連結手動覆寫、封鎖日期/時段、每個時段可選星期幾（G2，**手機 Book visit 也會跟著變**） | `crm_showrooms` 加欄位＋照片放 Storage |
| N6 | Cold lead templates 自訂變數（H2） | `crm_templates` 加變數清單；送 Meta 審核時轉成 `{{n}}` |
| N7 | Forms（H3）：客戶資料表單的設定，**手機的 Customer info 表單改讀這份設定** | 新表 `crm_forms`；手機表單改成依設定渲染 |
| N8 | Meta Ads 數據（見 S3） | 新整合，最後做 |

### 2.3 手機也會變（phone too）
- G2：Showrooms 的時段和星期 → 手機 **Book visit** 只顯示開放的時段。
- H3：Forms → 手機 **Customer info** 表單依設定顯示。
- 其他項目（Forms 編輯器、Ads Performance、Chat progress）只有電腦版。

### 2.4 設計稿的開放問題（J）
1. B2 Reply 24 h 名單（同 N4）。
2. 刪除通知要不要 Undo？
3. Meta 同步多久一次、要不要「Sync now」按鈕？
4. Send reminder 算不算 Chat progress 的「My actions」？

## 3 · 我發現的缺漏（會補，補了會告訴你）

- **1024–1279 px 寬度**：原型只有 1440 和 1280。建議 1024–1279 用 1280 的排版（側欄自動收成 72 px rail）。
- **載入中／讀取失敗／沒有資料**：原型都是滿資料。我會用原型現有的空狀態樣式補上（例如 Inbox 的「Pick a chat」那種）。
- **View as**、**Director 的 Team | Mine**：沿用現有規則。
- 原型裡的人名、廣告、日期是示範資料，正式版全部讀資料庫；「Today」用辦公室時間（UTC+8）。

## 4 · 分階段

1. **第一階段（不用改資料庫）**：外框（側欄、頂欄、右側選單、側欄 pane、toast、鍵盤）＋ Insight、Inbox、Assignment（Organic Leads、Ads to teams、Awaiting reply、Full time）、Calendar、Showrooms（現有欄位）、Settings（Member work type、Cold lead templates、Notifications 現有類型）＋ Ads Performance（CRM 數字）。需要 NEW DATA 的部分先照你的決定處理（隱藏或顯示空狀態）。逐像素比對。
2. **第二階段（你同意 N1–N7 之後）**：Chat progress、提醒、通知新類型與刪除、Showrooms 照片/封鎖、模板變數、Forms（含手機）。
3. **第三階段**：Meta Ads 整合（S3、N8）。

每一階段結束都會：截圖比對給你、跑型別檢查/lint/測試、更新 `.claude/rules/revenue/crm.md`。
