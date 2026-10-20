#!/usr/bin/env node
// —— Phase 6 验收用本地 mock Provider（OpenAI-compatible）——
// 用途：在真实浏览器里端到端验证“请求 → 结构化输出 → 校验 → 质量门 → 落库”。
// 明确边界：这是协议级 mock，不是真实 Provider 验收；真实供应商调用需用户自己的 Key。
// 通过 model 名切换行为：
//   mock-valid        正常返回合法 JSON
//   mock-bad-json     返回不可解析文本（验证有界修复/重试）
//   mock-bad-evidence 阅读题证据句编造（验证质量门拦截）
//   mock-rate-limit   始终 429
//   mock-slow         延迟 10s（验证超时/取消）
//   mock-auth-fail    401
import http from 'node:http';

const PORT = Number(process.env.MOCK_AI_PORT || 8799);
const requests = [];

function pick(userText, key) {
    // 提示词里的写法是 `targetWords: ["a","b"]`（键没有引号）：取键名之后最近的数组
    const i = userText.indexOf(key);
    if (i < 0)
        return [];
    const start = userText.indexOf('[', i);
    const end = userText.indexOf(']', start);
    if (start < 0 || end < 0)
        return [];
    return userText.slice(start + 1, end).split(',').map(x => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

function sentenceFor(userText) {
    const words = pick(userText, 'targetWords');
    const grammar = pick(userText, 'grammarTargets');
    const two = words.slice(0, 2);
    const sentence = `The team had ${two[0] ?? 'rebuilt'} the old station before the winter, and the ${two[1] ?? 'notebook'} was still on the table.`;
    return {
        sentence,
        targetWords: words.length ? [two[0]] : ['station'],
        grammarTargets: grammar.length ? [grammar[0]] : ['clause.adverbial'],
        difficultyNote: '中等长度，含一个时间状语从句，生词控制在目标词内。',
        chinese: '团队在冬天前修好了旧车站，笔记本还放在桌上。',
        structure: null,
        provenance: 'ai',
    };
}

const PASSAGE = 'The town had rebuilt its station twice before anyone understood the river. Every spring the engineers measured the current and wrote the numbers in a grey notebook, and every autumn they read those pages again before the first storm arrived. When the water rose, that notebook was the only record they trusted, because memory had failed them once and the cost had been high. The station stayed open through the worst weeks of the year, and the trains never stopped for longer than a day. People in the town still say that the river decides everything, but the notebook is how they argue with it.';

function readingFor(userText, badEvidence = false) {
    const words = pick(userText, 'targetWords');
    const grammar = pick(userText, 'grammarIds');
    const targets = words.length ? words.slice(0, 2) : ['notebook', 'current'];
    // mock 必须真的用上请求里的目标词，否则质量门会（正确地）拒绝
    let passage = PASSAGE;
    for (const w of targets) {
        if (!passage.toLowerCase().includes(String(w).toLowerCase()))
            passage += ` The engineers checked the ${w} again before the storm.`;
    }
    return {
        title: 'The Station Notebook',
        topic: 'river engineering',
        passage,
        targetWords: targets,
        targetGrammar: grammar.length ? [grammar[0]] : ['clause.adverbial'],
        difficultyRationale: '中等长度，含时间状语从句，生词限于目标词。',
        exercises: [
            {
                type: 'detail', question: 'What did the engineers write down every spring?',
                options: ['The station roof', 'The current measurements', 'The river name', 'The winter plan'],
                answerIndex: 1, explanation: '原文说他们每年春天测量 current 并记录。',
                evidenceQuote: badEvidence ? 'Engineers painted the station every summer' : 'measured the current and wrote the numbers',
            },
            {
                type: 'main_idea', question: 'What does the passage mainly show?',
                options: ['A new bridge', 'Relying on written records', 'A storm forecast', 'A train timetable'],
                answerIndex: 1, explanation: '结尾强调记录是唯一被信任的东西。',
                evidenceQuote: 'that notebook was the only record they trusted',
            },
            {
                type: 'inference', question: 'Why did the station stay open?',
                options: ['Because the records guided decisions', 'Because nobody worked there', 'Because the river was dry', 'Because the roof was new'],
                answerIndex: 0, explanation: '记录让人做出判断，车站得以开放。',
                evidenceQuote: 'the station stayed open through the worst weeks',
            },
        ],
    };
}

const server = http.createServer(async (req, res) => {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type,authorization',
        'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
    };
    if (req.method === 'OPTIONS') {
        res.writeHead(204, cors);
        res.end();
        return;
    }
    if (req.url === '/__requests') {
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(requests.map(r => ({ model: r.model, mode: r.mode, sentKeys: Object.keys(r.body), auth: r.auth, userChars: r.userChars }))));
        return;
    }
    if (req.url === '/__reset') {
        requests.length = 0;
        res.writeHead(200, cors);
        res.end('ok');
        return;
    }
    if (!req.url?.endsWith('/chat/completions')) {
        res.writeHead(404, cors);
        res.end('not found');
        return;
    }
    let raw = '';
    for await (const chunk of req)
        raw += chunk;
    let body;
    try {
        body = JSON.parse(raw);
    }
    catch {
        res.writeHead(400, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json body' }));
        return;
    }
    const model = String(body.model ?? '');
    const userText = String(body.messages?.find(m => m.role === 'user')?.content ?? '');
    requests.push({ model, mode: body.response_format?.type ?? 'text', body, auth: req.headers.authorization ? 'present' : 'missing', userChars: userText.length });
    const send = (status, payload) => {
        res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
    };
    const chat = (content, usage = { prompt_tokens: 120, completion_tokens: 80 }) => send(200, { model, choices: [{ message: { content }, finish_reason: 'stop' }], usage });

    if (model === 'mock-auth-fail') {
        send(401, { error: { message: 'invalid api key' } });
        return;
    }
    if (model === 'mock-rate-limit') {
        send(429, { error: { message: 'rate limited' } });
        return;
    }
    if (model === 'mock-slow') {
        await new Promise(r => setTimeout(r, 10_000));
        chat(JSON.stringify(sentenceFor(userText)));
        return;
    }
    if (model === 'mock-bad-json') {
        chat('对不起，我无法按格式输出。');
        return;
    }
    const isReading = /reinforcement passage|Reinforcement|强化文章/i.test(userText) || userText.includes('Write a reinforcement passage');
    if (model === 'mock-bad-evidence') {
        chat(JSON.stringify(readingFor(userText, true)));
        return;
    }
    chat(JSON.stringify(isReading ? readingFor(userText) : sentenceFor(userText)));
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`mock AI provider listening on http://127.0.0.1:${PORT}/v1 (models: mock-valid, mock-bad-json, mock-bad-evidence, mock-rate-limit, mock-slow, mock-auth-fail)`);
});
