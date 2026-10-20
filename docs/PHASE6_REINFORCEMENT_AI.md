# Phase 6 — Reinforcement AI（定向生成 + 质量门 + 证据纪律）

> AI 是脚手架，不是替代品：它只生成**练习材料**，真实英语仍负责最终能力验证，
> 掌握证据只来自用户自己完成的独立作答。

## 1. 能力范围

| 能力 | 入口 | 产物 |
| --- | --- | --- |
| 定向句生成 | 句子页「AI 定向句」 | `SentenceRecord`（`sourceType=ai`，`structureProvenance=ai_unverified`） |
| 强化阅读生成 | 阅读页「AI 强化阅读」 | `Passage`（`sourceType=ai_reinforcement`，`sourceReliability=ai_generated`，`extractionMethod=ai_generated`）+ 有证据的阅读题 |

两者都走既有 Learning Model：AI 句子进句库后由 Phase 4 选句/Lab 消费；AI 文章进阅读库后走 Phase 5 的冷读 → 分层阅读 → 标记 → 重读 → 收尾。**Planner 未新增任务类型**，因此未配置/生成失败时不会出现无法执行的假任务。

## 2. Provider 层（`src/aiProvider.ts`）

- **配置**：endpoint / model / key / structuredMode / timeoutMs / maxRetries / maxOutputTokens / temperature / concurrency / dailyTokenBudget；数值全部夹紧，Key 只在内存与本地设置中，不入日志、不入错误消息、不入生成记录。
- **能力不假设**：`auto` 依次尝试 `json_object → json_schema → text`；只有明确“不支持 response_format”才降级，并把可用模式记入 `settings.ai.knownMode`。
- **失败分类**：`missing-key / missing-model / invalid-endpoint / auth / model-not-found / rate-limit / server / timeout / network / cors / aborted / invalid-response / unsupported-mode / budget-exceeded`，每条都有中文可读提示与下一步建议。
- **有界重试**：只重试 429/5xx/超时/网络；鉴权/参数错误立即失败；限流不再整轮重试（避免成倍扣费）。
- **取消/超时**：`AbortSignal` + 单请求超时；用户取消立即返回 `aborted`。
- **用量**：优先用 Provider 的 `usage`，缺失时按字符/4 估算并标 `estimated`；预算按 **token** 计，**不**伪造货币金额。

## 3. 结构化输出（`src/aiJson.ts` + `src/aiValidate.ts`）

- JSON 修复仅三类：去代码围栏、丢弃前后解说取第一个平衡对象、去尾逗号；修不好直接失败。
- 契约严格：必需字段、无多余字段、类型、枚举、数组长度、文本长度、词数窗口、目标词必须在允许集合、语法点必须在知识图谱、选项不重复、`answerIndex ∈ 0..3`、**证据句必须逐字出现在正文**（空白与引号归一后比较）。
- 任一项失败 → 不落库，进入下一次修正（最多 3 次），并把问题清单写回给模型。

## 4. Prompt 版本化（`src/prompts/`）

| promptId | version | 用途 | 降级 |
| --- | --- | --- | --- |
| `sentence.generate` | 1.0.0 | 用薄弱词 + 语法点造一句自然英文 | 改用 Phase 4 authored 教学句 / 用户真实难句 |
| `reading.reinforce` | 1.0.0 | 针对真实阅读障碍生成短文 + 有证据的阅读题 | 继续读用户导入的真实文章 |

每条生成记录保存 `promptId`、`promptVersion`、`promptHash`（`promptId@version#fnv1a`）、`providerHost`、`model`、`structuredMode`、`usage`、`generatedAt`、`sourceMetadata`。改提示词必须升 version。

## 5. 质量门（`src/aiQuality.ts`）

1. Schema（上节校验）
2. 词数窗口
3. 目标词出现（允许词形派生，左边界必须是词边界）
4. 目标语法可观察（正则可达者强校验；语义型概念标 `unverifiable`，**不假装验证过**）
5. 难度理智性（本地启发式：词数 + 从句标记；目标带 ±1）
6. 内容指纹去重
7. 来源归属（`provenance=ai` / 证据逐字可回溯）
8. 安全渲染（禁 HTML/脚本/`javascript:`/控制字符）

不通过即拒绝或重试；**不为提高成功率放宽任何一条**。

## 6. 难度控制

输入真实学习模型数据（薄弱词、薄弱语法、已知词规模与样例、阅读障碍、目标词数），限制句长/从句/生词负荷/篇幅；模型自述难度只作参考，最终以本地启发式估计为准；用户真实练习结果才用于后续校准（本阶段不改 Planner 估算常量）。

## 7. 证据纪律

| 行为 | 产物 | 是否进入掌握 |
| --- | --- | --- |
| 生成/查看 AI 句子或文章 | generated material | 否 |
| 采纳进句库 | `ai_unverified` 句 | 否 |
| 在 Lab 中作答（独立/迁移/延迟） | attempt 证据 | 是（既有 BKT/FSRS 规则） |
| 阅读 AI 文章并标记/重读 | exposure / reading session | 否（阅读只是接触） |

浏览器验收逐字段比对了生成前后所有词的 `level/total`：**零变化**。

## 8. 隐私

- 只发送：目标词、语法点 id/名称、主题/障碍描述（用户可见的文本）、必要约束。
- 不发送：完整词库、学习历史、笔记、备份、API Key（Key 只进 `Authorization` 头）。
- 验收实测最长 user 消息 610 字符；请求体不含 `sk-`；生成记录中无 Key。
- 图片/文章正文默认不上传；只有用户主动点「生成」才发送上面列出的最小字段。

## 9. 失败降级

| 情况 | 表现 | 本地功能 |
| --- | --- | --- |
| 无 Key / Endpoint 空 | 按钮禁用 + 原因说明 | 全部可用，0 次请求 |
| 401/403 | 鉴权失败提示 | 全部可用 |
| 404 | 模型/接口不存在提示 | 全部可用 |
| 429 | 限流提示（最多 3 次请求） | 全部可用 |
| 超时 / 网络 / CORS | 对应提示 + 建议 | 全部可用 |
| 取消 | `已取消`，引擎/请求停止 | 全部可用 |
| 非法 JSON / 校验失败 | 列出具体问题，**不落库** | 全部可用 |

## 10. 测试

- 单元/集成：`tests/aiProvider.test.ts`（13）、`tests/aiStructured.test.ts`（8）、`tests/aiGenerate.test.ts`（10）。
- 浏览器：`scripts/phase6-smoke.mjs` + `tools/mock-ai-provider.mjs`（OpenAI-compatible，模型名切换行为：`mock-valid` / `mock-bad-json` / `mock-bad-evidence` / `mock-rate-limit` / `mock-slow` / `mock-auth-fail`）。
- 结果：**176/176** 测试；**31/31** 浏览器验收；回归 26/26 · 44/44 · 36/36 · 21/21。

浏览器验收覆盖：Scenario A（生成 → 校验 → 句库 → 掌握不变）、B（阅读障碍 → 强化文章 → 保存 → 可进阅读流程）、C（无 Key 全本地可用、0 请求）、D（429 明确报错、有界重试）、E（非法 JSON 有界修复、失败不落库）、F（刷新后材料与记录仍在）。

## 11. 真实 Provider 复验（尚未执行）

需要用户自己的 Key，且**不得**在聊天中提供。步骤：

1. 设置页填入 Endpoint（到 `/v1`）、Model、Key，勾选「在这台设备记住 Key」。
2. 打开浏览器 DevTools → Network，确认 `POST {endpoint}/chat/completions` 返回 200 且含 `choices[0].message.content`。
3. 在句子页生成一次：结果应显示 `sentence.generate@1.0.0`、真实 `model`、`tokens`。
4. 在阅读页生成一次：确认质量门「全部检查通过」且证据句能在正文里找到。
5. 故意填错 Key：应显示「鉴权失败」，且不产生任何生成记录。
6. 把上述 5 步的实际输出（不含 Key）记录到本文件，才算「真实 Provider E2E 通过」。

## 12. 已知限制

- 真实供应商未验收（无凭据）：协议与校验链已用 mock 端到端验证，但**不能**据此宣称真实 Provider E2E 通过。
- 语法“可观察性”是正则启发式：`structure.core`、`clause.attributive-nonexistent` 等语义型概念只能标 `unverifiable`。
- 难度控制是启发式（词数/从句/生词负荷），不是心理测量模型。
- 未做流式输出、多轮工具调用、批量生成；单次并发上限 1（UI 串行）。
- AI 文章不进入真实语料统计（阅读分析会单独标 `ai_reinforcement`）。
