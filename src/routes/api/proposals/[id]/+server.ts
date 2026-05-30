// PUT /api/proposals/[id] — accept or decline a proposal (setlist owner only)
// Body: { action: 'accept' | 'decline' }
// On accept: creates a song from the snapshot, appends it to the setlist

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { getParamId } from '$lib/server/utils';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = requireAuth(locals.user);
	const id = getParamId(params.id);

	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const { action } = body;
	if (action !== 'accept' && action !== 'decline') error(400, 'action must be accept or decline');

	const db = getDb();
	const proposal = db.prepare(`
		SELECT p.*, sl.user_id as setlist_owner_id
		FROM proposals p
		JOIN setlists sl ON sl.id = p.setlist_id
		WHERE p.id = ? AND p.status = 'pending'
	`).get(id) as any;
	if (!proposal) error(404, 'Proposal not found');
	if (proposal.setlist_owner_id !== user.id && user.role !== 'admin') error(403, 'Not your setlist');

	if (action === 'decline') {
		db.prepare("UPDATE proposals SET status = 'declined' WHERE id = ?").run(id);
		return new Response(null, { status: 204 });
	}

	// Accept: create song from snapshot, add to setlist
	const snapshot = JSON.parse(proposal.snapshot);
	const accept = db.transaction(() => {
		const songResult = db.prepare(`
			INSERT INTO songs (
				user_id, title, artist, album, thumbnail_url,
				spotify_url, apple_music_url, youtube_music_url,
				deezer_url, tidal_url, note, listed
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
		`).run(
			user.id,
			snapshot.title,
			snapshot.artist,
			snapshot.album ?? null,
			snapshot.thumbnailUrl ?? null,
			snapshot.spotifyUrl ?? null,
			snapshot.appleMusicUrl ?? null,
			snapshot.youtubeMusicUrl ?? null,
			snapshot.deezerUrl ?? null,
			snapshot.tidalUrl ?? null,
			snapshot.note ?? null
		);
		const songId = songResult.lastInsertRowid as number;

		const maxRow = db.prepare('SELECT COALESCE(MAX(position), -1) as max FROM setlist_items WHERE setlist_id = ?').get(proposal.setlist_id) as { max: number };
		db.prepare(`
			INSERT INTO setlist_items (setlist_id, song_id, added_by_user_id, position, snapshot)
			VALUES (?, ?, ?, ?, ?)
		`).run(proposal.setlist_id, songId, user.id, maxRow.max + 1, proposal.snapshot);

		db.prepare("UPDATE setlists SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run(proposal.setlist_id);
		db.prepare("UPDATE proposals SET status = 'accepted' WHERE id = ?").run(id);

		return songId;
	});

	const songId = accept();
	return json({ songId }, { status: 200 });
};
