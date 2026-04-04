// Khord AppView — AT Protocol firehose indexer
// Subscribes to the relay firehose, filters app.khord.* records,
// and writes them to SQLite for fast feed + vote-count queries.

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Firehose, parseCommit } from '@atproto/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH  = process.env.INDEXER_DB_PATH ?? join(__dirname, '../data/khord.db');
const RELAY    = process.env.FIREHOSE_RELAY   ?? 'wss://bsky.network';

const SONG_NSID = 'app.khord.song';
const VOTE_NSID = 'app.khord.vote';

// ── Database setup ────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ── Prepared statements ───────────────────────────────────────────────────────

const upsertActor = db.prepare(`
  INSERT INTO actors(did) VALUES(@did)
  ON CONFLICT(did) DO NOTHING
`);

const upsertSong = db.prepare(`
  INSERT INTO songs(
    uri, cid, actor_did, title, artist, album, isrc, odesli_key,
    spotify_url, apple_music_url, youtube_music_url, tidal_url,
    deezer_url, amazon_music_url, soundcloud_url, songlink_url,
    note, created_at
  ) VALUES(
    @uri, @cid, @actor_did, @title, @artist, @album, @isrc, @odesli_key,
    @spotify_url, @apple_music_url, @youtube_music_url, @tidal_url,
    @deezer_url, @amazon_music_url, @soundcloud_url, @songlink_url,
    @note, @created_at
  )
  ON CONFLICT(uri) DO UPDATE SET
    cid             = excluded.cid,
    title           = excluded.title,
    artist          = excluded.artist,
    album           = excluded.album,
    spotify_url     = excluded.spotify_url,
    apple_music_url = excluded.apple_music_url,
    songlink_url    = excluded.songlink_url,
    indexed_at      = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
`);

const deleteSong = db.prepare(`DELETE FROM songs WHERE uri = @uri`);

const upsertVote = db.prepare(`
  INSERT INTO votes(uri, cid, actor_did, subject_uri, direction, created_at)
  VALUES(@uri, @cid, @actor_did, @subject_uri, @direction, @created_at)
  ON CONFLICT(uri) DO UPDATE SET
    cid        = excluded.cid,
    direction  = excluded.direction,
    indexed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
`);

const deleteVote = db.prepare(`DELETE FROM votes WHERE uri = @uri`);

const getCursor  = db.prepare(`SELECT seq FROM cursor WHERE id = 1`);
const setCursor  = db.prepare(`UPDATE cursor SET seq = @seq WHERE id = 1`);

// ── Firehose handler ──────────────────────────────────────────────────────────

function handleCommit(evt) {
  const { repo: did, ops } = evt;

  for (const op of ops) {
    const uri = `at://${did}/${op.path}`;
    const collection = op.path.split('/')[0];

    if (collection === SONG_NSID) {
      if (op.action === 'create' || op.action === 'update') {
        const r = op.record;
        upsertActor.run({ did });
        upsertSong.run({
          uri,
          cid:               op.cid,
          actor_did:         did,
          title:             r.title        ?? '',
          artist:            r.artist       ?? '',
          album:             r.album        ?? null,
          isrc:              r.isrc         ?? null,
          odesli_key:        r.odesliKey    ?? null,
          spotify_url:       r.spotifyUrl   ?? null,
          apple_music_url:   r.appleMusicUrl ?? null,
          youtube_music_url: r.youtubeMusicUrl ?? null,
          tidal_url:         r.tidalUrl     ?? null,
          deezer_url:        r.deezerUrl    ?? null,
          amazon_music_url:  r.amazonMusicUrl ?? null,
          soundcloud_url:    r.soundcloudUrl ?? null,
          songlink_url:      r.songlinkUrl  ?? null,
          note:              r.note         ?? null,
          created_at:        r.createdAt    ?? new Date().toISOString(),
        });
      } else if (op.action === 'delete') {
        deleteSong.run({ uri });
      }
    }

    if (collection === VOTE_NSID) {
      if (op.action === 'create' || op.action === 'update') {
        const r = op.record;
        const subject_uri = r.subject?.uri ?? null;
        if (!subject_uri) continue;
        upsertActor.run({ did });
        upsertVote.run({
          uri,
          cid:         op.cid,
          actor_did:   did,
          subject_uri,
          direction:   r.direction ?? 'up',
          created_at:  r.createdAt ?? new Date().toISOString(),
        });
      } else if (op.action === 'delete') {
        deleteVote.run({ uri });
      }
    }
  }

  // Persist cursor after each commit batch
  if (evt.seq != null) setCursor.run({ seq: evt.seq });
}

// ── Start ─────────────────────────────────────────────────────────────────────

const { seq } = getCursor.get();
console.log(`[indexer] starting from cursor seq=${seq}, relay=${RELAY}`);

const firehose = new Firehose({
  relay: RELAY,
  cursor: seq > 0 ? seq : undefined,
  onCommit(evt) {
    try {
      handleCommit(evt);
    } catch (e) {
      console.error('[indexer] error handling commit:', e);
    }
  },
  onError(err) {
    console.error('[indexer] firehose error:', err);
  },
});

firehose.start();
console.log('[indexer] firehose connected');

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[indexer] shutting down');
  firehose.destroy();
  db.close();
  process.exit(0);
});
