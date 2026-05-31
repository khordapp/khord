// POST   /api/auth/delete-data    — delete all content for the current user (songs, votes, setlists, proposals).
//                                   The user account itself is preserved so they can sign back in.
// DELETE /api/auth/delete-data    — delete the user account entirely (cascades all content + sessions).
//                                   Clears the session cookie; user is signed out immediately.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, SESSION_COOKIE, deleteSession, cookieOptions } from '$lib/server/auth';
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

export const DELETE: RequestHandler = ({ locals, cookies }) => {
	const user = requireAuth(locals.user);

	const token = cookies.get(SESSION_COOKIE);

	const db = getDb();
	// Deleting the user cascades to sessions, songs, setlists, votes, proposals, etc.
	db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

	if (token) deleteSession(token);
	cookies.set(SESSION_COOKIE, '', { ...cookieOptions(0) });

	return json({ ok: true });
};
