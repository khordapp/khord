// GET  /api/admin/bans?did=         — list all bans
// POST /api/admin/bans              — add ban { ownerDid, targetDid, reason? }
// DELETE /api/admin/bans            — remove ban { ownerDid, targetDid }
// All operations are owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, getDbRw } from '$lib/server/db';
import { isOwner } from '$lib/server/access';

export const GET: RequestHandler = ({ url }) => {
	const did = url.searchParams.get('did') ?? '';
	if (!isOwner(did)) error(403, 'Forbidden');

	const db = getDb();
	if (!db) error(503, 'Database unavailable');

	const rows = db
		.prepare(
			`SELECT b.did, b.reason, b.banned_at, a.handle, a.display_name, a.avatar
			 FROM banned_users b
			 LEFT JOIN actors a ON a.did = b.did
			 ORDER BY b.banned_at DESC`
		)
		.all() as any[];

	const bans = rows.map((r) => ({
		did: r.did,
		reason: r.reason ?? null,
		bannedAt: r.banned_at,
		handle: r.handle ?? null,
		displayName: r.display_name ?? null,
		avatar: r.avatar ?? null
	}));

	return json({ bans });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const ownerDid: string = body?.ownerDid ?? '';
	const targetDid: string = body?.targetDid ?? '';
	const reason: string | null = body?.reason || null;

	if (!isOwner(ownerDid)) error(403, 'Forbidden');
	if (!targetDid) error(400, 'Missing targetDid');

	const db = getDbRw();
	if (!db) error(503, 'Database unavailable');

	db.prepare(
		`INSERT INTO banned_users(did, reason) VALUES(?, ?)
		 ON CONFLICT(did) DO UPDATE SET
		   reason = excluded.reason,
		   banned_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
	).run(targetDid, reason);

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const ownerDid: string = body?.ownerDid ?? '';
	const targetDid: string = body?.targetDid ?? '';

	if (!isOwner(ownerDid)) error(403, 'Forbidden');
	if (!targetDid) error(400, 'Missing targetDid');

	const db = getDbRw();
	if (!db) error(503, 'Database unavailable');

	db.prepare('DELETE FROM banned_users WHERE did = ?').run(targetDid);

	return json({ ok: true });
};
