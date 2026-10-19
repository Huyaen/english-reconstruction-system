// 静态服务器（无依赖）。用法：node server.mjs [--dir=dist] [--port=4173]
//   --dir ：托管目录（默认 dist；测试构建用 dist-test）——Phase 5.0 测试环境隔离
//   --port：监听端口（默认 4173）
import http from 'node:http';import {readFile,stat} from 'node:fs/promises';import path from 'node:path';
const argv=process.argv.slice(2);
const arg=(name,fallback)=>{const hit=argv.find(a=>a.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback;};
const dir=arg('dir','dist');
const port=Number(arg('port','4173'));
const root=path.join(import.meta.dirname,dir);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}if(pathname==='/'||(await stat(file)).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(await readFile(file));}catch{res.writeHead(404).end(`Not found. Run npm run build first (serving ${dir}).`);}}).listen(port,'127.0.0.1',()=>console.log(`词间已启动：http://localhost:${port} （目录 ${dir}，按 Ctrl+C 停止）`));
