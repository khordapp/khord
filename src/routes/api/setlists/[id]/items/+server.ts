// POST /api/setlists/[id]/items — add a song to a setlist (owner only)
// Body: { songId: number, snapshot?: object }

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { getParamId } from '$lib/server/utils';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = requireAuth(locals.user);
	const setlistId = getParamId(params.id);

	const db = getDb();
	const setlist = db.prepare('SELECT user_id FROM setlists WHERE id = ?').get(setlistId) as { user_id: number } | undefined;
	if (!setlist) error(404, 'Setlist not found');
	if (setlist.user_id !== user.id && user.role !== 'admin') error(403, 'Not your setlist');

	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const { songId, snapshot } = body;
	if (!songId) error(400, 'songId required');

	// Next position = max(position) + 1
	const maxRow = db.prepare('SELECT COALESCE(MAX(position), -1) as max FROM setlist_items WHERE setlist_id = ?').get(setlistId) as { max: number };
	const position = maxRow.max + 1;

	const result = db.prepare(`
		INSERT INTO setlist_items (setlist_id, song_id, added_by_user_id, position, snapshot)
		VALUES (?, ?, ?, ?, ?)
	`).run(setlistId, songId, user.id, position, snapshot ? JSON.stringify(snapshot) : null);

	// Touch setlist updated_at
	db.prepare("UPDATE setlists SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run(setlistId);

	return json({ id: result.lastInsertRowid, position }, { status: 201 });
};
