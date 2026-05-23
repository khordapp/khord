// DELETE /api/setlists/[id]/items/[itemId] — remove an item from a setlist (owner only)

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const DELETE: RequestHandler = ({ params, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const setlistId = parseInt(params.id, 10);
	const itemId    = parseInt(params.itemId, 10);
	if (!setlistId || !itemId) error(400, 'Invalid id');

	const db = getDb();
	const setlist = db.prepare('SELECT user_id FROM setlists WHERE id = ?').get(setlistId) as { user_id: number } | undefined;
	if (!setlist) error(404, 'Setlist not found');
	if (setlist.user_id !== locals.user.id) error(403, 'Not your setlist');

	const item = db.prepare('SELECT id FROM setlist_items WHERE id = ? AND setlist_id = ?').get(itemId, setlistId);
	if (!item) error(404, 'Item not found');

	db.prepare('DELETE FROM setlist_items WHERE id = ?').run(itemId);
	// Re-compact positions
	const remaining = db.prepare('SELECT id FROM setlist_items WHERE setlist_id = ? ORDER BY position ASC').all(setlistId) as { id: number }[];
	const update = db.prepare('UPDATE setlist_items SET position = ? WHERE id = ?');
	const compact = db.transaction(() => {
		remaining.forEach((r, idx) => update.run(idx, r.id));
	});
	compact();

	// Touch setlist updated_at
	db.prepare("UPDATE setlists SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run(setlistId);

	return new Response(null, { status: 204 });
};
