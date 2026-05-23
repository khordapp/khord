import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = ({ params, locals }) => {
	const id = parseInt(params.id, 10);
	if (!id) error(404, 'Song not found');

	const db = getDb();
	const row = db.prepare(`
		SELECT
			s.id, s.title, s.artist, s.album, s.thumbnail_url,
			s.spotify_url, s.apple_music_url, s.youtube_music_url,
			s.deezer_url, s.tidal_url, s.amazon_music_url, s.soundcloud_url,
			s.note, s.listed, s.created_at,
			u.id as user_id, u.username, u.display_name,
			(SELECT COUNT(*) FROM votes v WHERE v.song_id = s.id) as vote_count
		FROM songs s
		JOIN users u ON u.id = s.user_id
		WHERE s.id = ?
	`).get(id) as any;

	if (!row) error(404, 'Song not found');

	return {
		song: {
			id:              row.id,
			title:           row.title,
			artist:          row.artist,
			album:           row.album ?? undefined,
			thumbnailUrl:    row.thumbnail_url ?? undefined,
			spotifyUrl:      row.spotify_url ?? undefined,
			appleMusicUrl:   row.apple_music_url ?? undefined,
			youtubeMusicUrl: row.youtube_music_url ?? undefined,
			deezerUrl:       row.deezer_url ?? undefined,
			tidalUrl:        row.tidal_url ?? undefined,
			note:            row.note ?? undefined,
			createdAt:       row.created_at,
		},
		sharedBy: {
			userId:      row.user_id,
			username:    row.username,
			displayName: row.display_name ?? undefined,
		},
		voteCount:    row.vote_count as number,
		viewerUserId: locals.user?.id ?? null,
	};
};
