// Instance access control — BANNED_DIDS, ALLOWED_DIDS, and MAX_USERS enforcement.
// Called server-side after a successful OAuth sign-in.

import { getDbRw } from './db';

export function isOwner(did: string): boolean {
	const raw = process.env.OWNER_DIDS ?? '';
	const dids = raw.split(',').map((d) => d.trim()).filter(Boolean);
	return dids.includes(did);
}

function getBannedDids(): Set<string> {
	const raw = process.env.BANNED_DIDS ?? '';
	const dids = raw.split(',').map((d) => d.trim()).filter(Boolean);
	return new Set(dids);
}

function getAllowedDids(): Set<string> | null {
	const raw = process.env.ALLOWED_DIDS ?? '';
	const dids = raw.split(',').map((d) => d.trim()).filter(Boolean);
	return dids.length > 0 ? new Set(dids) : null; // null = allow anyone
}

function getMaxUsers(): number {
	const raw = process.env.MAX_USERS ?? '0';
	const n = parseInt(raw, 10);
	return isNaN(n) ? 0 : n; // 0 = unlimited
}

export type AccessResult =
	| { allowed: true }
	| { allowed: false; reason: string };

export function checkAndRegister(did: string): AccessResult {
	// 1. Ban check — env var (no DB needed)
	if (getBannedDids().has(did)) {
		return { allowed: false, reason: 'Your account has been removed from this instance.' };
	}

	const db = getDbRw();

	// 2. Ban check — DB (dynamic bans without restart)
	if (db) {
		const banned = db.prepare('SELECT 1 FROM banned_users WHERE did = ?').get(did);
		if (banned) {
			return { allowed: false, reason: 'Your account has been removed from this instance.' };
		}
	}

	// 3. DID allowlist — no DB needed
	const allowedDids = getAllowedDids();
	if (allowedDids && !allowedDids.has(did)) {
		return { allowed: false, reason: 'This instance is restricted to specific accounts.' };
	}

	// 4. MAX_USERS check — requires DB; skip gracefully if unavailable
	const maxUsers = getMaxUsers();
	if (db && maxUsers > 0) {
		const already = db.prepare('SELECT 1 FROM registered_users WHERE did = ?').get(did);
		if (!already) {
			const { n } = db.prepare('SELECT COUNT(*) as n FROM registered_users').get() as { n: number };
			if (n >= maxUsers) {
				return {
					allowed: false,
					reason: `This instance has reached its maximum of ${maxUsers} user${maxUsers === 1 ? '' : 's'}.`
				};
			}
		}
	}

	// 5. Register (upsert — idempotent on repeat sign-ins)
	db?.prepare('INSERT INTO registered_users(did) VALUES(?) ON CONFLICT(did) DO NOTHING').run(did);

	return { allowed: true };
}
