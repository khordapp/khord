// POST /api/auth/delete-data — delete all content for the current user (songs, votes, setlists, proposals).
// The user account itself is preserved so they can sign back in.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const POST: RequestHandler = ({ locals }) => {
	const user = requireAuth(locals.user);

	const db = getDb();

	db.transaction(() => {
		db.prepare('DELETE FROM proposals WHERE proposer_user_id = ?').run(user.id);
		db.prepare('DELETE FROM votes WHERE user_id = ?').run(user.id);
		db.prepare('DELETE FROM setlists WHERE user_id = ?').run(user.id);
		db.prepare('DELETE FROM songs WHERE user_id = ?').run(user.id);
	})();

	return json({ ok: true });
};
