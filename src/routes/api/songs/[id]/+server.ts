// PUT /api/songs/[id] — resync platform URLs (owner only)
// DELETE /api/songs/[id] — delete song (owner only)

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const id = parseInt(params.id, 10);
	if (!id) error(400, 'Invalid id');

	const db = getDb();
	const song = db.prepare('SELECT user_id FROM songs WHERE id = ?').get(id) as { user_id: number } | undefined;
	if (!song) error(404, 'Song not found');
	if (song.user_id !== locals.user.id) error(403, 'Not your song');

	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const { spotifyUrl, appleMusicUrl, youtubeMusicUrl, deezerUrl, tidalUrl } = body;

	db.prepare(`
		UPDATE songs SET
			spotify_url       = COALESCE(?, spotify_url),
			apple_music_url   = COALESCE(?, apple_music_url),
			youtube_music_url = COALESCE(?, youtube_music_url),
			deezer_url        = COALESCE(?, deezer_url),
			tidal_url         = COALESCE(?, tidal_url),
			updated_at        = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
		WHERE id = ?
	`).run(
		spotifyUrl ?? null,
		appleMusicUrl ?? null,
		youtubeMusicUrl ?? null,
		deezerUrl ?? null,
		tidalUrl ?? null,
		id
	);

	const row = db.prepare(`
		SELECT spotify_url, apple_music_url, youtube_music_url, deezer_url, tidal_url, updated_at
		FROM songs WHERE id = ?
	`).get(id) as any;

	return json({
		spotifyUrl:      row.spotify_url ?? undefined,
		appleMusicUrl:   row.apple_music_url ?? undefined,
		youtubeMusicUrl: row.youtube_music_url ?? undefined,
		deezerUrl:       row.deezer_url ?? undefined,
		tidalUrl:        row.tidal_url ?? undefined,
		updatedAt:       row.updated_at,
	});
};

export const DELETE: RequestHandler = ({ params, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const id = parseInt(params.id, 10);
	if (!id) error(400, 'Invalid id');

	const db = getDb();
	const song = db.prepare('SELECT user_id FROM songs WHERE id = ?').get(id) as { user_id: number } | undefined;
	if (!song) error(404, 'Song not found');
	if (song.user_id !== locals.user.id && locals.user.role !== 'admin') error(403, 'Not your song');

	db.prepare('DELETE FROM songs WHERE id = ?').run(id);
	return new Response(null, { status: 204 });
};
