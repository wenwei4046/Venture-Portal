# 開始交接：給 Claude Code

## 你只要做 3 件事

**1. 解壓到專案的 `docs` 資料夾**

```
Venture-Portal/
└── docs/
    └── design_handoff_crm_redesign/   ← 解壓後的資料夾
```

**2. 在專案根目錄打開 Claude Code**

```
cd Venture-Portal
claude
```

**3. 貼上這一句**

```
Follow docs/design_handoff_crm_redesign/CLAUDE.md
```

這樣就好。後面的步驟 Claude Code 會照 `CLAUDE.md` 自己走。

## 它會怎麼做

1. **先畫對照表，不改程式**：每個畫面對應到哪些檔案，寫在 `SCREEN_MAP.md`。它會停下來給你看，確認沒問題就回它「繼續」。
2. **換顏色和字體**：做完會停下來回報。
3. **桌面版**：一條一條改，每條做完都會告訴你怎麼驗收。
4. **手機版**：同上。
5. **最後交一份 `CHECKLIST.md`**：28 條改動逐條標示完成、部分完成或未完成。

## 你怎麼檢查

每次它停下來，就打開 `CRM Desktop.dc.html` 或 `CRM Phone.dc.html`，找到同編號的畫面，對照實際 app 看起來是否一樣。

## 它不會做的事

- 不會刪掉現有功能。設計稿沒畫到的會保留，只換成新樣式。
- 不會新增資料欄位或 API。需要的話，它會先問你。

## 資料夾裡有什麼

- `START HERE.md`：這份說明。
- `CLAUDE.md`：給 Claude Code 的工作指示。
- `CRM Redesign dev changes.md`：28 條改動，每條附驗收標準。
- `README.md`：顏色、字體規格和逐頁說明。
- `CRM Desktop.dc.html`、`CRM Phone.dc.html`：設計稿，用瀏覽器打開。
- `support.js`、`icons/`：讓設計稿能打開，app 用不到。
