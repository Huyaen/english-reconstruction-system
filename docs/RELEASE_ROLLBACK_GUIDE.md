# 词间 · 发布回滚指南（v1.0.0）

出问题时按「数据 → 代码 → 服务」的顺序处理：先保证学习数据不丢，再回退程序。

## 一、先做数据兜底（任何回滚前）

1. 打开应用 → 设置 → 导出全部学习数据，另存到 `D:\英语重构训练\词间备份\`。
2. 记下导出时间与文件大小。
3. 若页面已经打不开，直接用最近一次的备份文件（`词间完整备份_2026-11-01_dbv7.json`，SHA-256 见同目录 `.sha256.txt`）。

## 二、代码回滚

发布坐标：

| 名称 | 提交 | 含义 |
|---|---|---|
| `v1.0.0`（tag） | `main` 的发布提交 | 本次发布 |
| `pre-v1.0.0-main`（tag） | `9de8acd` | 发布前的 `main`，Phase 16.3 合并前 |

**整体退回发布前：**

```bash
cd "D:/英语重构训练/vocabulary-app"
git checkout main
git reset --hard pre-v1.0.0-main      # 只允许在确认要整体回退时使用
git push --force-with-lease origin main   # 需要你明确授权才执行
```

**只回退到某个已发布节点（不重写历史，推荐）：**

```bash
git revert --no-edit <出问题的提交>   # 生成反向提交，历史保留
npm test && npm run build             # 必须重跑门禁
git push origin main
```

> 规则：不使用无保护的 `push --force`；不在没有重跑 `tsc` / `npm test` / `npm run build` 的情况下改 `main`。
> `dist/` 是被跟踪的，回滚代码后必须重新 `npm run build` 并提交产物，否则 CI 的「Verify committed build artifacts」会红。

## 三、部署回滚（本机）

1. 双击 `停止词间.cmd`。
2. 回到目标版本的 `dist/`（`git checkout <tag> -- dist` 或重新 `npm run build`）。
3. 双击 `启动词间.cmd`。
4. 用浏览器打开 `http://localhost:4173`，确认首页能开、词库计数与回滚前一致。

## 四、数据回滚

1. 停止服务，打开应用。
2. 设置 → 选择备份文件 → 预览计数 → 确认恢复。
3. 恢复后刷新一次，确认计数不变。
4. **注意**：恢复是覆盖式；恢复前再导出一份当前库。

## 五、回滚后的验收（缺一不可）

```bash
cd "D:/英语重构训练/vocabulary-app"
npx tsc --noEmit
npm test
npm run build
git status --porcelain          # 应为空
```

- 浏览器实测：首页、词库、训练一题、句子、阅读、写作、设置各打开一次，控制台 0 报错。
- 数据核对：`words` / `records` / `sessions` / `sentences` 计数与回滚前一致（或与备份一致）。
- 远端核对：`git ls-remote origin refs/heads/main` 与本地 HEAD 相同。
- CI：对应提交的 run 必须 success。

## 六、发布包异常（无法启动）

1. 确认 `dist\index.html` 存在；缺失说明包不完整，重新解压/重新构建。
2. 确认 Node 可用：`node -v`。
3. 手工起服务看报错：`node server.mjs --dir=dist --port=4173`。
4. 仍然不行：用上一版 `dist` 覆盖后重试（第三节）。
