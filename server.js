// =====================================================
// server.js — StreamRank Backend
// Node.js sin framework
// =====================================================

const http = require('http');
const path = require('path');
const fs   = require('fs');

require('./config/db');

const { getUsers, getUserById, createUser, loginUser, updateUser, deleteUser } = require('./routes/users');
const { getLists, addToList, updateListItem, removeFromList } = require('./routes/lists');

const PORT = process.env.PORT || 3000;

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function getMovies(req, res) {
  const filePath = path.join(__dirname, 'data', 'movies.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return jsonResponse(res, 500, { ok: false, error: 'No se pudo leer el catálogo' });
    res.writeHead(200, {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const { method, url } = req;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // ── /api/movies ──
  if (method === 'GET' && url === '/api/movies') return getMovies(req, res);

  // ── /api/users ──
  if (url === '/api/users') {
    if (method === 'GET')  return getUsers(req, res);
    if (method === 'POST') return createUser(req, res);
  }

  // ── /api/users/:id ──
  if (url.match(/^\/api\/users\/\d+$/)) {
    const id = parseInt(url.split('/')[3]);
    if (method === 'GET')    return getUserById(req, res, id);
    if (method === 'PUT')    return updateUser(req, res, id);
    if (method === 'DELETE') return deleteUser(req, res, id);
  }

  // ── /api/login ──
  if (method === 'POST' && url === '/api/login') return loginUser(req, res);

  // ── /api/lists/:userId ──
  if (url.match(/^\/api\/lists\/\d+$/) && method === 'GET') {
    const userId = parseInt(url.split('/')[3]);
    return getLists(req, res, userId);
  }

  // ── /api/lists ──
  if (url === '/api/lists' && method === 'POST') return addToList(req, res);

  // ── /api/lists/:userId/:movieId ──
  if (url.match(/^\/api\/lists\/\d+\/.+$/)) {
    const parts   = url.split('/');
    const userId  = parseInt(parts[3]);
    const movieId = parts[4];
    if (method === 'PUT')    return updateListItem(req, res, userId, movieId);
    if (method === 'DELETE') return removeFromList(req, res, userId, movieId);
  }

  // ── 404 ──
  jsonResponse(res, 404, { ok: false, error: `Ruta ${method} ${url} no encontrada` });
});

server.listen(PORT, () => {
  console.log(`🚀 StreamRank API corriendo en http://localhost:${PORT}`);
  console.log('📡 Endpoints:');
  console.log('   GET    /api/movies');
  console.log('   GET    /api/users');
  console.log('   POST   /api/users        (registro)');
  console.log('   POST   /api/login');
  console.log('   PUT    /api/users/:id');
  console.log('   DELETE /api/users/:id');
  console.log('   GET    /api/lists/:userId');
  console.log('   POST   /api/lists');
  console.log('   PUT    /api/lists/:userId/:movieId');
  console.log('   DELETE /api/lists/:userId/:movieId');
});