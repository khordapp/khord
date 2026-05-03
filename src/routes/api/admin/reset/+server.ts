// POST /api/admin/reset — wipe all instance data except banned_users and instance_settings.
// Resets firehose cursor to 0 so the indexer re-syncs from scratch.
// Owner-only. Runs in a single transaction then VACUUMs.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isOwner } from '$lib/server/access';
import { getDbRw } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const ownerDid: string = body?.ownerDid ?? '';

	if (!isOwner(ownerDid)) error(403, 'Forbidden');

	const db = getDbRw();
	if (!db) error(503, 'Database unavailable');

	db.exec(`CREATE TABLE IF NOT EXISTS access_requests (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		handle       TEXT NOT NULL,
		did          TEXT NOT NULL UNIQUE,
		status       TEXT NOT NULL DEFAULT 'pending',
		requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
		reviewed_at  TEXT
	)`);

	db.transaction(() => {
		db.prepare('DELETE FROM access_requests').run();
		db.prepare('DELETE FROM proposals').run();
		db.prepare('DELETE FROM votes').run();
		db.prepare('DELETE FROM songs').run();
		db.prepare('DELETE FROM actors').run();
		db.prepare('DELETE FROM registered_users').run();
		db.prepare('UPDATE cursor SET seq = 0 WHERE id = 1').run();
	})();

	db.exec('VACUUM');

	return json({ ok: true });
};
