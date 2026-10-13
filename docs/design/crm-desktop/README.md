# CRM 電腦版 · Claude Design 交接包（2026-10-12）

Revenue app › Profile › **My leads & appointments** 在電腦上（寬度 ≥ 1024px）打開的是電腦版，手機上仍然是手機版。
這個資料夾是把**目前做好的基礎**帶去 Claude Design 調整、再帶回 Claude Code 實作用的。

- 第一版（已完成，分支 `crm-desktop`）：Control panel 電腦版，給 Principal 和 Revenue Director。
- 第二版（還沒做）：RS（業務員）的電腦版，用同一個外框。這次可以在 Claude Design 一起設計。

---

## 資料夾內容

| 檔案 / 資料夾 | 用途 | 要上傳到 Claude Design 嗎 |
|---|---|---|
| `design-brief.md` | 設計說明：每個畫面做什麼、**能用的資料**、可以改／不能改的地方、已知問題、要交回來的東西 | ✅ 一定要 |
| `prompt-claude-design.md` | 在 Claude Design 開新專案時貼的提示詞 | 複製內容貼上 |
| `desktop/*.png` | 目前電腦版 20 個畫面的截圖（1440×900，示範資料） | ✅ |
| `html/*.html` | 同樣 20 個畫面的 HTML 快照，可以直接打開、在 Claude Design 裡當起點修改（不進 git，只在這台電腦上） | ✅ 建議上傳（至少 01、05、08、12、14） |
| `rs-phone/*.png` | RS 手機版 6 個畫面（Inbox、聊天、Contacts、Calendar、Insight、Profile），設計 RS 電腦版的參考 | ✅ 要做 RS 時 |
| `prompt-claude-code.md` | 從 Claude Design 拿回來之後，在 Claude Code 貼的提示詞 | ❌ 回來時用 |
| `crm-desktop-handoff.zip` | 上面要上傳的檔案打包（不進 git） | 一次上傳用 |

截圖的編號：01–03 Insight · 04–07 Inbox · 08–11 Assignment · 12–13 Calendar · 14–19 Settings · 20 Director（有 Team | Mine）。

---

## 步驟 A · 帶去 Claude Design

1. 打開 claude.ai › **Design**，開一個新專案，名稱例如「CRM Desktop rev 1」。
2. 上傳 `crm-desktop-handoff.zip` 裡的檔案（或分別上傳：`design-brief.md`、`desktop/` 的截圖、`html/` 的快照、`rs-phone/` 的截圖）。
3. 把 `prompt-claude-design.md` 的內容整段貼上，送出。
4. 在 Claude Design 裡調整。建議順序：
   1. 先定**外框**：頁首、分頁、右邊側欄的寬度和開關方式（Control panel 和 RS 共用）。
   2. 再做 Control panel 五頁：Insight → Inbox → Assignment → Calendar → Settings。
   3. 最後做 RS 電腦版（Inbox / 聊天、Contacts、Calendar、Insight、Profile）。
5. 調整時請記住（`design-brief.md` 第 4 節有完整清單）：
   - **只用清單上的資料**。需要新的資料（例如新的數字、新的欄位），請在變更清單裡標「NEW DATA」，Claude Code 會先提資料庫方案給你同意才做。
   - **誰看得到什麼不變**（Assignment、Settings 只有 CRM · Manage 看得到）。
   - 右邊側欄目前放的是**手機版的畫面**（聊天、編輯器、Send to…）。要改它們的樣子，要標明「只改電腦版」或「手機版也一起改」。
6. 完成後，請 Claude Design 交出：
   - 一個 `.dc.html` 原型檔（每個畫面一個 frame，1440×900，另外至少一個 1280×800）；
   - 一份變更清單 `CRM Desktop rev 1 dev changes.md`（照 rev 1010 / 1011 的格式：編號、畫面、改什麼、驗收方式）；
   - 新增的圖示或圖片。
7. 下載匯出的資料夾。

## 步驟 B · 帶回 Claude Code

1. 把 Claude Design 匯出的資料夾放到 repo 的 `docs/design/crm-desktop-rev1/`（原型放 `prototypes/`）。
2. 在 Claude Code 打開 `Venture-Portal`，確認在分支 `crm-desktop`（或它合併後從 main 開的新分支）。
3. 把 `prompt-claude-code.md` 的內容貼上。
4. Claude Code 會：
   - 先讀變更清單和 `.claude/rules/revenue/crm.md`；
   - 有 NEW DATA 或要改資料庫的項目，**先提方案、等你同意**；
   - 電腦版頁面改 `src/components/member/crm/panel/desk/`（RS 的放 `crm/sales/desk/`），外框改 `crm/desk/`；
   - 側欄裡的手機版畫面，只透過它們的 generator patch 改（`tools/crm-design/`）；
   - 改完用 headless Chrome 截 1440×900 的圖給你比對，跑測試，再開 PR。

---

## 小提醒

- 截圖和 HTML 快照用的是示範資料（Teams Kelvin / Priya / Ryan、HOD Peter），不是正式客戶。
- HTML 快照沒有程式，只是畫面；按鈕點了不會有反應。
- 要重新擷取（例如程式改了之後），用 `tools/crm-design/capture-desktop.mjs`（見檔案開頭的說明）。
