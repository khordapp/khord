import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const row = getDb()
		.prepare('SELECT profile_public FROM users WHERE id = ?')
		.get(locals.user.id) as any;
	return json({ profilePublic: row ? !!row.profile_public : true });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await request.json();
	if (typeof body.profilePublic !== 'boolean') error(400, 'Invalid payload');
	getDb()
		.prepare('UPDATE users SET profile_public = ? WHERE id = ?')
		.run(body.profilePublic ? 1 : 0, locals.user.id);
	return json({ ok: true });
};
