// Phase 5.0（infra_github_actions_ci_002）：测试钩子能力探测。
// 唯一的开关是构建期常量 __ERV2_TEST_HOOKS__（由 vite.config.ts 按 --mode 注入）：
// - 生产构建：常量被替换为 false → 下面对 __labTest 的赋值会被摇树移除。
// - 测试构建（npm run build:test，mode=testhooks）：替换为 true。
// 未定义（例如 node --test 直接跑源码）时按“关闭”处理，因此任何单测都拿不到钩子能力。
declare const __ERV2_TEST_HOOKS__: boolean | undefined;
declare const __ERV2_PWA__: boolean | undefined;
export function testHooksEnabled(): boolean {
    return typeof __ERV2_TEST_HOOKS__ !== 'undefined' && __ERV2_TEST_HOOKS__ === true;
}
/** 生产构建才注册 service worker；测试构建（testhooks）不注册，避免缓存干扰 smoke。 */
export function pwaEnabled(): boolean {
    return typeof __ERV2_PWA__ !== 'undefined' && __ERV2_PWA__ === true;
}
