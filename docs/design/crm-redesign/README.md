# CRM 重新设计 · Claude Design 交接包（2026-10-17）

这次要用 Claude Design 重新设计 **CRM 手机版**（业务员的 Mine + Principal / Director 的 Team 控制面板）和 **CRM 电脑版**（Principal / Director 的桌面 CRM）。
这个资料夹把**目前正式上线的样子**完整带过去，让 Claude Design 在现有基础上重新设计，再带回 Claude Code 实作。

截图全部来自 2026-10-17 的 `main`（PR #540 之后），用示范资料（Teams Kelvin / Priya / Ryan、Revenue Director Peter），不是正式客户。

---

## 资料夹内容

| 档案 / 资料夹 | 用途 | 要上传到 Claude Design 吗 |
|---|---|---|
| `design-brief.md` | 设计说明：CRM 是什么、谁看到什么、每个画面能用的资料、不能改的规则、老板最近定下的决定、要交回来的东西 | ✅ 一定要 |
| `prompt-claude-design.md` | 在 Claude Design 开新专案时贴的提示词 | 复制内容贴上 |
| `phone-mine/*.png` | 业务员手机版 9 个画面（430×932 @2x） | ✅ |
| `phone-team/*.png` | Principal 手机版控制面板 8 个画面 | ✅ |
| `desktop/*.png` | 电脑版 13 个画面（1440×900） | ✅ |
| `html/*.html` | 同样 30 个画面的 HTML 快照，可以直接打开，当作 Claude Design 修改的起点（不进 git，只在这台电脑上） | ✅ 建议至少上传每组的 01 和聊天室 |
| `prompt-claude-code.md` | 从 Claude Design 拿回来之后，在 Claude Code 贴的提示词 | ❌ 回来时用 |
| `crm-redesign-handoff.zip` | 上面要上传的档案打包（不进 git） | 一次上传用 |

**截图编号**
- `phone-mine/`：01 Inbox · 02 聊天室 · 03 聊天室＋Attach · 04 聊天室＋表情 · 05 Contacts · 06 Calendar · 07 Insight · 08 Profile · 09 Notifications
- `phone-team/`：01 Insight · 02 Inbox（看板）· 03 Assignment · 04 Ads to teams · 05 一个广告的分配 · 06 Calendar · 07 Profile · 08 Showrooms
- `desktop/`：01 Insight · 02 Inbox · 03 Inbox＋聊天 · 04 Contacts · 05 Contacts＋客户 · 06 Calendar · 07 Ads Performance · 08 Assignment · 09 Showrooms · 10 Customer form · 11 Channels · 12 Settings · 13 Audit log

---

## 步骤 A · 带去 Claude Design

1. 打开 claude.ai › **Design**，开新专案，名称例如「CRM Redesign 2026-10」。
2. 上传 `crm-redesign-handoff.zip` 里的档案（或分别上传 `design-brief.md`、三个截图资料夹、`html/` 的快照）。
3. 把 `prompt-claude-design.md` 的内容整段贴上，送出。
4. 在 Claude Design 里调整。建议顺序：
   1. **先定视觉语言**：颜色、字体、圆角、卡片、按钮、底部导航——手机和电脑共用一套。
   2. **手机 Mine**：Inbox → 聊天室（含输入框、Attach、表情、录音）→ Contacts → Calendar → Insight → Profile。
   3. **手机 Team**：Insight → Inbox 看板 → Assignment（含 Ads to teams 编辑）→ Calendar → Profile（含 Showrooms）。
   4. **电脑版**：外框（左侧栏、顶栏、右侧栏）→ 各页。
5. 调整时请记住（`design-brief.md` 第 5、6 节有完整清单）：
   - **只用清单上的资料**。需要新的资料，在变更清单里标「NEW DATA」，Claude Code 会先提资料库方案给你同意才做。
   - **谁看得到什么不变**（例如 Assignment、Showrooms、Channels 只有 CRM 管理权限的人看得到）。
   - 第 6 节是**老板最近定下的决定**（例如自己的气泡是深橙色、Team 的 Inbox 右上角是人像 → 铃铛 → Contacts、小房子在 Team 的 Insight）。要改这些，请在变更清单里写明，回来时我会先问你。
6. 完成后，请 Claude Design 交出：
   - `.dc.html` 原型（每个画面一个 frame：手机 430×932，电脑 1440×900，另外至少一个 1280×800）；
   - 一份变更清单 `CRM Redesign dev changes.md`（编号、画面、改什么、手机 / 电脑 / 两边、NEW DATA、验收方式）；
   - 新增的图示或图片。
7. 下载汇出的资料夹。

## 步骤 B · 带回 Claude Code

1. 把汇出的资料夹放到 repo 的 `docs/design/crm-redesign-rev1/`（原型放 `prototypes/`）。
2. 在 Claude Code 打开 `Venture-Portal`，把 `prompt-claude-code.md` 的内容贴上。
3. Claude Code 会：
   - 先读变更清单和 `.claude/rules/revenue/crm.md`；
   - 有 NEW DATA 或要改资料库的项目，**先提方案、等你同意**；
   - 跟老板决定（brief 第 6 节）冲突的项目，**先列出来问你**；
   - 照现在的做法：画面从原型「生成」，行为放在 view model，不手改生成的档案；
   - 改完截图给你逐张比对，跑测试，再开 PR。

---

## 小提醒

- HTML 快照没有程式，只是画面；按钮点了不会有反应。
- 要重新撷取（例如程式改了之后）：先开 dev server，再跑
  `CRM_BASE=http://localhost:3000 node tools/crm-design/capture-redesign.mjs docs/design/crm-redesign`
  （`ONLY=phone` 或 `ONLY=desktop` 只截一边）。
- 这次没有包含：Revenue app 本身（Today、Quote、Arena…）、业务员的电脑版（还没做）、照片编辑器和相机（全萤幕工具，可以之后另外设计）。
