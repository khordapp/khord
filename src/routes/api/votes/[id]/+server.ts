// DELETE /api/votes/[id] — remove a vote (owner only)

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const DELETE: RequestHandler = ({ params, locals }) => {
	if (!locals.user) error(401, 'Not authenticated');

	const id = parseInt(params.id, 10);
	if (!id) error(400, 'Invalid id');

	const db = getDb();
	const vote = db.prepare('SELECT user_id FROM votes WHERE id = ?').get(id) as { user_id: number } | undefined;
	if (!vote) error(404, 'Vote not found');
	if (vote.user_id !== locals.user.id) error(403, 'Not your vote');

	db.prepare('DELETE FROM votes WHERE id = ?').run(id);
	return new Response(null, { status: 204 });
};
