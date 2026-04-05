// GET /api/proposals?setlistUri=at://...
// Returns pending proposals for a given setlist URI from the SQLite AppView.
// Returns 503 when DB is unavailable so the client can fall back to PDS fetching.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ url }) => {
	const db = getDb();
	if (!db) error(503, 'AppView not available');

	const setlistUri = url.searchParams.get('setlistUri');
	if (!setlistUri) error(400, 'Missing setlistUri parameter');

	const rows = db.prepare(`
		SELECT
			p.uri, p.cid, p.proposer_did,
			p.setlist_uri, p.setlist_cid,
			p.title, p.artist, p.album, p.thumbnail_url,
			p.spotify_url, p.apple_music_url, p.youtube_music_url,
			p.tidal_url, p.deezer_url, p.amazon_music_url,
			p.soundcloud_url, p.songlink_url,
			p.note, p.created_at,
			a.handle, a.display_name, a.avatar
		FROM proposals p
		LEFT JOIN actors a ON a.did = p.proposer_did
		WHERE p.setlist_uri = ?
		ORDER BY p.created_at ASC
	`).all(setlistUri) as any[];

	const proposals = rows.map((r) => ({
		uri:            r.uri,
		cid:            r.cid,
		proposerDid:    r.proposer_did,
		proposerHandle: r.handle      ?? r.proposer_did,
		proposerAvatar: r.avatar      ?? undefined,
		value: {
			setlistUri:  r.setlist_uri,
			setlistCid:  r.setlist_cid,
			snapshot: {
				title:           r.title,
				artist:          r.artist,
				album:           r.album           ?? undefined,
				thumbnailUrl:    r.thumbnail_url   ?? undefined,
				spotifyUrl:      r.spotify_url     ?? undefined,
				appleMusicUrl:   r.apple_music_url ?? undefined,
				youtubeMusicUrl: r.youtube_music_url ?? undefined,
				tidalUrl:        r.tidal_url       ?? undefined,
				deezerUrl:       r.deezer_url      ?? undefined,
				amazonMusicUrl:  r.amazon_music_url ?? undefined,
				soundcloudUrl:   r.soundcloud_url  ?? undefined,
				songlinkUrl:     r.songlink_url    ?? undefined,
			},
			note:       r.note       ?? undefined,
			createdAt:  r.created_at,
		}
	}));

	return json({ proposals });
};
