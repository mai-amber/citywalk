import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./docs/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const port = Number(process.env.NAV_PORT || 4317);
http.createServer(async (req, res) => {
  try {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (route === '/xr-test' && req.method === 'GET') {
      const page = (await readFile(path.join(root, 'quest.html'), 'utf8')).replace('src="quest.js?v=4"', 'src="/validation/xr-test.js"');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(page);
      return;
    }
    if (route === '/validation/xr-test.js' && req.method === 'GET') {
      const script = await readFile(new URL('./validation/xr-test.js', import.meta.url));
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }).end(script);
      return;
    }
    // Local setup only. This route is not part of the static deployment.
    if (route === '/setup' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Street View</title><style>body{max-width:34rem;margin:40px auto;padding:20px;font:17px system-ui}input,button{font:inherit;padding:12px}label{display:block;margin:20px 0}</style><h1>Connect Street View</h1><p>Use a dedicated Maps JavaScript API key restricted to the City Walk website and localhost.</p><form method="POST" action="/setup"><label>Restricted browser key <input type="password" name="key" required autocomplete="off"></label><label><input type="checkbox" name="restricted" value="yes" required> Website and API restrictions are saved in Google Cloud.</label><button>Connect Street View</button></form>');
      return;
    }
    if (route === '/setup' && req.method === 'POST') {
      const origin = req.headers.origin;
      if (![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin)) { res.writeHead(403).end(); return; }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4096) { res.writeHead(413).end(); return; } }
      const form = new URLSearchParams(body);
      if (!/^AIza[\w-]{35}$/.test(form.get('key') || '') || form.get('restricted') !== 'yes') { res.writeHead(400).end('Use a restricted Google Maps browser key.'); return; }
      await writeFile(path.join(root, 'maps-config.json'), JSON.stringify({ apiKey: form.get('key') }) + '\n');
      res.writeHead(303, { Location: '/', 'Cache-Control': 'no-store' }).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const target = path.resolve(root, '.' + (route === '/' ? '/index.html' : route));
    if (!target.startsWith(root)) { res.writeHead(403).end(); return; }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://localhost:${port}`));
