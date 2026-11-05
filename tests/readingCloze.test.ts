import test from 'node:test';import assert from 'node:assert/strict';
import {makeWord}from'../src/core.ts';import{createReadingSession,markWord}from'../src/readingSession.ts';
import{parsePassageText,tokenizeSentence}from'../src/readingText.ts';
import{buildClozeQueue,clozeAttempt}from'../src/readingCloze.ts';
function sample(text='The two impacts surprised us.',en='impact',surface='impacts'){
 const {paragraphs,sentences}=parsePassageText(text);
 const passage:any={id:'p',title:'Saved source',text,paragraphs,sentences,sourceType:'import',sourceUrl:'',topic:'',wordCount:6,difficulty:'',createdAt:1};
 const session=createReadingSession({passage,now:1,sessionId:'r'}),token=sentences.flatMap(s=>tokenizeSentence(text,s)).find(t=>t.surface===surface)!;
 const marked=markWord(session,{...token,tokenIndex:token.index,contextSentence:sentences[token.sentenceIndex].text,judgment:'unknown',now:5});
 const word=makeWord({en,zh:'影响',pos:'n.'},'b',0);return{passage,session:marked.session,word};
}
test('原句和定位来自真实保存文章，单独记录原词形而非词头',()=>{
 const s=sample(),q=buildClozeQueue([s.session],[s.passage],[s.word]);assert.equal(q.questions.length,1);
 const x=q.questions[0];assert.equal(x.expected,'impacts');assert.equal(x.masked,'The two _____ surprised us.');assert.equal(x.lemma,'impact');assert.equal(x.passageId,'p');assert.equal(x.markedAt,5);
 const before=structuredClone(s.word),a=clozeAttempt(x,'impacts','round',false,false,20,8);assert.equal(a.correct,true);assert.deepEqual(s.word,before);
 assert.equal(clozeAttempt(x,'impact','round',false,false,20).correct,false);
});
test('重复答案、伪造上下文、无释义或来源缺失均不能出题',()=>{
 for(const text of ['The impacts affected other impacts.','The impacts had an impact.']){const s=sample(text);assert.equal(buildClozeQueue([s.session],[s.passage],[s.word]).questions.length,0)}
 const s=sample();s.session.detail!.marks[0].contextSentence='AI invented sentence';assert.equal(buildClozeQueue([s.session],[s.passage],[s.word]).questions.length,0);
 const t=sample();t.word.zh='';assert.equal(buildClozeQueue([t.session],[t.passage],[t.word]).questions.length,0);assert.equal(buildClozeQueue([t.session],[],[t.word]).questions.length,0);
 const leaked=sample();leaked.word.zh='impacts 影响';assert.equal(buildClozeQueue([leaked.session],[leaked.passage],[leaked.word]).questions.length,0);
});
test('词形关联歧义保守排除，提示与重练留痕；大小写撇号连字符严格',()=>{
 const s=sample();const alt=makeWord({en:'impacts',zh:'冲击'},'b',1);assert.equal(buildClozeQueue([s.session],[s.passage],[s.word,alt]).questions.length,0);
 const q=buildClozeQueue([s.session],[s.passage],[s.word]).questions[0];const a=clozeAttempt(q,'impacts','s',true,true,1);assert.equal(a.assisted,true);assert.equal(a.retry,true);
 for(const [en,text,surface,input]of[["don't","I don't agree.","don't",'dont'],['China','China is large.','China','china'],['well-known','A well-known author spoke.','well-known','well known']]){const t=sample(text,en,surface),qs=buildClozeQueue([t.session],[t.passage],[t.word]);assert.equal(qs.questions.length,1);assert.equal(clozeAttempt(qs.questions[0],input,'s',false,false,1).correct,false)}
});

test('AI来源排除；人工词头关联可支持派生词形且不猜词根',()=>{
 const s=sample('The careful student checked her work.','care','careful');
 assert.equal(buildClozeQueue([s.session],[s.passage],[s.word]).questions.length,0);
 s.session.detail!.marks[0].lemma='care';assert.equal(buildClozeQueue([s.session],[s.passage],[s.word]).questions[0].expected,'careful');
 s.passage.sourceType='ai_reinforcement';assert.equal(buildClozeQueue([s.session],[s.passage],[s.word]).questions.length,0);
});
