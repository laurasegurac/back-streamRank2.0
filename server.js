// =====================================================
// server.js — StreamRank Backend
// Node.js sin framework
// =====================================================

const http = require('http');
const path = require('path');
const fs   = require('fs');

// Inicializar DB (crea tablas si no existen)
require('./config/db');

// Rutas
const {
  getUsers,
  getUserById,
  createUser,
  loginUser,
  updateUser,
  deleteUser,
} = require('./routes/users');

const PORT = process.env.PORT || 3000;

/* ── Helper: parsear ID de la URL ── */
function getIdFromUrl(url, base) {
  // url: /api/users/3  base: /api/users/
  const id = parseInt(url.replace(base, ''), 10);
  return isNaN(id) ? null : id;
}

/* ── Helper: respuesta JSON ── */
function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',               // CORS para el front
    'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
  });
  res.end(JSON.stringify(data));
}

/* ── Servir movies.json ── */
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

/* ── Servidor principal ── */
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

  // ── /api/movies ──────────────────────────────────
  if (method === 'GET' && url === '/api/movies') {
    return getMovies(req, res);
  }

  // ── /api/users ───────────────────────────────────
  if (url === '/api/users') {
    if (method === 'GET')  return getUsers(req, res);
    if (method === 'POST') return createUser(req, res);
  }

  // ── /api/users/:id ───────────────────────────────
  if (url.startsWith('/api/users/')) {
    const id = getIdFromUrl(url, '/api/users/');
    if (!id) return jsonResponse(res, 400, { ok: false, error: 'ID inválido' });

    if (method === 'GET')    return getUserById(req, res, id);
    if (method === 'PUT')    return updateUser(req, res, id);
    if (method === 'DELETE') return deleteUser(req, res, id);
  }

  // ── /api/login ───────────────────────────────────
  if (method === 'POST' && url === '/api/login') {
    return loginUser(req, res);
  }

  // ── Ruta no encontrada ───────────────────────────
  jsonResponse(res, 404, { ok: false, error: `Ruta ${method} ${url} no encontrada` });
});

server.listen(PORT, () => {
  console.log(`🚀 StreamRank API corriendo en http://localhost:${PORT}`);
  console.log('📡 Endpoints disponibles:');
  console.log('   GET    /api/movies');
  console.log('   GET    /api/users');
  console.log('   GET    /api/users/:id');
  console.log('   POST   /api/users    (registro)');
  console.log('   POST   /api/login');
  console.log('   PUT    /api/users/:id');
  console.log('   DELETE /api/users/:id');
});