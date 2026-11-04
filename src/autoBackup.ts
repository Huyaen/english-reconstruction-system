import { backup, validateBackup } from './db.ts';
import type { Data } from './types.ts';

// Chromium 的目录授权接口尚未包含在当前项目所用 TypeScript DOM 声明中。
export interface BackupDirectory {
    name: string;
    queryPermission(options: { mode: 'readwrite' }): Promise<string>;
    requestPermission(options: { mode: 'readwrite' }): Promise<string>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<{
        createWritable(): Promise<{ write(text: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
        getFile(): Promise<{ text(): Promise<string> }>;
    }>;
    removeEntry(name: string): Promise<void>;
}
export interface BackupState {
    enabled: boolean;
    handle?: BackupDirectory;
    owner: string;
    files: string[];
    events: string[];
    lastSuccess: number;
    status: 'off' | 'ready' | 'writing' | 'success' | 'permission' | 'error';
    error: string;
}
export class AutoBackup {
    state: BackupState = { enabled: false, owner: crypto.randomUUID(), files: [], events: [], lastSuccess: 0, status: 'off', error: '' };
    private tail: Promise<void> = Promise.resolve();
    private running = false;
    constructor(private load: () => Promise<Data>, private save: (state: BackupState) => Promise<void>, private changed: () => void) {}
    restore(state?: BackupState) { if (state) this.state = { ...state, status: state.enabled ? (state.status === 'writing' ? 'ready' : state.status) : 'off' }; }
    async checkPermission() {
        if (this.state.enabled && this.state.handle && await this.state.handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
            this.state.status = 'permission'; this.state.error = '目录权限已失效，请点击重新授权，或手动导出完整备份。';
            await this.persist();
        }
    }
    async select(handle: BackupDirectory) {
        if (this.running) throw Error('备份正在进行，请完成后再更换目录');
        // 更换目录不沿用旧目录的清理清单，也不删除旧目录任何文件。
        this.state = { enabled: true, handle, owner: crypto.randomUUID(), files: [], events: [], lastSuccess: 0, status: 'ready', error: '' };
        await this.persist();
    }
    async disable() { this.state.enabled = false; this.state.status = 'off'; await this.persist(); }
    async authorize() {
        const permission = await this.state.handle?.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') throw Error('目录未获授权，请选择目录或手动导出备份');
        this.state.enabled = true;
        this.state.status = 'ready';
        this.state.error = '';
        await this.persist();
    }
    run(event = `manual:${crypto.randomUUID()}`): Promise<void> {
        // 每项任务在真正执行时读取最新数据；慢写期间的新会话排队，不能被合并丢失。
        const task = this.tail.then(() => this.write(event));
        this.tail = task.catch(() => {});
        return task;
    }
    private async persist() { await this.save({ ...this.state, files: [...this.state.files], events: [...this.state.events] }); this.changed(); }
    private async write(event: string) {
        const state = this.state, dir = state.handle;
        if (!state.enabled || !dir || state.events.includes(event)) return;
        this.running = true;
        let created = '';
        let committed = false;
        const previousSuccess = state.lastSuccess;
        try {
            if (await dir.queryPermission({ mode: 'readwrite' }) !== 'granted') {
                state.status = 'permission'; state.error = '目录权限已失效。请点击重新授权；本次未写入磁盘，可立即备份重试。';
                await this.persist(); return;
            }
            state.status = 'writing'; state.error = ''; this.changed();
            const raw = backup(await this.load());
            validateBackup(JSON.parse(raw));
            const name = `cijian-auto-${state.owner}-${Date.now()}-${crypto.randomUUID()}.json`;
            // 不允许覆盖任何已有文件，即使文件名碰撞。
            try { await dir.getFileHandle(name); throw Error('备份文件名已存在'); }
            catch (e) { if (!(e instanceof DOMException) || e.name !== 'NotFoundError') throw e; }
            const file = await dir.getFileHandle(name, { create: true }); created = name;
            const text = JSON.stringify({ ...JSON.parse(raw), autoBackup: { owner: state.owner, filename: name } }, null, 2);
            const stream = await file.createWritable();
            try { await stream.write(text); await stream.close(); }
            catch (e) { await stream.abort().catch(() => {}); throw e; }
            const read = await (await file.getFile()).text();
            if (read !== text) throw Error('备份文件写后校验不一致');
            validateBackup(JSON.parse(read));
            state.files.push(name); state.events.push(event);
            state.lastSuccess = Date.now(); state.status = state.enabled ? 'success' : 'off';
            // 先保存所有权清单及成功事件，再清理；此处失败时保留磁盘文件。
            created = '';
            await this.persist();
            committed = true;
            while (state.files.length > 14) {
                const old = state.files[0];
                try {
                    const oldText = await (await (await dir.getFileHandle(old)).getFile()).text();
                    const parsed = JSON.parse(oldText);
                    if (parsed.autoBackup?.owner !== state.owner || parsed.autoBackup?.filename !== old) throw Error('旧文件所有权不匹配，未清理');
                    validateBackup(parsed);
                    await dir.removeEntry(old);
                }
                catch (e) { if (!(e instanceof DOMException) || e.name !== 'NotFoundError') throw e; }
                state.files.shift(); await this.persist();
            }
        }
        catch (e) {
            if (!committed) { state.events = state.events.filter(id => id !== event); state.lastSuccess = previousSuccess; }
            if (created) await dir.removeEntry(created).catch(() => {});
            state.status = e instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(e.name) ? 'permission' : 'error';
            state.error = `自动备份未完成：${e instanceof Error ? e.message : String(e)}。旧有效备份保留，请重新授权或手动导出。`;
            await this.persist().catch(() => { this.changed(); });
        }
        finally { this.running = false; }
    }
}
