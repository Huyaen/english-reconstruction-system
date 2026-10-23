import { defineConfig } from 'vite';

// Phase 5.0（infra_github_actions_ci_002）：测试钩子必须由构建时开关控制，不能只靠 URL query。
// 生产构建（npm run build / mode=production）：__ERV2_TEST_HOOKS__ = false → 钩子代码被摇掉。
// 测试构建（npm run build:test / --mode testhooks）：输出到 dist-test/，才允许暴露钩子。
export default defineConfig(({ mode }) => {
    const testHooks = mode === 'testhooks';
    return {
        define: {
            __ERV2_TEST_HOOKS__: JSON.stringify(testHooks),
            __ERV2_PWA__: JSON.stringify(!testHooks),
        },
        build: {
            outDir: testHooks ? 'dist-test' : 'dist',
            emptyOutDir: true,
        },
    };
});
