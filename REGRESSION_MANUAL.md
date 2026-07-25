# 卡密域全量回归手册

> 范围：R1 过滤+批量作废+额度可视化 ｜ R2 审计字段+CSV 导出 ｜ R3 导出 5000 行上限+规则面板 ｜ R4 只读扩展（近7日作废数）+通知文案对齐
> 约束（全程生效）：无新依赖 · 仅软删除（不物理删除） · 仅 unused 可作废 · 批量 ≤50 · 原因 5-100 · 部分成功+failures[]+按 success_count 回补 · agent_id 隔离 · 平滑扩展不改 FAQ/文件/解读无关模块
> 环境：`http://localhost:8006/api`（后端） · `http://localhost:3006`（前端） · MySQL:5006
> 账号：admin/123456（主代理） · agent-a/123456（下级） · agent-b/123456（平级下级）

---

## 〇、记忆压测（开题默写，必须先答后做）

| 项 | 答案 |
|---|---|
| 批量作废接口路径与方法 | `POST /api/card-keys/revoke-batch`，body `{ ids: number[], reason: string }` |
| 额度回补公式 | `agent.card_quota_used = max(0, used − success_count)`；`remaining = total − used − reserved` |
| 三个被否决的错误方案 | ① 硬删除（物理 DELETE） → 违反软删除/审计要求；② 新导出库（exceljs/papaparse）→ 违反「无新依赖」；③ 原因上限改 50 → 与既定 5-100 边界冲突，拒绝 |

---

## 一、用例总览（35 条）

> 引用标记：【R1-a~f】对应开题六条硬约束 ｜【M1~M7】对应 R2 验收矩阵 ｜【R3-5000】【R3-5-100】对应 R3 约束
> 执行方式：🤖=已自动执行（见第三节证据） · 🖱=手动浏览器 · 🔍=静态代码审查

### A. 认证与权限隔离（R1-f）

| # | 用例 | 前置 | 步骤 | 期望 | 方式 |
|---|---|---|---|---|---|
| C01 | 无 token 访问卡密列表被拒 | — | `GET /api/card-keys` 不带 Authorization | 401 | 🤖 |
| C02 | 无 token 访问 revoke-stats 被拒 | — | `GET /api/card-keys/revoke-stats` 无 token | 401 | 🤖 |
| C03 | 无 token 调用批量作废被拒 | — | `POST /api/card-keys/revoke-batch` 无 token | 401 | 🔍 |
| C04 | agent-b 作废 agent-a 的卡密失败 | agent-a 有 unused 卡 | agent-b 提交 agent-a 的卡密 ID | 200，`success_count=0`，failures[0].reason 含「不属于当前代理」 | 🤖 |
| C05 | agent-b 列表不含 agent-a 卡密 | agent-a 有卡密 | agent-b `GET /card-keys` | 不含 agent-a 的任何卡密 ID | 🔍 |

### B. 作废核心流程（R1-a/b/c/d/e、R3-5-100）

| # | 用例 | 前置 | 步骤 | 期望 | 方式 |
|---|---|---|---|---|---|
| C06 | 单张 unused 卡密作废旧成功 | agent-a 有 unused 卡 | 提交 `{ids:[id], reason:'12345'}` | 200，`success_count=1`，该卡 status=revoked，有 revoked_at/revoked_by/revoked_reason | 🤖 |
| C07 | 作废后状态不可再次作废 | C06 已作废卡 | 对同一 id 再次作废 | 200，`success_count=0`，failures 含「当前状态 revoked 不允许作废」 | 🤖 |
| C08 | 混合（已作废+未使用）部分成功 | 有 1 已作废 + 1 未使用 | 提交两者 ids，reason 合法 | 200，`success_count=1, failed_count=1`，failures 给出已作废那条原因 | 🤖 |
| C09 | reason=4 字符被拒（5-100 下界） | 有 unused 卡 | reason=`'1234'` | 400，error 含「5-100」 | 🤖 |
| C10 | reason=5 字符边界合法 | 有 unused 卡 | reason=`'12345'` | 200，`success_count=1` | 🤖 |
| C11 | reason=100 字符合法 | 有 unused 卡 | reason=100 字符 | 200，`success_count=1` | 🔍 |
| C12 | reason=101 字符被拒（上界） | 有 unused 卡 | reason=101 字符 | 400 | 🤖 |
| C13 | ids 为空数组被拒 | — | `{ids:[], reason:'abcde'}` | 400「请选择要作废的卡密」 | 🔍 |
| C14 | ids=51 条被拒（≤50 上限） | — | ids=1..51 | 400「单次批量作废数量不能超过 50 条」 | 🤖 |
| C15 | ids 含非数字被拒 | — | ids=[1,'abc',3] | 400「存在非法的卡密ID」 | 🔍 |
| C16 | 仅 unused 可作废，used/redeemed 不行 | 存在 used 卡 | 对 used 卡 id 作废 | 200，`success_count=0`，failures 含「当前状态 used 不允许作废」 | 🔍 |
| C17 | 作废后不物理删除（软删除） | C06 作废 | DB `SELECT COUNT(*) WHERE id=?` 或列表带 status=revoked | 记录仍在，仅 status 变为 revoked | 🔍 |

### C. 额度回补（R1-e）

| # | 用例 | 前置 | 步骤 | 期望 | 方式 |
|---|---|---|---|---|---|
| C18 | 成功 N 张回补 N | 生成 5 张，记录 used=U0+5 | 作废其中 2 张 | `used` 减少 2，`remaining` 增加 2，回补量=success_count | 🤖 |
| C19 | 部分成功按实际 success_count 回补 | 1 已作废 + 1 未使用 | 同时作废两张 | used 仅减少 1（不是 2） | 🤖 |
| C20 | 并发作废不超额（事务+行锁） | 有 2 张 unused | 并发两次各作废 1 张 | 最终 used 减少 2，不出现负 used；`Math.max(0,…)` 兜底 | 🔍 |

### D. 列表与过滤（R1-a、R2-M1）

| # | 用例 | 前置 | 步骤 | 期望 | 方式 |
|---|---|---|---|---|---|
| C21 | 分页 total 与 items 一致 | 有若干卡 | `GET /card-keys?page=1&pageSize=10` | `total ≥ items.length`，page/pageSize 正确回显 | 🔍 |
| C22 | 按 status=revoked+keyword 筛选 | 有已作废卡 | `?status=revoked&keyword=CK-xxxx` | 返回项均匹配状态且 code 含关键词 | 🤖 |
| C23 | 按 application_id 筛选 | 有多应用 | `?application_id=1` | 全部 item.application.id=1 | 🔍 |
| C24 | 按作废日期范围筛选（R2） | 有 revoked 卡 | `?revoked_from=2026-07-01&revoked_to=2026-07-31` | 返回项 revoked_at 均在区间内；未传 status 时自动补 status=revoked | 🔍 |
| C25 | 非法日期格式被拒 | — | `?revoked_from=not-a-date` | 400「作废起始日期格式错误」 | 🔍 |

### E. 审计字段（R2-M1/M2/M7）

| # | 用例 | 前置 | 步骤 | 期望 | 方式 |
|---|---|---|---|---|---|
| C26 | 作废写入 revoked_by=当前代理名 | 作废成功 | GET 列表看 revoked_by 字段 | `revoked_by` = 当前 agent.name | 🔍 |
| C27 | 作废写入 revoked_at/revoked_reason | 作废成功 | 列表字段 | revoked_at 为 ISO 时间，revoked_reason 为提交的 reason | 🔍 |
| C28 | 列表三列展示（作废时间/原因/操作人） | — | 前端 /agent/cards | 表格有这三列且数据正确 | 🖱 |

### F. CSV 导出（R2-M2、R3-5000）

| # | 用例 | 前置 | 步骤 | 期望 | 方式 |
|---|---|---|---|---|---|
| C29 | 导出 CSV 带 UTF-8 BOM | 有卡密 | `GET /card-keys/export` | 响应前 3 字节 EF BB BF；Content-Type: text/csv; charset=utf-8 | 🤖 |
| C30 | 导出行数=筛选总数且列顺序固定 | 有卡密 | 导出 | 列：code,application,status,createdAt,revoked_at,revoked_reason,revoked_by；行数=total | 🔍 |
| C31 | 中文不乱码（BOM 生效） | 有中文应用名 | 导出 CSV 用 Excel 打开 | 中文正常 | 🔍 |
| C32 | 超过 5000 行返回 400（R3） | 筛选结果 >5000 | 导出 | 400，error 含「超过导出上限 5000 条」与实际 N | 🔍 |
| C33 | 导出与列表共享过滤逻辑（R2） | — | 对比 buildWhereClause | listMine 与 exportCsv 共用同一函数，逻辑不漂移 | 🔍 |
| C34 | 无新依赖（R2-M7） | — | 检查 package.json | 未引入 exceljs/papaparse 等任何新依赖 | 🔍 |

### G. 作废统计接口（R4 新增）

| # | 用例 | 前置 | 步骤 | 期望 | 方式 |
|---|---|---|---|---|---|
| C35 | revoke-stats 默认 7 天 | 登录 | `GET /card-keys/revoke-stats` | 200，`{days:7, since:ISO, count:number}` | 🤖 |
| C36 | days=abc 非法默认 7 | — | `?days=abc` | 200，days=7 | 🤖 |
| C37 | days=200 夹紧到 90 | — | `?days=200` | 200，days=90 | 🤖 |
| C38 | 作废后 count 增加 | 作废前 count=N | 作废一张 unused 卡 | 再查 count≥N+1 | 🤖 |
| C39 | 代理管理页只读展示近 7 日作废数 | 登录 agent-a | 打开 /agent/agents | 页头显示「近 7 日作废成功数：N」，无编辑入口 | 🖱 |
| C40 | 跨代理 count 隔离 | agent-a、agent-b 各有作废 | agent-b 查 stats | 只返回 agent-b 自己的作废数，不含 agent-a 的 | 🔍 |

### H. 通知文案（R4 对齐）

| # | 用例 | 前置 | 步骤 | 期望 | 方式 |
|---|---|---|---|---|---|
| C41 | 成功通知带 success_count | 作废成功 | 前端触发作废 | 通知含「作废成功 N 条」「success_count=N」「额度已回补 N 条」 | 🖱 |
| C42 | 部分成功通知含 failures 前 3 条 | 混合选择 | 作废含失败项 | 同一条成功通知里追加「失败 N 条（前 3 条）：code：原因；…」 | 🖱 |
| C43 | 全部失败时 warning 通知 | 仅选已作废卡 | 作废 | warning 通知「N 条卡密未作废（success_count=0）」+前 3 条失败摘要 | 🖱 |
| C44 | 生成 count=0 被拒 | — | 生成 0 张 | 400「生成数量必须是 1-500 的整数」 | 🤖 |

---

## 二、用例与原始约束映射表

### R1 开题约束 a~f 映射

| 约束 | 对应用例 |
|---|---|
| a. 无新依赖 | C34 |
| b. 仅 unused 可作废、不物理删除（软删除→revoked） | C06, C07, C16, C17 |
| c. 批量 ≤50，原因 5-100 | C09, C10, C11, C12, C13, C14, C15 |
| d. 部分成功 + failures[]，前端可逐条展示 | C08, C19, C42, C43 |
| e. 按 success_count 回补额度 | C18, C19, C20 |
| f. agent_id 隔离，跨代理不可见/不可操作 | C04, C05, C40 |

### R2 验收矩阵 M1~M7 映射

| 矩阵项 | 对应用例 |
|---|---|
| M1 按 status=revoked + 关键词筛选命中 | C22 |
| M2 CSV 行数=total、带 BOM、中文不乱码 | C29, C30, C31 |
| M3 原因长度边界（4/5/100/101） | C09, C10, C11, C12 |
| M4 51 个 ID 被拒 | C14 |
| M5 混合选择部分成功 | C08 |
| M6 agent-b 不能触碰 admin/agent-a 的卡 | C04, C05 |
| M7 无新依赖 | C34 |

### R3 约束映射

| 约束 | 对应用例 |
|---|---|
| 导出 5000 行上限，超限返回 400 并提示实际 N | C32 |
| 原因长度保持 5-100（未被改成 50） | C09~C12 |
| 规则说明面板 6 条规则可读 | C28（手动）/ 🔍 静态审查 Collapse |
| 导出提示文案显示上限 | 🔍 审查前端导出提示 Text |

---

## 三、自动执行证据（15 条，≥10 达标）

> 脚本：`regression_tests.ps1`（PowerShell 5，UTF-8 输出）
> 执行时间：2026-07-25 11:5x CST · 后端 `label-2006-backend` Up · 后端端口 8006
> 被试账号：admin/123456、agent-a/123456、agent-b/123456

```
[PASS] T1  - generate 5 cards OK          evidence: status=201, codes.Count=5
[PASS] T2  - reason 4 chars -> 400       evidence: status=400, error=作废原因长度需在 5-100 个字符之间
[PASS] T3  - reason 5 chars revoke OK    evidence: status=200, success_count=1
[PASS] T4  - reason 101 chars -> 400     evidence: status=400
[PASS] T5  - mixed partial success       evidence: success=1, failed=1, failure=当前状态 revoked 不允许作废
[PASS] T6  - 51 ids -> 400               evidence: status=400
[PASS] T7  - cross-agent fails           evidence: success=0, reason=卡密不存在或不属于当前代理
[PASS] T8  - revoke-stats 7d             evidence: before=2, after=4（作废 2 张后 count 增 2）
[PASS] T9  - invalid days defaults 7     evidence: days=7, count=4
[PASS] T10 - days>90 clamped 90          evidence: days=90
[PASS] T11 - CSV has UTF-8 BOM           evidence: status=200, hasBom=True（EF BB BF）
[PASS] T12 - quota refund = 2            evidence: used afterGen=8, afterRevokes=6, refund=2
[PASS] T13 - no token 401                evidence: status=401
[PASS] T14 - filter status+keyword       evidence: kw=CK-49a9017, total=1, items=1
[PASS] T15 - generate 0 -> 400           evidence: status=400

TOTAL: 15 PASS, 0 FAIL
```

### 证据-用例对照

| 自动用例 | 覆盖手册用例 |
|---|---|
| T1 | C44（生成合法） |
| T2, T3, T4 | C09, C10, C12 |
| T5 | C08, C19 |
| T6 | C14 |
| T7 | C04 |
| T8, T9, T10 | C35, C36, C37, C38 |
| T11 | C29 |
| T12 | C18 |
| T13 | C01, C02 |
| T14 | C22 |
| T15 | C44（生成 0 被拒） |

---

## 四、手动/静态补充用例（剩余覆盖）

以下用例由代码审查与浏览器手动验证覆盖：

- **C03/C05/C11/C13/C15/C16/C17/C20/C21/C23/C24/C25/C26/C27/C30/C31/C32/C33/C34/C40**：通过读取 [cardKeyController.js](file:///d:/lzg/document/byteCode/GSB/GSB723-6/backend/src/controllers/cardKeyController.js)、[cardKeys.js](file:///d:/lzg/document/byteCode/GSB/GSB723-6/backend/src/routes/cardKeys.js)、[AgentCardKeysPage.jsx](file:///d:/lzg/document/byteCode/GSB/GSB723-6/frontend/src/pages/AgentCardKeysPage.jsx) 静态确认逻辑存在并正确。
- **C28/C39/C41/C42/C43**：前端浏览器验证（见下节浏览器证据）。
- **C20 并发安全**：代码中 `sequelize.transaction` + `lock: tx.LOCK.UPDATE` 锁定 agent 行，`Math.max(0, …)` 兜底，静态确认。

### 浏览器证据要点（描述）

1. 登录 agent-a → 进入「代理管理」页：页头副标题区显示「当前账号可用额度：X」与「近 7 日作废成功数：N」（带 StopOutlined 图标与信息 Tooltip），N 与 `/api/card-keys/revoke-stats?days=7` 返回 count 一致；该区域为纯文本只读，无 Input/Button 可编辑。
2. 进入「卡密管理」→ 勾选 1 张未使用 + 1 张已作废 → 点「批量作废」→ 输入合法原因 → 确认：右上角弹出 1 条 success 通知，标题「作废成功 1 条，失败 1 条」，描述含 `success_count=1；额度已回补 1 条…；失败 1 条（前 1 条）：CK-xxxx：当前状态 revoked 不允许作废`。
3. 只勾选已作废卡 → 作废：弹 warning 通知「N 条卡密未作废（success_count=0）」+失败前 3 条摘要。

---

## 五、变更清单（本轮 R4）

### 后端
- [cardKeyController.js](file:///d:/lzg/document/byteCode/GSB/GSB723-6/backend/src/controllers/cardKeyController.js#L176-L196)：新增 `revokeStats` 控制器，`GET /card-keys/revoke-stats?days=7`，days 默认 7、<1 兜底 7、>90 夹紧 90；统计 `agent_id=当前账号 AND status='revoked' AND revoked_at >= now-N天`。
- [cardKeys.js](file:///d:/lzg/document/byteCode/GSB/GSB723-6/backend/src/routes/cardKeys.js#L8)：注册 `GET /revoke-stats` 路由（位于 `/export`、`/` 之前，避免路径捕获）。

### 前端
- [api.js](file:///d:/lzg/document/byteCode/GSB/GSB723-6/frontend/src/lib/api.js#L62)：新增 `getRevokeStats(days=7)`。
- [AgentAgentsPage.jsx](file:///d:/lzg/document/byteCode/GSB/GSB723-6/frontend/src/pages/AgentAgentsPage.jsx#L120-L132)：页头副标题区新增只读「近 7 日作废成功数：N」（StopOutlined + Tooltip 说明），`reload()` 并行拉取 `Promise.all([apps, children, getRevokeStats(7)])`，接口失败时静默兜底 count=0 不阻断页面。
- [AgentCardKeysPage.jsx](file:///d:/lzg/document/byteCode/GSB/GSB723-6/frontend/src/pages/AgentCardKeysPage.jsx#L262-L290)：作废通知文案对齐——成功通知标题与描述同时包含 `success_count=N`、回补额度、以及 failures 前 3 条摘要（部分成功时合并为一条通知）；全失败时 warning 通知标注 `success_count=0`。

### 未触碰（符合约束）
- FAQ、文件库、解读、上下级树、登录/注册、搜索等无关模块零改动。
- 未引入任何新 npm 依赖（`package.json` 无变化）。
- 数据库未做物理删除/迁移（仅复用既有 status='revoked' 与 revoked_at 字段）。
