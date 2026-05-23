import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import bcrypt from 'bcryptjs';
import { getDb } from '$lib/server/db';
import { createSession, SESSION_COOKIE, cookieOptions } from '$lib/server/auth';
import { isOwnerUser } from '$lib/server/access';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => null);
	const email: string = (body?.email ?? '').trim().toLowerCase();
	const password: string = body?.password ?? '';

	if (!email || !password) error(400, 'Email and password are required.');

	const db = getDb();
	const user = db.prepare(
		'SELECT id, username, email, display_name, password_hash, role, (avatar IS NOT NULL) AS has_avatar FROM users WHERE email = ?'
	).get(email) as { id: number; username: string; email: string; display_name: string | null; password_hash: string; role: string; has_avatar: number } | undefined;

	if (!user || !(await bcrypt.compare(password, user.password_hash))) {
		error(401, 'Invalid email or password.');
	}

	// Check if banned
	const banned = db.prepare('SELECT 1 FROM banned_users WHERE user_id = ?').get(user.id);
	if (banned) error(403, 'Your account has been removed from this instance.');

	const token = createSession(user.id);
	cookies.set(SESSION_COOKIE, token, cookieOptions());

	return json({
		id: user.id,
		username: user.username,
		email: user.email,
		displayName: user.display_name,
		role: user.role,
		hasAvatar: user.has_avatar === 1,
		isOwner: isOwnerUser(user.username, user.email)
	});
};
