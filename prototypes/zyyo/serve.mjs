import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.xml':'application/xml; charset=utf-8', '.woff2':'font/woff2', '.woff':'font/woff', '.webp':'image/webp', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const { routes } = JSON.parse(await fs.readFile(path.join(root,'pages-manifest.json'),'utf8'));
http.createServer(async (request,response) => {
  try {
    const url = new URL(request.url,'http://localhost');
    const pathname=decodeURIComponent(url.pathname).replace(/\/$/,'')||'/';
    const target = path.resolve(root,routes[pathname]||'.'+decodeURIComponent(url.pathname));
    if (!target.startsWith(root+path.sep)) { response.writeHead(403).end(); return; }
    const data = await fs.readFile(target);
    response.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(data);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(1027,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:1027/'));
