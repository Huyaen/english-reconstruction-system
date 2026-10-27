// Phase 15h · 全站截图与合成数据工具
// 用法：
//   node scripts/phase15h-capture.mjs                       # 默认：深浅 × 3 尺寸 × 全站
//   PAGES=home,books THEMES=dark SIZES=1440x900 node scripts/phase15h-capture.mjs
// 说明：
//  - 使用独立 profile（scratch/p15h/live），不触碰真实用户数据；
//  - 首次运行用「粘贴词表 → 预览 → 确认导入」的真实导入路径写入合成词书；
//  - 在真实导入后跑一次 12 词 Preview，产生真实作答记录（统计/诊断才有内容）；
//  - 采集用 headful Edge + Page.captureScreenshot（不依赖 screencast）。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.CDP_PORT || 9500 + (Date.now() % 90));
const BASE = process.env.BASE || 'http://127.0.0.1:4173/?test=1';
const OUT = process.env.OUT || 'screenshots/phase15h';
const THEMES = (process.env.THEMES || 'dark,light').split(',');
const SIZES = (process.env.SIZES || '1440x900,1920x1080,1366x768').split(',').map(s => s.split('x').map(Number));
const PAGES = (process.env.PAGES || 'home,books,weak,sentence,reading,input,output,grammar,unit,diagnostics,exam,stats,ai,settings').split(',');
const PROFILE_BASE = process.env.PROFILE || 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/live';
const PROFILE = `${PROFILE_BASE}-run-${process.pid}`;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
// 每次运行用独立 profile（避免 Edge 单实例锁），跑前从基线复制、跑完写回
try { if (existsSync(PROFILE_BASE)) cpSync(PROFILE_BASE, PROFILE, { recursive: true }); } catch {}
mkdirSync(PROFILE, { recursive: true });

const WORDS = `abandon 放弃；抛弃
abundant 丰富的；充裕的
accelerate 加速；促进
accommodate 容纳；适应
accumulate 积累；积聚
accurate 准确的；精确的
acknowledge 承认；致谢
acquire 获得；习得
adapt 适应；改编
adequate 充分的；足够的
advocate 提倡；拥护
aesthetic 美学的；审美的
ambiguous 模棱两可的
ambitious 有雄心的
analyze 分析
anticipate 预料；期望
apparent 显而易见的
appropriate 恰当的
approximate 大约的
arbitrary 任意的；武断的
assess 评估
assume 假定；承担
attribute 归因于；属性
authentic 真实的；可信的
autonomous 自主的
beneficial 有益的
bias 偏见
capacity 容量；能力
category 类别
cease 停止
challenge 挑战
clarify 澄清
coherent 连贯的
collapse 崩溃；倒塌
commit 承诺；犯（错）
compel 强迫
compensate 补偿
competent 有能力的
complex 复杂的
comprehensive 全面的
compromise 妥协
conceive 构想；怀孕
conclude 得出结论
concrete 具体的
condemn 谴责
conduct 进行；行为
confine 限制
confirm 证实
conflict 冲突
conform 遵守；符合
consequence 后果
conservative 保守的
considerable 相当大的
consistent 一致的
constitute 构成
constrain 约束
consume 消耗
contemporary 当代的
contradict 反驳；矛盾
contribute 贡献
controversial 有争议的
conventional 传统的
convey 传达
convince 说服
cooperate 合作
core 核心
correspond 相符；通信
crucial 至关重要的
cultivate 培养
cumulative 累积的
curriculum 课程
decline 下降；拒绝
dedicate 致力于
deficiency 缺乏
define 定义
deliberate 故意的；深思的
demonstrate 证明；演示
deny 否认
derive 源自
detect 察觉
deteriorate 恶化
determine 决定；确定
devote 奉献
diminish 减少
discipline 纪律；学科
discriminate 区分；歧视
dismiss 解散；驳回
displace 取代；迫使离开
distinct 明显的；不同的
distort 扭曲
distribute 分配
diverse 多样的
dominate 支配
dramatic 戏剧性的；显著的
durable 耐用的
dynamic 动态的
efficient 高效的
elaborate 详细阐述
eliminate 消除
emerge 出现
emphasize 强调
enable 使能够
enormous 巨大的
ensure 确保
entitle 使有资格
equilibrium 平衡
essential 必要的；本质的
establish 建立
estimate 估计
evaluate 评价
eventually 最终
evident 明显的
evolve 演变
exaggerate 夸大
exceed 超过
exclude 排除
exhibit 展示
expand 扩展
explicit 明确的
exploit 利用；剥削
expose 暴露
extend 延伸
external 外部的
extract 提取
facilitate 促进
fatigue 疲劳
feasible 可行的
fluctuate 波动
formula 公式；方案
framework 框架
fundamental 基本的
generate 产生
genuine 真正的
gradual 渐进的
guarantee 保证
hypothesis 假设
identical 完全相同的
identify 识别
illustrate 说明
imitate 模仿
immune 免疫的
implement 实施
imply 暗示
impose 强加
incentive 激励
incidence 发生率
incline 倾向
indicate 表明
inevitable 不可避免的
infer 推断
inherent 固有的
initiate 发起
innovate 创新
insight 洞察力
integrate 整合
integrity 完整性；正直
intense 强烈的
interpret 解释
intervene 干预
intrinsic 内在的
investigate 调查
isolate 隔离
justify 证明正当
legitimate 合法的
liable 有责任的；易于
magnitude 重要性；量级
maintain 维持
manifest 显现
margin 边缘；差额
mature 成熟的
mechanism 机制
mediate 调解
minimal 最小的
modify 修改
monitor 监控
motivate 激励
neglect 忽视
negotiate 谈判
neutral 中立的
notion 概念
obscure 模糊的；使模糊
obtain 获得
obvious 明显的
occupy 占据
occur 发生
omit 省略
opponent 对手
optimize 优化
orient 定位；使适应
paradox 悖论
perceive 察觉
persist 坚持
perspective 视角
phenomenon 现象
plausible 貌似合理的
precise 精确的
predict 预测
preliminary 初步的
preserve 保存
prevail 盛行；获胜
primary 主要的
principle 原则
priority 优先
profound 深刻的
prohibit 禁止
prominent 突出的
promote 促进
proportion 比例
propose 提出
prospect 前景
provoke 激起
pursue 追求
radical 激进的；根本的
random 随机的
rational 理性的
recover 恢复
refine 提炼
reflect 反映
regulate 调节
reinforce 加强
reject 拒绝
relevant 相关的
reluctant 不情愿的
rely 依赖
remarkable 显著的
render 使成为；提供
resemble 相似
resolve 解决
restore 恢复
restrain 抑制
retain 保留
reveal 揭示
rigid 僵硬的
routine 常规的
satisfy 满足
scarce 稀缺的
scheme 方案
scope 范围
selective 有选择的
sensible 明智的
sequence 顺序
signify 表示
similar 相似的
simulate 模拟
sole 唯一的
sophisticated 复杂的；老练的
spontaneous 自发的
stable 稳定的
strategy 策略
strict 严格的
submit 提交
subsequent 随后的
substitute 替代
subtle 微妙的
sufficient 充足的
summary 摘要
supplement 补充
suppress 压制
sustain 维持
symbol 象征
tendency 趋势
tension 紧张
terminate 终止
theory 理论
thorough 彻底的
tolerate 容忍
transmit 传递
trigger 触发
ultimate 最终的
undergo 经历
underlying 潜在的
undertake 承担
uniform 一致的
unique 独特的
utilize 利用
valid 有效的
vanish 消失
variable 变量
verify 核实
visible 可见的
vital 至关重要的
vivid 生动的
welfare 福利
withdraw 撤回
withstand 承受`;

const child = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check',
  `--window-size=${SIZES[0][0]},${SIZES[0][1] + 120}`, '--window-position=0,0',
  '--disable-features=msEdgeSidebarV2', 'about:blank',
], { stdio: 'ignore', windowsHide: true });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find(t => t.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('devtools not ready');
}

const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiters = new Map(); const consoleErrors = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id;
  const timer = setTimeout(() => { waiters.delete(n); rej(new Error(method + ': timeout')); }, 25000);
  waiters.set(n, m => { clearTimeout(timer); m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const js = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: SIZES[0][0], height: SIZES[0][1], deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(3200);

// ── 合成数据：走真实导入路径 ───────────────────────────────────────────────
const wordCount = await js(`document.querySelector('[data-nav="books"]')?.click(), new Promise(r => setTimeout(() => r(document.querySelectorAll('#word-table tbody .word-link').length), 800))`);
let seeded = 'existing:' + wordCount;
if (!wordCount) {
  seeded = await js(`(async () => {
    document.querySelector('#import')?.click();
    await new Promise(r => setTimeout(r, 350));
    const ta = document.querySelector('#paste-words');
    if (!ta) return 'no-dialog';
    ta.value = ${JSON.stringify(WORDS)};
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#parse-paste')?.click();
    await new Promise(r => setTimeout(r, 600));
    const btn = document.querySelector('#import-confirm');
    if (!btn || btn.disabled) return 'parse-failed';
    document.querySelector('#import-name').value = '高中核心词汇（合成）';
    btn.click();
    await new Promise(r => setTimeout(r, 1800));
    return 'seeded:' + (document.querySelectorAll('#word-table tbody tr').length);
  })()`);
}

// ── 产生真实作答记录（Preview 12 词）────────────────────────────────────────
const hasRecords = await js(`(async () => {
  document.querySelector('[data-nav="stats"]')?.click();
  await new Promise(r => setTimeout(r, 600));
  const t = document.querySelector('#main')?.textContent || '';
  const m = t.match(/累计作答\\s*(\\d+)/);
  return m ? Number(m[1]) : 0;
})()`);
let sessionResult = 'skipped';
let answered = 0;
if (!hasRecords) {
  await js(`document.querySelector('[data-nav="books"]')?.click()`);
  await sleep(800);
  await js(`document.querySelector('#train-filter')?.click()`);
  await sleep(1500);
  for (let i = 0; i < 16; i++) {
    if (await js(`!!document.querySelector('#next')`)) {
      await js(`document.querySelector('#next').click()`);
      await sleep(600);
      continue;
    }
    const n = await js(`document.querySelectorAll('.answer').length`);
    if (!n) break;
    if (answered === 0 && process.env.SHOT_QUESTION) {
      const s1 = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, `quiz-question-${process.env.THEME_FIRST || 'dark'}.png`), Buffer.from(s1.data, 'base64'));
    }
    if (process.env.SHOT_FEEDBACK && answered === 2) {
      await js(`document.querySelector('#unknown')?.click()`);
      answered++;
      await sleep(900);
      const s3 = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, `quiz-feedback-${process.env.THEME_FIRST || 'dark'}.png`), Buffer.from(s3.data, 'base64'));
      await js(`document.querySelector('#next')?.click()`);
      await sleep(600);
      continue;
    }
    await js(`[...document.querySelectorAll('.answer')][${i % 3 === 0 ? 0 : n - 1}].click()`);
    answered++;
    await sleep(820);
    if (process.env.SHOT_FEEDBACK && answered === 2) {
      const s2 = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, `quiz-feedback-${process.env.THEME_FIRST || 'dark'}.png`), Buffer.from(s2.data, 'base64'));
    }
  }
  sessionResult = 'answered:' + answered;
  if (await js(`!!document.querySelector('#back-home')`)) { await js(`document.querySelector('#back-home').click()`); await sleep(900); }
  await js(`document.querySelector('[data-nav="home"]')?.click()`);
  await sleep(600);
}
// ── 截图 ───────────────────────────────────────────────────────────────────
const manifest = [];
for (const size of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  for (const theme of THEMES) {
    const cur = await js(`document.documentElement.dataset.theme`);
    if (cur !== theme) {
      await js(`document.querySelector('#theme')?.click()`);
      await sleep(520);
    }
    for (const page of PAGES) {
      const head = await js(`(async () => {
        const b = document.querySelector('[data-nav="${page}"]');
        if (!b) return 'no-nav';
        b.click();
        await new Promise(r => setTimeout(r, 760));
        const h = document.querySelector('#main');
        return (h?.querySelector('h1')?.textContent || h?.textContent || '').trim().slice(0, 42);
      })()`);
      await sleep(180);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const name = `${page}-${theme}-${size[0]}x${size[1]}.png`;
      writeFileSync(join(OUT, name), Buffer.from(shot.data, 'base64'));
      manifest.push({ file: name, page, theme, size: `${size[0]}x${size[1]}`, head });
    }
  }
}

writeFileSync(join(OUT, 'capture-manifest.json'), JSON.stringify({ seeded, sessionResult, shots: manifest, errors: consoleErrors.slice(0, 10) }, null, 2));
console.log(JSON.stringify({ seeded, sessionResult, shots: manifest.length, errors: consoleErrors.slice(0, 3) }));

ws.close();
child.kill();
await sleep(600);
try { cpSync(PROFILE, PROFILE_BASE, { recursive: true }); } catch {}
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
process.exit(0);
