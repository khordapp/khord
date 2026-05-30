// GET  /api/admin/requests?status=  — list access requests (default: pending). Owner-only.
// POST /api/admin/requests          — review a request { requestId, action: 'approve'|'decline' }. Owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireOwner } from '$lib/server/access';

export const GET: RequestHandler = ({ url, locals }) => {
	requireOwner(locals.user);

	const db = getDb();
	const status = url.searchParams.get('status') ?? 'pending';

	const rows = status === 'all'
		? db.prepare(
			'SELECT id, username, email, status, requested_at, reviewed_at FROM access_requests ORDER BY requested_at ASC'
		).all()
		: db.prepare(
			'SELECT id, username, email, status, requested_at, reviewed_at FROM access_requests WHERE status = ? ORDER BY requested_at ASC'
		).all(status);

	return json({
		requests: (rows as any[]).map((r) => ({
			id:          r.id,
			username:    r.username,
			email:       r.email,
			status:      r.status,
			requestedAt: r.requested_at,
			reviewedAt:  r.reviewed_at ?? null,
		}))
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	requireOwner(locals.user);

	const body = await request.json().catch(() => null);
	const requestId: number = body?.requestId;
	const action: string = body?.action ?? '';

	if (!requestId) error(400, 'Missing requestId');
	if (action !== 'approve' && action !== 'decline') error(400, 'action must be approve or decline');

	const db = getDb();
	const row = db
		.prepare('SELECT id, username, email FROM access_requests WHERE id = ?')
		.get(requestId) as { id: number; username: string; email: string } | undefined;

	if (!row) error(404, 'Request not found');

	const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

	if (action === 'approve') {
		db.prepare(
			`UPDATE access_requests SET status = 'approved', reviewed_at = ? WHERE id = ?`
		).run(now, requestId);
	} else {
		db.prepare(
			`UPDATE access_requests SET status = 'declined', reviewed_at = ? WHERE id = ?`
		).run(now, requestId);
	}

	return json({ ok: true });
};
