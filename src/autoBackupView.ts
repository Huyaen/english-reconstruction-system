import type { AutoBackup, BackupDirectory } from './autoBackup.ts';
import { esc, date } from './ui.ts';

export function backupPanel(): string {
    return '<section class="panel" id="auto-backup-panel"><h2>自动备份</h2><p>每轮学习完整保存后写入你选定的目录，保留最近 14 份有效自动备份。</p><p id="auto-backup-state" role="status" aria-live="polite"></p><div class="actions"><button id="auto-backup-local" class="primary">启用本机备份</button><button id="auto-backup-now" class="secondary">立即备份</button><button id="auto-backup-manual" class="secondary">手动导出完整备份</button></div><p class="hint">首次使用本机备份，先运行「配置词间备份目录.cmd」。备份失败时可手动导出，以最近成功时间为准。</p><details class="backup-options"><summary>其他备份选项</summary><div class="actions"><button id="auto-backup-select" class="secondary">启用并选择目录</button><button id="auto-backup-authorize" class="secondary">重新授权 / 继续启用</button><button id="auto-backup-off" class="secondary">关闭自动备份</button></div><p class="hint">使用浏览器目录授权时，重启后可能需要重新授权。</p></details></section>';
}
export function updateBackupPanel(manager: AutoBackup) {
    const target = document.querySelector('#auto-backup-state');
    if (!target) return;
    const s = manager.state;
    target.setAttribute('data-backup-status', s.status);
    const supported = typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
    const statuses = { off: '已关闭', ready: '等待下一轮完成', writing: '正在写入并校验', success: '备份成功', permission: '需要重新授权，请展开「其他备份选项」', error: '备份失败' };
    target.innerHTML = supported || s.local ? `目录：${esc(s.local ? '启动器配置的本机目录' : s.handle?.name ?? '尚未选择')} · ${statuses[s.status]}<br>最近成功：${s.lastSuccess ? date(s.lastSuccess) : '尚未成功'}${s.error ? `<br><span class="error">${esc(s.error)}</span>` : ''}` : '当前浏览器不支持授权目录写入。请使用桌面 Chrome / Edge，或手动导出完整备份。';
    const local = document.querySelector<HTMLButtonElement>('#auto-backup-local');
    if (local) { local.disabled = s.status === 'writing' || (!!s.local && s.enabled && s.status !== 'error'); }
    const select = document.querySelector<HTMLButtonElement>('#auto-backup-select');
    if (select) { select.disabled = !supported || s.status === 'writing'; select.textContent = s.handle ? '更换备份目录' : '启用并选择目录'; }
    for (const id of ['auto-backup-now', 'auto-backup-authorize', 'auto-backup-off']) {
        const button = document.querySelector<HTMLButtonElement>(`#${id}`);
        if (button) button.disabled = (!s.local && !s.handle) || s.status === 'writing' || (id === 'auto-backup-now' && !s.enabled) || (id === 'auto-backup-authorize' && (!s.handle || !!s.local));
    }
}
export function bindBackupPanel(manager: AutoBackup, manual: () => void, error: (message: string) => void) {
    const bind = (id: string, action: () => unknown) => document.querySelector(id)?.addEventListener('click', () => {
        try { Promise.resolve(action()).catch(e => error(e instanceof Error ? e.message : String(e))); }
        catch (e) { error(e instanceof Error ? e.message : String(e)); }
    });
    bind('#auto-backup-local', async () => {
        const button = document.querySelector<HTMLButtonElement>('#auto-backup-local');
        if (button) button.disabled = true;
        try { await manager.useLocal(); await manager.run(); }
        finally { updateBackupPanel(manager); }
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
