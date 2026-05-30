// GET /api/admin/users?cursor=&limit= — paginated registered users. Owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireOwner } from '$lib/server/access';
import type { UserRow } from '$lib/server/utils';

export const GET: RequestHandler = ({ url, locals }) => {
	requireOwner(locals.user);

	const db = getDb();

	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
	const cursor = url.searchParams.get('cursor'); // created_at of last item

	const rows = db.prepare(`
		SELECT id, username, email, display_name, role, created_at
		FROM users
		${cursor ? 'WHERE created_at < ?' : ''}
		ORDER BY created_at DESC
		LIMIT ?
	`).all(...(cursor ? [cursor] : []), limit) as UserRow[];

	const users = rows.map((r) => ({
		id:          r.id,
		username:    r.username,
		email:       r.email,
		displayName: r.display_name ?? null,
		role:        r.role,
		createdAt:   r.created_at,
	}));

	const nextCursor = users.length === limit ? users[users.length - 1].createdAt : null;

	return json({ users, cursor: nextCursor });
};
