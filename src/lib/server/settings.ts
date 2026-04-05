// Dynamic instance settings — stored in SQLite, override env var defaults.
// Table is created on first use so existing deployments don't need a migration step.

import { getDbRw } from './db';

const CREATE_TABLE = `
	CREATE TABLE IF NOT EXISTS instance_settings (
		key        TEXT PRIMARY KEY,
		value      TEXT NOT NULL,
		updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
	)
`;

function ensureTable() {
	getDbRw()?.exec(CREATE_TABLE);
}

/** Read a single setting. Returns defaultValue when DB is unavailable or key is unset. */
export function getSetting(key: string, defaultValue: string): string {
	const db = getDbRw();
	if (!db) return defaultValue;
	try {
		ensureTable();
		const row = db.prepare('SELECT value FROM instance_settings WHERE key = ?').get(key) as
			| { value: string }
			| undefined;
		return row?.value ?? defaultValue;
	} catch {
		return defaultValue;
	}
}

/** Write a single setting. No-op when DB is unavailable. */
export function setSetting(key: string, value: string): void {
	const db = getDbRw();
	if (!db) return;
	ensureTable();
	db.prepare(
		`INSERT INTO instance_settings(key, value) VALUES(?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value,
		   updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
	).run(key, value);
}

/** Read all settings as a plain object. */
export function getAllSettings(): Record<string, string> {
	const db = getDbRw();
	if (!db) return {};
	try {
		ensureTable();
		const rows = db.prepare('SELECT key, value FROM instance_settings').all() as {
			key: string;
			value: string;
		}[];
		return Object.fromEntries(rows.map((r) => [r.key, r.value]));
	} catch {
		return {};
	}
}
