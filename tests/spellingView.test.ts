import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SpellingPractice } from '../src/spellingView.ts';
import { makeWord } from '../src/core.ts';
import type { SpellingAttempt } from '../src/types.ts';
const sleep = () => new Promise(r => setTimeout(r, 10));
function fixture(save?: (a: SpellingAttempt) => Promise<void>) {
    const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
    const root = dom.window.document.querySelector('main')!;
    const attempts: SpellingAttempt[] = []; const completed: string[] = [];
    let current = true;
    const practice = new SpellingPractice([makeWord({ en: 'apple', zh: '苹果' }, 'book', 0)], 'spelling-test', root, save ?? (async a => { attempts.push(a); }), id => { completed.push(id); }, () => {}, () => current, 2);
    practice.render();
    const click = (id: string) => root.querySelector<HTMLButtonElement>(id)!.click();
    const submit = (value: string) => { root.querySelector<HTMLInputElement>('input')!.value = value; root.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); };
    return { root, attempts, completed, click, submit, leave: () => { current = false; }, dom };
}
test('提交前 DOM 不含答案或提示，辅助查看之后永远标辅助', async () => {
    const f = fixture(); assert.ok(!f.root.innerHTML.includes('apple'));
    const input = f.root.querySelector('input')!; assert.equal(input.getAttribute('spellcheck'), 'false');
    f.click('#spelling-reveal'); assert.ok(f.root.textContent!.includes('apple'));
    f.submit('apple'); await sleep(); assert.equal(f.attempts[0].assisted, true);
    f.click('#spelling-next'); assert.ok(f.root.textContent!.includes('0%')); assert.equal(f.completed.length, 1); f.dom.window.close();
});
test('重复 Enter 只存一次，正确后需明确继续并显示本轮正确率', async () => {
    const f = fixture(); f.submit('apple'); f.submit('apple'); await sleep();
    assert.equal(f.attempts.length, 1); f.click('#spelling-next');
    assert.ok(f.root.textContent!.includes('100%')); assert.equal(f.completed.length, 1); f.dom.window.close();
});
test('错误后重练单独留痕，不能提高首次独立正确率', async () => {
    const f = fixture(); f.submit('Apple'); await sleep(); f.click('#spelling-retry'); f.click('#spelling-next');
    f.submit('apple'); await sleep(); f.click('#spelling-next');
    assert.deepEqual(f.attempts.map(a => [a.correct, a.assisted, a.retry]), [[false, false, false], [true, true, true]]);
    assert.ok(f.root.textContent!.includes('0%')); assert.ok(f.root.textContent!.includes('apple')); f.dom.window.close();
});
test('保存失败保留输入且不推进，切页后的慢保存不覆盖新页面', async () => {
    const f = fixture(async () => { throw Error('quota'); }); f.submit('apple'); await sleep();
    assert.ok(f.root.textContent!.includes('未保存')); assert.equal(f.root.querySelector('input')!.value, 'apple'); assert.equal(f.completed.length, 0);
    let finish!: () => void;
    const slow = fixture(() => new Promise<void>(r => { finish = r; })); slow.submit('apple'); slow.leave(); slow.root.innerHTML = '<p>another page</p>'; finish(); await sleep();
    assert.equal(slow.root.textContent, 'another page'); f.dom.window.close(); slow.dom.window.close();
});
