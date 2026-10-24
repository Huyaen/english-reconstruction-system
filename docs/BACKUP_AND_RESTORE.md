# 备份、恢复与数据安全（Phase 14）

学习数据只在当前浏览器的当前 origin 内（`IndexedDB: vocabulary-memory-v1`）。复制项目目录、更新程序、重装浏览器都不等于备份。

## 1. 完整备份包含什么

`src/db.ts` 的 `backup()` 导出 `dataStores` 全部 28 个数据域：

`books / words / records / sessions / analyses / wordExposures / grammarConcepts / grammarAttempts / sentenceAttempts / sentences / passages / readingSessions / inputSources / inputSessions / outputAttempts / dailyPlans / miniUnits / skillSnapshots / weeklyDiagnostics / libraryItems / aiGenerations / transcripts / inputEvidence / examSpecifications / examMaterials / examItems / examSessions / examLogs`

外加 `settings`。**API Key 永远被剔除**（`key: ''`、`rememberKey: false`），不会因为导出备份而泄露。

## 2. 恢复流程的安全边界

1. 先校验 `format`、`version`、ID 字符集、重复 ID、核心引用（词书/单词/会话/记录/句子等）。
2. 校验失败：直接拒绝，当前数据不变。
3. 校验通过：在一个 IndexedDB `readwrite` 事务里 clear 全部 store 再写入。
4. **任何写入异常都会显式 `tx.abort()`**，不会出现“前面 store 已清空、后面 store 失败”的半套数据（Phase 14 修复）。
5. 恢复完成后重新 `loadData()`，并运行只读完整性审计；结构错误只提示，不静默修改。

## 3. 压力与异常验证

`tests/backupRoundtrip.test.ts`：

- 240 个词 + 全 28 个 store 的代表性记录（含嵌套 FSRS、sourceTypes、confusions、考试域、输入证据、阅读、计划、单元、诊断）；
- 备份 JSON 包含全部 store，ID/字段/settings 往返；
- Key 不进入备份；
- 恢复中途模拟序列化失败 → `replaceData` 回滚，原 books/words 完全不变；
- 成功恢复后关闭并重开数据库仍是同一份完整数据。

`tests/longitudinal.test.ts` 另有 D1/D7/D30、FSRS 多次复习、周诊断幂等覆盖。

## 4. 不能自动化证明的部分

- **真实浏览器 QuotaExceededError**：没有可靠办法在不破坏用户 profile 的前提下稳定制造存储配额耗尽；本阶段不伪造“配额通过”。`replaceData` 对同步/异步事务失败都会 abort，但配额路径仍标记为未实测。
- **浏览器进程崩溃/断电**：只验证了事务回滚与刷新恢复，没有做真实断电注入。
- **真实设备存储压力**：未在低存储 Android/iOS 上测试。

## 5. 导入前检查清单

- 当前地址是否就是日常使用的 `http://localhost:4173`；
- 最近是否有备份；备份文件的词书/单词/记录数量是否合理；
- 导入后是否看到结构错误提示；
- 确认无误前不要清空旧地址、不要删除备份。

完整的地址隔离说明见 `docs/ORIGIN_DATA_SAFETY.md`。
