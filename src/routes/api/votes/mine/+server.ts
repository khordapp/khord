// GET /api/votes/mine — returns current user's upvoted song and setlist IDs + vote IDs for unlike

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ locals }) => {
	const user = requireAuth(locals.user);

	const db = getDb();
	const rows = db.prepare(`
		SELECT id, song_id, setlist_id FROM votes WHERE user_id = ?
	`).all(user.id) as { id: number; song_id: number | null; setlist_id: number | null }[];

	// Maps from subject ID → vote row ID (needed for unlike/delete)
	const songs: Record<number, number> = {};
	const setlists: Record<number, number> = {};
	for (const r of rows) {
		if (r.song_id != null) songs[r.song_id] = r.id;
		else if (r.setlist_id != null) setlists[r.setlist_id] = r.id;
	}

	return json({ songs, setlists });
};
