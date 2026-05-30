// GET /api/proposals?setlistId=N — pending proposals for a setlist (owner only)
// POST /api/proposals — submit a song proposal (authenticated, non-owner)

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import type { ProposalRow } from '$lib/server/utils';

export const GET: RequestHandler = ({ url, locals }) => {
	const user = requireAuth(locals.user);

	const setlistIdParam = url.searchParams.get('setlistId');
	if (!setlistIdParam) error(400, 'setlistId required');
	const setlistId = parseInt(setlistIdParam, 10);
	if (!setlistId) error(400, 'Invalid setlistId');

	const db = getDb();
	const setlist = db.prepare('SELECT user_id FROM setlists WHERE id = ?').get(setlistId) as { user_id: number } | undefined;
	if (!setlist) error(404, 'Setlist not found');
	if (setlist.user_id !== user.id && user.role !== 'admin') error(403, 'Not your setlist');

	const rows = db.prepare(`
		SELECT p.id, p.snapshot, p.note, p.status, p.created_at,
		       p.proposer_user_id, u.username, u.display_name
		FROM proposals p
		JOIN users u ON u.id = p.proposer_user_id
		WHERE p.setlist_id = ? AND p.status = 'pending'
		ORDER BY p.created_at ASC
	`).all(setlistId) as ProposalRow[];

	return json({ proposals: rows.map((r) => ({
		id:        r.id,
		snapshot:  JSON.parse(r.snapshot),
		note:      r.note ?? undefined,
		status:    r.status,
		createdAt: r.created_at,
		proposer: {
			userId:      r.proposer_user_id,
			username:    r.username,
			displayName: r.display_name ?? undefined,
		}
	})) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireAuth(locals.user);

	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const { setlistId, snapshot, note } = body;
	if (!setlistId) error(400, 'setlistId required');
	if (!snapshot || typeof snapshot !== 'object') error(400, 'snapshot required');

	const db = getDb();
	const setlist = db.prepare('SELECT user_id FROM setlists WHERE id = ?').get(setlistId) as { user_id: number } | undefined;
	if (!setlist) error(404, 'Setlist not found');
	if (setlist.user_id === user.id) error(400, 'Owners add songs directly; no proposal needed');

	const result = db.prepare(`
		INSERT INTO proposals (setlist_id, proposer_user_id, snapshot, note)
		VALUES (?, ?, ?, ?)
	`).run(setlistId, user.id, JSON.stringify(snapshot), note?.trim() ?? null);

	return json({ id: result.lastInsertRowid }, { status: 201 });
};
