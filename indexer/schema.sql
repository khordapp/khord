-- Khord AppView schema
-- SQLite with WAL mode enabled at startup

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Actors ────────────────────────────────────────────────────────────────────
-- Minimal profile cache — populated when we first see a record from a DID.
CREATE TABLE IF NOT EXISTS actors (
  did         TEXT PRIMARY KEY,
  handle      TEXT,
  display_name TEXT,
  avatar      TEXT,
  indexed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ── Songs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS songs (
  uri             TEXT PRIMARY KEY,         -- at://did/app.khord.song/rkey
  cid             TEXT NOT NULL,
  actor_did       TEXT NOT NULL REFERENCES actors(did),
  title           TEXT NOT NULL,
  artist          TEXT NOT NULL,
  album           TEXT,
  isrc            TEXT,
  odesli_key      TEXT,
  spotify_url     TEXT,
  apple_music_url TEXT,
  youtube_music_url TEXT,
  tidal_url       TEXT,
  deezer_url      TEXT,
  amazon_music_url TEXT,
  soundcloud_url  TEXT,
  songlink_url    TEXT,
  note            TEXT,
  listed          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  indexed_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS songs_actor_did     ON songs(actor_did);
CREATE INDEX IF NOT EXISTS songs_created_at    ON songs(created_at DESC);

-- ── Votes ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS votes (
  uri         TEXT PRIMARY KEY,             -- at://did/app.khord.vote/rkey
  cid         TEXT NOT NULL,
  actor_did   TEXT NOT NULL REFERENCES actors(did),
  subject_uri TEXT NOT NULL,               -- song URI
  direction   TEXT NOT NULL CHECK(direction IN ('up', 'down')),
  created_at  TEXT NOT NULL,
  indexed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS votes_subject_uri ON votes(subject_uri);
CREATE INDEX IF NOT EXISTS votes_actor_did   ON votes(actor_did);

-- ── Proposals ────────────────────────────────────────────────────────────────
-- Song proposals submitted by non-owners; stored on proposer's PDS, indexed here.
CREATE TABLE IF NOT EXISTS proposals (
  uri          TEXT PRIMARY KEY,          -- at://proposer_did/app.khord.setlist.proposal/rkey
  cid          TEXT NOT NULL,
  proposer_did TEXT NOT NULL REFERENCES actors(did),
  setlist_uri  TEXT NOT NULL,             -- at://owner_did/app.khord.setlist/rkey
  setlist_cid  TEXT NOT NULL,
  title        TEXT NOT NULL,
  artist       TEXT NOT NULL,
  album        TEXT,
  thumbnail_url TEXT,
  spotify_url  TEXT,
  apple_music_url TEXT,
  youtube_music_url TEXT,
  tidal_url    TEXT,
  deezer_url   TEXT,
  amazon_music_url TEXT,
  soundcloud_url TEXT,
  songlink_url TEXT,
  note         TEXT,
  created_at   TEXT NOT NULL,
  indexed_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS proposals_setlist_uri ON proposals(setlist_uri);
CREATE INDEX IF NOT EXISTS proposals_proposer_did ON proposals(proposer_did);

-- ── Registered users ─────────────────────────────────────────────────────────
-- Tracks every DID that has successfully signed in to this instance.
-- Used for MAX_USERS enforcement.
CREATE TABLE IF NOT EXISTS registered_users (
  did           TEXT PRIMARY KEY,
  registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ── Banned users ──────────────────────────────────────────────────────────────
-- DIDs blocked from signing in to this instance.
-- To ban someone: INSERT INTO banned_users(did) VALUES('did:plc:...');
-- To unban:       DELETE FROM banned_users WHERE did = 'did:plc:...';
CREATE TABLE IF NOT EXISTS banned_users (
  did       TEXT PRIMARY KEY,
  reason    TEXT,
  banned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ── Instance settings ────────────────────────────────────────────────────────
-- Dynamic per-instance config — overrides env var defaults without a restart.
-- Written by the admin UI; read by the app server.
CREATE TABLE IF NOT EXISTS instance_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ── Cursor ────────────────────────────────────────────────────────────────────
-- Tracks the firehose sequence number so restarts resume from where we left off.
CREATE TABLE IF NOT EXISTS cursor (
  id  INTEGER PRIMARY KEY CHECK(id = 1),   -- singleton row
  seq INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO cursor(id, seq) VALUES(1, 0);
