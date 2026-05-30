// POST /api/admin/reset — wipe all user-generated content except banned_users and instance_settings.
// Owner-only. Runs in a single transaction then VACUUMs.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/access';
import { getDb } from '$lib/server/db';

export const POST: RequestHandler = ({ locals }) => {
	requireOwner(locals.user);

	const db = getDb();

	db.transaction(() => {
		db.prepare('DELETE FROM access_requests').run();
		db.prepare('DELETE FROM proposals').run();
		db.prepare('DELETE FROM votes').run();
		db.prepare('DELETE FROM setlist_items').run();
		db.prepare('DELETE FROM setlists').run();
		db.prepare('DELETE FROM songs').run();
		db.prepare('DELETE FROM sessions').run();
		db.prepare('DELETE FROM users').run();
	})();

	db.exec('VACUUM');

	return json({ ok: true });
};
