// =====================================================
// server.js — StreamRank Backend
// Node.js sin framework
// =====================================================

const http = require('http');
const path = require('path');
const fs   = require('fs');

require('./config/db');

const { getUsers, getUserById, createUser, loginUser, updateUser, deleteUser } = require('./routes/users');
const { getLists, addToList, updateListItem, removeFromList, getTops, createTop, updateTop, deleteTop } = require('./routes/lists');

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
  const urlObj    = new URL(req.url, `http://localhost:${PORT}`);
  const categoria = urlObj.searchParams.get('categoria');
  const tipo      = urlObj.searchParams.get('tipo');
  const global_   = urlObj.searchParams.get('global');
 
  const dataDir = path.join(__dirname, 'data');
 
  /* ── Categoría específica ── */
  if (categoria) {
    // Buscar en plataformas, estudios y sagas
    const posibles = [
      { path: path.join(dataDir, 'plataformas', `${categoria}.json`), type: 'platform' },
      { path: path.join(dataDir, 'estudios',    `${categoria}.json`), type: 'studio' },
      { path: path.join(dataDir, 'sagas',       `${categoria}.json`), type: 'saga' },
    ];
 
    for (const posible of posibles) {
      if (!fs.existsSync(posible.path)) continue;
      try {
        const raw  = fs.readFileSync(posible.path, 'utf8');
        const data = JSON.parse(raw);
 
        // Añadir nombre de categoría y tipo a cada item
        const items = data
          .map(item => ({ ...item, category: categoria, categoryType: posible.type }))
          .sort((a, b) => b.rating - a.rating);
        return jsonResponse(res, 200, items);
      } catch {
        continue;
      }
    }
 
    return jsonResponse(res, 404, { ok: false, error: `Categoría '${categoria}' no encontrada` });
  }
 
  /* ── Por tipo (plataformas / estudios / sagas) ── */
  if (tipo) {
    const tipoDir = path.join(dataDir, tipo);
    if (!fs.existsSync(tipoDir)) {
      return jsonResponse(res, 404, { ok: false, error: `Tipo '${tipo}' no existe` });
    }
    try {
      const archivos = fs.readdirSync(tipoDir).filter(f => f.endsWith('.json'));
      const resultado = {};
      for (const archivo of archivos) {
        const catId = archivo.replace('.json', '');
        const raw   = fs.readFileSync(path.join(tipoDir, archivo), 'utf8');
        resultado[catId] = JSON.parse(raw);
      }
      return jsonResponse(res, 200, resultado);
    } catch (err) {
      return jsonResponse(res, 500, { ok: false, error: 'Error leyendo tipo' });
    }
  }
  /* ── Top global ── */
  if (global_) {
  try {
    const vistos = new Set();
    const todos  = [];
    const carpetas = ['plataformas', 'estudios', 'sagas'];

    for (const carpeta of carpetas) {
      const carpetaDir = path.join(dataDir, carpeta);
      if (!fs.existsSync(carpetaDir)) continue;
      const archivos = fs.readdirSync(carpetaDir).filter(f => f.endsWith('.json'));
      for (const archivo of archivos) {
        const raw   = fs.readFileSync(path.join(carpetaDir, archivo), 'utf8');
        const items = JSON.parse(raw);
        for (const item of items) {
          const key = item.tmdbId || item.id;
          if (vistos.has(key)) continue;
          vistos.add(key);
          todos.push(item);
        }
      }
    }

    todos.sort((a, b) => b.rating - a.rating);
    // Sin slice — devuelve todo para que el frontend filtre
    return jsonResponse(res, 200, todos);
  } catch (err) {
    return jsonResponse(res, 500, { ok: false, error: 'Error generando top global' });
  }
}
 
 
 
 
  /* ── Sin parámetros: devuelve todo combinado ── */
  try {
    const resultado  = {};
    const carpetas   = ['plataformas', 'estudios', 'sagas'];
 
    for (const carpeta of carpetas) {
      const carpetaDir = path.join(dataDir, carpeta);
      if (!fs.existsSync(carpetaDir)) continue;
      const archivos = fs.readdirSync(carpetaDir).filter(f => f.endsWith('.json'));
      for (const archivo of archivos) {
        const catId = archivo.replace('.json', '');
        const raw   = fs.readFileSync(path.join(carpetaDir, archivo), 'utf8');
        resultado[catId] = JSON.parse(raw);
      }
    }
 
    return jsonResponse(res, 200, resultado);
  } catch (err) {
    return jsonResponse(res, 500, { ok: false, error: 'Error leyendo catálogo' });
  }
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

  // ── /api/last-update ──
  if (method === 'GET' && url === '/api/last-update') {
    try {
      const filePath = path.join(__dirname, 'data', 'last-update.json');
      if (!fs.existsSync(filePath)) {
        return jsonResponse(res, 200, { fecha: null });
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw || !raw.trim()) {
        return jsonResponse(res, 200, { fecha: null });
      }
      return jsonResponse(res, 200, JSON.parse(raw));
    } catch (err) {
      return jsonResponse(res, 200, { fecha: null });
    }
  }

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

  // ── /api/tops/:userId ──
if (url.match(/^\/api\/tops\/\d+$/) && method === 'GET') {
  const userId = parseInt(url.split('/')[3]);
  return getTops(req, res, userId);
}

// ── /api/tops ──
if (url === '/api/tops' && method === 'POST') return createTop(req, res);

// ── /api/tops/:topId ──
if (url.match(/^\/api\/tops\/\d+$/) && method === 'PUT') {
  const topId = parseInt(url.split('/')[3]);
  return updateTop(req, res, topId);
}

if (url.match(/^\/api\/tops\/\d+$/) && method === 'DELETE') {
  const topId = parseInt(url.split('/')[3]);
  return deleteTop(req, res, topId);
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
  console.log('   GET    /api/tops/:userId');
  console.log('   POST   /api/tops');
  console.log('   PUT    /api/tops/:topId');
  console.log('   DELETE /api/tops/:topId');
});
require('./scrapers/scheduler');