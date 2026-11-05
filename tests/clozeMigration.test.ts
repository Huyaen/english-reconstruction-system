import test from'node:test';import assert from'node:assert/strict';import'fake-indexeddb/auto';
import{DB_NAME,DB_VERSION,dataStores,openDB,closeDB,loadData,emptyData,backup,validateBackup,putItems,replaceData}from'../src/db.ts';import{makeWord}from'../src/core.ts';
test('真实v8→v9只增加独立填空表，原词条和旧证据保持原样；v8备份可恢复',async()=>{
 const d=emptyData();d.books=[{id:'b',name:'book',created:1}];d.words=[makeWord({en:'impact',zh:'影响'},'b',0)];d.words[0].fsrs.reps=3;d.words[0].fsrs.due=123456;
 const old=await new Promise<IDBDatabase>((r,j)=>{const q=indexedDB.open(DB_NAME,8);q.onupgradeneeded=()=>{for(const n of [...dataStores.filter(n=>n!=='clozeAttempts'),'meta'])q.result.createObjectStore(n,{keyPath:'id'})};q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
 await new Promise<void>((r,j)=>{const t=old.transaction(['books','words','meta'],'readwrite');t.objectStore('books').put(d.books[0]);t.objectStore('words').put(d.words[0]);t.objectStore('meta').put({id:'settings',value:d.settings});t.oncomplete=()=>r();t.onabort=()=>j(t.error)});old.close();
 await openDB();const after=await loadData();assert.equal(DB_VERSION,9);assert.deepEqual(after.clozeAttempts,[]);assert.deepEqual(after.words,d.words);assert.deepEqual(after.spellingAttempts,[]);
 const legacy=JSON.parse(backup(after));legacy.version=8;delete legacy.data.clozeAttempts;assert.deepEqual(validateBackup(legacy).clozeAttempts,[]);
 const attempt={id:'c',sessionId:'round',wordId:d.words[0].id,passageId:'p',readingSessionId:'r',markId:'m',sentenceIndex:0,sentence:'The impacts changed things.',start:4,end:11,expected:'impacts',lemma:'impact',input:'impacts',correct:true,assisted:false,retry:false,ms:5,at:10,markedAt:1,source:'saved-reading',sourceType:'import',sourceTitle:'title',sourceUrl:'',normalizationVersion:1};
 await putItems('clozeAttempts',[attempt]);const withEvidence=await loadData();assert.deepEqual(withEvidence.words,after.words);assert.deepEqual(withEvidence.records,after.records);
 const raw=JSON.parse(backup(withEvidence)),restored=validateBackup(raw);assert.deepEqual(restored.clozeAttempts,[attempt]);await replaceData(restored);assert.deepEqual((await loadData()).clozeAttempts,[attempt]);
 for(const patch of [{assisted:'yes'},{end:900},{expected:'wrong'},{correct:false},{source:'ai'},{wordId:'missing'}]){const bad=structuredClone(raw);Object.assign(bad.data.clozeAttempts[0],patch);assert.throws(()=>validateBackup(bad))}
 closeDB();await assert.rejects(new Promise((r,j)=>{const q=indexedDB.open(DB_NAME,8);q.onsuccess=()=>{q.result.close();r(true)};q.onerror=()=>j(q.error)}),{name:'VersionError'});
});
