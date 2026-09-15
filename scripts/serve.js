import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 8080);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };
createServer(async (request, response) => {
  try{
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if(!file.startsWith(root) || relative.split(/[\\/]/).some(part => part.startsWith('.') || part === 'node_modules')){
      response.writeHead(403).end(); return;
    }
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    response.end(content);
  }catch{ response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Message Flow: http://127.0.0.1:${port}`));
