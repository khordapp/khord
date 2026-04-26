// Instance access control — BANNED_DIDS, ALLOWED_DIDS, and MAX_USERS enforcement.
// Called server-side after a successful OAuth sign-in.

import { env } from '$env/dynamic/private';
import { getDbRw } from './db';
import { getSetting } from './settings';

export function isOwner(did: string): boolean {
	const raw = env.OWNER_DIDS ?? '';
	const dids = raw.split(',').map((d) => d.trim()).filter(Boolean);
	return dids.includes(did);
}

function getBannedDids(): Set<string> {
	const raw = env.BANNED_DIDS ?? '';
	const dids = raw.split(',').map((d) => d.trim()).filter(Boolean);
	return new Set(dids);
}

function getAllowedDids(): Set<string> | null {
	const raw = env.ALLOWED_DIDS ?? '';
	const dids = raw.split(',').map((d) => d.trim()).filter(Boolean);
	return dids.length > 0 ? new Set(dids) : null; // null = allow anyone
}

function getMaxUsers(): number {
	// DB setting takes precedence over env var
	const raw = getSetting('max_users', env.MAX_USERS ?? '0');
	const n = parseInt(raw, 10);
	return isNaN(n) ? 0 : n; // 0 = unlimited
}

function isRegistrationClosed(): boolean {
	return getSetting('registration_closed', 'false') === 'true';
}

function isInviteOnly(): boolean {
	return getSetting('invite_only', 'false') === 'true';
}

function ensureAccessRequestsTable(db: import('better-sqlite3').Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS access_requests (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			handle       TEXT NOT NULL,
			did          TEXT NOT NULL UNIQUE,
			status       TEXT NOT NULL DEFAULT 'pending',
			requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
			reviewed_at  TEXT
		)
	`);
}

export type AccessResult =
	| { allowed: true }
	| { allowed: false; reason: string; pendingRequest?: boolean };

export function checkAndRegister(did: string, handle: string | null = null): AccessResult {
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

	// 3b. Registration closed — block new users only; existing registered users pass through
	if (db && isRegistrationClosed()) {
		const already = db.prepare('SELECT 1 FROM registered_users WHERE did = ?').get(did);
		if (!already) {
			return { allowed: false, reason: 'Registration is currently closed on this instance.' };
		}
	}

	// 3c. Invite-only — new users must have an approved access request
	if (db && isInviteOnly()) {
		const already = db.prepare('SELECT 1 FROM registered_users WHERE did = ?').get(did);
		if (!already) {
			ensureAccessRequestsTable(db);
			const request = db
				.prepare('SELECT status FROM access_requests WHERE did = ?')
				.get(did) as { status: string } | undefined;

			if (request?.status === 'approved') {
				// Approved — fall through to register below
			} else if (request?.status === 'declined') {
				return { allowed: false, reason: 'Your access request was not approved.' };
			} else {
				// No request or previously unknown state — auto-submit
				if (!request) {
					db.prepare('INSERT OR IGNORE INTO access_requests(handle, did) VALUES(?, ?)').run(
						handle ?? '',
						did
					);
				} else if (handle) {
					// Keep handle fresh for pending requests
					db.prepare('UPDATE access_requests SET handle = ? WHERE did = ? AND status = ?').run(
						handle,
						did,
						'pending'
					);
				}
				return {
					allowed: false,
					reason: 'Your access request is pending admin review.',
					pendingRequest: true
				};
			}
		}
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

	// 6. Seed actors table with handle so admin panel shows it before the indexer catches up
	if (db && handle) {
		db.prepare(`INSERT INTO actors(did, handle) VALUES(?, ?)
			ON CONFLICT(did) DO UPDATE SET handle = excluded.handle WHERE excluded.handle IS NOT NULL`
		).run(did, handle);
	}

	return { allowed: true };
}
