-- =====================================================
-- StreamRank — Script de Base de Datos
-- Motor: SQLite
-- =====================================================

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL,
  email      TEXT    NOT NULL UNIQUE,
  password   TEXT    NOT NULL,
  created_at TEXT    DEFAULT (datetime('now'))
);

-- Tabla de listas (watchlist + historial)
CREATE TABLE IF NOT EXISTS user_lists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  movie_id    TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'watchlist', -- 'watchlist' | 'watched'
  -- Campos extra del historial
  fecha_visto TEXT    DEFAULT NULL,
  mi_rating   INTEGER DEFAULT 0,
  liked       INTEGER DEFAULT 0,  -- 0 = false, 1 = true
  nota        TEXT    DEFAULT '',
  estado      TEXT    DEFAULT NULL, -- 'por_ver' | 'empezada' | 'terminada'
  temporada   INTEGER DEFAULT 1,
  capitulo    INTEGER DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, movie_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_lists_user_id    ON user_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_lists_movie_id   ON user_lists(movie_id);