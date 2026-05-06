// GET /api/feed?dids=did1,did2,...&limit=50&cursor=<created_at>
// Returns songs from the SQLite AppView for the given set of DIDs,
// sorted by created_at descending. Returns 503 when DB is unavailable
// so the client can fall back to direct PDS fetching.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { getSetting } from '$lib/server/settings';
import { APP_URL } from '$lib/config';

export const GET: RequestHandler = ({ url }) => {
	const db = getDb();
	if (!db) error(503, 'AppView not available');

	const all = url.searchParams.get('all') === 'true';
	const didsParam = url.searchParams.get('dids');

	if (!all && !didsParam) error(400, 'Missing dids parameter');

	const dids = didsParam ? didsParam.split(',').filter(Boolean) : [];
	if (!all && dids.length === 0) error(400, 'No DIDs provided');

	const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
	const cursor = url.searchParams.get('cursor'); // ISO datetime — created_at of last item

	const feedScoped = getSetting('feed_scoped', 'false') === 'true';

	const params: unknown[] = [];
	if (!all) params.push(...dids);
	if (feedScoped) params.push(APP_URL);
	if (cursor) params.push(cursor);
	params.push(limit);

	const placeholders = dids.map(() => '?').join(',');

	const rows = db.prepare(`
		SELECT
			s.uri, s.cid, s.actor_did,
			s.title, s.artist, s.album, s.isrc, s.odesli_key,
			s.thumbnail_url,
			s.spotify_url, s.apple_music_url, s.youtube_music_url,
			s.tidal_url, s.deezer_url, s.amazon_music_url,
			s.soundcloud_url, s.songlink_url, s.note, s.created_at,
			a.handle, a.display_name, a.avatar
		FROM songs s
		JOIN actors a ON a.did = s.actor_did
		${!all ? `WHERE s.actor_did IN (${placeholders}) AND` : 'WHERE'} s.listed != 0
		${feedScoped ? 'AND s.instance_url = ?' : ''}
		${cursor ? 'AND s.created_at < ?' : ''}
		ORDER BY s.created_at DESC
		LIMIT ?
	`).all(...params) as any[];

	const items = rows.map((r) => ({
		uri:    r.uri,
		cid:    r.cid,
		record: {
			title:           r.title,
			artist:          r.artist,
			album:           r.album  ?? undefined,
			isrc:            r.isrc   ?? undefined,
			odesliKey:       r.odesli_key ?? undefined,
			thumbnailUrl:    r.thumbnail_url ?? undefined,
			spotifyUrl:      r.spotify_url ?? undefined,
			appleMusicUrl:   r.apple_music_url ?? undefined,
			youtubeMusicUrl: r.youtube_music_url ?? undefined,
			tidalUrl:        r.tidal_url ?? undefined,
			deezerUrl:       r.deezer_url ?? undefined,
			amazonMusicUrl:  r.amazon_music_url ?? undefined,
			soundcloudUrl:   r.soundcloud_url ?? undefined,
			songlinkUrl:     r.songlink_url ?? undefined,
			note:            r.note  ?? undefined,
			createdAt:       r.created_at,
		},
		sharedBy: {
			did:         r.actor_did,
			handle:      r.handle      ?? r.actor_did,
			displayName: r.display_name ?? undefined,
			avatar:      r.avatar       ?? undefined,
		},
	}));

	const nextCursor = items.length === limit ? items[items.length - 1].record.createdAt : null;

	return json({ items, cursor: nextCursor, feedScoped });
};
