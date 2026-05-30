// Instance access control — owner check and ban check.
// Owner identity: OWNER_EMAILS env var (comma-separated) or role = 'admin' in DB.

import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { SessionUser } from './auth';

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

/** Throws 403 unless the user is an instance owner. Returns the user for chaining. */
export function requireOwner(user: SessionUser | null | undefined): SessionUser {
	if (!user || !isOwnerUser(user.username, user.email)) error(403, 'Forbidden');
	return user;
}

// Legacy shim — some admin routes still pass a string identifier.
// Accepts userId as a number (preferred) or checks env OWNER_EMAILS.
export function isOwner(identifier: string | number): boolean {
	if (typeof identifier === 'number') return isOwnerById(identifier);
	// Fallback: treat string as email or username
	return getOwnerEmails().has((identifier as string).toLowerCase());
}
