// GET /api/admin/stats?did=
// Returns instance stats for the admin page. Owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { isOwner } from '$lib/server/access';

export const GET: RequestHandler = ({ url }) => {
	const did = url.searchParams.get('did') ?? '';
	if (!isOwner(did)) error(403, 'Forbidden');

	const db = getDb();
	if (!db) error(503, 'Database unavailable');

	const { registeredCount } = db
		.prepare('SELECT COUNT(*) as registeredCount FROM registered_users')
		.get() as { registeredCount: number };

	const { songsCount } = db
		.prepare('SELECT COUNT(*) as songsCount FROM songs')
		.get() as { songsCount: number };

	const { bannedCount } = db
		.prepare('SELECT COUNT(*) as bannedCount FROM banned_users')
		.get() as { bannedCount: number };

	const cursor = db
		.prepare('SELECT seq FROM cursor WHERE id = 1')
		.get() as { seq: number } | undefined;

	const maxUsers = parseInt(process.env.MAX_USERS ?? '0', 10) || 0;

	let pendingRequestsCount = 0;
	try {
		db.exec(`CREATE TABLE IF NOT EXISTS access_requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT, handle TEXT NOT NULL,
			did TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending',
			requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), reviewed_at TEXT
		)`);
		const { n } = db
			.prepare("SELECT COUNT(*) as n FROM access_requests WHERE status = 'pending'")
			.get() as { n: number };
		pendingRequestsCount = n;
	} catch {
		// table may not exist yet; non-fatal
	}

	return json({
		registeredCount,
		songsCount,
		bannedCount,
		cursorSeq: cursor?.seq ?? 0,
		maxUsers,
		pendingRequestsCount
	});
};
