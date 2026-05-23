import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = ({ params, locals }) => {
	const id = parseInt(params.id, 10);
	if (!id) error(404, 'Setlist not found');

	const db = getDb();
	const setlist = db.prepare(`
		SELECT sl.id, sl.title, sl.description, sl.open, sl.created_at, sl.updated_at,
		       sl.user_id, u.username, u.display_name
		FROM setlists sl
		JOIN users u ON u.id = sl.user_id
		WHERE sl.id = ?
	`).get(id) as any;
	if (!setlist) error(404, 'Setlist not found');

	const items = db.prepare(`
		SELECT
			si.id, si.song_id, si.position, si.snapshot, si.added_at,
			si.added_by_user_id,
			adder.username as adder_username,
			s.title, s.artist, s.album, s.thumbnail_url,
			s.spotify_url, s.apple_music_url, s.youtube_music_url,
			s.deezer_url, s.tidal_url, s.amazon_music_url, s.soundcloud_url,
			s.note, s.created_at as song_created_at
		FROM setlist_items si
		LEFT JOIN songs s ON s.id = si.song_id
		LEFT JOIN users adder ON adder.id = si.added_by_user_id
		WHERE si.setlist_id = ?
		ORDER BY si.position ASC
	`).all(id) as any[];

	return {
		setlist: {
			id:          setlist.id,
			title:       setlist.title,
			description: setlist.description ?? undefined,
			open:        setlist.open === 1,
			createdAt:   setlist.created_at,
			updatedAt:   setlist.updated_at,
			owner: {
				userId:      setlist.user_id,
				username:    setlist.username,
				displayName: setlist.display_name ?? undefined,
			},
			items: items.map((r: any) => {
				const snapshot = r.snapshot ? JSON.parse(r.snapshot) : null;
				const record = r.song_id ? {
					title:           r.title,
					artist:          r.artist,
					album:           r.album ?? undefined,
					thumbnailUrl:    r.thumbnail_url ?? undefined,
					spotifyUrl:      r.spotify_url ?? undefined,
					appleMusicUrl:   r.apple_music_url ?? undefined,
					youtubeMusicUrl: r.youtube_music_url ?? undefined,
					deezerUrl:       r.deezer_url ?? undefined,
					tidalUrl:        r.tidal_url ?? undefined,
					note:            r.note ?? undefined,
					createdAt:       r.song_created_at,
				} : snapshot;
				return {
					id:       r.id,
					songId:   r.song_id ?? undefined,
					position: r.position,
					addedAt:  r.added_at,
					addedBy:  r.adder_username ?? undefined,
					record,
				};
			})
		},
		viewerUserId: locals.user?.id ?? null
	};
};
