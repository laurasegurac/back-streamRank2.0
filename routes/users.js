// =====================================================
// routes/users.js — CRUD de usuarios con sqlite3
// =====================================================

const db = require('../config/db');

/* ── Helpers ── */
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

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ── GET /api/users ── */
function getUsers(req, res) {
  db.all(
    'SELECT id, username, email,password, created_at FROM users ORDER BY created_at DESC',
    [],
    (err, rows) => {
      if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al obtener usuarios' });
      jsonResponse(res, 200, { ok: true, data: rows });
    }
  );
}

/* ── GET /api/users/:id ── */
function getUserById(req, res, id) {
  db.get(
    'SELECT id, username, email, password, created_at FROM users WHERE id = ?',
    [id],
    (err, row) => {
      if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al obtener usuario' });
      if (!row) return jsonResponse(res, 404, { ok: false, error: 'Usuario no encontrado' });
      jsonResponse(res, 200, { ok: true, data: row });
    }
  );
}

/* ── POST /api/users (registro) ── */
async function createUser(req, res) {
  try {
    const { username, email, password } = await parseBody(req);

    if (!email || !password)
      return jsonResponse(res, 400, { ok: false, error: 'Email y contraseña son obligatorios' });
    if (!validateEmail(email))
      return jsonResponse(res, 400, { ok: false, error: 'Formato de email inválido' });
    if (password.length < 8)
      return jsonResponse(res, 400, { ok: false, error: 'La contraseña debe tener mínimo 8 caracteres' });

    // Verificar si ya existe
    db.get('SELECT id FROM users WHERE email = ?', [email], (err, existing) => {
      if (err) return jsonResponse(res, 500, { ok: false, error: 'Error interno' });
      if (existing) return jsonResponse(res, 409, { ok: false, error: 'El email ya está registrado' });

      const uname = username || email.split('@')[0];
      db.run(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [uname, email, password],
        function (err) {
          if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al crear usuario' });
          db.get(
            'SELECT id, username, email, password, created_at FROM users WHERE id = ?',
            [this.lastID],
            (err, newUser) => {
              if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al obtener usuario creado' });
              jsonResponse(res, 201, { ok: true, data: newUser });
            }
          );
        }
      );
    });
  } catch (err) {
    jsonResponse(res, 400, { ok: false, error: 'Cuerpo de la petición inválido' });
  }
}

/* ── POST /api/login ── */
async function loginUser(req, res) {
  try {
    const { email, password } = await parseBody(req);

    if (!email || !password)
      return jsonResponse(res, 400, { ok: false, error: 'Email y contraseña son obligatorios' });

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
      if (err) return jsonResponse(res, 500, { ok: false, error: 'Error interno' });
      if (!user) return jsonResponse(res, 401, { ok: false, error: 'Correo no registrado' });
      if (user.password !== password)
        return jsonResponse(res, 401, { ok: false, error: 'Contraseña incorrecta' });

      jsonResponse(res, 200, {
        ok: true,
        data: { id: user.id, username: user.username, email: user.email }
      });
    });
  } catch (err) {
    jsonResponse(res, 400, { ok: false, error: 'Cuerpo de la petición inválido' });
  }
}

/* ── PUT /api/users/:id ── */
async function updateUser(req, res, id) {
  try {
    const { username, email, password } = await parseBody(req);

    if (email && !validateEmail(email))
      return jsonResponse(res, 400, { ok: false, error: 'Formato de email inválido' });
    if (password && password.length < 8)
      return jsonResponse(res, 400, { ok: false, error: 'La contraseña debe tener mínimo 8 caracteres' });

    db.get('SELECT id FROM users WHERE id = ?', [id], (err, user) => {
      if (err) return jsonResponse(res, 500, { ok: false, error: 'Error interno' });
      if (!user) return jsonResponse(res, 404, { ok: false, error: 'Usuario no encontrado' });

      const updates = [];
      const values  = [];
      if (username) { updates.push('username = ?'); values.push(username); }
      if (email)    { updates.push('email = ?');    values.push(email); }
      if (password) { updates.push('password = ?'); values.push(password); }

      if (updates.length === 0)
        return jsonResponse(res, 400, { ok: false, error: 'No hay campos para actualizar' });

      values.push(id);
      db.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values,
        (err) => {
          if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al actualizar' });
          db.get(
            'SELECT id, username, email, password, created_at FROM users WHERE id = ?',
            [id],
            (err, updated) => {
              if (err) return jsonResponse(res, 500, { ok: false, error: 'Error interno' });
              jsonResponse(res, 200, { ok: true, data: updated });
            }
          );
        }
      );
    });
  } catch (err) {
    jsonResponse(res, 400, { ok: false, error: 'Cuerpo de la petición inválido' });
  }
}

/* ── DELETE /api/users/:id ── */
function deleteUser(req, res, id) {
  db.get('SELECT id FROM users WHERE id = ?', [id], (err, user) => {
    if (err) return jsonResponse(res, 500, { ok: false, error: 'Error interno' });
    if (!user) return jsonResponse(res, 404, { ok: false, error: 'Usuario no encontrado' });

    db.run('DELETE FROM users WHERE id = ?', [id], (err) => {
      if (err) return jsonResponse(res, 500, { ok: false, error: 'Error al eliminar' });
      jsonResponse(res, 200, { ok: true, message: 'Usuario eliminado correctamente' });
    });
  });
}

module.exports = { getUsers, getUserById, createUser, loginUser, updateUser, deleteUser };