import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReadingText, parsePassageText, tokenizeSentence, normalizeToken, contentHash, sentenceAtSpan, countWords } from '../src/readingText.ts';
import { validateImportText, buildPastedDraft, importFromFile, assertUrlAllowed, classifyFetchFailure, buildUrlDraft, ocrCapability, buildImageDraft, buildManualImageDraft, findDuplicate, toPassage, rebuildDraftText, IMPORT_LIMITS } from '../src/readingImport.ts';
import { estimateReadingDifficulty, classifyToken, clauseDepthOf, classificationLabel } from '../src/readingDifficulty.ts';
import { evidenceKey, makeEvidence, appendEvidence, summarizeEvidence, translationDependenceScore } from '../src/readingEvidence.ts';
import { explicitUnknownRate, estimatedUnknownRate, selectStudyCandidates, exposureFromMark, readingWordSeed } from '../src/readingVocabulary.ts';
import { makeWord } from '../src/core.ts';
import type { MasteryState, Passage, ReadingMark, Word } from '../src/types.ts';
// Phase 5 阅读域单元测试（纯函数，无 DOM / 无 DB / 不发网络请求）。
const ARTICLE = `Learning to read in a second language is not a matter of memorising every word.
A reader who understands the main structure of a sentence can often guess the meaning of an unfamiliar word from context.
That is why this programme separates exposure from mastery, and why it asks you to mark what you are unsure about.

Reading material should come from a traceable source, because the difficulty of a text depends on where it was published.
A short news article and a technical essay of the same length behave very differently, and the difference is not only about vocabulary.`;
function passageOf(raw: string, title = '测试文章', now = 1000): Passage {
    const res = buildPastedDraft({ raw, title, allowShort: true });
    if (!res.ok)
        assert.fail('fixture draft failed: ' + res.error.code + ' ' + res.error.message);
    return toPassage(res.value, now);
}
function markOf(partial: Partial<ReadingMark> & {
    surface: string;
    judgment: ReadingMark['judgment'];
}): ReadingMark {
    const surface = partial.surface;
    return {
        id: partial.id ?? 'mark-' + surface,
        passageId: partial.passageId ?? 'p1',
        sessionId: partial.sessionId ?? 's1',
        paragraphIndex: partial.paragraphIndex ?? 0,
        sentenceIndex: partial.sentenceIndex ?? 0,
        tokenIndex: partial.tokenIndex ?? 0,
        surface,
        normalized: partial.normalized ?? normalizeToken(surface),
        lemma: partial.lemma ?? null,
        judgment: partial.judgment,
        contextSentence: partial.contextSentence ?? 'context',
        at: partial.at ?? 1000,
        ...(partial.revokedAt ? { revokedAt: partial.revokedAt } : {}),
    };
}
function wordOf(en: string, level: MasteryState['level'], total: number, zh = '释义'): Word {
    const w = makeWord({ en, zh }, 'book-1', 1);
    return { ...w, state: { ...w.state, total, level } };
}
test('阅读文本规范化只做无损失变换（不改措辞/标点/引号）', () => {
    const res = normalizeReadingText('Line one.  \r\n\r\n\r\nLine\u00a0two so\u00adft.\r\n');
    assert.equal(/\r/.test(res.text), false, 'CRLF 必须归一为 LF');
    assert.equal(/\u00a0/.test(res.text), false, 'NBSP 必须归一为普通空格');
    assert.equal(/\u00ad/.test(res.text), false, '软连字符必须移除');
    assert.ok(res.notes.includes('crlf-to-lf'));
    assert.ok(res.notes.includes('nbsp-to-space'));
    assert.ok(res.notes.includes('soft-hyphen-removed'));
    assert.ok(res.notes.includes('blank-lines-collapsed'));
    assert.equal(res.text, 'Line one.\n\nLine two soft.');
    // 措辞、标点、引号、数字一律不动
    const prose = '“Hello,” said Mr. Smith — 3.14 times, isn’t it?';
    const kept = normalizeReadingText(prose);
    assert.equal(kept.text, prose);
    assert.deepEqual(kept.notes, []);
});
test('段落/句子切分不破坏原句边界，span 指回原文', () => {
    const raw = 'Dr. Smith spent $3.50 on it.\nHe said "It is fine." Then he left.\n\nSecond paragraph here, and it is shorter.';
    const parsed = parsePassageText(raw);
    assert.equal(parsed.paragraphs.length, 2, '空行必须分成两段');
    assert.ok(parsed.sentences.length >= 3, `至少应有 3 句，实际 ${parsed.sentences.length}`);
    parsed.sentences.forEach((s, i) => {
        assert.equal(s.index, i, '句子索引必须全篇唯一且连续');
        assert.equal(parsed.text.slice(s.start, s.end).trim(), s.text.trim(), '句子 span 必须指回原文');
    });
    assert.equal(parsed.sentences.some(s => /\b(Dr|Mr|Mrs|St)\.$/.test(s.text.trim())), false, '缩写不得被当成句末');
    assert.equal(parsed.sentences.some(s => /\$\d+\.$/.test(s.text.trim())), false, '小数点不得被当成句末');
    const first = parsed.sentences[0];
    assert.equal(sentenceAtSpan(parsed.sentences, first.start, first.end)?.index, first.index);
    assert.equal(sentenceAtSpan(parsed.sentences, 1, 2), null, '不存在的 span 必须返回 null');
    assert.equal(countWords(parsed.text), parsed.wordCount);
});
test('词元切分保留表面形式与原文位置；归一化不做词形还原', () => {
    const parsed = parsePassageText("Running costs $3.50, doesn't it?");
    const sentence = parsed.sentences[0];
    const tokens = tokenizeSentence(sentence.text, sentence);
    assert.ok(tokens.length >= 5, '应切出多个词元：' + tokens.map(t => t.surface).join('|'));
    assert.equal(tokens[0].surface, 'Running', '表面形式必须保留大小写');
    assert.equal(tokens.some(t => t.surface === "doesn't"), true, '缩写必须整体保留');
    let rebuilt = '';
    let cursor = 0;
    tokens.forEach((t, i) => {
        assert.equal(t.index, i);
        rebuilt += sentence.text.slice(cursor, t.start - sentence.start) + t.surface;
        cursor = t.end - sentence.start;
        assert.equal(sentence.text.slice(t.start - sentence.start, t.end - sentence.start), t.surface, '词元 span 必须指回原文');
        assert.equal(t.normalized, normalizeToken(t.surface));
    });
    rebuilt += sentence.text.slice(cursor);
    assert.equal(rebuilt, sentence.text, '词元 + 词元之间的原文片段必须无损还原句子（标点/符号不丢）');
    assert.equal(normalizeToken('Running'), 'running', '只做小写化，不做词形还原');
    assert.equal(normalizeToken('don’t'), "don't", '弯引号归一为直引号');
    assert.equal(tokens[0].lemma, null, '没有可靠词形时 lemma 必须为 null，不得编造');
});
test('内容指纹忽略大小写与空白，用于重复导入提示', () => {
    assert.equal(contentHash('Hello  World\n'), contentHash('hello world'));
    assert.notEqual(contentHash('hello world'), contentHash('hello worlds'));
});
test('导入校验：空文本/太短/太长/纯符号都返回结构化错误，不静默保存', () => {
    const empty = validateImportText('   \n  ');
    if (empty.ok)
        assert.fail('空文本必须失败');
    assert.equal(empty.error.code, 'empty');
    assert.ok(empty.error.fallback.includes('paste'));
    assert.equal(empty.error.stage, 'source-validation');
    assert.equal(empty.stages.some(s => !s.ok), true);
    const symbols = validateImportText('!!! ??? ... ---');
    if (symbols.ok)
        assert.fail('纯符号必须失败');
    assert.equal(symbols.error.code, 'empty');
    const short = validateImportText('one two three four five');
    if (short.ok)
        assert.fail('过短文本默认必须失败');
    assert.equal(short.error.code, 'too-short');
    assert.match(short.error.hint, /仍按短文导入/, '必须给出显式确认的出口');
    const allowed = validateImportText('one two three four five', { allowShort: true });
    if (!allowed.ok)
        assert.fail('显式允许短文时必须通过');
    assert.equal(allowed.value.wordCount, 5);
    const huge = validateImportText('word '.repeat(IMPORT_LIMITS.maxWords + 1));
    if (huge.ok)
        assert.fail('超长文本必须要求拆分');
    assert.equal(huge.error.code, 'too-long');
    assert.equal(IMPORT_LIMITS.minWords, 60, '短文阈值是产品约定，改动必须同步文档');
});
test('文件导入只支持真实可解析的类型，不假装解析 PDF/DOCX', () => {
    const txt = importFromFile({ name: 'article.txt', data: ARTICLE });
    if (!txt.ok)
        assert.fail('TXT 必须可导入：' + txt.error.code);
    assert.equal(txt.value.extractionMethod, 'file_text');
    assert.equal(txt.value.sourceType, 'uploaded_file');
    assert.equal(txt.value.sourceReliability, 'user_provided');
    const html = importFromFile({
        name: 'page.html',
        data: '<html><head><script>var leak = 1;</script><style>p{color:red}</style></head><body><nav>menu</nav><p>' + ARTICLE.replace(/\n\n/g, '</p><p>') + '</p><footer>c</footer></body></html>',
    });
    if (!html.ok)
        assert.fail('HTML 必须可导入：' + html.error.code);
    assert.equal(html.value.extractionMethod, 'file_html');
    assert.equal(/leak/.test(html.value.text), false, 'script 内容不得进入正文');
    assert.equal(/color:red/.test(html.value.text), false, 'style 内容不得进入正文');
    assert.ok(html.value.wordCount >= 100, '正文必须保留：' + html.value.wordCount);
    const docx = importFromFile({ name: 'paper.docx', data: 'PK\u0003\u0004binary' });
    if (docx.ok)
        assert.fail('DOCX 不允许假装解析');
    assert.equal(docx.error.code, 'unsupported-document');
    assert.match(docx.error.hint, /PDF|DOCX/);
    const png = importFromFile({ name: 'photo.png', data: 'binary' });
    if (png.ok)
        assert.fail('图片必须走 OCR 路径，不能当文本文件');
    assert.equal(png.error.code, 'unsupported-document');
});
test('网址导入有安全边界：不抓本机/内网/云元数据地址', () => {
    for (const bad of ['http://127.0.0.1:8000/a', 'http://localhost/a', 'http://169.254.169.254/latest/meta-data', 'http://192.168.1.5/a', 'http://metadata.google.internal/x']) {
        const res = assertUrlAllowed(bad);
        if (res.ok)
            assert.fail('内网地址必须拒绝：' + bad);
        assert.equal(res.error.code, 'blocked-url', bad);
    }
    const scheme = assertUrlAllowed('javascript:alert(1)');
    if (scheme.ok)
        assert.fail('非 http(s) 必须拒绝');
    assert.equal(scheme.error.code, 'invalid-url');
    const good = assertUrlAllowed('https://example.com/story?id=1');
    if (!good.ok)
        assert.fail('公开网址必须允许：' + good.error.code);
    assert.equal(good.value.host, 'example.com');
});
test('抓取失败按原因分类，且不绕付费墙', () => {
    assert.equal(classifyFetchFailure({ status: 403, body: 'Please subscribe to continue' }).code, 'paywall');
    assert.equal(classifyFetchFailure({ status: 402 }).code, 'paywall');
    assert.equal(classifyFetchFailure({ status: 401 }).code, 'login-required');
    assert.equal(classifyFetchFailure({ status: 403, body: 'sign in to read more' }).code, 'login-required');
    assert.equal(classifyFetchFailure({ cors: true }).code, 'cannot-fetch');
    assert.match(classifyFetchFailure({ cors: true }).message, /CORS|跨站/);
    assert.equal(classifyFetchFailure({ timedOut: true }).code, 'timeout');
    assert.equal(classifyFetchFailure({ status: 503 }).code, 'cannot-fetch');
    const emptyHtml = buildUrlDraft({ url: 'https://example.com/a', html: '<html><body><script>1</script></body></html>' });
    if (emptyHtml.ok)
        assert.fail('抽不到正文必须失败');
    assert.equal(emptyHtml.error.code, 'malformed-html');
    const web = buildUrlDraft({ url: 'https://example.com/a', html: '<article><p>' + ARTICLE.replace(/\n\n/g, '</p><p>') + '</p></article>' });
    if (!web.ok)
        assert.fail('正常网页必须可导入：' + web.error.code);
    assert.equal(web.value.sourceType, 'web_article');
    assert.equal(web.value.sourceReliability, 'editorial');
    assert.equal(web.value.sourceUrl, 'https://example.com/a');
    assert.equal(web.value.sourceName, 'example.com');
});
test('OCR：能力不可用时明确不可用，识别结果必须人工确认', () => {
    const none = ocrCapability({ providerSupportsVision: false, localOcrInstalled: false });
    assert.equal(none.available, false);
    assert.equal(none.method, 'none');
    assert.match(none.reason, /没有可用的 OCR/);
    assert.equal(ocrCapability({ providerSupportsVision: true, localOcrInstalled: false }).method, 'vision');
    assert.equal(ocrCapability({ providerSupportsVision: false, localOcrInstalled: true }).method, 'local');
    const raw = buildImageDraft({ text: ARTICLE, imageName: 'shot.png', method: 'vision', confidence: 0.62, userConfirmed: false });
    if (raw.ok)
        assert.fail('未确认的 OCR 结果不得直接成为阅读材料');
    assert.equal(raw.error.code, 'ocr-needs-confirmation');
    const unconfirmedManual = buildManualImageDraft({ text: ARTICLE, imageName: 'shot.png', userConfirmed: false });
    if (unconfirmedManual.ok)
        assert.fail('人工转录也要确认');
    assert.equal(unconfirmedManual.error.code, 'ocr-needs-confirmation');
    const manual = buildManualImageDraft({ text: ARTICLE, imageName: 'shot.png', title: '截图文章', userConfirmed: true });
    if (!manual.ok)
        assert.fail('确认后的人工转录必须可用：' + manual.error.code);
    assert.equal(manual.value.extractionMethod, 'manual');
    assert.equal(manual.value.sourceType, 'uploaded_image');
    assert.equal(manual.value.sourceReliability, 'unknown', '截图来源可靠性只能是 unknown，不得假装权威');
    assert.equal(manual.value.userEdited, true);
    const vision = buildImageDraft({ text: ARTICLE, imageName: 'shot.png', method: 'vision', confidence: 0.9, userConfirmed: true });
    if (!vision.ok)
        assert.fail('确认后的视觉 OCR 必须可用：' + vision.error.code);
    assert.equal(vision.value.extractionMethod, 'vision_ocr');
});
test('重复导入检测与 Passage 映射保留来源信息', () => {
    const draft = buildPastedDraft({ raw: ARTICLE, title: 'A', topic: 'education' });
    if (!draft.ok)
        assert.fail('draft failed');
    const passage = toPassage(draft.value, 5000);
    assert.equal(passage.createdAt, 5000);
    assert.equal(passage.importedAt, 5000);
    assert.equal(passage.contentHash, draft.value.contentHash);
    assert.equal(passage.paragraphs?.length, draft.value.paragraphs.length);
    assert.equal(passage.sentences?.length, draft.value.sentences.length);
    assert.equal(passage.difficulty, '', '难度未估算时不得编造');
    assert.equal(passage.sourceReliability, 'user_provided');
    assert.equal(passage.extractionMethod, 'paste');
    assert.equal(findDuplicate(draft.value, [passage])?.id, passage.id, '同内容必须命中重复');
    assert.equal(findDuplicate(draft.value, []), null);
    const edited = buildPastedDraft({ raw: ARTICLE + '\n\nOne extra sentence added by the reader.', title: 'A' });
    if (!edited.ok)
        assert.fail('edited draft failed');
    assert.equal(findDuplicate(edited.value, [passage]), null);
    const rebuilt = rebuildDraftText(draft.value, ARTICLE + '\n\nOne extra sentence added by the reader.');
    if (!rebuilt.ok)
        assert.fail('rebuild failed');
    assert.equal(rebuilt.value.userEdited, true, '用户编辑过必须留痕');
    assert.equal(rebuilt.value.extractionMethod, 'manual');
    assert.equal(rebuilt.value.contentHash, edited.value.contentHash);
});
test('难度估算：已知覆盖决定分类，无证据词不并入生词率', () => {
    const passage = passageOf(ARTICLE);
    const words = [0, 1].map(i => wordOf('placeholder' + i, 'normal', 3));
    // 全篇没有词库证据：no-evidence 必须单独统计，不能算“不会”
    const blind = estimateReadingDifficulty({ sentences: passage.sentences ?? [], text: passage.text, model: { words: [] } });
    assert.equal(blind.estimatedUnknownRate, 0, '没有任何词库证据时不得声称有生词率');
    assert.ok(blind.noEvidenceRate > 0.9, '缺证据比例必须被显式统计：' + blind.noEvidenceRate);
    assert.ok(blind.reasons.some(r => /不在词库/.test(r)), '必须解释“不在词库 ≠ 不会”');
    assert.equal(blind.confidence, 'low');
    assert.equal(blind.classification, 'too-hard', '证据不足时不得给出乐观分类');
    // 高覆盖 → comfort
    const tokens = (passage.text.toLowerCase().match(/[a-z']+/g) ?? []);
    const known = [...new Set(tokens)].map(t => wordOf(t, 'normal', 4));
    const high = estimateReadingDifficulty({ sentences: passage.sentences ?? [], text: passage.text, model: { words: known, knownVocabSize: 800 } });
    assert.ok(high.knownCoverage >= 0.9, '覆盖应接近 1：' + high.knownCoverage);
    assert.equal(high.classification, 'comfort');
    assert.equal(high.classification, 'comfort');
    assert.equal(classificationLabel('comfort'), classificationLabel('comfort'));
    assert.equal(high.confidence, 'high');
    assert.equal(high.distinctUnknownTokens.length, 0);
    // 一半有测验证据（normal）+ 一半测过但没证据（new / total=0 → uncertain）→ 覆盖下降、估算生词率上升
    const uniq = [...new Set(tokens)];
    const half = uniq.filter((_, i) => i % 2 === 0).map(t => wordOf(t, 'normal', 4));
    const untested = uniq.filter((_, i) => i % 2 === 1).map(t => wordOf(t, 'new', 0));
    const low = estimateReadingDifficulty({ sentences: passage.sentences ?? [], text: passage.text, model: { words: [...half, ...untested], knownVocabSize: 800 } });
    assert.ok(low.knownCoverage < 0.9, '覆盖必须下降');
    assert.ok(low.uncertainRate > 0, '词库里有但没有测验证据的词必须按 uncertain 统计：' + low.uncertainRate);
    assert.ok(low.estimatedUnknownRate > 0, '不确定词按半权计入估算：' + low.estimatedUnknownRate);
    assert.notEqual(low.classification, 'comfort');
    assert.ok(low.classification === 'growth' || low.classification === 'stretch' || low.classification === 'too-hard');
    // 明确不会的词进入 distinctUnknownTokens 与 estimated，且“不在词库”的词不算不会
    const unknownSurface = uniq.filter((_, i) => i % 2 === 1)[0] ?? 'reader';
    const unknownWord = wordOf(unknownSurface, 'unknown', 5);
    const withUnknown = estimateReadingDifficulty({ sentences: passage.sentences ?? [], text: passage.text, model: { words: [...half, ...untested, unknownWord], knownVocabSize: 800 } });
    assert.ok(withUnknown.distinctUnknownTokens.includes(unknownWord.en), 'explicit unknown 必须进入 distinctUnknownTokens');
    const weak = estimateReadingDifficulty({ sentences: passage.sentences ?? [], text: passage.text, model: { words: [...half, ...untested, unknownWord], knownVocabSize: 800, grammarWeakCount: 5 } });
    assert.ok(weak.difficulty >= withUnknown.difficulty, '语法薄弱不得降低难度');
    // 在难度未触顶的场景下，语法薄弱必须真的抬高难度
    const weakHigh = estimateReadingDifficulty({ sentences: passage.sentences ?? [], text: passage.text, model: { words: known, knownVocabSize: 800, grammarWeakCount: 5 } });
    assert.ok(weakHigh.difficulty > high.difficulty, `语法薄弱必须抬高难度：${high.difficulty} → ${weakHigh.difficulty}`);
    assert.ok(weakHigh.reasons.some(r => /语法概念/.test(r)));
    assert.ok(high.estimatedMinutes >= 1 && withUnknown.estimatedMinutes >= 1);
    assert.equal(classifyToken(words[0]), 'known');
    assert.equal(classifyToken(undefined), 'no-evidence');
    assert.equal(classifyToken(wordOf('x', 'unknown', 3)), 'unknown');
    assert.equal(classifyToken(wordOf('y', 'new', 0)), 'uncertain');
    assert.ok(clauseDepthOf({ index: 0, paragraphIndex: 0, text: 'The book that I bought, which was cheap, is good.', start: 0, end: 50, wordCount: 12 }) >= 2);
});
test('证据幂等键与自评置信度上限（自评不得高于 medium）', () => {
    assert.equal(evidenceKey('s1', 'cold-baseline', 'first'), 's1:cold-baseline:first');
    const self = makeEvidence({ type: 'cold-baseline', passageId: 'p1', sessionId: 's1', source: 'self_reported', confidence: 'high', value: 40, key: 'k1', at: 1 });
    assert.equal(self.confidence, 'medium', '自评置信度上限是 medium');
    const behaviour = makeEvidence({ type: 'vocabulary-obstacle', passageId: 'p1', sessionId: 's1', source: 'task_behaviour', confidence: 'high', value: 'x', key: 'k2', at: 1 });
    assert.equal(behaviour.confidence, 'high');
    const first = appendEvidence([], self);
    const again = appendEvidence(first, makeEvidence({ type: 'cold-baseline', passageId: 'p1', sessionId: 's1', source: 'self_reported', confidence: 'low', value: 90, key: 'k1', at: 99 }));
    assert.equal(again.length, 1, '同 key 必须幂等，不新增也不改写');
    assert.equal(again[0].value, 40);
    const two = appendEvidence(again, behaviour);
    assert.equal(two.length, 2);
    const summary = summarizeEvidence([...two, makeEvidence({ type: 'detail', passageId: 'p1', sessionId: 's1', source: 'verified_item', confidence: 'high', value: 1, key: 'k3', at: 2 })]);
    assert.equal(summary.vocabularyObstacles, 1);
    assert.equal(summary.verified, 1);
    assert.equal(summary.selfReported, 1);
    assert.deepEqual(summary.types.sort(), ['cold-baseline', 'detail', 'vocabulary-obstacle']);
    assert.equal(translationDependenceScore('A'), 0);
    assert.equal(translationDependenceScore('E'), 4);
});
test('生词率区分 explicit 与 estimated，并携带分母/覆盖/置信度', () => {
    const marks = [
        markOf({ surface: 'memorising', judgment: 'unknown', tokenIndex: 3 }),
        markOf({ surface: 'traceable', judgment: 'unknown', tokenIndex: 4 }),
        markOf({ surface: 'unfamiliar', judgment: 'vague', tokenIndex: 5 }),
    ];
    const explicit = explicitUnknownRate(marks, 200);
    assert.equal(explicit.denominator, 200);
    assert.equal(explicit.numerator, 2);
    assert.equal(explicit.value, 1, '2/200 = 1%');
    assert.match(explicit.method, /unknown 标记数/);
    assert.match(explicit.note, /没标记不等于你认识/);
    assert.equal(explicit.source, 'explicit_marks');
    assert.ok(explicit.sampleCoverage > 0 && explicit.sampleCoverage < 0.2);
    assert.equal(explicit.confidence, 'low', '覆盖很低时置信度必须低');
    // explicit 与 estimated 必须是两个不同的量
    const tokens = ['memorising', 'traceable', 'reader', 'structure', 'context', 'essay', 'length', 'behaves', 'only', 'vocabulary'];
    const dict = new Map<string, Word>([
        ['memorising', wordOf('memorising', 'unknown', 4)],
        ['traceable', wordOf('traceable', 'vague', 2)],
        ['reader', wordOf('reader', 'normal', 6)],
        ['structure', wordOf('structure', 'fluent', 9)],
    ]);
    const estimated = estimatedUnknownRate(marks, tokens, n => dict.get(n));
    assert.equal(estimated.denominator, 10);
    assert.equal(estimated.numerator, 1, '只有 explicit unknown 计入 numerator');
    assert.equal(estimated.value, 15, '(1 + 0.5×1)/10 = 15%');
    assert.ok(estimated.sampleCoverage < 1);
    assert.match(estimated.note, /不在词库/);
    assert.equal(estimated.confidence, 'low');
    assert.notEqual(estimated.value, explicit.value, '两个生词率绝不能混算');
    const none = estimatedUnknownRate(marks, ['zzz', 'qqq'], () => undefined);
    assert.equal(none.value, 0, '完全没证据时不得声称有生词率');
    assert.equal(none.sampleCoverage, 0);
    assert.equal(none.confidence, 'low');
    const empty = estimatedUnknownRate(marks, [], () => undefined);
    assert.equal(empty.value, null);
    assert.equal(empty.denominator, 0);
});
test('学习候选：专有名词与待补释义词被区别对待', () => {
    const words: Word[] = [wordOf('structure', 'normal', 5, '结构')];
    const marks = [
        markOf({ surface: 'Kubernetes', judgment: 'unknown', tokenIndex: 1 }),
        markOf({ surface: 'deployment', judgment: 'unknown', tokenIndex: 2 }),
        markOf({ surface: 'deployment', judgment: 'unknown', tokenIndex: 9, id: 'm2' }),
        markOf({ surface: 'deployment', judgment: 'unknown', tokenIndex: 12, id: 'm3' }),
        markOf({ surface: 'structure', judgment: 'vague', tokenIndex: 4 }),
        markOf({ surface: 'the', judgment: 'unknown', tokenIndex: 5 }),
    ];
    const out = selectStudyCandidates(marks, words);
    const byNorm = new Map(out.map(c => [c.normalized, c]));
    assert.equal(byNorm.has('the'), false, '功能词不得进入学习候选');
    const proper = byNorm.get('kubernetes');
    assert.ok(proper, '专有名词必须保留但单独归类');
    assert.equal(proper!.bucket, 'proper-noun');
    assert.equal(proper!.needsDefinition, true, '词库里没有释义时必须标记待补，不得编造释义');
    assert.equal(proper!.existingWordId, null);
    const core = byNorm.get('deployment');
    assert.ok(core);
    assert.equal(core!.occurrences, 3);
    assert.equal(core!.bucket, 'core', '高频 unknown 词应进核心学习');
    assert.equal(core!.needsDefinition, true);
    assert.ok(core!.reasons.includes('appears-x3'));
    const existing = byNorm.get('structure');
    assert.ok(existing);
    assert.equal(existing!.existingWordId, words[0].id);
    assert.equal(existing!.needsDefinition, false, '词库里已有释义就不该再要求补释义');
    assert.equal(out[0].bucket, 'core', '核心词必须排在最前：' + out.map(c => c.bucket).join(','));
    const revoked = selectStudyCandidates([markOf({ surface: 'deployment', judgment: 'unknown', revokedAt: 5 })], words);
    assert.equal(revoked.length, 0, '撤销的标记不得进入候选');
    const seeded = readingWordSeed('deployment', 'book-x', 7, 1000);
    assert.equal(seeded.zh, '', '新词不得带编造释义');
    assert.equal(seeded.en, 'deployment');
    const exposure = exposureFromMark(markOf({ surface: 'deployment', judgment: 'unknown' }), 'word-1', 2000);
    assert.equal(exposure.state, 'unknown');
    assert.equal(exposure.sourceType, 'reading');
    assert.equal(exposure.at, 2000);
    assert.equal(exposure.sentence, 'context');
});
