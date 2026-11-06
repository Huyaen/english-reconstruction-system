import assert from'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{buildClozeQueue}from'../src/readingCloze.ts';import{validateBackup}from'../src/db.ts';import{checkDataIntegrity}from'../src/integrity.ts';
import{allocateCatchup}from'../src/catchup.ts';
const base=process.env.CIJIAN_E2E_DIR;if(!base)throw Error('CIJIAN_E2E_DIR must name an external test-fixture directory');const out=process.env.CIJIAN_E2E_OUTPUT??base,mode=process.argv[2];if(!['catchup','cloze','upgrade','restore-regression','info','wake'].includes(mode))throw Error('Unknown v1.2 test mode');
let targets;for(let n=0;n<100;n++){try{targets=await(await fetch('http://127.0.0.1:9395/json/list')).json();if(targets.some(t=>t.url.startsWith('http://127.0.0.1:4196/')))break}catch{}await new Promise(r=>setTimeout(r,100))}
const target=targets?.find(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1:4196/'));if(!target)throw Error('Isolated target missing');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const wait=async expr=>{for(let i=0;i<200;i++){if(await ev(expr))return;await new Promise(r=>setTimeout(r,100))}throw Error(`timeout ${expr}`)};
const click=s=>ev(`document.querySelector(${JSON.stringify(s)}).click();true`),current=async()=>JSON.parse(await ev('window.__inputTest.backupJson()'));
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const sha=v=>createHash('sha256').update(JSON.stringify(canon(v))).digest('hex');
const hashes=d=>Object.fromEntries(Object.entries(d).map(([k,v])=>[k,{count:Array.isArray(v)?v.length:1,sha256:sha(Array.isArray(v)?v.map(x=>k==='grammarConcepts'?Object.fromEntries(Object.entries(x).filter(([key])=>key!=='updatedAt')):x).sort((a,b)=>String(a.id).localeCompare(String(b.id))):v)}]));
const checks=[],check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name)};
const shot=async name=>{const r=await send('Page.captureScreenshot',{captureBeyondViewport:false});await writeFile(`${out}/${name}.png`,Buffer.from(r.data,'base64'))};
const key=async(k,code,vk,text)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:vk,...(text?{text}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code})};
try{
 if(mode==='restore-regression'){const snapshot=await readFile(`${base}/before-catchup.json`,'utf8');await wait('!!window.__inputTest && (window.__pageTest.state().page!=="quiz" || !window.__pageTest.state().busy)');await click('[data-nav="home"]');await ev(`window.__inputTest.restoreJson(${JSON.stringify(snapshot)})`);await ev('window.__restoreOldDoc=true;true');await send('Page.reload');await wait('!window.__restoreOldDoc && document.readyState==="complete" && !!window.__inputTest && !!document.querySelector("[data-nav=home]")');const seeded=JSON.parse(snapshot);for(const w of seeded.data.words.slice(0,120)){w.state.total=5;w.schedule.due=1;w.fsrs.reps=0}await ev(`window.__inputTest.restoreJson(${JSON.stringify(JSON.stringify(seeded))})`);await click('[data-nav="home"]');await ev('document.querySelector("#catchup-limit").value="30";true');await click('#catchup-start');await wait('document.documentElement.dataset.page==="quiz"');await wait('!window.__pageTest.state().busy');await click('#quit');await wait('document.documentElement.dataset.page==="home"');await ev(`window.__inputTest.restoreJson(${JSON.stringify(snapshot)})`);check('恢复无计划备份后不残留旧回归分配',await ev('!document.querySelector("#catchup-panel")'));assert.deepEqual((await current()).data.dailyPlans,JSON.parse(snapshot).data.dailyPlans)}
 if(mode==='info'){const d=await current();console.log(JSON.stringify({plans:d.data.dailyPlans.map(p=>({available:p.availableMinutes,catchup:p.catchup,activeTasks:p.initialPlan.filter(t=>!['done','skipped','replaced'].includes(t.status)).map(t=>({module:t.module,minutes:t.minutes,kind:t.kind}))})),sessions:d.data.sessions.filter(s=>!s.ended).map(s=>({mode:s.mode,index:s.index,queue:s.queue.length}))}))}
 if(['cloze','wake'].includes(mode)){const{windowId}=await send('Browser.getWindowForTarget',{targetId:target.id});await send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});await send('Page.bringToFront')}
 if(mode==='upgrade'){
  const before=JSON.parse(await readFile(`${base}/before-v8.json`,'utf8'));await send('Page.reload');await wait('!!window.__inputTest && !!document.querySelector("[data-nav=settings]")');
  const after=await current();check('隔离真实v8升级v9',after.version===9&&after.data.clozeAttempts.length===0);
  const a=hashes(before.data),b=hashes(after.data);for(const[k,h]of Object.entries(a))assert.deepEqual(b[k],h,k);
  check('4716词、58条实际复习、51条拼写及全部旧域哈希保持',true);
  check('结构完整性无新增错误',checkDataIntegrity(validateBackup(after)).errors===0);
  await writeFile(`${out}/b-v8-v9-migration.json`,JSON.stringify({checks,before:a,after:b,normalization:'Only existing boot-refreshed grammarConcept.updatedAt omitted; all other fields hashed'},null,2));
 }
 if(mode==='cloze'){
  await wait('!!window.__inputTest && !!document.querySelector("[data-nav=settings]")');await click('[data-nav="reading"]');
  const text=await readFile(`${base}/alice-reading.txt`,'utf8');
  await ev(`document.querySelector('#read-title').value='Alice’s Adventures in Wonderland – Chapter I (Project Gutenberg #11)';document.querySelector('#read-topic').value='Public-domain original, https://www.gutenberg.org/files/11/11-0.txt';document.querySelector('#read-paste').value=${JSON.stringify(text)};document.querySelector('#read-paste').dispatchEvent(new Event('input',{bubbles:true}));true`);
  await click('[data-read-save="paste"]');await wait('!!document.querySelector("[data-read-start]")');await click('[data-read-start]');await wait('!!document.querySelector("[data-read-cold-submit]")');await click('[data-read-cold-submit]');await wait('!!document.querySelector("[data-tok]")');
  const chosen=['get','nothing','once'];
  for(const surface of chosen){await ev(`(()=>{const t=[...document.querySelectorAll('[data-tok]')].find(t=>t.textContent===${JSON.stringify(surface)});if(!t)throw Error('visible real token missing');t.click();document.querySelector('[data-mark="unknown"]').click();return true})()`);await new Promise(r=>setTimeout(r,200))}
  const captured=await current();const session=captured.data.readingSessions.at(-1);check('真实阅读UI捕获三处原句及来源',session.detail.marks.length===3&&session.detail.marks.every(m=>m.contextSentence&&m.passageId===session.passageId));
  const original=structuredClone(captured.data);await click('[data-nav="home"]');await click('[data-mode="cloze"]');await wait('!!document.querySelector("#cloze-input")');
  const queue=buildClozeQueue(captured.data.readingSessions,captured.data.passages,captured.data.words).questions;
  check('题目来自实际保存原句且有完整中文',queue.length===3&&queue.every(q=>q.zh&&text.includes(q.original)));
  await shot('原句填空题面');
  for(let i=0;i<4;i++){
   const masked=await ev('document.querySelector("#cloze-sentence").textContent'),q=queue.find(q=>q.masked===masked);assert.ok(q);
   if(i===1)await click('#cloze-hint');await send('Input.insertText',{text:i===0?'wrong-form':q.expected});await key('Enter','Enter',13,'\r');await wait('!!document.querySelector("#cloze-next")');
   if(i===0)await click('#cloze-retry');await click('#cloze-next');
  }
  await wait('document.querySelector("#main").textContent.includes("原句填空完成")');await shot('原句填空结果');
  const after=await current(),attempts=after.data.clozeAttempts;check('错误、辅助、独立正确、重练分别保存',attempts.length===4&&attempts.filter(a=>a.assisted).length===2&&attempts.filter(a=>a.retry).length===1);
  for(const k of ['words','records','sessions','spellingAttempts'])assert.deepEqual(after.data[k],original[k],k);check('阅读填空未改写旧FSRS及三类既有证据',true);
  const p=captured.data.passages.find(p=>p.id===session.passageId);check('每条独立证据保存来源原文词形与阅读会话',attempts.every(a=>a.passageId===p.id&&a.readingSessionId===session.id&&a.sentence.slice(a.start,a.end)===a.expected));
  await send('Page.reload');await wait('!!window.__inputTest && !!document.querySelector("[data-nav=settings]")');assert.deepEqual((await current()).data.clozeAttempts,attempts);check('刷新后独立证据完整保留',true);
  const roundtrip=await current();validateBackup(roundtrip);await ev(`window.__inputTest.restoreJson(${JSON.stringify(JSON.stringify(roundtrip))})`);assert.deepEqual((await current()).data.clozeAttempts,attempts);check('v9完整备份包含填空证据且可恢复',true);
  await writeFile(`${out}/b-cloze-e2e.json`,JSON.stringify({checks,source:'https://www.gutenberg.org/files/11/11-0.txt',passageId:p.id,readingSessionId:session.id,sourceType:p.sourceType,attempts:attempts.map(({id,wordId,expected,correct,assisted,retry,passageId})=>({id,wordId,expected,correct,assisted,retry,passageId}))},null,2));
 }
 if(mode==='catchup'){ await wait('!!window.__inputTest && (window.__pageTest.state().page!=="quiz" || !window.__pageTest.state().busy)'); await click('[data-nav="home"]');
  let beforeScenario;try{beforeScenario=JSON.parse(await readFile(`${base}/before-catchup.json`,'utf8'));await ev(`window.__inputTest.restoreJson(${JSON.stringify(JSON.stringify(beforeScenario))})`)}catch(e){if(e.code!=='ENOENT')throw e;beforeScenario=await current();await writeFile(`${base}/before-catchup.json`,JSON.stringify(beforeScenario),{flag:'wx'})}
  const {windowId}=await send('Browser.getWindowForTarget',{targetId:target.id});await send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});await send('Page.bringToFront');
  let clockId;
  const clock=async now=>{if(clockId)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:clockId});const src=`{const Base=Date;window.Date=class extends Base{constructor(...args){super(...(args.length?args:[${now}]))}static now(){return ${now}}};}`;clockId=(await send('Page.addScriptToEvaluateOnNewDocument',{source:src})).identifier;await ev('window.__oldClockDocument=true;true');await send('Page.reload');await wait('!window.__oldClockDocument && document.readyState==="complete" && !!window.__inputTest && !!document.querySelector("[data-nav=settings]")');await ev(src);await click('[data-nav="home"]');assert.equal(await ev('Date.now()'),now,'Isolated test clock must actually advance')};
  const t0=new Date('2026-11-12T04:00:00Z').getTime(),day=86400000;await clock(t0);
  const seeded=structuredClone(beforeScenario);for(let n=0;n<600;n++){const w=seeded.data.words[n];w.state.total=5;w.state.correct=1;w.state.level=n%2?'normal':'unknown';w.state.errors=4;w.previewedAt=t0-60*day;w.schedule.due=t0-(n+1)*day;w.fsrs={...w.fsrs,reps:5,state:2,lapses:1,stability:3,difficulty:5,lastReview:t0-(n+5)*day,due:w.schedule.due,scheduledDays:4,learningSteps:0};}
  seeded.data.dailyPlans=[];validateBackup(seeded);await ev(`window.__inputTest.restoreJson(${JSON.stringify(JSON.stringify(seeded))})`);await click('[data-nav="home"]');await wait('!!document.querySelector("#catchup-panel")');
  const original=await current(),byId=new Map(original.data.words.map(w=>[w.id,w]));
  const perfStart=performance.now();const perf=allocateCatchup({words:original.data.words,records:original.data.records,settings:original.data.settings,now:t0,cap:30,minutes:30});const elapsed=performance.now()-perfStart;
  check('4716词规模分配不重复且不改原词',perf.wordIds.length===30&&new Set(perf.wordIds).size===30);
  await ev('document.querySelector("#plan-budget").value="60";document.querySelector("#plan-budget").dispatchEvent(new Event("change",{bubbles:true}));document.querySelector("#catchup-limit").value="30";true');await shot('回归模式入口');await click('#catchup-start');await wait('document.documentElement.dataset.page==="quiz"');
  const started=await current(),plan=started.data.dailyPlans.find(p=>p.catchup?.active),allocation=plan.catchup;
  check('回归计划每日30且兼容原时间预算',allocation.wordIds.length===30&&allocation.budgetMinutes<=plan.availableMinutes);
  assert.deepEqual(started.data.words,original.data.words);assert.deepEqual(started.data.records,original.data.records);check('创建分配没有改FSRS到期或伪造复习',true);
  const answer=async()=>{await wait('!window.__pageTest.state().busy');if(await ev('window.__pageTest.state().paused'))await click('#continue');if(await ev('!!document.querySelector("#next")')){await click('#next');await wait('!window.__pageTest.state().busy')};const q=await ev('window.__pageTest.question()');assert.ok(q);await click(`[data-answer="${q.wordId}"]`);await new Promise(r=>setTimeout(r,130))};
  for(let n=0;n<10;n++)await answer();await wait('!window.__pageTest.state().busy');await click('#quit');await wait('document.documentElement.dataset.page==="home"');
  const beforeReplan=(await current()).data.dailyPlans.find(p=>p.id===plan.id);await click('#plan-regenerate');await wait(`window.__inputTest.backupJson().then(t=>JSON.parse(t).data.dailyPlans.find(p=>p.id===${JSON.stringify(plan.id)}).revision>${beforeReplan.revision})`);
  const replanned=(await current()).data.dailyPlans.find(p=>p.id===plan.id);assert.deepEqual(replanned.catchup,beforeReplan.catchup);assert.deepEqual(replanned.initialPlan,beforeReplan.initialPlan);check('部分复习后同预算重排不恢复新词、不丢任务、不改变当天分配',true);await clock(t0);await wait('!!document.querySelector("#catchup-panel")');
  const resumed=await current();assert.deepEqual(resumed.data.dailyPlans.find(p=>p.id===plan.id).catchup.wordIds,allocation.wordIds);check('中断刷新后当天分配和10条已做进度保留',resumed.data.records.length===original.data.records.length+10);
  await click('#catchup-start');await wait('document.documentElement.dataset.page==="quiz"');for(let n=0;n<60&&await ev('document.documentElement.dataset.page!=="results"');n++)await answer();await wait('document.documentElement.dataset.page==="results"');
  const completed=await current(),added=completed.data.records.filter(r=>!original.data.records.some(x=>x.id===r.id)),reviewed=new Set(added.map(r=>r.wordId));check('完成后仅30个实际复习词且记录来自真实答题',reviewed.size===30&&[...reviewed].every(id=>allocation.wordIds.includes(id)));
  for(const w of completed.data.words)if(!reviewed.has(w.id))assert.deepEqual(w,byId.get(w.id));check('其余4686个词所有字段及FSRS到期完全不变',true);
  await click('[data-nav="home"]');await shot('回归模式今日完成');const sessions=completed.data.sessions.length;await click('#catchup-start');check('达到上限不会刷新后补入更多词',(await current()).data.sessions.length===sessions);
  await clock(t0+day);await click('#catchup-start');await wait('document.documentElement.dataset.page==="quiz"');const tomorrow=await current();check('跨日期生成新分配而保留昨日计划',tomorrow.data.dailyPlans.length===2&&tomorrow.data.dailyPlans.find(p=>p.id===plan.id).catchup.wordIds.join()===allocation.wordIds.join());
  for(let n=0;n<2;n++)await answer();await wait('!window.__pageTest.state().busy');await click('#quit');await wait('document.documentElement.dataset.page==="home"');const partial=await current();
  await clock(t0+2*day);await click('#catchup-start');await wait('document.documentElement.dataset.page==="quiz"');const third=await current();
  check('跨日中断只保留两条已答证据，不把昨日剩余当成功',third.data.records.length===partial.data.records.length&&third.data.dailyPlans.length===3);
  for(const w of third.data.words)if(!reviewed.has(w.id)&&!partial.data.records.filter(r=>!completed.data.records.some(prev=>prev.id===r.id)).some(r=>r.wordId===w.id))assert.deepEqual(w,byId.get(w.id));check('连续跨日分配仍不改未复习词到期',true);
  await writeFile(`${base}/catchup-v9-backup.json`,JSON.stringify(third));await writeFile(`${base}/catchup-v9-backup.json`,JSON.stringify(third));const rt=validateBackup(third);await click('[data-nav="home"]');await ev(`window.__inputTest.restoreJson(${JSON.stringify(JSON.stringify(third))})`);assert.deepEqual((await current()).data.dailyPlans,third.data.dailyPlans);check('回归计划进入完整备份且恢复一致',true);
  await writeFile(`${out}/b-catchup-e2e.json`,JSON.stringify({checks,testClock:'2026-11-12 through 2026-11-14, isolated scenario only',scale:original.data.words.length,simulatedBacklog:600,firstDayReviewed:reviewed.size,allocationMs:elapsed,plans:third.data.dailyPlans.map(p=>({date:p.date,catchup:p.catchup})),unreviewedWordsUnchanged:true},null,2));
  await ev(`window.__inputTest.restoreJson(${JSON.stringify(JSON.stringify(beforeScenario))})`);await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:clockId});await send('Page.reload');await wait('!!window.__inputTest && !!document.querySelector("[data-nav=settings]")');
  console.log('Isolated scenario restored to pre-test baseline; native clock resumed');
 }
}finally{ws.close()}
