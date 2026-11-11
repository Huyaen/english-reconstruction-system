// 词间 PWA service worker：只缓存同源静态资源，不缓存 AI 请求/用户材料。
// 更新策略：安装后等待新 worker 接管；导航请求 network-first，断网时回退已缓存的应用外壳。
// 每次发布更新 CACHE 版本号：activate 会删除旧版本外壳，避免过期 hashed 资源长期堆积。
const CACHE = 'erv2-shell-v2-9c6de08b05';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await cache.addAll(CORE);
        await self.skipWaiting();
    })());
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k.startsWith('erv2-shell-') && k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});
self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING')
        void self.skipWaiting();
});
self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET')
        return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin || url.pathname === '/sw.js')
        return;
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(req);
                if (fresh.ok) {
                    const cache = await caches.open(CACHE);
                    await cache.put('/index.html', fresh.clone());
                }
                return fresh;
            }
            catch {
                return (await caches.match(req, { ignoreSearch: true }))
                    || (await caches.match('/index.html'))
                    || (await caches.match('/'))
                    || new Response('当前处于离线状态，且应用外壳尚未缓存。请联网打开一次后再试。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
            }
        })());
        return;
    }
    const cacheable = url.pathname.startsWith('/assets/') || CORE.includes(url.pathname);
    if (!cacheable)
        return;
    event.respondWith((async () => {
        const hit = await caches.match(req);
        if (hit)
            return hit;
        const fresh = await fetch(req);
        if (fresh.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(req, fresh.clone());
        }
        return fresh;
    })());
});
