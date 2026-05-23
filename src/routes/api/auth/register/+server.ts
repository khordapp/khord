import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import bcrypt from 'bcryptjs';
import { getDb } from '$lib/server/db';
import { createSession, SESSION_COOKIE, cookieOptions } from '$lib/server/auth';
import { isOwnerUser } from '$lib/server/access';
import { getSetting } from '$lib/server/settings';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => null);
	const email: string = (body?.email ?? '').trim().toLowerCase();
	const username: string = (body?.username ?? '').trim();
	const password: string = body?.password ?? '';

	if (!email || !username || !password) error(400, 'Email, username, and password are required.');
	if (password.length < 8) error(400, 'Password must be at least 8 characters.');
	if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
		error(400, 'Username must be 2–32 characters: letters, numbers, underscores, dots, hyphens.');
	}

	const db = getDb();

	// Registration closed?
	if (getSetting('registration_closed', 'false') === 'true') {
		const isOwner = isOwnerUser(username, email);
		if (!isOwner) error(403, 'Registration is currently closed on this instance.');
	}

	// Invite-only?
	if (getSetting('invite_only', 'false') === 'true') {
		const req = db.prepare('SELECT status FROM access_requests WHERE email = ?').get(email) as { status: string } | undefined;
		if (req?.status !== 'approved') {
			// Auto-submit request if not already pending
			if (!req) {
				db.prepare('INSERT OR IGNORE INTO access_requests(username, email) VALUES(?, ?)').run(username, email);
			}
			error(403, JSON.stringify({ pendingRequest: true, message: 'Your access request is pending review.' }));
		}
	}

	// Max users?
	const maxUsers = parseInt(getSetting('max_users', env.MAX_USERS ?? '0'), 10);
	if (maxUsers > 0) {
		const { n } = db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
		if (n >= maxUsers) error(403, `This instance has reached its maximum of ${maxUsers} user${maxUsers === 1 ? '' : 's'}.`);
	}

	// Check uniqueness
	const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
	if (existingEmail) error(409, 'An account with that email already exists.');
	const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
	if (existingUsername) error(409, 'That username is already taken.');

	const password_hash = await bcrypt.hash(password, 12);
	const isOwner = isOwnerUser(username, email);
	const role = isOwner ? 'admin' : 'user';

	const result = db.prepare(
		'INSERT INTO users(username, email, password_hash, role) VALUES(?, ?, ?, ?)'
	).run(username, email, password_hash, role) as { lastInsertRowid: number };

	const userId = result.lastInsertRowid as number;
	const token = createSession(userId);
	cookies.set(SESSION_COOKIE, token, cookieOptions());

	return json({ id: userId, username, email, displayName: null, role, isOwner });
};
