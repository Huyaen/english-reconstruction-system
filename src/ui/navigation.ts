const paths = {
    home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
    books: 'M4 4h6v16H4z M14 4h5l2 15-5 1z',
    weak: 'M20 8a8 8 0 1 0 0 8 M20 4v4h-4 M12 8v4l3 2',
    sentence: 'M4 6h16 M4 12h12 M4 18h16 M8 3v18',
    reading: 'M12 6c-3-3-6-3-10-2v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-4-1-7-1-10 2v15',
    input: 'M4 13v-1a8 8 0 0 1 16 0v1 M4 13h4v6H4z M16 13h4v6h-4z',
    output: 'm4 16 12-12 4 4L8 20H4z M13 7l4 4 M11 20h9',
    grammar: 'M12 3v6 M5 15v-3h14v3 M12 9v6 M3 16h4v4H3z M10 16h4v4h-4z M17 16h4v4h-4z',
    unit: 'm12 3 9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
    diagnostics: 'M4 4h16v16H4z M7 13h3l2-5 3 8 2-3h1',
    exam: 'M8 4H5v17h14V4h-3 M8 3h8v4H8z M8 13l2 2 5-5',
    stats: 'M4 3v17h17 M8 16v-3 M12 16V8 M16 16V5 M20 16v-5',
    ai: 'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
    settings: 'M4 6h16 M4 12h16 M4 18h16 M8 4v4 M15 10v4 M10 16v4',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    light: 'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10',
    dark: 'M20 15a8 8 0 0 1-11-11 8.5 8.5 0 1 0 11 11z',
} as const;

export function navIcon(icon: keyof typeof paths): string {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[icon]}"/></svg>`;
}

const groups = [
    { label: '学习', items: [['home', '今天'], ['books', '词库'], ['weak', '薄弱词'], ['reading', '阅读']] },
    { label: '训练', items: [['sentence', '句子'], ['grammar', '语法'], ['input', '输入练习'], ['output', '写作练习'], ['unit', '单元'], ['exam', '考试']] },
    { label: '回顾与管理', items: [['diagnostics', '学习报告'], ['stats', '统计'], ['ai', 'AI 建议'], ['settings', '设置']] },
] as const;

export function navigationLabel(page: string): string {
    for (const group of groups) {
        const match = group.items.find(([id]) => id === page);
        if (match) return match[1];
    }
    return '专注训练';
}

export function navigationHTML(page: string): string {
    const current = ['quiz', 'preview', 'preview-done', 'spelling', 'cloze', 'results'].includes(page) ? 'books' : page;
    return groups.map(group => `<div class="nav-group" role="group" aria-label="${group.label}">
        <span class="nav-group-label" aria-hidden="true">${group.label}</span>
        ${group.items.map(([id, label]) => `<button type="button" data-nav="${id}"${id === current ? ' class="active" aria-current="page"' : ''}>${navIcon(id)}${label}</button>`).join('')}
    </div>`).join('');
}
