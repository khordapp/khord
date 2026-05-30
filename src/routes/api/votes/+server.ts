// POST /api/votes — upvote a song or setlist (authenticated)
// Body: { songId: number } | { setlistId: number }

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireAuth(locals.user);

	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const { songId, setlistId } = body;
	if (!songId && !setlistId) error(400, 'songId or setlistId required');
	if (songId && setlistId) error(400, 'Provide songId or setlistId, not both');

	const db = getDb();
	try {
		const result = db.prepare(`
			INSERT INTO votes (user_id, song_id, setlist_id) VALUES (?, ?, ?)
		`).run(user.id, songId ?? null, setlistId ?? null);
		return json({ id: result.lastInsertRowid }, { status: 201 });
	} catch (e: any) {
		if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') error(409, 'Already voted');
		throw e;
	}
};
