import type { AutoBackup, BackupDirectory } from './autoBackup.ts';
import { esc, date } from './ui.ts';

export function backupPanel(): string {
    return '<section class="panel" id="auto-backup-panel"><h2>自动备份</h2><p>每轮完整学习成功保存后，将全部学习数据写入你授权的目录，默认保留最近 14 份有效自动备份。</p><p id="auto-backup-state" role="status" aria-live="polite"></p><div class="actions"><button id="auto-backup-select" class="primary">启用并选择目录</button><button id="auto-backup-authorize" class="secondary">重新授权 / 继续启用</button><button id="auto-backup-now" class="secondary">立即备份</button><button id="auto-backup-off" class="secondary">关闭自动备份</button><button id="auto-backup-manual" class="secondary">手动导出完整备份</button></div><p class="hint">目录名称由浏览器提供，网页无法显示完整磁盘路径。关闭页面、断电、磁盘故障或授权失效时，不能保证最新一轮已备份；请确认最近成功时间。浏览器持久存储不能代替磁盘备份。</p></section>';
}
export function updateBackupPanel(manager: AutoBackup) {
    const target = document.querySelector('#auto-backup-state');
    if (!target) return;
    const s = manager.state;
    const supported = typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
    const statuses = { off: '已关闭', ready: '等待下一轮完成', writing: '正在写入并校验', success: '备份成功', permission: '需要重新授权', error: '备份失败' };
    target.innerHTML = supported ? `目录：${esc(s.handle?.name ?? '尚未选择')} · ${statuses[s.status]}<br>最近成功：${s.lastSuccess ? date(s.lastSuccess) : '尚未成功'}${s.error ? `<br><span class="error">${esc(s.error)}</span>` : ''}` : '当前浏览器不支持授权目录写入。请使用桌面 Chrome / Edge，或手动导出完整备份。';
    const select = document.querySelector<HTMLButtonElement>('#auto-backup-select');
    if (select) { select.disabled = !supported || s.status === 'writing'; select.textContent = s.handle ? '更换备份目录' : '启用并选择目录'; }
    for (const id of ['auto-backup-now', 'auto-backup-authorize', 'auto-backup-off']) {
        const button = document.querySelector<HTMLButtonElement>(`#${id}`);
        if (button) button.disabled = !s.handle || s.status === 'writing' || (id === 'auto-backup-now' && !s.enabled);
    }
}
export function bindBackupPanel(manager: AutoBackup, manual: () => void, error: (message: string) => void) {
    const bind = (id: string, action: () => unknown) => document.querySelector(id)?.addEventListener('click', () => {
        try { Promise.resolve(action()).catch(e => error(e instanceof Error ? e.message : String(e))); }
        catch (e) { error(e instanceof Error ? e.message : String(e)); }
    });
    bind('#auto-backup-select', async () => {
        const picker = (window as unknown as { showDirectoryPicker(options: { mode: string; id: string }): Promise<BackupDirectory> }).showDirectoryPicker;
        const handle = await picker.call(window, { mode: 'readwrite', id: 'cijian-backup' });
        await manager.select(handle);
        await manager.run();
    });
    bind('#auto-backup-authorize', async () => { await manager.authorize(); await manager.run(); });
    bind('#auto-backup-now', () => manager.run());
    bind('#auto-backup-off', () => manager.disable());
    bind('#auto-backup-manual', manual);
    updateBackupPanel(manager);
}
