// GET /api/feed?cursor=<ISO>&limit=50
// Returns listed songs from all users, sorted by created_at DESC.
// No fallback needed — DB is authoritative.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { getSetting } from '$lib/server/settings';
import { mapSongRecord, type SongRow } from '$lib/server/utils';

export const GET: RequestHandler = ({ url, locals }) => {
	requireAuth(locals.user);
	const db = getDb();
	const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
	const cursor = url.searchParams.get('cursor'); // ISO datetime of last item

	const params: unknown[] = [];
	if (cursor) params.push(cursor);
	params.push(limit);

	const rows = db.prepare(`
		SELECT
			s.id, s.user_id,
			s.title, s.artist, s.album, s.thumbnail_url,
			s.spotify_url, s.apple_music_url, s.youtube_music_url,
			s.deezer_url, s.tidal_url, s.amazon_music_url, s.soundcloud_url,
			s.note, s.created_at,
			u.username, u.display_name
		FROM songs s
		JOIN users u ON u.id = s.user_id
		WHERE s.listed = 1
		${cursor ? 'AND s.created_at < ?' : ''}
		ORDER BY s.created_at DESC
		LIMIT ?
	`).all(...params) as (SongRow & { username: string; display_name: string | null })[];

	const items = rows.map((r) => ({
		id: r.id,
		record: mapSongRecord(r),
		sharedBy: {
			userId:      r.user_id,
			username:    r.username,
			displayName: r.display_name ?? undefined,
		},
	}));

	const nextCursor = items.length === limit ? items[items.length - 1].record.createdAt : null;
	return json({ items, cursor: nextCursor });
};
