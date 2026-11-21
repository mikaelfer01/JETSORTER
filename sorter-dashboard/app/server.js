// Servidor local do Sorter Monitor: entrega o painel (arquivos estáticos) e faz de PROXY para o sorter,
// mantendo cookies/CSRF no lado do servidor (o painel fala só com 127.0.0.1). Sem dependências externas.
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'origin', 'referer', 'cookie', 'content-length', 'x-sorter-base']);

function start({ webRoot, port = 8750, host = '127.0.0.1', defaultBase = 'http://10.1.164.9', log = () => {}, onAuth = () => {} } = {}) {
  const jars = new Map(); // origem do sorter -> { nome: valor }
  const agents = new Map();
  const jar = (o) => { let j = jars.get(o); if (!j) { j = {}; jars.set(o, j); } return j; };
  const agent = (o) => { let a = agents.get(o); if (!a) { a = new http.Agent({ keepAlive: true, maxSockets: 24 }); agents.set(o, a); } return a; };

  function proxy(req, res, rest) {
    let base;
    try { base = new URL(String(process.env.SORTER_FORCE_BASE || req.headers['x-sorter-base'] || defaultBase)); } catch (e) { res.writeHead(400); return res.end('base inválida'); }
    if (base.protocol !== 'http:') { res.writeHead(400); return res.end('apenas http'); }
    const origin = base.origin;
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) headers[k] = v;
      const j = jar(origin);
      const ck = Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ');
      if (ck) headers.cookie = ck;
      headers.host = base.host;
      headers.origin = origin;
      headers.referer = origin + '/home';
      if (body.length) headers['content-length'] = body.length;
      const up = http.request({ host: base.hostname, port: base.port || 80, path: rest, method: req.method, headers, agent: agent(origin), timeout: 60000 }, (ur) => {
        for (const sc of ur.headers['set-cookie'] || []) {
          const [kv] = sc.split(';'); const i = kv.indexOf('=');
          if (i > 0) j[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
        }
        const loc = String(ur.headers.location || '');
        if (ur.statusCode === 401 || ([301, 302, 303, 307, 308].includes(ur.statusCode) && /login|signin|auth/i.test(loc))) {
          ur.resume();
          log('sorter pede login (' + ur.statusCode + ' ' + loc + ')');
          try { onAuth(origin); } catch (e) { /* ignora */ }
          res.writeHead(401, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ code: 0, msg: 'Login necessário no sorter — use a janela de login do aplicativo' }));
        }
        const out = {};
        for (const [k, v] of Object.entries(ur.headers)) if (!HOP.has(k) && k !== 'set-cookie') out[k] = v;
        res.writeHead(ur.statusCode || 502, out);
        ur.pipe(res);
      });
      up.on('timeout', () => up.destroy(new Error('tempo esgotado')));
      up.on('error', (e) => { log('proxy erro: ' + e.message); if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code: 0, msg: 'Sem conexão com o sorter: ' + e.message })); });
      if (body.length) up.write(body);
      up.end();
    });
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/__s/')) return proxy(req, res, req.url.slice(4));
    if (u.pathname === '/__feishu' && req.method === 'POST') { // encaminha SOMENTE para o webhook do Feishu/Lark (a página não pode chamar direto por CORS)
      let target; try { target = new URL(String(req.headers['x-feishu-url'] || '')); } catch (e) { target = null; }
      if (!target || target.protocol !== 'https:' || !/(^|\.)(feishu\.cn|larksuite\.com|slack\.com|discord\.com|discordapp\.com|office\.com|office365\.com|logic\.azure\.com)$/.test(target.hostname)) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"code":-1,"msg":"URL do webhook inválida"}'); }
      const chunks = []; req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const buf = Buffer.concat(chunks);
        const up = https.request({ hostname: target.hostname, path: target.pathname + target.search, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': buf.length }, timeout: 15000 }, (r) => { res.writeHead(r.statusCode || 502, { 'content-type': 'application/json' }); r.pipe(res); });
        up.on('error', (e) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code: -1, msg: 'Sem conexão com o Feishu: ' + e.message })); });
        up.on('timeout', () => up.destroy(new Error('tempo esgotado')));
        up.end(buf);
      });
      return;
    }
    if (u.pathname === '/__state' && req.method === 'POST') { // o painel publica o resumo; só fica em memória
      const ch = []; let n = 0; req.on('data', (c) => { n += c.length; if (n < 200000) ch.push(c); });
      req.on('end', () => { try { global.__sorterState = JSON.parse(Buffer.concat(ch).toString()); } catch (e) { /* ignora */ } res.writeHead(204); res.end(); });
      return;
    }
    if (u.pathname === '/api/resumo' && req.method === 'GET') { // API local (somente 127.0.0.1): números atuais do painel em JSON
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(global.__sorterState || { erro: 'painel ainda sem dados' }));
    }
    if (u.pathname === '/__ping') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/dashboard.html';
    const f = path.normalize(path.join(webRoot, p));
    if (!f.startsWith(path.normalize(webRoot))) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); return res.end('não encontrado'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(d);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    const setCookies = (origin, obj) => { Object.assign(jar(origin), obj); };
    // confere se a sessão atual do proxy já enxerga o sistema (a página /query/trace traz o token CSRF)
    const check = (origin = defaultBase) => new Promise((ok) => {
      const b = new URL(origin); const j = jar(b.origin);
      const rq = http.request({ host: b.hostname, port: b.port || 80, path: '/query/trace', method: 'GET', timeout: 8000, headers: { cookie: Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ') } }, (r) => {
        let t = ''; r.on('data', (c) => { if (t.length < 400000) t += c; }); r.on('end', () => ok(r.statusCode === 200 && /name=["']_token["']/.test(t) ? 'ok' : 'login'));
      });
      rq.on('timeout', () => rq.destroy(new Error('t'))); rq.on('error', () => ok('offline')); rq.end();
    });
    server.listen(port, host, () => resolve({ server, port: server.address().port, close: () => server.close(), setCookies, check }));
  });
}
module.exports = { start };

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, 'web'));
  const port = +process.env.PORT || 8750;
  start({ webRoot: root, port, defaultBase: process.env.SORTER_BASE || 'http://10.1.164.9', log: console.log })
    .then((s) => console.log(`Sorter Monitor em http://127.0.0.1:${s.port}  (web: ${root})`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
