// GET    /api/admin/bans             — list all bans. Owner-only.
// POST   /api/admin/bans             — add ban { targetUserId, reason? }. Owner-only.
// DELETE /api/admin/bans             — remove ban { targetUserId }. Owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { isOwnerUser } from '$lib/server/access';

export const GET: RequestHandler = ({ locals }) => {
	const user = locals.user;
	if (!user || !isOwnerUser(user.username, user.email)) error(403, 'Forbidden');

	const db = getDb();

	const rows = db.prepare(`
		SELECT b.user_id, b.reason, b.banned_at,
		       u.username, u.display_name, u.email
		FROM banned_users b
		JOIN users u ON u.id = b.user_id
		ORDER BY b.banned_at DESC
	`).all() as any[];

	return json({
		bans: rows.map((r) => ({
			userId:      r.user_id,
			username:    r.username,
			displayName: r.display_name ?? null,
			email:       r.email,
			reason:      r.reason ?? null,
			bannedAt:    r.banned_at,
		}))
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || !isOwnerUser(user.username, user.email)) error(403, 'Forbidden');

	const body = await request.json().catch(() => null);
	const targetUserId: number = body?.targetUserId;
	const reason: string | null = body?.reason || null;
	const purgeContent: boolean = body?.purgeContent === true;

	if (!targetUserId) error(400, 'Missing targetUserId');

	const db = getDb();

	const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId) as { id: number } | undefined;
	if (!target) error(404, 'User not found');

	db.transaction(() => {
		db.prepare(`
			INSERT INTO banned_users(user_id, reason) VALUES(?, ?)
			ON CONFLICT(user_id) DO UPDATE SET
			  reason = excluded.reason,
			  banned_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
		`).run(targetUserId, reason);

		if (purgeContent) {
			db.prepare('DELETE FROM proposals WHERE proposer_user_id = ?').run(targetUserId);
			db.prepare('DELETE FROM votes WHERE user_id = ?').run(targetUserId);
			db.prepare('DELETE FROM setlists WHERE user_id = ?').run(targetUserId);
			db.prepare('DELETE FROM songs WHERE user_id = ?').run(targetUserId);
		}
	})();

	return json({ ok: true, purged: purgeContent });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || !isOwnerUser(user.username, user.email)) error(403, 'Forbidden');

	const body = await request.json().catch(() => null);
	const targetUserId: number = body?.targetUserId;

	if (!targetUserId) error(400, 'Missing targetUserId');

	const db = getDb();
	db.prepare('DELETE FROM banned_users WHERE user_id = ?').run(targetUserId);

	return json({ ok: true });
};
