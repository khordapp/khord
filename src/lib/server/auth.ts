// Server-side session management — token stored in cookie, resolved against sessions table.

import { randomBytes } from 'crypto';
import { getDb } from './db';

export const SESSION_COOKIE = 'khord_session';
const SESSION_DAYS = 30;

export interface SessionUser {
	id: number;
	username: string;
	email: string;
	displayName: string | null;
	role: string;
	hasAvatar: boolean;
}

export function createSession(userId: number): string {
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000).toISOString();
	getDb().prepare(
		'INSERT INTO sessions(token, user_id, expires_at) VALUES(?, ?, ?)'
	).run(token, userId, expiresAt);
	return token;
}

export function getSession(token: string): SessionUser | null {
	const row = getDb().prepare(`
		SELECT u.id, u.username, u.email, u.display_name, u.role,
		       (u.avatar IS NOT NULL) AS has_avatar
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
	`).get(token) as { id: number; username: string; email: string; display_name: string | null; role: string; has_avatar: number } | undefined;

	if (!row) return null;
	return { id: row.id, username: row.username, email: row.email, displayName: row.display_name, role: row.role, hasAvatar: row.has_avatar === 1 };
}

export function deleteSession(token: string): void {
	getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function purgeExpiredSessions(): void {
	getDb().prepare("DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')").run();
}

export function cookieOptions(maxAge = SESSION_DAYS * 86400) {
	return {
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: process.env.NODE_ENV === 'production',
		maxAge,
		path: '/'
	};
}
