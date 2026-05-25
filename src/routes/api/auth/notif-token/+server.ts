import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomBytes } from 'crypto';
import { getDb } from '$lib/server/db';

// POST — create or refresh a long-lived notification token for the current user.
// Used by the Capacitor app to authenticate background feed polling.
export const POST: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const token = randomBytes(32).toString('hex');
	getDb().prepare(
		'INSERT OR REPLACE INTO notification_tokens(token, user_id) VALUES(?, ?)'
	).run(token, locals.user.id);

	return json({ token });
};
