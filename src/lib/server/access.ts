// Instance access control — owner check and ban check.
// Owner identity: OWNER_EMAILS env var (comma-separated) or role = 'admin' in DB.

import { env } from '$env/dynamic/private';

function getOwnerEmails(): Set<string> {
	const raw = env.OWNER_EMAILS ?? '';
	return new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/** True if the given username or email belongs to an instance owner. */
export function isOwnerUser(username: string, email: string): boolean {
	const owners = getOwnerEmails();
	return owners.has(email.toLowerCase()) || owners.has(username.toLowerCase());
}

/** True if the given userId has the admin role in the DB. */
export function isOwnerById(userId: number): boolean {
	try {
		const { getDb } = require('./db');
		const row = getDb().prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
		return row?.role === 'admin';
	} catch {
		return false;
	}
}

// Legacy shim — some admin routes still pass a string identifier.
// Accepts userId as a number (preferred) or checks env OWNER_EMAILS.
export function isOwner(identifier: string | number): boolean {
	if (typeof identifier === 'number') return isOwnerById(identifier);
	// Fallback: treat string as email or username
	return getOwnerEmails().has((identifier as string).toLowerCase());
}
