// POST /api/admin/reset — wipe all instance data except banned_users and instance_settings.
// Resets firehose cursor to 0 so the indexer re-syncs from scratch.
// Owner-only. Runs in a single transaction then VACUUMs.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isOwner } from '$lib/server/access';
import { getDbRw } from '$lib/server/db';
import { env } from '$env/dynamic/private';

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

	// Re-register owner DIDs so admins aren't locked out after reset
	const ownerDids = (env.OWNER_DIDS ?? '').split(',').map((d) => d.trim()).filter(Boolean);
	for (const did of ownerDids) {
		db.prepare('INSERT INTO registered_users(did) VALUES(?) ON CONFLICT(did) DO NOTHING').run(did);
	}

	return json({ ok: true });
};
