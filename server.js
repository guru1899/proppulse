const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const root = __dirname;
const db = new DatabaseSync(path.join(root, 'proppulse.db'));
db.exec('CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
const getState = db.prepare("SELECT value FROM app_state WHERE key = 'main'");
const putState = db.prepare("INSERT INTO app_state (key, value) VALUES ('main', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  response.end(JSON.stringify(body));
}

http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/api/state' && request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return response.end();
  }
  if (url.pathname === '/api/state') {
    if (request.method === 'GET') {
      const row = getState.get();
      return send(response, 200, row ? JSON.parse(row.value) : { data: null, users: [] });
    }
    if (request.method === 'PUT') {
      let raw = '';
      request.on('data', chunk => { raw += chunk; });
      request.on('end', () => {
        try {
          const state = JSON.parse(raw);
          if (!state || typeof state !== 'object' || !state.data) return send(response, 400, { error: 'Invalid state' });
          putState.run(JSON.stringify({ data: state.data, users: Array.isArray(state.users) ? state.users : [] }));
          send(response, 200, { ok: true });
        } catch {
          send(response, 400, { error: 'Invalid JSON' });
        }
      });
      return;
    }
    return send(response, 405, { error: 'Method not allowed' });
  }

  const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.resolve(root, requested);
  if (!file.startsWith(root + path.sep)) return response.end('Not found');
  fs.readFile(file, (error, content) => {
    response.writeHead(error ? 404 : 200, { 'Content-Type': types[path.extname(file)] || 'text/plain; charset=utf-8' });
    response.end(error ? 'Not found' : content);
  });
}).listen(4174, '127.0.0.1', () => console.log('PropPulse database is ready at http://127.0.0.1:4174'));
