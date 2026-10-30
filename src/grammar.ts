// —— Phase 4：Grammar Knowledge Graph（显式语法知识图谱）——
// 设计依据：PROJECT_SPEC §50–§52、§85；REFERENCE_RESEARCH §5.2（BKT-lite）。
// 纪律：
//   1) 图谱是显式节点 + 先修边；禁止循环依赖（validateTaxonomy 拒绝并丢弃成环边）。
//   2) mastery 是 BKT-lite 估计值，参数为启发式起点（未用用户数据拟合），
//      证据不足时必须返回 unknown / insufficient-evidence，不得当成已验证掌握率。
//   3) 纯函数优先；持久化交给 db.ts / sentenceStore.ts。
import type { GrammarAttempt, GrammarCategory, GrammarConcept } from './types.ts';
export const GRAMMAR_CATEGORY_LABELS: Record<GrammarCategory, string> = {
    'sentence-structure': '句子成分与基本句型',
    clauses: '从句系统',
    'non-finite': '非谓语动词',
    'verb-system': '时态 · 语态 · 情态',
    phrases: '短语结构',
    cohesion: '逻辑与衔接',
};
export interface GrammarCardContent {
    rule: string;
    why: string;
    example: {
        ok: string;
        bad?: string;
        note?: string;
    };
    commonErrors: string[];
    transfer: string;
}
export interface GrammarConceptDef {
    id: string;
    name: string;
    category: GrammarCategory;
    parentId: string | null;
    description: string;
    prerequisiteIds: string[];
    relatedConceptIds: string[];
    examples: string[];
    difficulty: 1 | 2 | 3;
    card: GrammarCardContent;
}
// —— 知识图谱本体（§50 的分类按教学实际调整，不机械照搬列表）——
export const GRAMMAR_TAXONOMY: GrammarConceptDef[] = [
    // 句子成分与基本句型
    {
        id: 'structure.core', name: '句子主干（主 + 谓）', category: 'sentence-structure', parentId: null,
        description: '任何完整句子至少有一个主语与一个限定谓语；先找主干，再处理修饰。',
        prerequisiteIds: [], relatedConceptIds: ['structure.subject', 'structure.predicate'], examples: ['Birds fly.', 'The machine stopped.'],
        difficulty: 1,
        card: {
            rule: '每个完整句都要有一个限定动词（谓语），它是句子唯一的"骨架中心"。',
            why: '从句/非谓语/介词短语都可能出现动词样子的词，先用"有没有主语"和"能不能独立成句"筛出真正谓语。',
            example: { ok: 'The old bridge collapsed.', bad: 'The old bridge collapsing.', note: '第二句没有限定谓语，不能独立成句。' },
            commonErrors: ['把 to do / doing 当谓语', '漏掉从句里的第二个谓语'],
            transfer: '挑一个长句，先只圈出主语与谓语，其余全部划掉，再看是否还成立。',
        },
    },
    {
        id: 'structure.subject', name: '主语', category: 'sentence-structure', parentId: 'structure.core',
        description: '句子谈论的对象；可以是名词、代词、从句或非谓语结构。',
        prerequisiteIds: ['structure.core'], relatedConceptIds: ['clause.subject'], examples: ['What he said surprised me.', 'Reading helps.'],
        difficulty: 1,
        card: {
            rule: '主语是谓语所说明的对象；从句或 doing 结构都可以当主语。',
            why: '主语不一定在最前面或只有一两个词，先找谓语再回头找主语更稳。',
            example: { ok: 'What he said surprised me.', note: '主语是整个名词性从句。' },
            commonErrors: ['把句首状语当主语'],
            transfer: '在真实句子里把主语整个画出来，包括它的从句。',
        },
    },
    {
        id: 'structure.predicate', name: '谓语', category: 'sentence-structure', parentId: 'structure.core',
        description: '限定动词短语，携带时态、语态、情态信息。',
        prerequisiteIds: ['structure.core'], relatedConceptIds: ['verb.tense', 'verb.passive'], examples: ['She has been working.', 'It was built in 1900.'],
        difficulty: 1,
        card: {
            rule: '谓语是带时态/语态的动词短语，可能由 2–3 个词组成（have been done）。',
            why: '把助动词一起看成一个整体，才不会把 has 和 been 当两个谓语。',
            example: { ok: 'It was built in 1900.', note: 'was built 一起才是谓语（被动）。' },
            commonErrors: ['只圈主动词，漏掉助动词', '把过去分词当谓语'],
            transfer: '找出句中的谓语并把整组助动词+主动词一起标出。',
        },
    },
    {
        id: 'structure.object', name: '宾语', category: 'sentence-structure', parentId: 'structure.core',
        description: '动作的承受者；可为人/物/从句/非谓语。',
        prerequisiteIds: ['structure.predicate'], relatedConceptIds: ['clause.object'], examples: ['I know what she means.'],
        difficulty: 1,
        card: {
            rule: '宾语回答"对什么做"；及物动词后面必须有宾语。',
            why: '区分 that 引导的宾语从句与同位语/定语从句时，取决于它补足的是动词还是名词。',
            example: { ok: 'I know what she means.' },
            commonErrors: ['把状语当宾语'],
            transfer: '问自己"做什么、对谁做"，再核对结构。',
        },
    },
    {
        id: 'structure.complement', name: '补语', category: 'sentence-structure', parentId: 'structure.core',
        description: '说明主语或宾语身份/状态（be、become、make 等之后）。',
        prerequisiteIds: ['structure.predicate'], relatedConceptIds: ['structure.svc', 'structure.svoc'], examples: ['He became a teacher.', 'They elected him chairman.'],
        difficulty: 2,
        card: {
            rule: '系动词后说明主语的是主语补语；make/find/elected 后说明宾语的是宾语补语。',
            why: '补语与宾语之间可以补一个 be 而意思不变，这是识别补语的可靠办法。',
            example: { ok: 'They elected him chairman.', note: 'him = chairman，是宾语补语。' },
            commonErrors: ['把补语误当宾语'],
            transfer: '看到 make/keep/find + 名词时，试着加 be 验证。',
        },
    },
    {
        id: 'structure.modifier', name: '修饰成分', category: 'sentence-structure', parentId: 'structure.core',
        description: '定语、状语等附加信息；删掉后主干仍完整。',
        prerequisiteIds: ['structure.core'], relatedConceptIds: ['clause.relative', 'phrase.preposition'], examples: ['The man in the blue coat is my uncle.'],
        difficulty: 2,
        card: {
            rule: '修饰成分依附于某个中心词或整个句子，不是主干。',
            why: '长句难读多半是修饰成分太长；先剥离修饰，主干立刻清晰。',
            example: { ok: 'The man in the blue coat is my uncle.', note: 'in the blue coat 修饰 the man。' },
            commonErrors: ['把定语从句当主句'],
            transfer: '把修饰成分用括号括起来，只读主干。',
        },
    },
    {
        id: 'structure.svo', name: '主谓宾（SVO）', category: 'sentence-structure', parentId: 'structure.core',
        description: '最常见句型：主语 + 及物谓语 + 宾语。',
        prerequisiteIds: ['structure.subject', 'structure.predicate', 'structure.object'], relatedConceptIds: ['structure.svoo'], examples: ['She wrote a letter.'],
        difficulty: 1,
        card: { rule: 'SVO：谁 + 做什么 + 对什么。', why: '先锁定 SVO 骨架，再挂修饰成分。', example: { ok: 'She wrote a letter.' }, commonErrors: ['把宾语从句拆成两个句子'], transfer: '把一句长句压成 SVO 版本。' },
    },
    {
        id: 'structure.svc', name: '主系表（SVC）', category: 'sentence-structure', parentId: 'structure.core',
        description: '主语 + 系动词 + 主语补语。',
        prerequisiteIds: ['structure.subject', 'structure.complement'], relatedConceptIds: ['structure.svo'], examples: ['The plan sounds risky.'],
        difficulty: 2,
        card: { rule: '系动词（be/look/sound/become/seem）后面是表语，不是宾语。', why: '表语说明主语状态，动作性弱；判断时看动词是不是系动词。', example: { ok: 'The plan sounds risky.' }, commonErrors: ['把表语当宾语'], transfer: '换一个系动词，重写同一句。' },
    },
    {
        id: 'structure.svoo', name: '主谓双宾（SVOO）', category: 'sentence-structure', parentId: 'structure.core',
        description: '主语 + 谓语 + 间接宾语 + 直接宾语。',
        prerequisiteIds: ['structure.svo'], relatedConceptIds: ['structure.svoc'], examples: ['He gave me the keys.'],
        difficulty: 2,
        card: { rule: 'give/send/show/tell 类动词可带两个宾语：人 + 物。', why: '两个名词连着出现时，先判断动词是否允许双宾。', example: { ok: 'He gave me the keys.', note: 'me 间接宾语，the keys 直接宾语。' }, commonErrors: ['把间接宾语当状语'], transfer: '把它改写成 to/for 结构。' },
    },
    {
        id: 'structure.svoc', name: '主谓宾补（SVOC）', category: 'sentence-structure', parentId: 'structure.core',
        description: '主语 + 谓语 + 宾语 + 宾语补语。',
        prerequisiteIds: ['structure.svo', 'structure.complement'], relatedConceptIds: ['structure.svoo'], examples: ['They made him leader.'],
        difficulty: 3,
        card: { rule: 'make/keep/find/leave 等之后，宾语后面的成分说明宾语状态。', why: '补语与宾语有 be 关系；这将决定你是否读懂"他把某事变成什么"。', example: { ok: 'They made him leader.', note: 'him is leader。' }, commonErrors: ['把宾语补语当第二个宾语'], transfer: '找出 SVO 后再问"宾语变成什么"。' },
    },
    // 从句系统
    {
        id: 'clause.main', name: '主句', category: 'clauses', parentId: null,
        description: '可以独立成句的句子；一个句子只有一个主句。',
        prerequisiteIds: ['structure.core'], relatedConceptIds: ['clause.object', 'clause.relative'], examples: ['I left before he came.'],
        difficulty: 2,
        card: { rule: '主句 = 能独立存在的那个句子，其他都是从句。', why: '标点不能帮你判断；能不能独立成句才是标准。', example: { ok: 'I left before he came.', note: 'I left 是主句。' }, commonErrors: ['把逗号前的部分一律当主句'], transfer: '把从句遮住，看剩下的是否还是完整句。' },
    },
    {
        id: 'clause.object', name: '宾语从句', category: 'clauses', parentId: 'clause.main',
        description: 'that/whether/what/who 等引导，整体充当动词宾语。',
        prerequisiteIds: ['clause.main', 'structure.object'], relatedConceptIds: ['clause.subject'], examples: ['I think that he is right.'],
        difficulty: 2,
        card: { rule: '宾语从句补足动词；that 常可省略，但省略后仍是完整的一小句。', why: '识别关键是"动词后面需要宾语，而宾语是一整句话"。', example: { ok: 'I think that he is right.' }, commonErrors: ['把 that 从句当定语从句'], transfer: '把宾语从句换成名词短语，句子仍成立。' },
    },
    {
        id: 'clause.relative', name: '定语从句', category: 'clauses', parentId: 'clause.main',
        description: '修饰前面的名词（先行词）；who/which/that/whose/where 等引导。',
        prerequisiteIds: ['clause.main', 'structure.modifier'], relatedConceptIds: ['clause.attributive-nonexistent'], examples: ['The report that he wrote is missing.'],
        difficulty: 3,
        card: {
            rule: '定语从句紧跟在先行词后面，起形容词作用；去掉它句子仍完整。',
            why: '它是最高频的长句难点：从句里已经有一个独立的主谓，容易被误认成"第二个主句"。',
            example: { ok: 'The report that he wrote is missing.', bad: 'The report is missing that he wrote.', note: '从句必须紧跟先行词。' },
            commonErrors: ['把定语从句当主句', '找不到先行词', '关系词省略后认不出从句边界'],
            transfer: '先找先行词，再把它后面的整段括起来当形容词读。',
        },
    },
    {
        id: 'clause.attributive-nonexistent', name: '先行词定位（定语从句）', category: 'clauses', parentId: 'clause.relative',
        description: '确定定语从句修饰哪个名词；这是读懂长句的第一步。',
        prerequisiteIds: ['clause.relative'], relatedConceptIds: [], examples: ['The idea that you suggested works.'],
        difficulty: 3,
        card: { rule: '关系统词前面的那个名词（组）就是先行词，除非隔着介词短语。', why: '"修饰谁"决定了句子到底在说什么，位置感比语法术语更重要。', example: { ok: 'The idea that you suggested works.', note: '先行词是 the idea。' }, commonErrors: ['把远处名词当先行词'], transfer: '用线把关系词连回先行词。' },
    },
    {
        id: 'clause.adverbial', name: '状语从句', category: 'clauses', parentId: 'clause.main',
        description: '时间/原因/条件/让步/结果等；由 when/because/if/although/so that 等引导。',
        prerequisiteIds: ['clause.main'], relatedConceptIds: ['logic.connection'], examples: ['Although it rained, they continued.'],
        difficulty: 2,
        card: { rule: '状语从句修饰整个主句，表示时间、原因、条件、让步等关系。', why: '逻辑连接词是唯一可靠线索；先读连词再读句子。', example: { ok: 'Although it rained, they continued.' }, commonErrors: ['把让步当原因'], transfer: '把同一句按"因为/虽然/如果"各写一次，比较差别。' },
    },
    {
        id: 'clause.subject', name: '主语从句', category: 'clauses', parentId: 'clause.main',
        description: '整个从句作主语，谓语通常是单数。',
        prerequisiteIds: ['clause.main', 'structure.subject'], relatedConceptIds: ['clause.predicative'], examples: ['What surprised me was his tone.'],
        difficulty: 3,
        card: { rule: '主语从句在最前面或 it 形式主语之后；谓语按第三人称单数。', why: '它决定"是谁在做这件事"，误判会让整句意思走偏。', example: { ok: 'What surprised me was his tone.' }, commonErrors: ['把主语从句当状语'], transfer: '用 it 改写同一句。' },
    },
    {
        id: 'clause.predicative', name: '表语从句', category: 'clauses', parentId: 'clause.main',
        description: '系动词之后的从句，说明主语内容。',
        prerequisiteIds: ['clause.main', 'structure.complement'], relatedConceptIds: ['clause.subject'], examples: ['The problem is that we have no time.'],
        difficulty: 3,
        card: { rule: 'be/seem/become 之后的从句是表语从句。', why: '与宾语从句形式相近，靠前面的动词性质区分。', example: { ok: 'The problem is that we have no time.' }, commonErrors: ['把表语从句当定语从句'], transfer: '把从句换成名词，看句子是否还通。' },
    },
    {
        id: 'clause.nested', name: '从句嵌套', category: 'clauses', parentId: 'clause.main',
        description: '从句里再套从句；必须能分层切分。',
        prerequisiteIds: ['clause.object', 'clause.relative'], relatedConceptIds: [], examples: ['The book that I read says that the plan will fail.'],
        difficulty: 3,
        card: { rule: '先切第一层主句，再逐层进入从句内部。', why: '长句读不懂常常是"层级混在一起"，而不是单词不认识。', example: { ok: 'The book [that I read] says [that the plan will fail].' }, commonErrors: ['一层读到底'], transfer: '给每个从句编号并画出层级。' },
    },
    // 非谓语
    {
        id: 'nonfinite.gerund', name: '动名词 doing', category: 'non-finite', parentId: null,
        description: 'doing 作名词性子句成分（主语、宾语、介词宾语）。',
        prerequisiteIds: ['structure.object'], relatedConceptIds: ['phrase.preposition-gerund'], examples: ['Reading helps.', 'She enjoys teaching.'],
        difficulty: 2,
        card: { rule: 'doing 在名词位置就是动名词：主语、动词宾语、介词宾语都能放。', why: '动词后接 doing 还是 to do 常常是固定搭配，但介词后必须用 doing。', example: { ok: 'She enjoys teaching.', bad: 'She enjoys to teach.' }, commonErrors: ['介词后用原形', '把动名词当谓语'], transfer: '写出三个"介词 + doing"的搭配。' },
    },
    {
        id: 'nonfinite.participle', name: '分词 doing / done', category: 'non-finite', parentId: null,
        description: '分词作定语或状语；-ing 主动进行，-ed 被动完成。',
        prerequisiteIds: ['structure.modifier'], relatedConceptIds: ['nonfinite.role'], examples: ['The man standing there is my father.', 'Written in 1900, the book still sells.'],
        difficulty: 3,
        card: { rule: '分词没有主语，逻辑主语必须能从主句找到；ing 与主句主语多为主动关系，ed 为被动。', why: '判断分词修饰的是谁，是理解长句的关键步骤。', example: { ok: 'Written in 1900, the book still sells.', note: 'the book 与 write 是被动关系。' }, commonErrors: ['分词的逻辑主语找错'], transfer: '把分词改写成完整的定语从句。' },
    },
    {
        id: 'nonfinite.infinitive', name: '不定式 to do', category: 'non-finite', parentId: null,
        description: 'to do 表目的、结果或名词性成分。',
        prerequisiteIds: ['structure.predicate'], relatedConceptIds: ['nonfinite.role'], examples: ['He left early to catch the train.'],
        difficulty: 2,
        card: { rule: 'to do 不携带时态，常表目的（为了）或补充说明。', why: '它后面不接主语，因此不能当主句谓语。', example: { ok: 'He left early to catch the train.' }, commonErrors: ['把 to do 当谓语'], transfer: '把目的状语改成 so that 从句。' },
    },
    {
        id: 'nonfinite.role', name: '非谓语在句中担当的成分', category: 'non-finite', parentId: null,
        description: '综合判断 doing/done/to do 是定语、状语还是名词性成分。',
        prerequisiteIds: ['nonfinite.gerund', 'nonfinite.participle', 'nonfinite.infinitive'], relatedConceptIds: [], examples: ['The idea of moving abroad worries him.'],
        difficulty: 3,
        card: { rule: '先看位置：名词位置→名词性；句首/句末带逗号→状语；紧贴名词→定语。', why: '这一步决定句子结构分析是否成立。', example: { ok: 'The idea of moving abroad worries him.', note: 'of moving abroad 是介词短语，其中的动名词是介词宾语。' }, commonErrors: ['把状语分词当定语'], transfer: '给同一句写两个版本，改变非谓语成分作用。' },
    },
    // 时态 · 语态 · 情态
    {
        id: 'verb.tense', name: '时态', category: 'verb-system', parentId: null,
        description: '现在/过去/将来；与时间状语配合。',
        prerequisiteIds: ['structure.predicate'], relatedConceptIds: ['verb.aspect'], examples: ['He works here.', 'He worked here.'],
        difficulty: 1,
        card: { rule: '谓语形态告诉你事件发生在什么时间。', why: '时态是句子最可靠的时间线索，尤其在时间状语省略时。', example: { ok: 'He has worked here since 2010.' }, commonErrors: ['从句时态与主句不呼应'], transfer: '把一句过去时改成现在完成时，观察含义变化。' },
    },
    {
        id: 'verb.aspect', name: '体（进行 / 完成 / 完成进行）', category: 'verb-system', parentId: null,
        description: '进行体强调过程，完成体强调结果与关联。',
        prerequisiteIds: ['verb.tense'], relatedConceptIds: [], examples: ['He has been waiting for hours.'],
        difficulty: 2,
        card: { rule: '完成进行 = 从过去持续到现在并仍在继续。', why: '体决定"动作是否完成、是否持续"，与时间点无关。', example: { ok: 'He has been waiting for hours.' }, commonErrors: ['完成与进行混用'], transfer: '分别写进行、完成、完成进行三个版本。' },
    },
    {
        id: 'verb.passive', name: '被动语态', category: 'verb-system', parentId: null,
        description: 'be + done；主语是动作承受者。',
        prerequisiteIds: ['structure.predicate'], relatedConceptIds: ['nonfinite.participle'], examples: ['The bridge was built in 1900.'],
        difficulty: 2,
        card: { rule: '看到 be + 过去分词，先判断是不是被动，再找真正的施动者（常有 by）。', why: '被动句的中心往往不是句首的名词，理解重心会变。', example: { ok: 'The bridge was built in 1900.' }, commonErrors: ['把被动当过去时', '漏掉 by 后的施动者'], transfer: '把被动句还原成主动句，比较信息重心。' },
    },
    {
        id: 'verb.modal', name: '情态动词', category: 'verb-system', parentId: null,
        description: 'can/may/must/should 等表达可能性、义务、推测。',
        prerequisiteIds: ['structure.predicate'], relatedConceptIds: ['logic.negation'], examples: ['It must have rained.'],
        difficulty: 3,
        card: { rule: '情态动词后接原形；情态 + have done 表对过去的推测。', why: '情态表达作者的态度与确信程度，是阅读理解的关键信息。', example: { ok: 'It must have rained.', note: '对过去的强推测。' }, commonErrors: ['情态后接 done 当一般过去'], transfer: '把同一句改成"可能/一定/应该"三个版本。' },
    },
    // 短语结构
    {
        id: 'phrase.preposition', name: '介词短语', category: 'phrases', parentId: null,
        description: '介词 + 名词性成分；常作定语或状语。',
        prerequisiteIds: ['structure.modifier'], relatedConceptIds: ['phrase.preposition-gerund'], examples: ['The key to the door is lost.'],
        difficulty: 2,
        card: { rule: '介词短语要么修饰名词（定语），要么修饰整个句子（状语）；位置决定作用。', why: '粘连的介词短语是长句的主要"厚度"来源。', example: { ok: 'The key to the door is lost.' }, commonErrors: ['把状语当定语'], transfer: '把句中介词短语改成定语从句。' },
    },
    {
        id: 'phrase.preposition-gerund', name: '介词 + doing', category: 'phrases', parentId: 'phrase.preposition',
        description: '介词后面必须接名词性成分，动词要变成 doing。',
        prerequisiteIds: ['phrase.preposition', 'nonfinite.gerund'], relatedConceptIds: [], examples: ['She is good at solving problems.'],
        difficulty: 2,
        card: {
            rule: '介词后需要名词性质成分：动词要写成 doing。',
            why: '介词不能直接带谓语形式；of predict 不合语法，必须是 of predicting。',
            example: { ok: 'of predicting', bad: 'of predict', note: '介词 of 后接动名词。' },
            commonErrors: ['介词后接动词原形', '把介词 to 误认为不定式 to'],
            transfer: '列出 3 个"介词 + doing"的常见搭配并各自造句。',
        },
    },
    {
        id: 'phrase.noun', name: '名词短语', category: 'phrases', parentId: null,
        description: '限定词 + 修饰语 + 名词；整体充当一个成分。',
        prerequisiteIds: ['structure.core'], relatedConceptIds: [], examples: ['the surprisingly cheap second-hand car'],
        difficulty: 2,
        card: { rule: '名词短语整体是一个成分，中心的那个名词才决定它的性质。', why: '长名词短语容易让人误以为里面有多个主语。', example: { ok: 'the surprisingly cheap second-hand car' }, commonErrors: ['把修饰语当主语'], transfer: '把长名词短语压成"限定词 + 名词"。' },
    },
    {
        id: 'phrase.coordination', name: '并列结构', category: 'phrases', parentId: null,
        description: 'and/or/but 连接同级成分；两侧必须同性质。',
        prerequisiteIds: ['structure.core'], relatedConceptIds: ['logic.connection'], examples: ['She sings and dances.'],
        difficulty: 2,
        card: { rule: '并列连词两侧成分必须同级（名词对名词、从句对从句）。', why: '看到 and 要问"哪两部分并列"，否则会读错层次。', example: { ok: 'She sings and dances.', note: '两个谓语并列。' }, commonErrors: ['把并列成分当成主从'], transfer: '在长句中括号标出并列的两侧。' },
    },
    // 逻辑与衔接
    {
        id: 'logic.comparison', name: '比较结构', category: 'cohesion', parentId: null,
        description: '比较级、最高级、as…as、the more…the more。',
        prerequisiteIds: ['structure.core'], relatedConceptIds: [], examples: ['The more you read, the faster you read.'],
        difficulty: 3,
        card: { rule: '先找比较基准（than/as 后面），再确定谁比谁。', why: '比较句里信息重心在差异，读错基准会完全读反。', example: { ok: 'The more you read, the faster you read.' }, commonErrors: ['找不到比较基准'], transfer: '把一句比较句改写成"更…因为…"。' },
    },
    {
        id: 'logic.negation', name: '否定与否定转移', category: 'cohesion', parentId: null,
        description: 'not/never/hardly/no longer 等；否定范围常小于字面。',
        prerequisiteIds: ['structure.predicate'], relatedConceptIds: ['verb.modal'], examples: ['I do not think he is right.'],
        difficulty: 3,
        card: { rule: 'I don’t think… 的否定实际作用在从句上。', why: '否定范围决定句子的真实主张。', example: { ok: 'I do not think he is right.', note: '≈ I think he is not right.' }, commonErrors: ['否定范围读错'], transfer: '把否定移到从句，比较语气差别。' },
    },
    {
        id: 'logic.reference', name: '指代关系', category: 'cohesion', parentId: null,
        description: 'it/they/this/that/one 等指回前文；必须能定位。',
        prerequisiteIds: ['structure.core'], relatedConceptIds: [], examples: ['The plan failed, which surprised everyone.'],
        difficulty: 3,
        card: { rule: '每个代词都要能指回一个明确的名词或整句内容。', why: '指代定位错误是"每个词都认识但读不懂"的常见原因。', example: { ok: 'The plan failed, which surprised everyone.', note: 'which 指整句。' }, commonErrors: ['which 指代范围读错'], transfer: '把每个代词换回它指的名词，重读一遍。' },
    },
    {
        id: 'logic.connection', name: '逻辑连接', category: 'cohesion', parentId: null,
        description: 'however/therefore/moreover/instead 等标记句间关系。',
        prerequisiteIds: ['clause.adverbial'], relatedConceptIds: ['phrase.coordination'], examples: ['It rained; therefore, the match was cancelled.'],
        difficulty: 2,
        card: { rule: '连接词给出句间关系（转折、因果、递进、对照）。', why: '阅读理解题的答案常常取决于句子之间的逻辑关系。', example: { ok: 'It rained; therefore, the match was cancelled.' }, commonErrors: ['however 与 therefore 混用'], transfer: '给同一组句子换三种逻辑连接词，比较含义变化。' },
    },
];
// —— BKT-lite（REFERENCE_RESEARCH §5.2）：每概念一个 p(known)，O(1) 更新 ——
// 参数为启发式起点，未用用户数据拟合；界面必须按"估算"呈现。
export const GRAMMAR_CONFIG = {
    bkt: {
        prior: 0.25,
        learn: 0.15,
        guess: 0.25,
        slip: 0.1,
        forget: 0.02,
    },
    mastery: {
        mastered: 0.85,
        learning: 0.45,
        minEvidence: 4,
        incrementalEvidence: 4,
        strongEvidence: 8,
        delayMs: 24 * 60 * 60 * 1000,
        // ≥ 该辅助级别 = 已看到答案/完整解释：只计接触，不产生掌握证据
        exposedLevel: 3,
    },
    weak: {
        threshold: 0.6,
        minAttempts: 3,
        minErrors: 2,
    },
    evidenceWeights: {
        recognition: 0.6,
        structureStep: 1,
        independent: 1.2,
        transfer: 1.5,
        delayed: 1.4,
        hintPenalty: 0.5,
    },
    paramsNote: 'BKT-lite 参数为启发式起点（prior 0.25 / learn 0.15 / guess 0.25 / slip 0.1），未经过用户数据拟合；界面一律标注为估算。',
    taxonomyVersion: 'grammar-graph-2026-10',
};
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export function bktUpdate(p: number, correct: boolean, params: {
    prior: number;
    learn: number;
    guess: number;
    slip: number;
    forget: number;
} = GRAMMAR_CONFIG.bkt): number {
    const pp = clamp01(Number.isFinite(p) ? p : params.prior);
    const posterior = correct
        ? (pp * (1 - params.slip)) / (pp * (1 - params.slip) + (1 - pp) * params.guess)
        : (pp * params.slip) / (pp * params.slip + (1 - pp) * (1 - params.guess));
    const learned = posterior + (1 - posterior) * params.learn;
    return clamp01(learned * (1 - params.forget));
}
export function bktSequence(results: boolean[], length = 0, params = GRAMMAR_CONFIG.bkt): number {
    let p = params.prior;
    for (let i = 0; i < results.length; i++)
        p = bktUpdate(p, results[i], params);
    return clamp01(p);
}
// 证据权重：辅助越多、越接近"看过答案"，权重越低（§68 多证据）
export function evidenceWeight(a: GrammarAttempt, now = Date.now()): number {
    const w = GRAMMAR_CONFIG.evidenceWeights;
    let weight = w.recognition;
    if (a.transfer)
        weight = w.transfer;
    else if (a.independent)
        weight = w.structureStep;
    if (a.delayed && now - a.at >= GRAMMAR_CONFIG.mastery.delayMs)
        weight = Math.max(weight, w.delayed);
    if ((a.supportLevel ?? 0) >= 2)
        weight *= w.hintPenalty;
    if ((a.supportLevel ?? 0) >= 3)
        weight *= w.hintPenalty;
    return weight;
}
export type GrammarBand = 'unknown' | 'insufficient-evidence' | 'exposed' | 'learning' | 'likely-mastered';
export interface GrammarConceptState {
    conceptId: string;
    p: number;
    band: GrammarBand;
    attempts: number;
    correct: number;
    independentCorrect: number;
    transferCorrect: number;
    delayedAttempts: number;
    errorTypes: Record<string, number>;
    weak: boolean;
    lastSeenAt: number;
    nextReviewAt: number;
    reasons: string[];
}
export const GRAMMAR_BAND_LABELS: Record<GrammarBand, string> = {
    unknown: '还没练过',
    'insufficient-evidence': '练得还少',
    exposed: '看过讲解',
    learning: '在练',
    'likely-mastered': '练得比较稳',
};
function errorCounts(attempts: GrammarAttempt[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const a of attempts) {
        if (a.correct || !a.errorType)
            continue;
        out[a.errorType] = (out[a.errorType] ?? 0) + 1;
    }
    return out;
}
// 从真实 attempt 计算概念状态（多证据：独立作答 / 迁移 / 延迟 / 重复错误 / 辅助级别）
export function grammarState(concept: GrammarConceptDef | {
    id: string;
}, attempts: GrammarAttempt[], now = Date.now()): GrammarConceptState {
    const mine = attempts.filter(a => a.conceptId === concept.id).sort((a, b) => a.at - b.at);
    const errors = errorCounts(mine);
    const attemptsCount = mine.length;
    const correct = mine.filter(a => a.correct).length;
    const independentCorrect = mine.filter(a => a.correct && (a.independent ?? false) && (a.supportLevel ?? 0) === 0).length;
    const transferCorrect = mine.filter(a => a.correct && a.transfer).length;
    const delayedAttempts = mine.filter(a => a.delayed && now - a.at >= GRAMMAR_CONFIG.mastery.delayMs).length;
    // 只看"算证据"的尝试：看过答案/完整解释（supportLevel ≥ exposedLevel）只计接触，不推进后验
    const evidence = mine.filter(a => (a.supportLevel ?? 0) < GRAMMAR_CONFIG.mastery.exposedLevel);
    const exposedCount = mine.length - evidence.length;
    let p = GRAMMAR_CONFIG.bkt.prior;
    for (const a of evidence)
        p = bktUpdate(p, a.correct, GRAMMAR_CONFIG.bkt);
    const reasons: string[] = [];
    let band: GrammarBand = 'unknown';
    if (attemptsCount === 0) {
        band = 'unknown';
        reasons.push('no-attempts');
    }
    else if (!evidence.length) {
        band = 'exposed';
        reasons.push(`exposed-only-${exposedCount}`);
    }
    else if (evidence.length < GRAMMAR_CONFIG.mastery.minEvidence) {
        band = 'insufficient-evidence';
        reasons.push(`evidence-${evidence.length}/${GRAMMAR_CONFIG.mastery.minEvidence}`);
    }
    else if (independentCorrect === 0 && transferCorrect === 0) {
        band = 'exposed';
        reasons.push('no-independent-evidence');
    }
    else if (p >= GRAMMAR_CONFIG.mastery.mastered && (independentCorrect >= 2 || transferCorrect >= 1))
        band = 'likely-mastered';
    else if (p >= GRAMMAR_CONFIG.mastery.learning)
        band = 'learning';
    else {
        band = 'exposed';
        reasons.push('low-posterior');
    }
    if (transferCorrect)
        reasons.push(`transfer-${transferCorrect}`);
    if (delayedAttempts)
        reasons.push(`delayed-${delayedAttempts}`);
    if (independentCorrect)
        reasons.push(`independent-${independentCorrect}`);
    const repeated = Object.entries(errors).filter(([, n]) => n >= 2).map(([t, n]) => `${t}x${n}`);
    if (repeated.length)
        reasons.push(`repeat-errors:${repeated.join(',')}`);
    const weak = evidence.length >= GRAMMAR_CONFIG.weak.minAttempts
        && p < GRAMMAR_CONFIG.weak.threshold
        && (correct < attemptsCount || Object.values(errors).some(n => n >= GRAMMAR_CONFIG.weak.minErrors));
    if (weak)
        reasons.push(`weak-p-${p.toFixed(2)}`);
    const lastSeenAt = mine.length ? mine[mine.length - 1].at : 0;
    if (exposedCount && evidence.length)
        reasons.push(`exposed-${exposedCount}`);
    const nextReviewAt = lastSeenAt ? lastSeenAt + (p >= GRAMMAR_CONFIG.mastery.mastered ? 7 : p >= GRAMMAR_CONFIG.mastery.learning ? 3 : 1) * 86400000 : 0;
    return { conceptId: concept.id, p, band, attempts: attemptsCount, correct, independentCorrect, transferCorrect, delayedAttempts, errorTypes: errors, weak, lastSeenAt, nextReviewAt, reasons };
}
export function conceptStates(defs: GrammarConceptDef[], attempts: GrammarAttempt[], now = Date.now()): GrammarConceptState[] {
    return defs.map(d => grammarState(d, attempts, now));
}
export interface WeakConceptSignal {
    conceptId: string;
    name: string;
    category: GrammarCategory;
    p: number;
    attempts: number;
    topError: string;
    reasons: string[];
}
export function weakConcepts(defs: GrammarConceptDef[], attempts: GrammarAttempt[], now = Date.now(), limit = 5): WeakConceptSignal[] {
    const byId = new Map(defs.map(d => [d.id, d]));
    return conceptStates(defs, attempts, now)
        .filter(s => s.weak)
        .sort((a, b) => {
        if (a.p !== b.p)
            return a.p - b.p;
        const ea = Object.values(a.errorTypes).reduce((n, v) => n + v, 0);
        const eb = Object.values(b.errorTypes).reduce((n, v) => n + v, 0);
        if (eb !== ea)
            return eb - ea;
        return a.conceptId < b.conceptId ? -1 : 1;
    })
        .slice(0, limit)
        .map(s => {
        const def = byId.get(s.conceptId);
        const topError = Object.entries(s.errorTypes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        return { conceptId: s.conceptId, name: def?.name ?? s.conceptId, category: def?.category ?? 'sentence-structure', p: s.p, attempts: s.attempts, topError, reasons: s.reasons };
    });
}
// —— 图谱结构操作 ——
export interface TaxonomyIssue {
    kind: 'cycle' | 'missing-prerequisite' | 'duplicate-id' | 'self-reference' | 'missing-parent';
    conceptId: string;
    detail: string;
}
export function validateTaxonomy(defs: GrammarConceptDef[] = GRAMMAR_TAXONOMY): {
    ok: boolean;
    issues: TaxonomyIssue[];
    concepts: GrammarConceptDef[];
} {
    const issues: TaxonomyIssue[] = [];
    const byId = new Map<string, GrammarConceptDef>();
    const concepts: GrammarConceptDef[] = [];
    for (const d of defs) {
        if (byId.has(d.id)) {
            issues.push({ kind: 'duplicate-id', conceptId: d.id, detail: '重复概念 id，已丢弃后一个' });
            continue;
        }
        byId.set(d.id, d);
        concepts.push(d);
    }
    for (const d of concepts) {
        if (d.prerequisiteIds.includes(d.id)) {
            issues.push({ kind: 'self-reference', conceptId: d.id, detail: '先修关系不能指向自身' });
            d.prerequisiteIds = d.prerequisiteIds.filter(p => p !== d.id);
        }
        for (const p of [...d.prerequisiteIds]) {
            if (!byId.has(p)) {
                issues.push({ kind: 'missing-prerequisite', conceptId: d.id, detail: `未定义先修概念 ${p}，已忽略该边` });
                d.prerequisiteIds = d.prerequisiteIds.filter(x => x !== p);
            }
        }
        if (d.parentId && !byId.has(d.parentId)) {
            issues.push({ kind: 'missing-parent', conceptId: d.id, detail: `未定义父概念 ${d.parentId}` });
        }
    }
    // 环检测：以先修边为方向的 DFS 三色标记
    const state = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const visit = (id: string): boolean => {
        state.set(id, 1);
        stack.push(id);
        for (const p of byId.get(id)?.prerequisiteIds ?? []) {
            const s = state.get(p) ?? 0;
            if (s === 1) {
                const info = byId.get(id)!;
                info.prerequisiteIds = info.prerequisiteIds.filter(x => x !== p);
                issues.push({ kind: 'cycle', conceptId: id, detail: `检测到先修环 ${[...stack, p].join(' → ')}；已删除边 ${id} → ${p}` });
                continue;
            }
            if (s === 0 && visit(p))
                continue;
        }
        stack.pop();
        state.set(id, 2);
        return false;
    };
    for (const d of concepts)
        if ((state.get(d.id) ?? 0) === 0)
            visit(d.id);
    return { ok: issues.length === 0, issues, concepts };
}
export function prerequisitesOf(id: string, concepts: GrammarConceptDef[] = GRAMMAR_TAXONOMY): string[] {
    return concepts.find(c => c.id === id)?.prerequisiteIds ?? [];
}
// 传递闭包：返回全部（含间接）先修概念，按层序展开；遇到未知 id 时忽略
export function ancestorConcepts(id: string, concepts: GrammarConceptDef[] = GRAMMAR_TAXONOMY): string[] {
    const out: string[] = [];
    const seen = new Set<string>([id]);
    const queue = [...prerequisitesOf(id, concepts)];
    while (queue.length) {
        const next = queue.shift()!;
        if (seen.has(next))
            continue;
        seen.add(next);
        out.push(next);
        queue.push(...prerequisitesOf(next, concepts));
    }
    return out;
}
export function descendantConcepts(id: string, concepts: GrammarConceptDef[] = GRAMMAR_TAXONOMY): string[] {
    const out: string[] = [];
    let frontier = [id];
    while (frontier.length) {
        const next: string[] = [];
        for (const f of frontier)
            for (const c of concepts)
                if (c.prerequisiteIds.includes(f) && !out.includes(c.id) && c.id !== id) {
                    out.push(c.id);
                    next.push(c.id);
                }
        frontier = next;
    }
    return out;
}
export function topologicalOrder(concepts: GrammarConceptDef[] = GRAMMAR_TAXONOMY): GrammarConceptDef[] {
    const { concepts: clean } = validateTaxonomy(concepts);
    const visited = new Set<string>();
    const out: GrammarConceptDef[] = [];
    const visit = (c: GrammarConceptDef): void => {
        if (visited.has(c.id))
            return;
        visited.add(c.id);
        for (const p of c.prerequisiteIds) {
            const parent = clean.find(x => x.id === p);
            if (parent)
                visit(parent);
        }
        out.push(c);
    };
    for (const c of clean)
        visit(c);
    return out;
}
export interface ReadinessResult {
    ok: boolean;
    missing: string[];
    blockedBy: string[];
}
// 前置语法概念是否已具备（依据真实 BKT 状态；无证据算未具备）
export function prerequisitesSatisfied(id: string, states: GrammarConceptState[], threshold = GRAMMAR_CONFIG.mastery.learning, concepts: GrammarConceptDef[] = GRAMMAR_TAXONOMY): ReadinessResult {
    const pById = new Map(states.map(s => [s.conceptId, s.p]));
    const missing = ancestorConcepts(id, concepts).filter(a => (pById.get(a) ?? 0) < threshold);
    return { ok: missing.length === 0, missing, blockedBy: missing.length ? missing : [] };
}
export function conceptById(id: string, concepts: GrammarConceptDef[] = GRAMMAR_TAXONOMY): GrammarConceptDef | undefined {
    return concepts.find(c => c.id === id);
}
export function conceptIdForName(name: string): string | undefined {
    return GRAMMAR_TAXONOMY.find(c => c.name === name)?.id;
}
// 由 Taxonomy 生成持久化节点；已有节点保留其学习证据（additive，不覆盖用户数据）
export function seedGrammarConcepts(existing: GrammarConcept[], now = Date.now(), concepts: GrammarConceptDef[] = GRAMMAR_TAXONOMY): GrammarConcept[] {
    const { concepts: clean } = validateTaxonomy(concepts);
    const byId = new Map(existing.map(c => [c.id, c]));
    const out: GrammarConcept[] = [];
    for (const def of clean) {
        const prev = byId.get(def.id);
        out.push({
            id: def.id,
            name: def.name,
            parentId: def.parentId,
            exposures: prev?.exposures ?? 0,
            attempts: prev?.attempts ?? 0,
            correct: prev?.correct ?? 0,
            mastery: prev?.mastery ?? GRAMMAR_CONFIG.bkt.prior,
            retention: prev?.retention ?? 0,
            errorTypes: prev?.errorTypes ?? {},
            lastSeenAt: prev?.lastSeenAt ?? 0,
            nextReviewAt: prev?.nextReviewAt ?? 0,
            createdAt: prev?.createdAt ?? now,
            category: def.category,
            description: def.description,
            prerequisiteIds: [...def.prerequisiteIds],
            relatedConceptIds: [...def.relatedConceptIds],
            examples: [...def.examples],
            confidence: prev?.confidence ?? 0,
            realContextEvidence: prev?.realContextEvidence ?? 0,
            source: 'taxonomy',
            updatedAt: now,
        });
    }
    for (const c of existing)
        if (!out.some(o => o.id === c.id))
            out.push(c);
    return out;
}
export function taxonomyVersion(): string {
    return GRAMMAR_CONFIG.taxonomyVersion;
}
