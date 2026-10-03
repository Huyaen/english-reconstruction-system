import * as XLSX from 'xlsx';
import type { Word } from './types.ts';
import { norm } from './core.ts';
export type Row = Pick<Word, 'en' | 'zh' | 'pos' | 'phonetic' | 'example' | 'collocation' | 'difficulty' | 'tags'>;
export interface Parsed {
    rows: Row[];
    duplicates: number;
    errors: string[];
}
const aliases: Record<keyof Row, string[]> = { en: ['en', 'english', 'word', '英文', '单词', '英语'], zh: ['zh', 'chinese', 'meaning', 'translation', '中文', '释义', '中文释义'], pos: ['pos', '词性'], phonetic: ['phonetic', '音标'], example: ['example', 'sentence', '例句'], collocation: ['collocation', '搭配', '高频搭配'], difficulty: ['difficulty', 'level', '等级', '难度'], tags: ['tags', '标签'] };
export function table(rows: unknown[][]): Parsed {
    const out: Parsed = { rows: [], duplicates: 0, errors: [] };
    const seen = new Set<string>();
    const header = rows[0]?.map(v => norm(String(v ?? ''))) || [];
    const hasHeader = aliases.en.some(a => header.includes(a)) && aliases.zh.some(a => header.includes(a));
    const columns = Object.fromEntries(Object.entries(aliases).map(([k, as], i) => [k, hasHeader ? header.findIndex(h => as.includes(h)) : i])) as Record<keyof Row, number>;
    rows.slice(hasHeader ? 1 : 0).forEach((values, i) => {
        if (values.every(v => v == null || String(v).trim() === ''))
            return;
        const r = Object.fromEntries(Object.keys(aliases).map(k => [k, String(values[columns[k as keyof Row]] ?? '').trim()])) as Row;
        if (!r.en || !r.zh) {
            out.errors.push(`第 ${i + (hasHeader ? 2 : 1)} 行缺少英文或中文`);
            return;
        }
        if (r.en.length > 200 || r.zh.length > 3000) {
            out.errors.push(`第 ${i + 1} 行过长`);
            return;
        }
        const key = norm(r.en);
        if (seen.has(key)) {
            out.duplicates++;
            return;
        }
        seen.add(key);
        out.rows.push(r);
    });
    return out;
}
export function parseText(text: string, ext: string): Parsed {
    text = text.replace(/^\uFEFF/, '');
    if (ext === 'json') {
        const obj = JSON.parse(text);
        const arr = Array.isArray(obj) ? obj : obj.words;
        if (!Array.isArray(arr))
            throw Error('JSON 需要单词数组或 {"words": [...]}');
        if (arr.some(x => !x || typeof x !== 'object'))
            throw Error('JSON 每条必须为单词对象或数组');
        if (Array.isArray(arr[0]))
            return table(arr);
        return table([Object.keys(aliases), ...arr.map(o => Object.values(aliases).map(as => { const key = Object.keys(o).find(k => as.includes(norm(k))); const v = key ? o[key] : ''; return Array.isArray(v) ? v.join('；') : v; }))]);
    }
    if (ext === 'csv' || ext === 'tsv') {
        const book = XLSX.read(text, { type: 'string', raw: true, FS: ext === 'tsv' ? '\t' : ',' });
        return table(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' }));
    }
    return table(text.split(/\r?\n/).map(line => {
        if (line.includes('\t'))
            return line.split('\t');
        const m = line.trim().match(/^(.+?)\s+(?=[\u3400-\u9fff]|(?:n|v|adj|adv|vt|vi)\.)((?:.|\s)+)$/);
        return m ? [m[1], m[2]] : [line.trim()];
    }));
}
export function parseWorkbook(bytes: ArrayBuffer): Parsed { const b = XLSX.read(bytes, { type: 'array' }); return table(XLSX.utils.sheet_to_json(b.Sheets[b.SheetNames[0]], { header: 1, defval: '' })); }
export async function parseFile(file: File): Promise<Parsed> {
    if (file.size > 25 * 1024 * 1024)
        throw Error('单次文件上限 25 MB，请拆分词书。');
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['txt', 'csv', 'tsv', 'xlsx', 'xls', 'json'].includes(ext))
        throw Error('请选择 TXT / CSV / XLSX / JSON');
    if (ext === 'xlsx' || ext === 'xls')
        return parseWorkbook(await file.arrayBuffer());
    const bytes = await file.arrayBuffer();
    let text = new TextDecoder().decode(bytes);
    if (text.includes('\ufffd'))
        text = new TextDecoder('gb18030').decode(bytes);
    return parseText(text, ext);
}
export function exportWords(words: Word[], ext: string): Blob {
    const rows = [['英文', '中文', '词性', '音标', '例句', '搭配', '等级', '标签'], ...words.map(w => [w.en, w.zh, w.pos, w.phonetic, w.example, w.collocation, w.difficulty, w.tags])];
    if (ext === 'txt')
        return new Blob(['\ufeff' + words.map(w => w.en + '\t' + w.zh).join('\n')], { type: 'text/plain;charset=utf-8' });
    const safeRows = rows.map(r => r.map(s => /^[=+@-]/.test(s) ? "'" + s : s));
    const sheet = XLSX.utils.aoa_to_sheet(safeRows);
    if (ext === 'csv')
        return new Blob(['\ufeff' + XLSX.utils.sheet_to_csv(sheet)], { type: 'text/csv;charset=utf-8' });
    const b = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(b, sheet, '词书');
    return new Blob([XLSX.write(b, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
