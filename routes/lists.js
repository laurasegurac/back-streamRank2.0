// =====================================================
// routes/lists.js — Listas de usuario
// Maneja verDespues (watchlist) e historial (watched)
// =====================================================

const db      = require('../config/db');
const fs      = require('fs');
const path    = require('path');

/* ── Helper respuesta ── */
function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}
function getMovieCatalog() {
  try {
    const dataDir  = path.join(__dirname, '..', 'data');
    const carpetas = ['plataformas', 'estudios', 'sagas'];
    const todos    = [];
    const vistos   = new Set();

    for (const carpeta of carpetas) {
      const carpetaDir = path.join(dataDir, carpeta);
      if (!fs.existsSync(carpetaDir)) continue;

      const archivos = fs.readdirSync(carpetaDir).filter(f => f.endsWith('.json'));
      for (const archivo of archivos) {
        const raw   = fs.readFileSync(path.join(carpetaDir, archivo), 'utf8');
        const items = JSON.parse(raw);
        for (const item of items) {
          const key = item.tmdbId || item.id;
          if (!vistos.has(key)) {
            vistos.add(key);
            todos.push(item);
          }
        }
      }
    }



    return todos;
  } catch { return []; }
}


/* ── GET /api/lists/:userId ──
   Retorna { verDespues: [...], historial: [...] }
   Enriquece cada item con datos del catálogo
*/
function getLists(req, res, userId) {
  const catalog = getMovieCatalog();

  db.all(
    'SELECT * FROM user_lists WHERE user_id = ? ORDER BY created_at ASC',
    [userId],
    (err, rows) => {
      if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al obtener listas' });

      // Enriquecer con datos del catálogo
      const enrich = (row) => {
        const movie = catalog.find(m => m.id === row.movie_id) || {};
        return {
          id:        row.movie_id,
          title:     movie.title    || row.movie_id,
          type:      movie.type     || '',
          genres:    Array.isArray(movie.genres) ? movie.genres.join(', ') : '',
          rating:    movie.rating   ? String(movie.rating) : '',
          desc:      movie.desc     || '',
          img:       movie.img      || '',
          platform:  movie.platform || '',
          // Campos extra del historial
          status:    row.status,
          fechaVisto:row.fecha_visto   || '',
          miRating:  row.mi_rating     || 0,
          liked:     row.liked         === 1,
          nota:      row.nota          || '',
          estado:    row.estado        || null,
          temporada: row.temporada     || 1,
          capitulo:  row.capitulo      || 1,
        };
      };

      const verDespues = rows.filter(r => r.status === 'watchlist').map(enrich);
      const historial  = rows.filter(r => r.status === 'watched').map(enrich);

      jsonResponse(res, 200, { ok: true, data: { verDespues, historial } });
    }
  );
}

/* ── POST /api/lists ──
   Body: { userId, movieId, status }
   status: 'watchlist' | 'watched'
*/
async function addToList(req, res) {
  try {
    const { userId, movieId, status = 'watchlist' } = await parseBody(req);

    if (!userId || !movieId)
      return jsonResponse(res, 400, { ok: false, error: 'userId y movieId son obligatorios' });

    // Si ya existe, actualizar status
    db.get(
      'SELECT id FROM user_lists WHERE user_id = ? AND movie_id = ?',
      [userId, movieId],
      (err, existing) => {
        if (err) return jsonResponse(res, 500, { ok: false, error: 'Error interno' });

        if (existing) {
          db.run(
            'UPDATE user_lists SET status = ? WHERE user_id = ? AND movie_id = ?',
            [status, userId, movieId],
            (err) => {
              if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al actualizar' });
              jsonResponse(res, 200, { ok: true, message: 'Lista actualizada' });
            }
          );
        } else {
          db.run(
            'INSERT INTO user_lists (user_id, movie_id, status) VALUES (?, ?, ?)',
            [userId, movieId, status],
            (err) => {
              if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al agregar' });
              jsonResponse(res, 201, { ok: true, message: 'Agregado a la lista' });
            }
          );
        }
      }
    );
  } catch {
    jsonResponse(res, 400, { ok: false, error: 'Cuerpo inválido' });
  }
}

/* ── PUT /api/lists/:userId/:movieId ──
   Actualiza campos extra del historial
   Body: { miRating, liked, nota, estado, temporada, capitulo }
*/
async function updateListItem(req, res, userId, movieId) {
  try {
    const body = await parseBody(req);
    const { miRating, liked, nota, estado, temporada, capitulo, status, fechaVisto } = body;

    db.get(
      'SELECT id FROM user_lists WHERE user_id = ? AND movie_id = ?',
      [userId, movieId],
      (err, row) => {
        if (err) return jsonResponse(res, 500, { ok: false, error: 'Error interno' });
        if (!row) return jsonResponse(res, 404, { ok: false, error: 'Item no encontrado' });

        const updates = [];
        const values  = [];

        if (status      !== undefined) { updates.push('status = ?');      values.push(status); }
        if (fechaVisto  !== undefined) { updates.push('fecha_visto = ?'); values.push(fechaVisto); }
        if (miRating    !== undefined) { updates.push('mi_rating = ?');   values.push(miRating); }
        if (liked       !== undefined) { updates.push('liked = ?');       values.push(liked ? 1 : 0); }
        if (nota        !== undefined) { updates.push('nota = ?');        values.push(nota); }
        if (estado      !== undefined) { updates.push('estado = ?');      values.push(estado); }
        if (temporada   !== undefined) { updates.push('temporada = ?');   values.push(temporada); }
        if (capitulo    !== undefined) { updates.push('capitulo = ?');    values.push(capitulo); }

        if (!updates.length)
          return jsonResponse(res, 400, { ok: false, error: 'Nada que actualizar' });

        values.push(userId, movieId);
        db.run(
          `UPDATE user_lists SET ${updates.join(', ')} WHERE user_id = ? AND movie_id = ?`,
          values,
          (err) => {
            if (err) return jsonResponse(res, 500, { ok: false, error: err.message });
            jsonResponse(res, 200, { ok: true, message: 'Actualizado correctamente' });
          }
        );
      }
    );
  } catch {
    jsonResponse(res, 400, { ok: false, error: 'Cuerpo inválido' });
  }
}

/* ── DELETE /api/lists/:userId/:movieId ── */
function removeFromList(req, res, userId, movieId) {
  db.get(
    'SELECT id FROM user_lists WHERE user_id = ? AND movie_id = ?',
    [userId, movieId],
    (err, row) => {
      if (err) return jsonResponse(res, 500, { ok: false, error: 'Error interno' });
      if (!row) return jsonResponse(res, 404, { ok: false, error: 'Item no encontrado' });

      db.run(
        'DELETE FROM user_lists WHERE user_id = ? AND movie_id = ?',
        [userId, movieId],
        (err) => {
          if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al eliminar' });
          jsonResponse(res, 200, { ok: true, message: 'Eliminado de la lista' });
        }
      );
    }
  );
}
/* ── GET /api/tops/:userId ── */
function getTops(req, res, userId) {
  db.all(
    'SELECT * FROM user_tops WHERE user_id = ? ORDER BY created_at ASC',
    [userId],
    (err, rows) => {
      if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al obtener tops' });
      const tops = rows.map(r => ({
        id:     r.id,
        nombre: r.nombre,
        items:  JSON.parse(r.items || '[]'),
      }));
      jsonResponse(res, 200, { ok: true, data: tops });
    }
  );
}

/* ── POST /api/tops ──
   Body: { userId, nombre }
*/
async function createTop(req, res) {
  try {
    const { userId, nombre } = await parseBody(req);
    if (!userId || !nombre)
      return jsonResponse(res, 400, { ok: false, error: 'userId y nombre son obligatorios' });

    db.run(
      'INSERT INTO user_tops (user_id, nombre, items) VALUES (?, ?, ?)',
      [userId, nombre, '[]'],
      function (err) {
        if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al crear top' });
        jsonResponse(res, 201, { ok: true, data: { id: this.lastID, nombre, items: [] } });
      }
    );
  } catch {
    jsonResponse(res, 400, { ok: false, error: 'Cuerpo inválido' });
  }
}

/* ── PUT /api/tops/:topId ──
   Body: { nombre?, items? }
*/
async function updateTop(req, res, topId) {
  try {
    const body = await parseBody(req);
    const { nombre, items } = body;

    const updates = [];
    const values  = [];
    if (nombre !== undefined) { updates.push('nombre = ?'); values.push(nombre); }
    if (items  !== undefined) { updates.push('items = ?');  values.push(JSON.stringify(items)); }

    if (!updates.length)
      return jsonResponse(res, 400, { ok: false, error: 'Nada que actualizar' });

    values.push(topId);
    db.run(
      `UPDATE user_tops SET ${updates.join(', ')} WHERE id = ?`,
      values,
      (err) => {
        if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al actualizar top' });
        jsonResponse(res, 200, { ok: true, message: 'Top actualizado' });
      }
    );
  } catch {
    jsonResponse(res, 400, { ok: false, error: 'Cuerpo inválido' });
  }
}

/* ── DELETE /api/tops/:topId ── */
function deleteTop(req, res, topId) {
  db.run(
    'DELETE FROM user_tops WHERE id = ?',
    [topId],
    (err) => {
      if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al eliminar top' });
      jsonResponse(res, 200, { ok: true, message: 'Top eliminado' });
    }
  );
}

module.exports = { getLists, addToList, updateListItem, removeFromList, getTops, createTop, updateTop, deleteTop };