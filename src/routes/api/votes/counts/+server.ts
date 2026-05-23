// GET /api/votes/counts?songIds=1,2,3&setlistIds=4,5
// Returns upvote counts for songs and/or setlists by integer ID.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ url }) => {
	const songIdsParam    = url.searchParams.get('songIds');
	const setlistIdsParam = url.searchParams.get('setlistIds');

	if (!songIdsParam && !setlistIdsParam) error(400, 'songIds or setlistIds required');

	const db = getDb();
	const songs: Record<number, number> = {};
	const setlists: Record<number, number> = {};

	if (songIdsParam) {
		const ids = songIdsParam.split(',').map(Number).filter(Boolean);
		if (ids.length > 0) {
			const ph = ids.map(() => '?').join(',');
			const rows = db.prepare(`
				SELECT song_id, COUNT(*) as count FROM votes
				WHERE song_id IN (${ph}) GROUP BY song_id
			`).all(...ids) as { song_id: number; count: number }[];
			for (const r of rows) songs[r.song_id] = r.count;
		}
	}

	if (setlistIdsParam) {
		const ids = setlistIdsParam.split(',').map(Number).filter(Boolean);
		if (ids.length > 0) {
			const ph = ids.map(() => '?').join(',');
			const rows = db.prepare(`
				SELECT setlist_id, COUNT(*) as count FROM votes
				WHERE setlist_id IN (${ph}) GROUP BY setlist_id
			`).all(...ids) as { setlist_id: number; count: number }[];
			for (const r of rows) setlists[r.setlist_id] = r.count;
		}
	}

	return json({ songs, setlists });
};
