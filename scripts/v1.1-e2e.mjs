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
const localBackupState = 'new Promise((resolve,reject)=>{const q=indexedDB.open("vocabulary-memory-v1");q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result;const r=db.transaction("meta").objectStore("meta").get("auto-backup");r.onsuccess=()=>{db.close();resolve(r.result?.value ? {owner:r.result.value.owner,files:r.result.value.files,lastSuccess:r.result.value.lastSuccess,status:r.result.value.status}:null)};r.onerror=()=>reject(r.error)}})';
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); }
try {
    const { windowId } = await send('Browser.getWindowForTarget', { targetId: target.id });
    await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await send('Page.bringToFront');
    check('测试构建与真实目录 API', await ev('!!window.__inputTest && typeof showDirectoryPicker === "function"'));
    if (mode === 'auto') {
        const data = (await current()).data;
        data.books = [{ id: 'shanghai-scale', name: '上海高考英语词书（4716条隔离规模夹具）', created: 1 }, { id: 'e2e-practice', name: '隔离练习', created: 1 }];
        data.words = Array.from({ length: 4716 }, (_, i) => makeWord({ en: `word${i}`, zh: `释义${i}` }, 'shanghai-scale', i));
        data.words.push(...['apple', 'New York', "don't", 'well-known'].map((en, i) => ({ ...makeWord({ en, zh: ['苹果', '纽约', '不要', '知名的'][i] }, 'e2e-practice', i), previewedAt: 1, previewResult: 'know' })));
        data.sessions = []; data.records = []; data.spellingAttempts = [];
        data.passages = [{ id: 'e2e-passage', title: '隔离阅读', text: 'A short reading.', createdAt: 1 }];
        data.readingSessions = [{ id: 'e2e-reading', passageId: 'e2e-passage', at: 1 }];
        const payload = { format: 'vocabulary-memory', version: 7, data };
        validateBackup(structuredClone(payload));
        await ev(`window.__inputTest.restoreJson(${JSON.stringify(JSON.stringify(payload))})`);
        await click('[data-nav="settings"]');
        await ev(`document.querySelector('[name=key]').value='E2E-KEY-DO-NOT-BACKUP'; document.querySelector('[name=rememberKey]').checked=true; document.querySelector('#settings-form').requestSubmit(); true`);
        await sleep(250);
        const priorManual = await ev(localBackupState);
        await click('#auto-backup-now');
        await wait(`(${localBackupState}).then(s=>s?.lastSuccess > ${priorManual.lastSuccess} && s.status === 'success' && s.files.length <= 14)`, 30000);
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
            if (await ev('document.querySelector("#pause-cover")?.hidden === false')) await click('#continue');
            const state = await ev('window.__pageTest.state()');
            if (state.page === 'results') break;
            const value = await current(); const session = value.data.sessions.find(s => !s.ended);
            if (session?.question) { await click(`[data-answer="${session.question.wordId}"]`); }
            await sleep(180);
        }
        await wait('document.documentElement.dataset.page === "results"');
        const finalData = await current();
        const sessionEvent = `vocab:${finalData.data.sessions[0].id}`;
        await wait(`new Promise(r=>{const q=indexedDB.open("vocabulary-memory-v1");q.onsuccess=()=>{const db=q.result;const t=db.transaction("meta");const g=t.objectStore("meta").get("auto-backup");g.onsuccess=()=>{db.close();r(g.result?.value?.events.includes(${JSON.stringify(sessionEvent)}) && g.result.value.files.length <= 14)};}})`);
        const after = await files();
        const added = after.filter(n => !before.includes(n));
        check('完整会话自动写入一次，重复结束保存不重复', added.length === 1);
        const diskText = await readFile(path.join(disk, added[0]), 'utf8');
        assert.deepEqual(JSON.parse(diskText).data.records, finalData.data.records);
        check('磁盘包含本轮 ReviewRecord', !!diskText);
        await ev(`window.__inputTest.restoreJson(${JSON.stringify(diskText)})`);
        const restored = await current();
        check('磁盘 JSON 实际恢复，词书、学习及阅读记录保留', restored.data.words.length === 4720 && restored.data.records.length === finalData.data.records.length && restored.data.readingSessions.length === 1);
        await click('[data-nav="settings"]'); await ev('document.querySelector("#auto-backup-panel").scrollIntoView(); true'); await shot('auto-backup.png');
    }
    if (mode === 'spelling') {
        await click('[data-nav="home"]');
        if (await ev('!!document.querySelector("#finish-old")')) { await click('#finish-old'); await wait('!document.querySelector("#finish-old")'); }
        const before = await current();
        check('真实浏览器 v7→v8 保留 4716 词书', before.version === 8 && before.data.words.filter(w => w.bookId === 'shanghai-scale').length === 4716);
        await click('[data-nav="home"]');
        await ev('document.querySelector("#range-book").value="e2e-practice"; true');
        await click('[data-mode="spelling"]');
        await wait('!!document.querySelector("#spelling-input")');
        check('拼写独立入口与输入焦点', await ev('document.documentElement.dataset.page === "spelling" && document.activeElement.id === "spelling-input"'));
        await shot('spelling-question.png');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '1', code: 'Digit1', text: '1', windowsVirtualKeyCode: 49 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1' });
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space' });
        check('输入数字与空格不触发选择题', await ev('document.querySelector("#spelling-input").value === "1 "') && (await current()).data.records.length === before.data.records.length);
        await ev('document.querySelector("#spelling-input").value=""; true');
        for (let i = 0; i < 5; i++) {
            const prompt = await ev('document.querySelector("#spelling-prompt").textContent');
            const word = before.data.words.find(w => w.bookId === 'e2e-practice' && w.zh === prompt);
            assert.ok(word);
            check(`题 ${i + 1} 未泄漏隐藏答案`, !(await ev('document.querySelector("#main").innerHTML')).includes(word.en));
            if (i === 1) await click('#spelling-reveal');
            await send('Input.insertText', { text: i === 0 ? word.en + 'x' : word.en });
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
            await wait('!!document.querySelector("#spelling-next")');
            if (i === 0) await click('#spelling-retry');
            await click('#spelling-next');
        }
        await wait('document.querySelector("#main").textContent.includes("拼写练习完成")');
        const after = await current();
        const priorIds = new Set(before.data.spellingAttempts.map(a => a.id));
        const attempts = after.data.spellingAttempts.filter(a => !priorIds.has(a.id));
        check('独立拼写证据、辅助和重练正确', attempts.length === 5 && attempts.filter(a => a.assisted).length === 2 && attempts.filter(a => a.retry).length === 1);
        assert.deepEqual(after.data.words, before.data.words); assert.deepEqual(after.data.records, before.data.records); assert.deepEqual(after.data.sessions, before.data.sessions);
        check('旧 FSRS、到期、ReviewRecord 及旧会话完全不变', true);
        check('首次独立正确率排除辅助和重练', await ev('document.querySelector("#main").textContent.includes("50%")'));
        await shot('spelling-results.png');
        await sleep(600);
        const diskTexts = await Promise.all((await files()).map(n => readFile(path.join(disk, n), 'utf8')));
        const saved = diskTexts.find(t => JSON.parse(t).data.spellingAttempts?.length === after.data.spellingAttempts.length);
        check('本轮拼写证据实际进入自动磁盘备份', !!saved);
        validateBackup(JSON.parse(saved));
        await ev(`window.__inputTest.restoreJson(${JSON.stringify(saved)})`);
        assert.deepEqual((await current()).data.spellingAttempts, after.data.spellingAttempts);
        check('v8 磁盘备份包含拼写记录且可恢复', true);
        // 原有选择题数字键和空格键通过真实键盘路径核对。
        await click('[data-nav="home"]'); await ev('document.querySelector("#range-book").value="e2e-practice"; true'); await click('[data-mode="quick"]');
        await wait('!!document.querySelector(".answer")'); await sleep(120);
        const count = (await current()).data.records.length;
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1' });
        await sleep(220);
        check('原选择题数字快捷键继续工作', (await current()).data.records.length === count + 1);
        if (await ev('!!document.querySelector("#next")')) await click('#next');
        await sleep(180);
        const priorRecordIds = new Set((await current()).data.records.map(r => r.id));
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ' });
        await sleep(180);
        check('原选择题空格快捷键继续工作', (await current()).data.records.some(r => !priorRecordIds.has(r.id) && r.reason === 'unknown'));
        await click('#quit'); await click('#finish-old');
    }
    if (mode === 'retention') {
        await click('[data-nav="settings"]');
        const initial = await ev(localBackupState);
        assert.ok(initial?.owner, '先通过真实系统目录选择器授权测试目录');
        const sentinel = path.join(disk, 'v1.1-foreign-sentinel.txt');
        await writeFile(sentinel, 'foreign file must remain');
        const foreign = (await files()).filter(n => !n.startsWith(`cijian-auto-${initial.owner}-`));
        for (let i = 0; i < 16; i++) {
            const before = await ev(localBackupState);
            await click('#auto-backup-now');
            await wait(`(${localBackupState}).then(s=>s?.lastSuccess > ${before.lastSuccess} && s.status === 'success' && s.files.length <= 14)`, 30000);
        }
        const state = await ev(localBackupState);
        const actual = (await files()).filter(n => n.startsWith(`cijian-auto-${initial.owner}-`));
        check('真实磁盘仅保留本目录清单中最近14份有效备份', actual.length === 14 && state.files.length === 14);
        check('清理不删除其他文件或其他所有者备份', await readFile(sentinel, 'utf8') === 'foreign file must remain' && foreign.every(n => !state.files.includes(n) && !actual.includes(n)));
        const all = await readdir(disk); check('原有其他所有者文件仍全部存在', foreign.every(n => all.includes(n)));
        for (const name of state.files) validateBackup(JSON.parse(await readFile(path.join(disk, name), 'utf8')));
        check('14份实际磁盘文件全部通过结构校验', true);
    }
    await writeFile(path.join(out, `${mode}-e2e.json`), JSON.stringify({ browser: await send('Browser.getVersion'), checks }, null, 2));
}
finally { ws.close(); }
