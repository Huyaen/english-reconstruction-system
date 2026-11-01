# 词间 v1.0.0 最终发布报告

> 日期：2026-11-01　仓库：`Huyaen/english-reconstruction-system`（私有）　数据库版本：7
> 本报告只记录**可复现的命令与实测结果**，不包含任何密钥、令牌或用户学习内容。

## 一、结论

**判定：READY FOR RELEASE（产品侧全部门禁通过，已合并 `main` 并完成本地部署；剩 1 件账号安全操作需你本人完成——轮换 GitHub 令牌，见第八节）。**

- `main` 已从 `9de8acd` 快进到 `b7c6af2`，远端 HEAD 与本地一致，CI（push 事件）通过。
- 真实用户学习数据已备份到仓库外，并做过一次**隔离 origin 的恢复预演**（计数完全一致）。
- 启动入口固定 `http://localhost:4173`，双击「启动词间.cmd」或桌面「词间」快捷方式即可；停止用「停止词间.cmd」。
- 没有修改任何学习逻辑、证据规则、数据库版本或用户记录；本轮只做发布工程与文档。

## 二、交付坐标

| 项目 | 值 |
|---|---|
| 发布分支 | `main` |
| 最终 HEAD | `1f9f2fdabb00e30e41e9c43d496fa47b6ee9051c`（仅文档回填） |
| 发布工程提交 | `a7f9bb0053bd956520d42acfcdab40a9e522ed5d`（启动器 + 文档 + 截图） |
| 代码合并点 | `b7c6af235ad2048acf50aee34275144d993b44df` |
| 合并前 main | `9de8acd2a40f84ab1fb631ada79de15242d2e45a` |
| 合并方式 | `git merge --ff-only`（快进，无合并提交、无强推、无历史改写） |
| 回滚坐标 | tag `pre-v1.0.0-main` → `9de8acd`（本轮新建，未移动任何旧 tag） |
| 发布 tag | `v1.0.0` → `a7f9bb0`（annotated，已推送；`git ls-remote` 已核对） |
| CI（main push） | `41302414739` @ `1f9f2fd` success；`41302197280` @ `a7f9bb0` success；`41299310883` @ `b7c6af2` success |
| CI（合并前的同等代码） | run `41291883816`（`workflow_dispatch` @ `b7c6af2`）→ success |
| 测试 | `npm test` **438/438**（本轮在 `main` 上重跑） |
| 构建 | `npm run build` 0；`dist` 与提交内容逐字节一致（重建后 `git status dist` 为 0） |
| 文案门禁 | `copy-lint {"files":101,"hits":0}` |

## 三、发布门禁实测

| 门禁 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 通过（无输出） |
| 全量测试 | `npm test` | `tests 438 / pass 438 / fail 0`（31.2s） |
| 生产构建 | `npm run build` | `✓ built`，`stamp-sw → erv2-shell-v2-2c36f11d44` |
| 构建可重现 | `npm run build` 后 `git status --porcelain dist` | 0（产物与提交一致，不是陈旧构建） |
| 文案检测 | `node scripts/phase16_1-copy-lint.mjs` | `{"files":101,"hits":0,"byRule":{}}` |
| 测试钩子 | `grep -rl "__labTest\|__readTest\|__examTest" dist/assets/*.js` | 无（生产包不含测试钩子） |
| CI | GitHub Actions | main push `41302197280`（`a7f9bb0`）success；`41299310883`（`b7c6af2`）success；Node 22 的「Verify committed build artifacts」步骤绿 |

Git 卫生：合并前 `git status --porcelain` 为 0；`git stash list` 空；`.git/MERGE_HEAD`、`rebase-merge`、`rebase-apply` 均不存在；`origin/main` 与本地 `main` 同哈希；工作树在合并、构建、冒烟之后仍为 0 改动（本轮新增文件见第六节）。

## 四、合并过程（含一次自我纠正）

1. 在 `main` 的旧头上打回滚 tag：`pre-v1.0.0-main → 9de8acd`。
2. `git checkout main` → `git merge --ff-only phase16.3-evidence-integrity`。
3. **发现同名歧义**：tag `phase16.3-evidence-integrity`（指向 `53aa8ab`）与分支同名，`git merge <名字>` 解析到了 tag，`main` 先停在 `53aa8ab`。
   这不是历史改写，只是少走了 2 个提交；随即 `git merge --ff-only refs/heads/phase16.3-evidence-integrity` 补到 `b7c6af2`。
   教训：**同名 tag 与分支时，合并必须写 `refs/heads/…`**。
4. `git push origin main` → `9de8acd..b7c6af2  main -> main`（快进推送，未使用 `--force`）。
5. 远端核对：`git ls-remote origin refs/heads/main` = `b7c6af2…` = 本地 HEAD。
6. 既有 tag 全部未移动：`phase16.3-evidence-integrity → 53aa8ab`、`phase16.2-copy-final → 2af1bd7`。

## 五、真实学习数据备份（已完成）

用户真实数据位于 **Edge Default profile**、origin `http://localhost:4173` 的 IndexedDB（`vocabulary-memory-v1`）。

只读做法：把该 origin 的 IndexedDB 目录**复制**到全新临时 profile，用无头 Edge 打开同一 origin，让应用自己执行「导出全部学习数据」。**原件只被读取，没有被打开、迁移或写入。**

| 项 | 值 |
|---|---|
| 备份文件 | `D:\英语重构训练\词间备份\词间完整备份_2026-11-01_dbv7.json` |
| 大小 | 5,832,494 字节 |
| SHA-256 | `ce634517790fb61ffaa5b5c61bf45b696f768d53f8c51154c91dcce98fb875c0`（同目录 `.sha256.txt`） |
| 元数据 | `D:\英语重构训练\词间备份\BACKUP-META_2026-11-01.json` |
| 格式 / 版本 | `vocabulary-memory` / 7 |
| 内容计数 | books 1、words 3175、records 7、sessions 1、sentences 12、grammarConcepts 34、examSpecifications 3、examMaterials 2、examItems 16 |
| 敏感字段 | `settings.key` 为空、`rememberKey=false`（`backup()` 强制剔除密钥）；备份内 `sk-` 出现次数 0 |

备份位置在**仓库之外**（`D:\英语重构训练\词间备份\`），不进 Git、不进发布包。

## 六、恢复预演（隔离 origin）

- 环境：全新 profile + `http://localhost:4176`（与真实 origin 不同，互不干扰）。
- 操作：走真实界面「设置 → 选择备份文件 → 恢复」，随后刷新页面。
- 结果（恢复后 / 刷新后完全一致）：

```json
{"books":1,"words":3175,"records":7,"sessions":1,"sentences":12,
 "grammarConcepts":34,"examItems":16,"examMaterials":2,"examSpecifications":3,
 "settings":{"endpoint":true,"model":true,"hasKey":false,"theme":"dark","ratio":50}}
```

- 脚本错误 0；`hasKey:false` 属设计（备份不带密钥），恢复后需在设置页重新填一次 AI 密钥。
- 与真实数据计数的对照：books 1 / words 3175 / records 7 / sessions 1 / sentences 12 / grammarConcepts 34 / exam 3+2+16 —— **逐项一致**。

## 七、发布冒烟（全新 profile + 合成数据，origin `http://localhost:4177`）

一条脚本走完 12 项检查清单，结果全部为真实界面操作 + IndexedDB 读取：

| # | 检查项 | 实测证据 |
|---|---|---|
| 1 | 首页正常打开、无空白、无脚本错误 | `page=home`，12 张截图，`Runtime.exceptionThrown` 计数 **0** |
| 2 | 词汇书导入（合成 CSV，20 词） | `#import` → 选择文件 → 预览 → 确认；`words=20` |
| 3 | 计划生成 | 30 分钟档 → 生成 5 项任务（新词预览/回忆测试/拆句/写作/收尾再想一次），`dailyPlans=1` |
| 4 | 词汇训练、双向出题、答题反馈、进度 | 预览 20 词 → 回忆测试 10 题：`records=10`、`sessions=1`，答对/答错反馈与「下一题」均出现 |
| 5 | FSRS 复习排期 | `words[*].fsrs.due` 有值：`tested 6~10` 个词全部 `withDue`，`reps 1~2`、`scheduledDays` 有值 |
| 6 | 句子拆解 | 真实句库 12 句 → 开始拆句 → 4 步（主干/谓语/切分/整句义）→ 结果页「步骤正确 2/4」；`sentenceAttempts=1` |
| 7 | 阅读辅助 | 粘贴 106 词文章 → 首读准备（难度/已知词覆盖）→「开始逐段阅读」→ 阅读器 + 辅助工具（`#read-help-tools` 等）可用；`passages=1` |
| 8 | 写作输出 | 选任务 → 编辑器输入 → 提交：`outputAttempts=1`，出现「请求语言反馈」（AI 未配置时的降级口径） |
| 9 | 语法概念 | 打开「句子主干（主+谓）」详情：难度、练习情况、先修、易混、知识卡齐全 |
| 10 | 报告/统计/薄弱词/AI 建议 | 四页均渲染（正文长度 90~2577 字符），无空白页 |
| 11 | 刷新持久化 | 刷新前后 `{words:20, records:10, sessions:1, passages:1, sentenceAttempts:1, outputAttempts:1, dailyPlans:1}` 完全一致 |
| 12 | 导出 | 设置页「导出全部学习数据」→ 下载 JSON（`format=vocabulary-memory`、`version=7`） |

截图：`screenshots/release_v1/01-home.png … 12-after-reload.png`（12 张，5.9MB）。

## 八、启动与部署

| 入口 | 说明 |
|---|---|
| `启动词间.cmd` | 双击即用：检查 Node → 检查 4173 是否已被本应用占用 → 后台启动 `node server.mjs --dir=dist --port=4173` → 等到页面可访问再打开浏览器 |
| `scripts/launch-cijian.ps1` | 真正的逻辑（UTF-8 BOM）。已实测两条分支：未运行时启动成功；已运行时只开浏览器 |
| `停止词间.cmd` / `scripts/stop-cijian.ps1` | 只杀命令行里带 `server.mjs` 且含 `4173` 的 node 进程（不动其他 node） |
| 桌面快捷方式 | `C:\Users\86152\Desktop\词间.lnk` → `启动词间.cmd`，工作目录固定 |
| `start-windows.bat` | 保留为兼容入口，转调「启动词间.cmd」 |

为什么必须固定 `localhost:4173`：IndexedDB 按 origin 隔离，换成别的端口/主机名就是另一个空库，用户会以为数据丢了。启动器里写死端口并在端口被他人占用时**拒绝启动**（而不是换端口静默启动）。

日志：`cijian-server.log` / `cijian-server.log.err`（已加入 `.gitignore`，不进仓库）。

## 九、数据与安全边界

- 数据层：IndexedDB `vocabulary-memory-v1`，29 个 store，DB v7（**未升级**）；不使用 `localStorage`。
- AI 配置：`endpoint` / `model` / `key` 均存本地 IndexedDB；`key` 是**明文**（本地库，非加密）——这是已知限制，见第十节。
- 备份：`backup()` 强制剔除密钥；导入时校验 `format` 与 `version`，越界拒绝。
- 仓库：847 个跟踪文件，全量扫描 `ghp_/github_pat_/sk-/AKIA/PRIVATE KEY` 形态**0 命中**；无 `.env`、无 `.ldb`、无用户数据文件；历史里唯一命中「ghp_」的提交是**描述性文字**（记录了「扫描 0 命中」），不含真实令牌。
- 本轮所有审计产物（临时 profile、备份副本、截图、JSON）都在仓库外：`C:\Users\86152\AppData\Local\hermes\cache\scratch\p16_5\`。

## 十、已知限制（不阻塞本次发布，但必须在发布说明里讲清）

1. **AI 密钥明文存在浏览器本地库**，且备份已剔除密钥：换设备/清浏览器数据后要重新填。
2. **真实 AI 服务未在本轮做质量验收**（不消耗你的额度）：冒烟只验证了「未配置时的说明」与「提交后的降级反馈」。AI 生成的句子质量仍以你自己的使用为准。
3. **历史数据未回填**：Phase 16.3 之前「AI 未核验结构被算进语法掌握」的记录仍在库里，只提供了只读识别工具 `scripts/phase16_3-legacy-audit.mjs`，没有自动回滚。
4. **移动端构图未专项设计**，只保证不溢出/不重叠。
5. **视觉审美未获你本人验收**：本轮只证明「能用、无空白、无脚本错误」，不宣称审美目标达成。首页在「没有计划」时会同时出现「今天的计划（生成后显示）」占位卡与「今天的计划（按你给的时间排）」设置卡，标题重复、留白偏多——属既有设计，**本轮未改动**，记录在此供后续决定。
6. **首次打开会把旧库从 v3 迁移到 v7**（在副本上已验证成功）：建议你先用第五节的备份兜底，再打开真实数据。

## 十一、回滚

见 `docs/RELEASE_ROLLBACK_GUIDE.md`：代码回滚坐标 `pre-v1.0.0-main`（`9de8acd`），数据回滚用第五节备份。

## 十二、账号安全（唯一待你操作项）

此前有一轮工具日志里出现过 GitHub 令牌（本轮已杜绝任何凭证输出，且已核实仓库与历史里没有令牌）。

我无法替你创建/吊销 PAT，请你本人做一次轮换：

1. GitHub → Settings → Developer settings → Personal access tokens → 找到当前用于本仓库的令牌 → **Revoke**。
2. 新建一个最小权限令牌（只给 `Contents: Read and write`，只授权 `Huyaen/english-reconstruction-system`）。
3. 把新令牌写入 `C:\Users\86152\.config\hermes-github-token.txt`（覆盖旧内容），并删除 `cache/scratch/ap16b.sh` 之类的临时凭据脚本。

做完这一步，本次发布即为完全体：**RELEASED**。
