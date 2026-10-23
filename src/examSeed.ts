// —— Phase 11：内置题库（项目自编，非官方真题）——
// 用途：让应用在没有用户材料时也能演示完整链路；所有题目明确标 authored。
// 不复制任何商业教辅；文本为项目原创，许可 project-authored。
import type { AssessmentItem, ExamMaterial, ExamDistractor, ExamQuestionType, ItemProvenance, ItemVerifiedStatus, ExamErrorCategory, ExamErrorSubcategory } from './examTypes.ts';
const CREATED = Date.UTC(2026, 9, 23, 3, 0, 0);
const MATERIALS: ExamMaterial[] = [
    {
        id: 'mat-glass-city', title: 'The Glass City', topic: 'urban design',
        text: `In the 1970s, the city of Ashford covered its main street with a glass roof. Shopkeepers believed the roof would protect customers from rain and attract visitors from neighbouring towns. For a few years, it worked. Cafes opened, and the street stayed busy even in winter.\n\nYet the glass soon created new problems. Sunlight passed through the roof and heated the street like a greenhouse. In summer, temperatures rose so high that people avoided the area at midday. The city tried painting the glass white, but this made the street dark and gloomy. Engineers finally replaced part of the roof with plants and open panels. The lesson was simple: a solution designed for one season can become a burden in another.`,
        wordCount: 118, source: 'builtin', license: 'project-authored', provenance: 'authored', verifiedStatus: 'verified', createdAt: CREATED,
    },
    {
        id: 'mat-cloze-cooperation', title: 'Why Teams Need Friction', topic: 'teamwork',
        text: `A team without disagreement can feel comfortable, but comfort is not the same as progress. When everyone quickly agrees, the group may simply be avoiding the effort of testing its own ideas. Researchers who study decision-making have found that modest disagreement improves the quality of a plan, (1) ______ it forces people to explain their reasoning. The key word is modest: personal attacks make people defensive, while focused questions keep the discussion productive. Good teams therefore design ways to disagree without breaking trust.`,
        wordCount: 88, source: 'builtin', license: 'project-authored', provenance: 'authored', verifiedStatus: 'verified', createdAt: CREATED,
    },
];
function distractors(entries: [
    string,
    ExamErrorCategory,
    ExamErrorSubcategory,
    string
][]): ExamDistractor[] {
    return entries.map(([option, category, subcategory, reason]) => ({ option, category, subcategory, reason }));
}
interface PartialItem {
    id: string;
    questionType: ExamQuestionType;
    section: string;
    stem: string;
    options?: {
        id: string;
        text: string;
    }[];
    answerKey?: string | null;
    answerEvidence: string;
    explanation: string;
    targetSkills: string[];
    targetWords?: string[];
    targetGrammar?: string[];
    materialId?: string | null;
    purpose?: 'exam' | 'weekly';
    pointValue?: number;
    estimatedTimeMinutes?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
    provenance?: ItemProvenance;
    verifiedStatus?: ItemVerifiedStatus;
    rubric?: string[];
    audioUrl?: string | null;
    distractorAnalysis?: ExamDistractor[];
}
function item(p: PartialItem): AssessmentItem {
    return {
        id: p.id, examCategory: 'other', examYear: 2026, purpose: p.purpose ?? 'exam',
        section: p.section, questionType: p.questionType, materialId: p.materialId ?? null, stem: p.stem,
        options: p.options ?? [], answerKey: p.answerKey ?? null, answerEvidence: p.answerEvidence, explanation: p.explanation,
        pointValue: p.pointValue ?? 2, estimatedTimeMinutes: p.estimatedTimeMinutes ?? 3, difficulty: p.difficulty ?? 'medium',
        difficultyBasis: '项目编写时按句式与词汇复杂度人工估计，不是官方难度。',
        targetSkills: p.targetSkills, targetWords: p.targetWords ?? [], targetGrammar: p.targetGrammar ?? [],
        source: 'builtin', license: 'project-authored', provenance: p.provenance ?? 'authored', verifiedStatus: p.verifiedStatus ?? 'verified',
        distractorAnalysis: p.distractorAnalysis, rubric: p.rubric, audioUrl: p.audioUrl ?? null, createdAt: CREATED,
    };
}
const ITEMS: AssessmentItem[] = [
    item({
        id: 'ex-grammar-1', questionType: 'contextual_grammar', section: 'written',
        stem: 'By the time the researchers arrived, the river ______ its course after days of heavy rain.',
        options: [{ id: 'A', text: 'changes' }, { id: 'B', text: 'had changed' }, { id: 'C', text: 'has changed' }, { id: 'D', text: 'was changing' }],
        answerKey: 'B', answerEvidence: '「By the time + 过去时」表示过去某一时刻之前已完成，需用过去完成时 had changed。',
        explanation: '时间状语 by the time the researchers arrived 给出过去参照点，河流改道发生在其前，故用过去完成时。',
        targetSkills: ['grammar.tense', 'grammar.past-perfect'], targetGrammar: ['g.past-perfect'], difficulty: 'medium',
        distractorAnalysis: distractors([
            ['A', 'structure', 'clause_relation', '忽略了过去参照点，误用一般现在时。'],
            ['C', 'structure', 'clause_relation', '现在完成时的参照点是现在，与 arrived 冲突。'],
            ['D', 'structure', 'clause_relation', '过去进行时强调当时正在进行，未表达“已完成”。'],
        ]),
    }),
    item({
        id: 'ex-grammar-2', questionType: 'contextual_grammar', section: 'written',
        stem: 'The proposal, ______ aims to cut household waste, was approved by the council.',
        options: [{ id: 'A', text: 'which' }, { id: 'B', text: 'that' }, { id: 'C', text: 'what' }, { id: 'D', text: 'it' }],
        answerKey: 'A', answerEvidence: '逗号后的非限制性定语从句指代 proposal，只能用 which，不能用 that。',
        explanation: '非限制性定语从句不能用 that；what 不引导定语从句；it 会造成两个独立句无连接。',
        targetSkills: ['grammar.relative-clause'], targetGrammar: ['g.relative-clause'], difficulty: 'easy',
        distractorAnalysis: distractors([
            ['B', 'structure', 'clause_relation', '非限制性定语从句不能用 that。'],
            ['C', 'structure', 'clause_relation', 'what 不能引导此处定语从句。'],
            ['D', 'structure', 'clause_relation', 'it 不能连接两个句子。'],
        ]),
    }),
    item({
        id: 'ex-vocab-1', questionType: 'vocabulary_in_context', section: 'written', materialId: 'mat-glass-city',
        stem: 'In the passage, the word “burden” is closest in meaning to ______.',
        options: [{ id: 'A', text: 'a heavy load' }, { id: 'B', text: 'a quick solution' }, { id: 'C', text: 'a pleasant surprise' }, { id: 'D', text: 'a seasonal benefit' }],
        answerKey: 'A', answerEvidence: '最后一句说“为某个季节设计的方案可能在另一个季节变成负担”，burden 指沉重负担。',
        explanation: '上下文把最初有效的方案与后来的问题对照，burden 表示需要承受的重负。',
        targetSkills: ['vocabulary.context', 'reading.inference'], targetWords: ['burden'], difficulty: 'medium',
        distractorAnalysis: distractors([
            ['B', 'vocabulary', 'word_meaning', '把 solution 与 burden 混为一谈。'],
            ['C', 'vocabulary', 'word_meaning', '忽略转折语气。'],
            ['D', 'vocabulary', 'word_meaning', 'benefit 与 burden 语义相反。'],
        ]),
    }),
    item({
        id: 'ex-cloze-1', questionType: 'cloze', section: 'written', materialId: 'mat-cloze-cooperation',
        stem: 'Blank (1): modest disagreement improves the quality of a plan, ______ it forces people to explain their reasoning.',
        options: [{ id: 'A', text: 'because' }, { id: 'B', text: 'although' }, { id: 'C', text: 'unless' }, { id: 'D', text: 'whether' }],
        answerKey: 'A', answerEvidence: '前后为因果关系：分歧迫使人们解释理由，因此提高质量。',
        explanation: 'because 引出原因；although 让步、unless 条件、whether 选择，均与逻辑不符。',
        targetSkills: ['logic.cause', 'cloze.cohesion'], targetGrammar: ['g.adverbial-clause'], difficulty: 'easy',
        distractorAnalysis: distractors([
            ['B', 'logic', 'misreading', '把因果误读为让步。'],
            ['C', 'logic', 'misreading', '条件关系不成立。'],
            ['D', 'logic', 'misreading', 'whether 不表因果。'],
        ]),
    }),
    item({
        id: 'ex-reading-1', questionType: 'reading_comprehension', section: 'written', materialId: 'mat-glass-city',
        stem: 'What is the main idea of the passage?',
        options: [
            { id: 'A', text: 'Glass roofs are always harmful to city streets.' },
            { id: 'B', text: 'A design that solves one problem may create another.' },
            { id: 'C', text: 'Shopkeepers should never invest in public spaces.' },
            { id: 'D', text: 'Painting glass white is the best engineering solution.' },
        ],
        answerKey: 'B', answerEvidence: '末句直接总结：为一个季节设计的解决方案，可能在另一个季节变成负担。',
        explanation: '全文先讲玻璃屋顶带来人流，再讲夏天过热与改造，落点在方案的副作用，故选 B。',
        targetSkills: ['reading.main-idea'], difficulty: 'easy',
        distractorAnalysis: distractors([
            ['A', 'logic', 'overgeneralization', 'always 过度概括；文中最初是有效的。'],
            ['C', 'logic', 'overgeneralization', 'never 过度推断。'],
            ['D', 'evidence', 'misreading', '刷白只是失败的尝试之一。'],
        ]),
    }),
    item({
        id: 'ex-reading-2', questionType: 'reading_comprehension', section: 'written', materialId: 'mat-glass-city',
        stem: 'Why did painting the glass white fail to solve the problem?',
        options: [
            { id: 'A', text: 'It made the street too dark.' },
            { id: 'B', text: 'It attracted too many visitors.' },
            { id: 'C', text: 'It increased the cost of cafes.' },
            { id: 'D', text: 'It stopped rainwater from reaching the street.' },
        ],
        answerKey: 'A', answerEvidence: '原文：The city tried painting the glass white, but this made the street dark and gloomy.',
        explanation: '定位原文即可得到 A；其余选项没有文本依据。',
        targetSkills: ['reading.detail', 'reading.evidence-location'], difficulty: 'easy',
        distractorAnalysis: distractors([
            ['B', 'evidence', 'incomplete_evidence', '与原文人流变化无关。'],
            ['C', 'evidence', 'incomplete_evidence', '原文未提成本。'],
            ['D', 'evidence', 'incomplete_evidence', '原文未提雨水路径。'],
        ]),
    }),
    item({
        id: 'ex-reading-3', questionType: 'reading_comprehension', section: 'written', materialId: 'mat-glass-city',
        stem: 'What can be inferred about the city’s final decision?',
        options: [
            { id: 'A', text: 'It rejected the idea of a covered street entirely.' },
            { id: 'B', text: 'It combined natural elements with an open design.' },
            { id: 'C', text: 'It replaced glass with a solid metal roof.' },
            { id: 'D', text: 'It moved the shops to another town.' },
        ],
        answerKey: 'B', answerEvidence: '原文：replaced part of the roof with plants and open panels。',
        explanation: 'plants and open panels 说明保留部分屋顶结构，同时引入植物与开放面板，故选 B。',
        targetSkills: ['reading.inference'], difficulty: 'medium',
        distractorAnalysis: distractors([
            ['A', 'logic', 'overgeneralization', '只替换了部分屋顶，不是完全放弃。'],
            ['C', 'evidence', 'incomplete_evidence', '原文没有金属屋顶。'],
            ['D', 'evidence', 'misreading', '原文没有搬迁。'],
        ]),
    }),
    item({
        id: 'ex-translation-1', questionType: 'translation', section: 'written',
        stem: '将下面句子译成英语：这座城市最初为了吸引游客而建造的玻璃屋顶，后来反而让夏天更难忍受。',
        answerKey: null, answerEvidence: '参考译文：The glass roof that the city originally built to attract visitors ended up making summers even harder to bear.',
        explanation: '评分关注：定语从句/分词结构、originally 与 ended up 的转折、比较级 harder to bear；允许多种正确表达。',
        targetSkills: ['output.translation', 'grammar.relative-clause'], targetGrammar: ['g.relative-clause'], difficulty: 'hard', pointValue: 5, estimatedTimeMinutes: 5,
        rubric: ['意义完整：玻璃屋顶、建造目的、后来的反效果', '语法：从句或分词结构正确', '词汇：吸引游客 / 难以忍受表达自然', '自然度：英语语序，不是逐字直译'],
    }),
    item({
        id: 'ex-summary-1', questionType: 'summary_writing', section: 'written', materialId: 'mat-glass-city',
        stem: '用不超过 60 词概括本文，不要照抄原文句子。',
        answerKey: null, answerEvidence: '参考要点：玻璃屋顶初期带来人流；夏季过热；刷白失败；最终以植物和开放面板改造；结论是方案可能带来新问题。',
        explanation: '评分关注主要观点、逻辑关系、删去细节、用自己的语言重组；不把复制原文当高质量概要。',
        targetSkills: ['output.summary', 'reading.main-idea'], difficulty: 'hard', pointValue: 10, estimatedTimeMinutes: 12,
        rubric: ['覆盖玻璃屋顶的初衷与效果', '覆盖过热/刷白失败/最终改造', '保留因果关系', '使用自己的英语表达，不整句照抄'],
    }),
    item({
        id: 'ex-writing-1', questionType: 'situational_writing', section: 'written',
        stem: 'Your school plans to reduce plastic waste. Write a short proposal (80–120 words) with two practical suggestions and reasons.',
        answerKey: null, answerEvidence: '评分依据：任务完成（建议+理由）、组织、语法、词汇、连贯性；不按官方阅卷标准给分。',
        explanation: '开放写作只提供诊断性反馈与自评，不产生官方分数。',
        targetSkills: ['output.argument', 'output.organization'], difficulty: 'hard', pointValue: 15, estimatedTimeMinutes: 20,
        rubric: ['提出两条可执行建议', '每条建议有理由', '段落组织清楚', '语法与词汇基本准确', '不跑题'],
    }),
    item({
        id: 'ex-listening-1', questionType: 'listening', section: 'oral', audioUrl: null,
        stem: 'Listen to the conversation and choose the main reason the speaker changed her plan.',
        options: [{ id: 'A', text: 'The weather' }, { id: 'B', text: 'A train delay' }, { id: 'C', text: 'A meeting' }, { id: 'D', text: 'An illness' }],
        answerKey: 'B', answerEvidence: '需要音频与原文；当前未内置音频，因此不可完成。',
        explanation: '没有音频时不得让用户“听题”；该题在 UI 中显示 unavailable。',
        targetSkills: ['listening.main-idea'], difficulty: 'medium', verifiedStatus: 'needs_review',
    }),
    item({
        id: 'wk-sentence-1', questionType: 'sentence_parsing', section: 'weekly', purpose: 'weekly',
        stem: 'Which part is the main clause of: “Although the results were incomplete, the team decided to publish its findings.”?',
        options: [
            { id: 'A', text: 'Although the results were incomplete' },
            { id: 'B', text: 'the team decided to publish its findings' },
            { id: 'C', text: 'to publish its findings' },
            { id: 'D', text: 'the results were incomplete' },
        ],
        answerKey: 'B', answerEvidence: 'Although 引导让步状语从句；主句是 the team decided to publish its findings。',
        explanation: '先找连词划出从句，剩余能独立成立的部分是主句。',
        targetSkills: ['grammar.clause-boundary'], targetGrammar: ['g.adverbial-clause'], difficulty: 'medium', pointValue: 1, estimatedTimeMinutes: 2,
    }),
    item({
        id: 'wk-sentence-2', questionType: 'sentence_parsing', section: 'weekly', purpose: 'weekly',
        stem: 'In “The report written by the students was praised for its clarity.”, what does “written by the students” modify?',
        options: [{ id: 'A', text: 'The report' }, { id: 'B', text: 'The students' }, { id: 'C', text: 'clarity' }, { id: 'D', text: 'was praised' }],
        answerKey: 'A', answerEvidence: '过去分词短语作后置定语，修饰 The report。',
        explanation: 'written by the students 紧跟在 The report 后，逻辑主语是被修饰名词。',
        targetSkills: ['grammar.non-finite', 'grammar.modifier'], targetGrammar: ['g.non-finite'], difficulty: 'medium', pointValue: 1, estimatedTimeMinutes: 2,
    }),
    item({
        id: 'wk-output-1', questionType: 'short_output', section: 'weekly', purpose: 'weekly',
        stem: '用 2–4 句英语说明：你最近学到的一个观点，以及它为什么对你有用。',
        answerKey: null, answerEvidence: '开放表达；只记录文本与自评，不自动给分。',
        explanation: '独立表达证据看是否自己写、是否照抄；不评作文分。',
        targetSkills: ['output.independent'], difficulty: 'medium', pointValue: 0, estimatedTimeMinutes: 6,
        rubric: ['清楚表达一个观点', '说明理由', '语法不影响理解'],
    }),
    item({
        id: 'wk-reflection-1', questionType: 'reflection', section: 'weekly', purpose: 'weekly',
        stem: '这次阅读/表达时，你有多依赖翻译成中文？',
        options: [
            { id: 'A', text: '几乎不依赖，直接理解' }, { id: 'B', text: '偶尔查词，但整体直接理解' },
            { id: 'C', text: '需要先译成中文才能理解' }, { id: 'D', text: '大量依赖翻译' }, { id: 'E', text: '几乎没有理解' },
        ],
        answerKey: null, answerEvidence: '自评，仅用于翻译依赖趋势，不是能力分数。',
        explanation: '这是自评项，不产生客观分数。',
        targetSkills: ['translation.dependence'], difficulty: 'easy', pointValue: 0, estimatedTimeMinutes: 1,
    }),
    item({
        id: 'ex-text-structure-1', questionType: 'text_structure', section: 'written', materialId: 'mat-glass-city',
        stem: 'Which sentence best describes the function of the second paragraph?',
        options: [
            { id: 'A', text: 'It introduces the original purpose of the roof.' },
            { id: 'B', text: 'It explains the unexpected consequences of the design.' },
            { id: 'C', text: 'It compares two different cities.' },
            { id: 'D', text: 'It summarizes the engineers’ final solution.' },
        ],
        answerKey: 'B', answerEvidence: '第二段以 Yet 开头，列举过热、刷白失败等后果。',
        explanation: '关注转折词 Yet 与段落功能；第二段是问题后果，不是初衷或结论。',
        targetSkills: ['reading.text-structure'], difficulty: 'medium', pointValue: 2,
    }),
];
export function builtinMaterials(): ExamMaterial[] {
    return MATERIALS.map(m => ({ ...m }));
}
export function builtinExamItems(): AssessmentItem[] {
    return ITEMS.map(i => ({ ...i, options: i.options.map(o => ({ ...o })), distractorAnalysis: i.distractorAnalysis?.map(d => ({ ...d })) }));
}
