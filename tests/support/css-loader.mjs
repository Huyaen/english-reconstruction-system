/**
 * 测试用 loader：把 `import './x.css'` 变成空模块。
 *
 * 应用的 app.ts 会直接 import 样式文件（浏览器由 Vite 处理）；node --test 环境没有 CSS
 * 加载器，直接 import 会抛 ERR_UNKNOWN_FILE_EXTENSION。所有集成测试都通过
 * `--import tsx --loader tests/support/css-loader.mjs` 启动，样式不进 node 侧断言。
 */
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) {
    return { url: 'data:text/javascript,export default {}', format: 'module', shortCircuit: true };
  }
  return next(specifier, context);
}
