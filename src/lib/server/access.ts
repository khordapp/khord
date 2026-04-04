// Instance access control — ALLOWED_DIDS and MAX_USERS enforcement.
// Called server-side after a successful OAuth sign-in.

import { getDbRw } from './db';

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
	// 1. DID allowlist — no DB needed
	const allowedDids = getAllowedDids();
	if (allowedDids && !allowedDids.has(did)) {
		return { allowed: false, reason: 'This instance is restricted to specific accounts.' };
	}

	const db = getDbRw();

	// 2. MAX_USERS check — requires DB; skip gracefully if unavailable
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

	// 3. Register (upsert — idempotent on repeat sign-ins)
	db?.prepare('INSERT INTO registered_users(did) VALUES(?) ON CONFLICT(did) DO NOTHING').run(did);

	return { allowed: true };
}
