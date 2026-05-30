// DELETE /api/votes/[id] — remove a vote (owner only)

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { getParamId } from '$lib/server/utils';

export const DELETE: RequestHandler = ({ params, locals }) => {
	const user = requireAuth(locals.user);
	const id = getParamId(params.id);

	const db = getDb();
	const vote = db.prepare('SELECT user_id FROM votes WHERE id = ?').get(id) as { user_id: number } | undefined;
	if (!vote) error(404, 'Vote not found');
	if (vote.user_id !== user.id) error(403, 'Not your vote');

	db.prepare('DELETE FROM votes WHERE id = ?').run(id);
	return new Response(null, { status: 204 });
};
