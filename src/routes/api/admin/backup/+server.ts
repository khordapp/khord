// GET  /api/admin/backup — list backup files. Owner-only.
// POST /api/admin/backup — generate a new backup (gzipped). Owner-only.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/access';
import { getDb, getDbPath } from '$lib/server/db';
import { mkdirSync, readdirSync, statSync, unlinkSync, createReadStream, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

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
		.filter(f => f.startsWith('khord-backup-') && f.endsWith('.db.gz'))
		.map(filename => {
			const stat = statSync(join(dir, filename));
			return { filename, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
		})
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

	return json({ backups: files });
};

export const POST: RequestHandler = async ({ locals }) => {
	requireOwner(locals.user);

	const dir = ensureBackupDir();
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const rawPath = join(dir, `khord-backup-${timestamp}.db`);
	const gzPath  = join(dir, `khord-backup-${timestamp}.db.gz`);

	const db = getDb();
	await db.backup(rawPath);

	await pipeline(createReadStream(rawPath), createGzip(), createWriteStream(gzPath));
	unlinkSync(rawPath);

	const stat = statSync(gzPath);
	const filename = `khord-backup-${timestamp}.db.gz`;
	return json({ filename, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() });
};
