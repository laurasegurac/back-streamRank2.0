-- =====================================================
-- StreamRank — Script de Base de Datos
-- Motor: SQLite (compatible con better-sqlite3)
-- =====================================================

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  username  TEXT    NOT NULL,
  email     TEXT    NOT NULL UNIQUE,
  password  TEXT    NOT NULL,
  created_at TEXT   DEFAULT (datetime('now'))
);

-- Tabla de listas (películas guardadas por usuario)
CREATE TABLE IF NOT EXISTS user_lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  movie_id   TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'watchlist', -- 'watchlist' | 'watched'
  created_at TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, movie_id)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_lists_user_id    ON user_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_lists_movie_id   ON user_lists(movie_id);