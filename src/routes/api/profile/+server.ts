import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ locals }) => {
	const user = requireAuth(locals.user);
	const row = getDb()
		.prepare('SELECT profile_public FROM users WHERE id = ?')
		.get(user.id) as any;
	return json({ profilePublic: row ? !!row.profile_public : true });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const user = requireAuth(locals.user);
	const body = await request.json();
	if (typeof body.profilePublic !== 'boolean') error(400, 'Invalid payload');
	getDb()
		.prepare('UPDATE users SET profile_public = ? WHERE id = ?')
		.run(body.profilePublic ? 1 : 0, user.id);
	return json({ ok: true });
};
