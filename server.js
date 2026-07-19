const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const root = __dirname;
const db = new DatabaseSync(path.join(root, 'proppulse.db'));
db.exec('CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
const read = db.prepare('SELECT value FROM app_state WHERE key = ?');
const write = db.prepare('INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
const value = (key, fallback) => { const row = read.get(key); try { return row ? JSON.parse(row.value) : fallback; } catch { return fallback; } };
const put = (key, data) => write.run(key, JSON.stringify(data));
const personal = data => ({ accounts: data?.accounts || [], balances: data?.balances || [], withdrawals: data?.withdrawals || [] });

// One-time migration from the former shared-state format. Existing Guru data becomes Guru's workspace.
const legacy = value('main', null);
if (!value('settings', null)) put('settings', { rules: legacy?.data?.rules || [], propFirms: legacy?.data?.propFirms || [] });
if (!value('users', null)) put('users', legacy?.users || []);
const usersAtStart = value('users', []);
if (legacy?.data && !value('user:guru_admin', null)) put('user:guru_admin', personal(legacy.data));

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  response.end(JSON.stringify(body));
}
function receive(request, done) {
  let raw = '';
  request.on('data', chunk => { raw += chunk; });
  request.on('end', () => { try { done(JSON.parse(raw || '{}')); } catch { done(null); } });
}
function safeUsername(username) { return /^[A-Za-z0-9_.-]{1,64}$/.test(username); }

http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/') && request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return response.end();
  }
  if (url.pathname === '/api/users') {
    if (request.method === 'GET') return send(response, 200, { users: value('users', []) });
    if (request.method === 'PUT') return receive(request, body => {
      if (!body || !Array.isArray(body.users)) return send(response, 400, { error: 'Invalid users' });
      put('users', body.users);
      send(response, 200, { ok: true });
    });
  }
  const deleteUser = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (deleteUser && request.method === 'DELETE') {
    const username = decodeURIComponent(deleteUser[1]);
    const adminUsername = url.searchParams.get('admin') || '';
    const users = value('users', []);
    const administrator = users.find(user => user.username === adminUsername);
    if (administrator?.role !== 'admin') return send(response, 403, { error: 'Administrator access required' });
    if (username === adminUsername) return send(response, 400, { error: 'You cannot delete your own administrator account' });
    if (!users.some(user => user.username === username)) return send(response, 404, { error: 'User not found' });
    put('users', users.filter(user => user.username !== username));
    db.prepare('DELETE FROM app_state WHERE key = ?').run(`user:${username}`);
    return send(response, 200, { ok: true });
  }
  const match = url.pathname.match(/^\/api\/user-data\/([^/]+)$/);
  if (match) {
    const username = decodeURIComponent(match[1]);
    if (!safeUsername(username)) return send(response, 400, { error: 'Invalid username' });
    if (request.method === 'GET') return send(response, 200, { settings: value('settings', { rules: [], propFirms: [] }), personal: value(`user:${username}`, { accounts: [], balances: [], withdrawals: [] }) });
    if (request.method === 'PUT') return receive(request, body => {
      if (!body || !body.personal) return send(response, 400, { error: 'Invalid workspace' });
      put(`user:${username}`, personal(body.personal));
      const user = value('users', []).find(item => item.username === username);
      if (user?.role === 'admin' && body.settings) put('settings', { rules: body.settings.rules || [], propFirms: body.settings.propFirms || [] });
      send(response, 200, { ok: true });
    });
  }
  // Kept for older browser copies. It no longer contains personal account data.
  if (url.pathname === '/api/state') {
    if (request.method === 'GET') return send(response, 200, { data: { ...value('settings', { rules: [], propFirms: [] }), accounts: [], balances: [], withdrawals: [] }, users: value('users', []) });
    if (request.method === 'PUT') return send(response, 200, { ok: true });
  }
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.resolve(root, requested);
  if (!file.startsWith(root + path.sep)) return response.end('Not found');
  fs.readFile(file, (error, content) => {
    response.writeHead(error ? 404 : 200, { 'Content-Type': types[path.extname(file)] || 'text/plain; charset=utf-8' });
    response.end(error ? 'Not found' : content);
  });
}).listen(4174, '127.0.0.1', () => console.log('PropPulse database is ready at http://127.0.0.1:4174'));
