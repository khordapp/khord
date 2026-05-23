// Server-side SQLite — authoritative data store. DB is always required in no-proto mode.
// Schema is initialized on first open; no separate indexer needed.

import { building } from '$app/environment';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let _db: import('better-sqlite3').Database | null = null;
let _tried = false;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS songs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  artist            TEXT NOT NULL,
  album             TEXT,
  isrc              TEXT,
  thumbnail_url     TEXT,
  spotify_url       TEXT,
  apple_music_url   TEXT,
  youtube_music_url TEXT,
  deezer_url        TEXT,
  tidal_url         TEXT,
  amazon_music_url  TEXT,
  soundcloud_url    TEXT,
  note              TEXT,
  listed            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS songs_user_id    ON songs(user_id);
CREATE INDEX IF NOT EXISTS songs_created_at ON songs(created_at DESC);
CREATE INDEX IF NOT EXISTS songs_listed     ON songs(listed, created_at DESC);

CREATE TABLE IF NOT EXISTS setlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  open        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS setlists_user_id ON setlists(user_id);

CREATE TABLE IF NOT EXISTS setlist_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  setlist_id       INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
  song_id          INTEGER REFERENCES songs(id) ON DELETE SET NULL,
  added_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  position         INTEGER NOT NULL,
  snapshot         TEXT,
  added_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS setlist_items_setlist_id ON setlist_items(setlist_id, position);

CREATE TABLE IF NOT EXISTS votes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id    INTEGER REFERENCES songs(id) ON DELETE CASCADE,
  setlist_id INTEGER REFERENCES setlists(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(user_id, song_id),
  UNIQUE(user_id, setlist_id),
  CHECK(
    (song_id IS NOT NULL AND setlist_id IS NULL) OR
    (song_id IS NULL AND setlist_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS votes_song_id    ON votes(song_id);
CREATE INDEX IF NOT EXISTS votes_setlist_id ON votes(setlist_id);
CREATE INDEX IF NOT EXISTS votes_user_id    ON votes(user_id);

CREATE TABLE IF NOT EXISTS proposals (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  setlist_id       INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
  proposer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot         TEXT NOT NULL,
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS proposals_setlist_id ON proposals(setlist_id);

CREATE TABLE IF NOT EXISTS banned_users (
  user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reason    TEXT,
  banned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS instance_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS access_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status       TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  reviewed_at  TEXT
);
`;

function openDb(): import('better-sqlite3').Database {
	const Database = require('better-sqlite3') as typeof import('better-sqlite3');
	const dbName = process.env.INDEXER_DB_NAME;
	const path = dbName ? `/data/${dbName}` : (process.env.INDEXER_DB_PATH ?? './data/khord.db');
	const db = new Database(path);
	db.exec(SCHEMA);
	console.log('[db] opened', path);
	return db;
}

function init() {
	if (building || _tried) return;
	_tried = true;
	try {
		_db = openDb();
	} catch (e) {
		console.error('[db] failed to open:', e);
	}
}

export function getDb(): import('better-sqlite3').Database {
	init();
	if (!_db) throw new Error('Database unavailable');
	return _db;
}

// Kept for backward compat with settings.ts / access.ts that call getDbRw()
export function getDbRw(): import('better-sqlite3').Database | null {
	try {
		return getDb();
	} catch {
		return null;
	}
}
