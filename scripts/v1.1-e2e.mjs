// 真实 Edge E2E。仅允许专用 origin :4186；需先启动 build:test、隔离 profile、CDP :9386，
// 并在设置页用真实目录选择器授权空的测试目录。运行：
// node --import tsx scripts/v1.1-e2e.mjs auto <绝对测试目录> <证据输出目录>
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { makeWord } from '../src/core.ts';
import { validateBackup } from '../src/db.ts';

const [mode = 'auto', disk, out] = process.argv.slice(2);
if (!disk || !out || !path.isAbsolute(disk) || !path.isAbsolute(out)) throw Error('必须明确指定隔离磁盘目录与证据目录');
await mkdir(out, { recursive: true });
const tabs = await (await fetch('http://127.0.0.1:9386/json/list')).json();
const target = tabs.find(t => t.type === 'page' && new URL(t.url).origin === 'http://127.0.0.1:4186');
if (!target) throw Error('缺少隔离测试 origin，拒绝连接其他页面');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(expression, ms = 15000) { const start = Date.now(); while (Date.now() - start < ms) { if (await ev(expression)) return; await sleep(80); } throw Error(`timeout ${expression}`); }
const click = selector => ev(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
const current = async () => JSON.parse(await ev('window.__inputTest.backupJson()'));
async function shot(name) { const r = await send('Page.captureScreenshot', { captureBeyondViewport: false }); await writeFile(path.join(out, name), Buffer.from(r.data, 'base64')); }
const files = async () => (await readdir(disk)).filter(n => /^cijian-auto-.*\.json$/.test(n));
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); }
try {
    check('测试构建与真实目录 API', await ev('!!window.__inputTest && typeof showDirectoryPicker === "function"'));
    if (mode === 'auto') {
        const data = (await current()).data;
        data.books = [{ id: 'shanghai-scale', name: '上海高考英语词书（4716条隔离规模夹具）', created: 1 }, { id: 'e2e-practice', name: '隔离练习', created: 1 }];
        data.words = Array.from({ length: 4716 }, (_, i) => makeWord({ en: `word${i}`, zh: `释义${i}` }, 'shanghai-scale', i));
        data.words.push(...['apple', 'New York', "don't", 'well-known'].map((en, i) => ({ ...makeWord({ en, zh: ['苹果', '纽约', '不要', '知名的'][i] }, 'e2e-practice', i), previewedAt: 1, previewResult: 'know' })));
        data.sessions = []; data.records = [];
        data.passages = [{ id: 'e2e-passage', title: '隔离阅读', text: 'A short reading.', createdAt: 1 }];
        data.readingSessions = [{ id: 'e2e-reading', passageId: 'e2e-passage', at: 1 }];
        const payload = { format: 'vocabulary-memory', version: 7, data };
        validateBackup(structuredClone(payload));
        await ev(`window.__inputTest.restoreJson(${JSON.stringify(JSON.stringify(payload))})`);
        await click('[data-nav="settings"]');
        await ev(`document.querySelector('[name=key]').value='E2E-KEY-DO-NOT-BACKUP'; document.querySelector('[name=rememberKey]').checked=true; document.querySelector('#settings-form').requestSubmit(); true`);
        await sleep(250);
        await click('#auto-backup-now');
        await wait('document.querySelector("#auto-backup-state").textContent.includes("备份成功")');
        const before = await files();
        check('实际磁盘备份存在', before.length >= 1);
        const texts = await Promise.all(before.map(n => readFile(path.join(disk, n), 'utf8')));
        const latest = texts.map(t => ({ t, v: JSON.parse(t) })).filter(x => x.v.data.words.length === 4720).at(-1);
        check('4716 词书与阅读记录写入磁盘', latest && latest.v.data.readingSessions.some(x => x.id === 'e2e-reading'));
        check('两处 Key 不进入磁盘文件', latest && !latest.t.includes('E2E-KEY-DO-NOT-BACKUP') && latest.v.data.settings.key === '' && latest.v.data.settings.ai.key === '');
        validateBackup(JSON.parse(latest.t));
        await click('[data-nav="home"]');
        await ev('document.querySelector("#range-book").value="e2e-practice"; true');
        await click('[data-mode="quick"]');
        for (let i = 0; i < 30; i++) {
            const state = await ev('window.__pageTest.state()');
            if (state.page === 'results') break;
            const value = await current(); const session = value.data.sessions.find(s => !s.ended);
            if (session?.question) { await click(`[data-answer="${session.question.wordId}"]`); }
            await sleep(180);
        }
        await wait('document.documentElement.dataset.page === "results"');
        await wait('new Promise(r=>{const q=indexedDB.open("vocabulary-memory-v1");q.onsuccess=()=>{const db=q.result;const t=db.transaction("meta");const g=t.objectStore("meta").get("auto-backup");g.onsuccess=()=>{db.close();r(g.result?.value?.events.some(x=>x.startsWith("vocab:")))};}})');
        const after = await files();
        check('完整会话自动写入一次，重复结束保存不重复', after.length === before.length + 1);
        const finalData = await current();
        const diskText = (await Promise.all(after.map(n => readFile(path.join(disk, n), 'utf8')))).find(t => JSON.parse(t).data.records.length === finalData.data.records.length && JSON.parse(t).data.records.length > 0);
        check('磁盘包含本轮 ReviewRecord', !!diskText);
        await ev(`window.__inputTest.restoreJson(${JSON.stringify(diskText)})`);
        const restored = await current();
        check('磁盘 JSON 实际恢复，词书、学习及阅读记录保留', restored.data.words.length === 4720 && restored.data.records.length === finalData.data.records.length && restored.data.readingSessions.length === 1);
        await click('[data-nav="settings"]'); await ev('document.querySelector("#auto-backup-panel").scrollIntoView(); true'); await shot('auto-backup.png');
    }
    await writeFile(path.join(out, `${mode}-e2e.json`), JSON.stringify({ browser: await send('Browser.getVersion'), checks }, null, 2));
}
finally { ws.close(); }
