import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { closeDB, loadData, openDB, saveSettings } from '../src/db.ts';
import { chat, normalizeAIConfig } from '../src/aiProvider.ts';
import { usageTotals, withUsageBudget } from '../src/aiStore.ts';

test('预算在请求前生效，记录成功的真实用量和失败的预留量，阻挡并发', async () => {
    await openDB();
    const data = await loadData();
    const cfg = { ...normalizeAIConfig(null), endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', key: 'test', structuredMode: 'text' as const, maxRetries: 0 };
    const job = { system: 'Tutor', user: 'Affect and effect' };
    let calls = 0;
    let finish!: () => void;
    const fetchImpl: typeof fetch = async () => {
        calls++;
        await new Promise<void>(resolve => { finish = resolve; });
        return Response.json({ choices: [{ message: { content: 'Explanation' } }], usage: { prompt_tokens: 50, completion_tokens: 20, prompt_cache_hit_tokens: 10 } });
    };
    await assert.rejects(chat(withUsageBudget({ ...cfg, dailyTokenBudget: 0 }, data.aiGenerations), job, { fetchImpl }), /每日预算/);
    assert.equal(calls, 0);
    const metered = withUsageBudget({ ...cfg, dailyTokenBudget: 5000 }, data.aiGenerations);
    const pending = chat(metered, job, { fetchImpl });
    await assert.rejects(chat(metered, job, { fetchImpl }), /另一项 AI 请求/);
    while (!finish) await new Promise(r => setTimeout(r, 1));
    finish();
    await pending;
    await assert.rejects(chat(metered, job, { fetchImpl: async () => new Response('', { status: 503 }) }));
    const totals = usageTotals((await loadData()).aiGenerations, 0);
    assert.equal(totals.requests, 2);
    assert.equal(totals.input, 50);
    assert.equal(totals.output, 20);
    assert.equal(totals.cached, 10);
    assert.equal(totals.estimated, 1);
    assert.ok(totals.peakUsd > 0);
});

test('未勾选记住密钥时，旧字段和 Provider 字段均不写入 IndexedDB', async () => {
    const { settings } = await loadData();
    const cfg = normalizeAIConfig(null);
    await saveSettings({ ...settings, key: 'test', rememberKey: false, ai: { ...cfg, key: 'test' } });
    assert.equal((await loadData()).settings.ai?.key, 'test');
    closeDB();
    const saved = (await loadData()).settings;
    assert.equal(saved.key, '');
    assert.equal(saved.ai?.key, '');
});
