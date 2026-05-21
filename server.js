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

/* ── /api/movies ──
   Sin parámetro  → devuelve todo el catálogo (objeto o array)
   ?categoria=X   → devuelve solo esa categoría como array
   ?global=true   → devuelve top global (todos los items combinados, sin duplicados, ordenados por rating)
*/
function getMovies(req, res) {
  const filePath = path.join(__dirname, 'data', 'movies.json');
  fs.readFile(filePath, 'utf8', (err, raw) => {
    if (err) return jsonResponse(res, 500, { ok: false, error: 'No se pudo leer el catálogo' });

    let catalogo;
    try { catalogo = JSON.parse(raw); }
    catch { return jsonResponse(res, 500, { ok: false, error: 'JSON inválido' }); }

    const urlObj   = new URL(req.url, `http://localhost:${PORT}`);
    const categoria = urlObj.searchParams.get('categoria');
    const global_  = urlObj.searchParams.get('global');

    // Array plano (scraper viejo) → devolver directo
    if (Array.isArray(catalogo)) {
      if (categoria) {
        // Filtrar por plataforma si el campo existe
        const filtrado = catalogo.filter(m =>
          (m.platform || '').toLowerCase().includes(categoria.replace('-', ' '))
        );
        return jsonResponse(res, 200, filtrado);
      }
      return jsonResponse(res, 200, catalogo);
    }

    // Objeto por categorías (scraper nuevo)
    if (categoria) {
      const items = catalogo[categoria] || [];
      return jsonResponse(res, 200, items);
    }

    if (global_) {
      // Top global: combinar todas las categorías, quitar duplicados por tmdbId o id, ordenar por rating
      const vistos = new Set();
      const todos  = [];
      for (const items of Object.values(catalogo)) {
        for (const item of items) {
          const key = item.tmdbId || item.id;
          if (!vistos.has(key)) {
            vistos.add(key);
            todos.push(item);
          }
        }
      }
      todos.sort((a, b) => b.rating - a.rating);
      return jsonResponse(res, 200, todos.slice(0, 20));
    }

    // Sin parámetros → devolver objeto completo
    res.writeHead(200, {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(raw);
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
  if (method === 'GET' && url.startsWith('/api/movies')) return getMovies(req, res);

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
  console.log('   GET    /api/movies                  → todo el catálogo');
  console.log('   GET    /api/movies?categoria=netflix → top de esa categoría');
  console.log('   GET    /api/movies?global=true       → top global sin duplicados');
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