// GET  /api/admin/backup — list backup files. Owner-only.
// POST /api/admin/backup — generate a new backup. Owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/access';
import { getDb, getDbPath } from '$lib/server/db';
import { mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

function getBackupDir(): string {
	return join(dirname(getDbPath()), 'backups');
}

function ensureBackupDir(): string {
	const dir = getBackupDir();
	mkdirSync(dir, { recursive: true });
	return dir;
}

export const GET: RequestHandler = ({ locals }) => {
	requireOwner(locals.user);

	const dir = getBackupDir();
	try {
		mkdirSync(dir, { recursive: true });
	} catch { /* already exists */ }

	const files = readdirSync(dir)
		.filter(f => f.startsWith('khord-backup-') && f.endsWith('.db'))
		.map(filename => {
			const stat = statSync(join(dir, filename));
			return { filename, sizeBytes: stat.size, createdAt: stat.birthtime.toISOString() };
		})
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

	return json({ backups: files });
};

export const POST: RequestHandler = async ({ locals }) => {
	requireOwner(locals.user);

	const dir = ensureBackupDir();
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const filename = `khord-backup-${timestamp}.db`;
	const destPath = join(dir, filename);

	const db = getDb();
	await db.backup(destPath);

	const stat = statSync(destPath);
	return json({ filename, sizeBytes: stat.size, createdAt: stat.birthtime.toISOString() });
};
