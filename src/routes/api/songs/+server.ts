// POST /api/songs — create a new song record (authenticated)

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { getSetting } from '$lib/server/settings';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireAuth(locals.user);

	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const { title, artist, album, thumbnailUrl, spotifyUrl, appleMusicUrl,
		youtubeMusicUrl, deezerUrl, tidalUrl, amazonMusicUrl, soundcloudUrl,
		note, listed = 1, urlsResolvedAt } = body;

	if (!title || typeof title !== 'string') error(400, 'title is required');
	if (!artist || typeof artist !== 'string') error(400, 'artist is required');
	if (note && typeof note === 'string' && [...note].length > 300) error(400, 'note exceeds 300 characters');

	const albumArtDisabled =
		getSetting('album_art_disabled', env.DISABLE_ALBUM_ART === 'true' ? 'true' : 'false') === 'true';

	const db = getDb();
	const result = db.prepare(`
		INSERT INTO songs (
			user_id, title, artist, album, thumbnail_url,
			spotify_url, apple_music_url, youtube_music_url, deezer_url,
			tidal_url, amazon_music_url, soundcloud_url, note, listed,
			urls_resolved_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		user.id,
		title.trim(),
		artist.trim(),
		album?.trim() ?? null,
		albumArtDisabled ? null : (thumbnailUrl ?? null),
		spotifyUrl ?? null,
		appleMusicUrl ?? null,
		youtubeMusicUrl ?? null,
		deezerUrl ?? null,
		tidalUrl ?? null,
		amazonMusicUrl ?? null,
		soundcloudUrl ?? null,
		note?.trim() ?? null,
		listed ? 1 : 0,
		urlsResolvedAt ?? null
	);

	const row = db.prepare('SELECT id, created_at FROM songs WHERE id = ?').get(result.lastInsertRowid) as { id: number; created_at: string };
	return json({ id: row.id, createdAt: row.created_at }, { status: 201 });
};
