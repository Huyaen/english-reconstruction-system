import test from'node:test';import assert from'node:assert/strict';import'fake-indexeddb/auto';
import{openDB,closeDB,emptyData,replaceData,loadData,backup,validateBackup}from'../src/db.ts';import{savePlan,loadPlan}from'../src/plannerStore.ts';import{createDailyPlan}from'../src/planner.ts';import{applyCatchupToPlan}from'../src/catchup.ts';import{makeWord}from'../src/core.ts';
test('回归分配复用dailyPlans且备份恢复，刷新日期固定、不污染词与记录；拒绝损坏分配',async()=>{
 await openDB();const d=emptyData(),now=new Date(2026,10,5,12).getTime();d.books=[{id:'b',name:'book',created:1}];d.words=Array.from({length:60},(_,i)=>{const w=makeWord({en:'word'+i,zh:'释义'+i},'b',i);w.state.total=2;w.state.level='unknown';w.schedule.due=now-10*86400000;return w});await replaceData(d);
 const base=createDailyPlan({now,words:d.words,records:[],availableMinutes:30,energy:'normal'}).plan;
 const p=applyCatchupToPlan(base,{words:d.words,records:[],settings:d.settings,now,cap:30,minutes:30});const saved=await savePlan(p,0);assert.deepEqual((await loadPlan(p.date))!.catchup,p.catchup);
 const loaded=await loadData();assert.deepEqual([...loaded.words].sort((a,b)=>a.id.localeCompare(b.id)),[...d.words].sort((a,b)=>a.id.localeCompare(b.id)));assert.deepEqual(loaded.records,[]);const raw=JSON.parse(backup(loaded));assert.deepEqual(validateBackup(raw).dailyPlans[0].catchup,p.catchup);await replaceData(validateBackup(raw));assert.deepEqual((await loadPlan(p.date))!.catchup,saved.catchup);
 for(const patch of[{cap:0},{cap:501},{active:'yes'},{wordIds:['same','same']},{date:'2020-01-01'}]){const bad=structuredClone(raw);Object.assign(bad.data.dailyPlans[0].catchup,patch);assert.throws(()=>validateBackup(bad))}closeDB();
});
