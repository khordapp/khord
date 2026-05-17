// Server-side SQLite connections — only available in server routes, never the browser.
// Returns null when the DB file doesn't exist (dev without indexer running).
// The app gracefully falls back to direct PDS fetching when null.

import { building } from '$app/environment';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let _ro: import('better-sqlite3').Database | null = null; // read-only (feed/votes queries)
let _rw: import('better-sqlite3').Database | null = null; // read-write (registration)
let _tried = false;

function open(path: string, readonly: boolean): import('better-sqlite3').Database | null {
	try {
		const Database = require('better-sqlite3') as typeof import('better-sqlite3');
		const db = new Database(path, { readonly });
		db.pragma('journal_mode = WAL');
		return db;
	} catch (e) {
		if (!readonly) {
			// rw open also fails if file doesn't exist yet — not fatal
		}
		return null;
	}
}

function init() {
	if (building || _tried) return;
	_tried = true;
	const dbName = process.env.INDEXER_DB_NAME;
	const path = dbName ? `/data/${dbName}` : (process.env.INDEXER_DB_PATH ?? './data/khord.db');
	_ro = open(path, true);
	_rw = open(path, false);
	if (_ro) console.log('[db] connected to', path);
	else console.log('[db] not available, falling back to PDS fetch');
}

// Read-only connection — for feed and vote queries.
export function getDb(): import('better-sqlite3').Database | null {
	init();
	return _ro;
}

// Read-write connection — for registration only.
export function getDbRw(): import('better-sqlite3').Database | null {
	init();
	return _rw;
}
