// GET /api/admin/users?did=&cursor=&limit=
// Returns paginated registered users, joined with actors for display info. Owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { isOwner } from '$lib/server/access';

export const GET: RequestHandler = ({ url }) => {
	const did = url.searchParams.get('did') ?? '';
	if (!isOwner(did)) error(403, 'Forbidden');

	const db = getDb();
	if (!db) error(503, 'Database unavailable');

	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
	const cursor = url.searchParams.get('cursor'); // registered_at of last item

	const rows = db
		.prepare(
			`SELECT r.did, r.registered_at, a.handle, a.display_name, a.avatar
			 FROM registered_users r
			 LEFT JOIN actors a ON a.did = r.did
			 ${cursor ? 'WHERE r.registered_at < ?' : ''}
			 ORDER BY r.registered_at DESC
			 LIMIT ?`
		)
		.all(...(cursor ? [cursor] : []), limit) as any[];

	const users = rows.map((r) => ({
		did: r.did,
		registeredAt: r.registered_at,
		handle: r.handle ?? null,
		displayName: r.display_name ?? null,
		avatar: r.avatar ?? null
	}));

	const nextCursor = users.length === limit ? users[users.length - 1].registeredAt : null;

	return json({ users, cursor: nextCursor });
};
