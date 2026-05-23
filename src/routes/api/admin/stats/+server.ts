// GET /api/admin/stats — instance stats. Owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { isOwnerUser } from '$lib/server/access';

export const GET: RequestHandler = ({ locals }) => {
	const user = locals.user;
	if (!user || !isOwnerUser(user.username, user.email)) error(403, 'Forbidden');

	const db = getDb();

	const { userCount } = db
		.prepare('SELECT COUNT(*) as userCount FROM users')
		.get() as { userCount: number };

	const { songsCount } = db
		.prepare('SELECT COUNT(*) as songsCount FROM songs')
		.get() as { songsCount: number };

	const { bannedCount } = db
		.prepare('SELECT COUNT(*) as bannedCount FROM banned_users')
		.get() as { bannedCount: number };

	const { pendingRequestsCount } = db
		.prepare("SELECT COUNT(*) as pendingRequestsCount FROM access_requests WHERE status = 'pending'")
		.get() as { pendingRequestsCount: number };

	const { setlistCount } = db
		.prepare('SELECT COUNT(*) as setlistCount FROM setlists')
		.get() as { setlistCount: number };

	return json({
		userCount,
		songsCount,
		bannedCount,
		setlistCount,
		pendingRequestsCount,
	});
};
