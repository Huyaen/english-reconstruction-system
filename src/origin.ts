// —— 数据地址策略（Phase 14）——
// 学习数据按浏览器 origin（协议 + 主机名 + 端口）隔离。localhost 与 127.0.0.1
// 在浏览器里不是同一个 origin，因此不能自动跳转、也不能假装是同一份数据。
// 本模块只负责说明当前地址与推荐地址的差异，绝不迁移、删除或改写任何数据。
export const CANONICAL_ORIGIN = 'http://localhost:4173';
export interface OriginNotice {
    current: string;
    canonical: string;
    /** 当前是否就是推荐地址（协议、主机名、端口全部一致）。 */
    same: boolean;
    /** 主机名不同（例如 127.0.0.1）时，数据空间一定不同。 */
    hostDifferent: boolean;
    message: string;
}
function normalize(origin: string): string {
    try {
        return new URL(origin).origin;
    }
    catch {
        return origin;
    }
}
export function originNotice(currentOrigin: string = typeof location === 'undefined' ? CANONICAL_ORIGIN : location.origin, canonical: string = CANONICAL_ORIGIN): OriginNotice {
    const current = normalize(currentOrigin);
    const target = normalize(canonical);
    const same = current === target;
    let hostDifferent = false;
    try {
        hostDifferent = new URL(current).hostname !== new URL(target).hostname;
    }
    catch {
        hostDifferent = true;
    }
    const message = same
        ? `当前已使用推荐地址 ${target}。学习数据保存在这个地址下。`
        : `当前地址是 ${current}，推荐固定使用 ${target}。浏览器把不同协议、主机名或端口视为不同存储空间；从 ${current} 打开看不到 ${target} 下的数据，反过来也一样。不要在两个地址之间来回切换，也不要在未导出备份时直接清空或迁移。`;
    return { current, canonical: target, same, hostDifferent, message };
}
