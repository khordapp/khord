// GET  /api/admin/requests?did=&status=  — list access requests (default: all)
// POST /api/admin/requests               — review a request { ownerDid, requestId, action: 'approve'|'decline' }
// Owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, getDbRw } from '$lib/server/db';
import { isOwner } from '$lib/server/access';

const ENSURE_TABLE = `
	CREATE TABLE IF NOT EXISTS access_requests (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		handle       TEXT NOT NULL,
		did          TEXT NOT NULL UNIQUE,
		status       TEXT NOT NULL DEFAULT 'pending',
		requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
		reviewed_at  TEXT
	)
`;

export const GET: RequestHandler = ({ url }) => {
	const did = url.searchParams.get('did') ?? '';
	if (!isOwner(did)) error(403, 'Forbidden');

	const dbRw = getDbRw();
	if (!dbRw) error(503, 'Database unavailable');
	dbRw.exec(ENSURE_TABLE);

	const db = getDb();
	if (!db) error(503, 'Database unavailable');

	const status = url.searchParams.get('status') ?? null;
	const rows = status
		? db
				.prepare(
					`SELECT id, handle, did, status, requested_at, reviewed_at
					 FROM access_requests WHERE status = ? ORDER BY requested_at ASC`
				)
				.all(status)
		: db
				.prepare(
					`SELECT id, handle, did, status, requested_at, reviewed_at
					 FROM access_requests ORDER BY requested_at ASC`
				)
				.all();

	const requests = (rows as any[]).map((r) => ({
		id: r.id,
		handle: r.handle,
		did: r.did,
		status: r.status,
		requestedAt: r.requested_at,
		reviewedAt: r.reviewed_at ?? null
	}));

	return json({ requests });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const ownerDid: string = body?.ownerDid ?? '';
	const requestId: number = body?.requestId;
	const action: string = body?.action ?? '';

	if (!isOwner(ownerDid)) error(403, 'Forbidden');
	if (!requestId) error(400, 'Missing requestId');
	if (action !== 'approve' && action !== 'decline') error(400, 'action must be approve or decline');

	const db = getDbRw();
	if (!db) error(503, 'Database unavailable');

	db.exec(ENSURE_TABLE);

	const row = db
		.prepare('SELECT did, handle FROM access_requests WHERE id = ?')
		.get(requestId) as { did: string; handle: string } | undefined;

	if (!row) error(404, 'Request not found');

	const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

	if (action === 'approve') {
		db.prepare(
			`UPDATE access_requests SET status = 'approved', reviewed_at = ? WHERE id = ?`
		).run(now, requestId);

		// Register the user
		db.prepare(
			'INSERT INTO registered_users(did) VALUES(?) ON CONFLICT(did) DO NOTHING'
		).run(row.did);

		// Seed actors table so admin panel shows handle
		if (row.handle) {
			db.prepare(
				`INSERT INTO actors(did, handle) VALUES(?, ?)
				 ON CONFLICT(did) DO UPDATE SET handle = excluded.handle WHERE excluded.handle IS NOT NULL`
			).run(row.did, row.handle);
		}
	} else {
		db.prepare(
			`UPDATE access_requests SET status = 'declined', reviewed_at = ? WHERE id = ?`
		).run(now, requestId);
	}

	return json({ ok: true });
};
