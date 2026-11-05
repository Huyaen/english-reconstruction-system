import test from'node:test';import assert from'node:assert/strict';import{JSDOM}from'jsdom';import{ClozePractice}from'../src/clozeView.ts';
test('原句输入Enter提交、提示/错误/辅助重练与独立证据、保存失败留在原题',async()=>{
 const dom=new JSDOM('<main></main>');Object.assign(globalThis,{document:dom.window.document});const root=document.querySelector('main')!;
 const q:any={id:'q',wordId:'w',passageId:'p',readingSessionId:'r',markId:'m',sentenceIndex:0,original:'The impacts changed things.',masked:'The _____ changed things.',start:4,end:11,expected:'impacts',lemma:'impact',zh:'影响',pos:'n.',markedAt:1,sourceType:'import',sourceTitle:'Real source',sourceUrl:''};
 const saved:any[]=[];let finishes=0,fail=true;const p=new ClozePractice([q],root,async a=>{if(fail)throw Error('write failed');saved.push(a)},()=>finishes++,()=>{},()=>{},()=>true,0);p.render();
 assert.ok(!root.textContent!.includes('impacts'));const input=root.querySelector('input')!;input.value='wrong';root.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(saved.length,0);assert.match(root.textContent!,/未保存/);
 fail=false;root.querySelector<HTMLButtonElement>('#cloze-hint')!.click();root.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(saved[0].assisted,true);assert.equal(saved[0].correct,false);
 root.querySelector<HTMLButtonElement>('#cloze-retry')!.click();root.querySelector<HTMLButtonElement>('#cloze-next')!.click();root.querySelector<HTMLInputElement>('input')!.value='impacts';root.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(saved[1].retry,true);assert.equal(saved[1].assisted,true);
 root.querySelector<HTMLButtonElement>('#cloze-next')!.click();p.render();assert.equal(finishes,1);assert.match(root.textContent!,/0%/);dom.window.close();
});
