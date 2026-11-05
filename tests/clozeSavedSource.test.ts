import test from'node:test';import assert from'node:assert/strict';import'fake-indexeddb/auto';
import{openDB,closeDB,emptyData,replaceData,getDB,loadData,putItems}from'../src/db.ts';import{makeWord}from'../src/core.ts';import{parsePassageText,tokenizeSentence}from'../src/readingText.ts';import{createReadingSession,markWord}from'../src/readingSession.ts';import{buildClozeQueue,loadClozeQueue}from'../src/readingCloze.ts';
test('阅读保存事务失败时，填空入口只读取已提交的标记，不能使用内存草稿',async()=>{
 await openDB();try{const text='The impacts changed things.',parsed=parsePassageText(text),d=emptyData();const p:any={id:'p',title:'Original',...parsed,sourceType:'import',sourceUrl:'',createdAt:1,topic:'',wordCount:4,difficulty:''};
 d.books=[{id:'b',name:'book',created:1}];d.words=[makeWord({en:'impact',zh:'影响'},'b',0)];d.passages=[p];const s=createReadingSession({passage:p,now:1,sessionId:'r'});d.readingSessions=[s];await replaceData(d);
 const token=tokenizeSentence(text,p.sentences[0]).find(t=>t.surface==='impacts')!,draft=markWord(s,{...token,tokenIndex:token.index,contextSentence:text,judgment:'unknown',now:2}).session;
 assert.equal(buildClozeQueue([draft],[p],d.words).questions.length,1);
 const tx=getDB().transaction('readingSessions','readwrite');const failed=new Promise<void>((r,j)=>{tx.oncomplete=()=>r();tx.onabort=()=>j(Error('injected abort'))});tx.objectStore('readingSessions').put(draft);tx.abort();await assert.rejects(failed);
 assert.equal((await loadData()).readingSessions[0].detail!.marks.length,0);assert.equal((await loadClozeQueue()).questions.length,0);
 await putItems('readingSessions',[draft]);assert.equal((await loadClozeQueue()).questions[0].expected,'impacts');assert.equal((await loadData()).clozeAttempts.length,0);
 }finally{closeDB()}
});
