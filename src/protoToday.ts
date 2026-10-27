// ════════════════════════════════════════════════════════════════════════════
// Phase 15c · Today 原型 A / B（真实页面，不是 mock）
// 只在 ?proto=a|b 时启用；默认（无参数）仍是 15b 界面，因此测试与冒烟不受影响。
// 两套共享业务动作（bindPlan 的数据属性），但 DOM 结构、构图、材质与动效完全不同。
// ════════════════════════════════════════════════════════════════════════════

export type ProtoId = 'a' | 'b' | 'd';

export interface ProtoTaskView {
    id: string;
    label: string;
    minutes: number;
    module: string;
    note: string;
    reason: string;
    status: string;
    critical: boolean;
    flexible: boolean;
    isNext: boolean;
}

export interface ProtoContext {
    proto: ProtoId;
    hasPlan: boolean;
    budget: number;
    usedMinutes: number;
    remainingMinutes: number;
    done: number;
    total: number;
    skipped: number;
    ratio: number;
    next: ProtoTaskView | null;
    tasks: ProtoTaskView[];
    reason: string;
    emptyNote: string;
}

const esc = (s: string): string =>
    s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const stateClass = (t: ProtoTaskView): string =>
    t.status === 'done' ? 'is-done' : t.isNext ? 'is-now' : t.status === 'skipped' || t.status === 'replaced' ? 'is-skipped' : '';

function actions(t: ProtoTaskView, variant: 'a' | 'b'): string {
    if (t.status === 'done' || t.status === 'skipped' || t.status === 'replaced')
        return '';
    const go = `<button class="${variant === 'a' ? 'proto-rail-go' : ''}" data-task-start="${esc(t.id)}">${t.status === 'started' ? '继续' : '开始'}</button>`;
    const rest = [
        t.flexible ? `<button data-task-replace="${esc(t.id)}">替换</button>` : '',
        `<button data-task-delay="${esc(t.id)}">延后</button>`,
        `<button data-task-skip="${esc(t.id)}">跳过</button>`,
    ].join('');
    return go + rest;
}

/* ───────────────────────── A · Obsidian Instrument ───────────────────────── */

function railItemA(t: ProtoTaskView, index: number): string {
    const cls = stateClass(t);
    return `<div class="proto-rail-item ${cls}" data-task="${esc(t.id)}">
  <span class="proto-rail-dot" aria-hidden="true"></span>
  <span class="proto-rail-index">${String(index + 1).padStart(2, '0')}</span>
  <div class="proto-rail-main">
    <div class="proto-rail-title"><b>${esc(t.label)}</b><span class="proto-rail-min">${t.minutes}′</span>${t.critical ? '<span class="proto-rail-critical">关键记忆</span>' : ''}${t.status === 'done' ? '<span class="proto-rail-critical" style="color:var(--a-green)">已完成</span>' : ''}</div>
    <div class="proto-rail-note">${esc(t.note)}${t.reason ? ` · ${esc(t.reason)}` : ''}</div>
  </div>
  <div class="proto-rail-actions">${actions(t, 'a')}</div>
</div>`;
}

function stageA(c: ProtoContext): string {
    if (!c.hasPlan) {
        return `<section class="proto-instrument">
  <div class="proto-eyebrow"><span>TODAY · 今日学习</span></div>
  <div class="proto-clock"><b>—</b><span>分钟可用</span></div>
  <div class="proto-next">
    <div class="proto-next-label">还没有今天的计划</div>
    <h1 class="proto-next-title">先给今天留一段时间。</h1>
    <p class="proto-next-reason">计划只在预算内安排拿得到证据的任务；没有真实目标时不会生成假任务。</p>
  </div>
  <div class="proto-cta-row"><span class="proto-cta-note">在右侧选择时间预算与状态，生成今天的顺序。</span></div>
</section>`;
    }
    const t = c.next;
    const usedPct = c.budget ? Math.min(100, Math.round((c.usedMinutes / c.budget) * 100)) : 0;
    return `<section class="proto-instrument" data-specular>
  <div class="proto-eyebrow"><span>TODAY · 学习会话</span><span style="margin-left:auto;letter-spacing:.1em">${new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span></div>
  <div class="proto-clock"><b data-odometer="${c.remainingMinutes}" data-odometer-key="p15c-a-remaining">${c.remainingMinutes}</b><span>分钟可用</span></div>
  <div class="proto-ruler" role="img" aria-label="今日预算 ${c.budget} 分钟，已用 ${c.usedMinutes} 分钟">
    <b style="left:0">0</b>
    <b style="right:0">${c.budget}</b>
    <i style="width:${usedPct}%"></i>
  </div>
  <div class="proto-next">
    <div class="proto-next-label">${t ? `当前 · ${esc(t.module)} · ${t.minutes} 分钟` : '今日完成'}${c.next && c.next.critical ? ' · 关键记忆' : ''}</div>
    <h1 class="proto-next-title">${t ? esc(t.label) : `今天的 ${c.total} 项都做完了。`}</h1>
    <p class="proto-next-reason">${t ? `先做这一项：${esc(c.reason)}。${esc(t.note)}` : '已完成的任务与证据都保留；跳过 / 替换不会冒充学习证据。'}</p>
  </div>
  <div class="proto-cta-row">
    ${t
        ? `<button id="start-today" class="proto-cta">${t.status === 'started' ? '继续这一项' : '开始今天的训练'}</button>`
        : `<button id="hero-adjust" class="proto-cta">调整明天</button>`}
    <span class="proto-cta-note">预算 <b>${c.budget}</b> 分钟 · 完成 <b>${c.done}/${c.total}</b>${c.skipped ? ` · 跳过 <b>${c.skipped}</b>` : ''}</span>
    <button id="import" class="proto-import">导入词书</button>
  </div>
  <div class="proto-dial-wrap">
    <div class="proto-dial" style="--p:${c.budget ? Math.min(100, Math.round((c.usedMinutes / c.budget) * 100)) : 0}">
      <div class="proto-dial-face">
        <b>${c.usedMinutes}</b><span>已排 / ${c.budget} 分钟</span>
      </div>
    </div>
    <div class="proto-dial-legend">
      <div><span>已排</span><b>${c.usedMinutes}′</b></div>
      <div><span>未排</span><b>${Math.max(0, c.budget - c.usedMinutes)}′</b></div>
      <div><span>已完成</span><b>${c.done}/${c.total}</b></div>
    </div>
  </div>
  <div class="proto-brief" aria-label="今日分钟分配">
    ${(() => {
        const by = new Map<string, number>();
        for (const x of c.tasks)
            by.set(x.module, (by.get(x.module) ?? 0) + x.minutes);
        const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        const max = Math.max(1, ...rows.map(r => r[1]));
        const sum = rows.reduce((n, r) => n + r[1], 0);
        return `<div class="proto-brief-head"><span>分钟分配 · 按模块</span><b>${sum}′</b></div>` +
            rows.map(([m, v]) => `<div class="proto-brief-row"><span>${esc(m)}</span><div class="proto-brief-bar"><i style="width:${Math.round(v / max * 100)}%"></i></div><b>${v}′</b></div>`).join('');
    })()}
  </div>
  <div class="proto-strip">
    <div><span>本项时长</span><b>${t ? t.minutes : 0}′</b></div>
    <div><span>平均每项</span><b>${c.total ? Math.round(c.budget / c.total) : 0}′</b></div>
    <div><span>关键记忆</span><b>${c.tasks.filter(x => x.critical).length}</b></div>
    <div class="proto-strip-bar" aria-hidden="true"><i style="width:${c.budget ? Math.min(100, Math.round((c.usedMinutes / c.budget) * 100)) : 0}%"></i></div>
  </div>
</section>`;
}

function sideA(c: ProtoContext): string {
    const pctDone = c.total ? Math.round((c.done / c.total) * 100) : 0;
    return `<div class="proto-side">
  <section class="proto-track plan-panel" id="plan-panel" aria-label="今日任务序列">
    <div class="proto-track-head">
      <b>Sequence</b>
      <div class="proto-gauge proto-gauge-sm" style="--p:${pctDone}" data-label="${pctDone}%"></div>
      <span>${c.done}/${c.total} 完成${c.skipped ? ` · 跳过 ${c.skipped}` : ''}</span>
    </div>
    <div class="proto-rail">${c.tasks.map((t, i) => railItemA(t, i)).join('') || '<p class="proto-rail-note">今天没有需要安排的任务。</p>'}</div>
    <div class="proto-rail-foot">
      <button id="plan-regenerate" data-quiet="1">重新生成未完成部分</button>
      <button id="plan-adjust" data-quiet="1">调整预算 / 状态</button>
    </div>
  </section>
</div>`;
}

/* ───────────────────────── B · Atmospheric Studio ───────────────────────── */

function upnextItemB(t: ProtoTaskView, idx?: number): string {
    const cls = stateClass(t);
    return `<div class="proto-upnext-item ${cls}" data-task="${esc(t.id)}">
  <span class="proto-upnext-state" aria-hidden="true"></span>
  ${idx ? `<span class="proto-upnext-idx">${String(idx).padStart(2, '0')}</span>` : ''}
  <div class="proto-upnext-main"><b>${esc(t.label)}</b><small>${esc(t.note)}</small></div>
  <div class="proto-upnext-meta"><span>${t.minutes}′</span><div class="proto-upnext-actions">${actions(t, 'b')}</div></div>
</div>`;
}

function stageB(c: ProtoContext): string {
    if (!c.hasPlan) {
        return `<section class="proto-air">
  <div class="proto-eyebrow"><span>今日学习</span></div>
  <div class="proto-clock"><b>—</b><span>分钟可用</span></div>
  <div class="proto-next">
    <div class="proto-next-label">还没有今天的计划</div>
    <h1 class="proto-next-title">先给今天留一段时间。</h1>
    <p class="proto-next-reason">计划只在预算内安排拿得到证据的任务；没有真实目标时不会生成假任务。</p>
  </div>
  <div class="proto-cta-row"><button id="import" class="proto-cta">导入词书</button></div>
</section>`;
    }
    const t = c.next;
    return `<section class="proto-air" data-specular>
  <div class="proto-eyebrow"><span>今日学习 · Build your day</span></div>
  <div class="proto-clock">
    <b data-odometer="${c.remainingMinutes}" data-odometer-key="p15c-b-remaining">${c.remainingMinutes}</b>
    <span>分钟可用 · 预算 ${c.budget} 分钟</span>
  </div>
  <div class="proto-next">
    <div class="proto-next-label">${t ? `接下来 · ${t.minutes} 分钟` : '今天已完成'}</div>
    <h1 class="proto-next-title">${t ? esc(t.label) : '今天的任务已经做完。'}</h1>
    <p class="proto-next-reason">${t ? `${esc(c.reason)} · ${esc(t.note)}` : '证据都保留着；明天的隔夜检测会告诉你真正留下了多少。'}</p>
  </div>
  <div class="proto-cta-row">
    ${t ? `<button id="start-today" class="proto-cta">${t.status === 'started' ? '继续这一项' : '开始今天的训练'}</button>` : `<button id="hero-adjust" class="proto-cta">调整明天</button>`}
    <button id="import" class="proto-import proto-import-b">导入词书</button>
  </div>
</section>`;
}

function slabB(c: ProtoContext): string {
    return `<div class="proto-slab proto-readout" role="status">
  <div class="proto-readout-cell"><span>已完成</span><b>${c.done}/${c.total}</b><small>项</small></div>
  <div class="proto-readout-cell"><span>平均每项</span><b>${c.total ? Math.round(c.budget / c.total) : 0}′</b><small>分钟</small></div>
  <div class="proto-readout-cell"><span>关键记忆</span><b>${c.tasks.filter(x => x.critical).length}</b><small>项</small></div>
</div>`;
}

function ribbonB(c: ProtoContext): string {
    const segs = c.tasks.map(t => {
        const cls = stateClass(t);
        const idx = c.tasks.indexOf(t) + 1;
        return `<div class="proto-ribbon-seg ${cls}" style="--w:${Math.max(1, t.minutes)}" data-min="${t.minutes}′" data-idx="${String(idx).padStart(2, '0')}" data-task="${esc(t.id)}" title="${esc(t.label)} · ${t.minutes} 分钟"></div>`;
    }).join('');
    const open = c.tasks.filter(t => t.status !== 'done' && t.status !== 'skipped' && t.status !== 'replaced');
    const upnext = open.slice(0, 3);
    const rest = open.slice(3);
    return `<div class="proto-slab proto-ribbon-wrap">
  <div class="proto-ribbon-head"><b>今日时间带</b><span>段宽 = 该项分钟数 · ${c.usedMinutes}/${c.budget} 分钟</span></div>
  <div class="proto-ribbon">${segs}</div>
  <div class="proto-upnext">${upnext.map(x => upnextItemB(x, c.tasks.indexOf(x) + 1)).join('')}</div>
  ${rest.length
        ? `<details class="proto-all"><summary>还有 ${rest.length} 项</summary><div class="proto-upnext">${rest.map(x => upnextItemB(x, c.tasks.indexOf(x) + 1)).join('')}</div></details>`
        : ''}
  <div class="proto-rail-foot">
    <button id="plan-regenerate" data-quiet="1">重新生成未完成部分</button>
    <button id="plan-adjust" data-quiet="1">调整预算 / 状态</button>
  </div>
</div>`;
}

/* ───────────────────────── 入口 ───────────────────────── */

export function protoTodayHTML(c: ProtoContext): string {
    const body = c.proto === 'a'
        ? stageA(c) + sideA(c)
        : `<div class="proto-stage">
  <i class="proto-beam" aria-hidden="true"></i>
  ${stageB(c)}
  <i class="proto-pool" aria-hidden="true"></i>
</div>` + slabB(c) + ribbonB(c);
    const sw = `<nav class="proto-switch" aria-label="原型切换">
  <a href="?proto=a" ${c.proto === 'a' ? 'aria-current="true"' : ''}>A · Obsidian</a>
  <a href="?proto=b" ${c.proto === 'b' ? 'aria-current="true"' : ''}>B · Studio</a>
  <a href="./">15b 基线</a>
</nav>`;
    return `<div class="proto-page">${body}</div>${sw}`;
}

export interface ProtoTaskInput {
    id: string;
    minutes: number;
    status: string;
    critical?: boolean;
    flexible?: boolean;
    label?: string;
    kind?: string;
    reason?: string[];
}

export function protoTaskViews(input: {
    tasks: ProtoTaskInput[];
    nextId: string | null;
    labelOf: (t: ProtoTaskInput) => string;
    moduleOf: (t: ProtoTaskInput) => string;
    noteOf: (t: ProtoTaskInput) => string;
    reasonOf: (t: ProtoTaskInput) => string;
}): ProtoTaskView[] {
    return input.tasks.map(t => ({
        id: t.id,
        label: input.labelOf(t),
        minutes: t.minutes,
        module: input.moduleOf(t),
        note: input.noteOf(t),
        reason: input.reasonOf(t),
        status: t.status,
        critical: !!t.critical,
        flexible: !!t.flexible,
        isNext: t.id === input.nextId,
    }));
}

/* ══════════════════════ D · Cinematic Dynamic（15d）══════════════════════
   B 的空间 + A 的精密读数，加上一套真正会动的东西：
   环境光呼吸、指针光场与倾斜、弹簧按压、行内展开与收回。
   数据与动作仍走 bindPlan() 的 data-* 契约。 */


/* ══════════════ 15f · Cinematic Composition ═══════════════════════════════
   构图主张：一天的"时间轴"是一条贯穿页面的竖向轴线（.d2-axis），
   剩余时间站在这条轴上（金属立柱），当前任务挂在轴的右侧（玻璃板），
   今日路线横穿轴线（哑光地形），任务明细沿轴向下延伸。
   一条光从上到下走，三种材质对它的反应不同——这是本页唯一持续的运动。 */

function rowF(t: ProtoTaskView, index: number, open = false): string {
    const cls = stateClass(t) + (open ? ' is-open' : '');
    const done = t.status === 'done' || t.status === 'skipped' || t.status === 'replaced';
    const go = done ? '' : `<button class="d-go" data-task-start="${esc(t.id)}">${t.status === 'started' ? '继续' : '开始'}</button>`;
    const rest = done ? ''
        : `${t.flexible ? `<button data-task-replace="${esc(t.id)}">替换</button>` : ''}<button data-task-delay="${esc(t.id)}">延后</button><button data-task-skip="${esc(t.id)}">跳过</button>`;
    return `<div class="d-row ${cls}" data-task="${esc(t.id)}" data-expand="1" style="--i:${index}">
  <button class="d-row-head" type="button" aria-expanded="${open ? 'true' : 'false'}">
    <span class="d-idx">${String(index + 1).padStart(2, '0')}</span>
    <span class="d-dot" aria-hidden="true"></span>
    <span class="d-row-main"><b>${esc(t.label)}</b><small>${esc(t.note)}</small></span>
    <span class="d-row-meta"><span>${t.minutes}′</span>${t.critical ? '<i class="d-key-flag">关键</i>' : ''}<i class="d-chev" aria-hidden="true"></i></span>
  </button>
  <div class="d-row-detail" style="height:${open ? 'auto' : '0px'}">
    <p>${esc(t.reason || '按真实到期与保留率安排')} · ${esc(t.module)}</p>
    <div class="d-row-actions">${go}${rest}</div>
  </div>
</div>`;
}

/** 路线段只放得下 6 个字：去掉冒号后的副标题与书名号内的篇名，保留任务本体。 */
function shortLabel(label: string): string {
    const head = label.split(/[：:·（(《]/)[0].trim();
    const s = head || label;
    return s.length > 6 ? `${s.slice(0, 5)}…` : s;
}

/* 路线段：等宽单元（4 分钟的段只有 27px，按分钟分配宽度会让标签和数字都读不出来），
   时长改由段内底条长度编码，标签直接可读。 */
function segF(t: ProtoTaskView, index: number, maxMin: number): string {
    const cls = stateClass(t);
    const r = Math.max(.12, t.minutes / maxMin);
    return `<button class="d-seg ${cls}" style="--r:${r.toFixed(3)}" data-seg="${esc(t.id)}"
    title="第 ${index + 1} 项 · ${esc(t.label)} · ${t.minutes} 分钟"
    aria-label="第 ${index + 1} 项 ${esc(t.label)}，${t.minutes} 分钟">
    <i>${String(index + 1).padStart(2, '0')} · ${t.minutes}′</i><b>${esc(shortLabel(t.label))}</b><u aria-hidden="true"></u>
  </button>`;
}

export function protoTodayD(c: ProtoContext): string {
    // remainingMinutes = 今日路线里还没做的分钟数；budget - remaining = 未安排余量
    const routePct = c.budget ? Math.min(100, Math.round((c.remainingMinutes / c.budget) * 100)) : 0;
    const unscheduled = Math.max(0, c.budget - c.remainingMinutes);
    const pctDone = c.total ? Math.round((c.done / c.total) * 100) : 0;
    const t = c.next;
    const crit = c.tasks.filter(x => x.critical).length;
    const sw = `<nav class="proto-switch" aria-label="原型切换">
  <a href="?proto=a">A · Obsidian</a>
  <a href="?proto=b">B · Studio</a>
  <a href="?proto=d" aria-current="true">D · Cinematic</a>
  <a href="./">15b 基线</a>
</nav>`;

    if (!c.hasPlan) {
        return `<div class="d-page">
  <div class="d-field" aria-hidden="true"><i class="d-key"></i><i class="d-rim"></i><i class="d-grain"></i></div>
  <div class="d2-frame">
    <div class="d2-spine" role="group" aria-label="今日时间预算">
      <div class="d2-remaining"><b>—</b><span>分钟可用</span></div>
      <div class="d2-budget d2-budget--empty"><i class="d2-fill" style="--p:0%"></i></div>
      <div class="d2-progress is-empty"><b>—</b><span>还没有任务</span></div>
    </div>
    <section class="d-stage d2-now">
      <div class="d2-glass" aria-hidden="true"></div>
      <div class="d2-now-body">
        <div class="d-next-label"><i aria-hidden="true"></i>还没有今天的计划</div>
        <h1 class="d-next-title">先给今天留一段时间。</h1>
        <p class="d-next-reason">计划只在预算内安排拿得到证据的任务；没有真实目标时不会生成假任务。</p>
      </div>
      <div class="d2-now-side">
        <button id="import" class="d-cta" data-spring><span class="d-glint" aria-hidden="true"></span>导入词书</button>
        <span class="d2-now-hint">先用上方预算设定今天的可用时间，再生成路线</span>
      </div>
    </section>
    <section class="d2-route"><div class="d2-route-head"><b>今日路线</b><span>生成计划后出现</span></div><div class="d-ribbon"></div></section>
    <section class="d2-ledger"><div class="d-list"></div></section>
  </div>
</div>${sw}`;
    }

    return `<div class="d-page">
  <div class="d-field" aria-hidden="true">
    <i class="d-key"></i><i class="d-rim"></i><i class="d-grain"></i>
  </div>
  <div class="d2-frame">
    <div class="d2-spine" role="group" aria-label="今日时间预算">
      <div class="d2-remaining">
        <b data-odometer="${c.remainingMinutes}" data-odometer-key="p15f-remaining">${c.remainingMinutes}</b>
        <span>分钟待完成</span>
      </div>
      <div class="d2-budget" style="--p:${routePct}%" role="img" aria-label="今日预算 ${c.budget} 分钟，路线 ${c.remainingMinutes} 分钟，未安排 ${unscheduled} 分钟">
        <i class="d2-bar"><i class="d2-rest" style="--p:${routePct}%"></i><i class="d2-fill" style="--p:${routePct}%"></i><i class="d2-tick" style="--p:${routePct}%"></i></i>
        <em class="d2-budget-b">${c.budget}′ 预算</em>
        <em class="d2-budget-c">${unscheduled}′ 未安排</em>
        <em class="d2-budget-a">${c.remainingMinutes}′ 路线</em>
      </div>
      <div class="d2-progress">
        <div class="d2-ring" style="--p:${pctDone}"><span>${c.done}/${c.total}</span></div>
        <div><b>已完成</b>${c.skipped ? `<span>跳过 ${c.skipped} 项</span>` : ''}</div>
      </div>
    </div>

    <section class="d-stage d2-now" data-specular data-morph-anchor="today" data-morph-dest="today">
      <div class="d2-glass" aria-hidden="true"></div>
      <div class="d2-now-reflect" aria-hidden="true"></div>
      <div class="d2-now-body">
        <div class="d-next-label"><i aria-hidden="true"></i>${t ? `接下来 · ${esc(t.module)}` : '今天已完成'}</div>
        <h1 class="d-next-title">${t ? esc(t.label) : `今天的 ${c.total} 项都做完了。`}</h1>
        <p class="d-next-reason">${t ? `${esc(c.reason)} · ${esc(t.note)}` : '证据都保留着；明天的隔夜检测会告诉你真正留下了多少。'}</p>
        <div class="d2-chips">
          ${t ? `<span>${t.minutes} 分钟</span>` : ''}
          ${t && t.critical ? '<span class="is-warm">关键记忆</span>' : ''}
          ${crit && !(t && t.critical) ? `<span>${crit} 项关键</span>` : ''}
        </div>
      </div>
      <div class="d2-now-side">
        ${t
            ? `<button id="start-today" class="d-cta" data-spring><span class="d-glint" aria-hidden="true"></span>${t.status === 'started' ? '继续这一项' : '开始今天的训练'}</button>`
            : `<button id="hero-adjust" class="d-cta" data-spring><span class="d-glint" aria-hidden="true"></span>调整明天</button>`}
        <button id="import" class="d-quiet">导入词书</button>
        <span class="d2-now-hint">${t ? `从「${esc(t.label)}」开始 · ${t.minutes} 分钟 · 进度不丢` : '今天的证据已经保存'}</span>
      </div>
    </section>

    <section class="d2-route">
      <div class="d2-route-head">
        <b>今日路线</b>
        <span>底条长度 = 分钟数 · 点一段跳到该项</span>
      </div>
      <div class="d-ribbon">${c.tasks.map((x, i) => segF(x, i, Math.max(1, ...c.tasks.map(y => y.minutes)))).join('')}</div>
    </section>

    <section class="d2-ledger">
      <div class="d2-ledger-head"><b>任务明细</b><span>点一行展开</span></div>
      <div class="d-list">${c.tasks.map((x, i) => rowF(x, i)).join('')}</div>
    </section>

    <div class="d-foot">
      <button id="plan-regenerate" class="d-quiet">重新生成未完成部分</button>
      <button id="plan-adjust" class="d-quiet">调整预算 / 状态</button>
    </div>
  </div>
</div>${sw}`;
}
