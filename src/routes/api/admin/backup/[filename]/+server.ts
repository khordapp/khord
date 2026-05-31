// GET    /api/admin/backup/[filename] — download a backup file. Owner-only.
// DELETE /api/admin/backup/[filename] — delete a backup file. Owner-only.

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/access';
import { getDbPath } from '$lib/server/db';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import { join, dirname, basename } from 'path';
import { Readable } from 'stream';

function resolveBackupPath(filename: string): string {
	const safe = basename(filename);
	if (!safe.startsWith('khord-backup-') || !safe.endsWith('.db.gz') || safe.includes('/') || safe.includes('..')) {
		throw new Error('Invalid filename');
	}
	return join(dirname(getDbPath()), 'backups', safe);
}

export const GET: RequestHandler = ({ params, locals }) => {
	requireOwner(locals.user);

	let filePath: string;
	try {
		filePath = resolveBackupPath(params.filename);
	} catch {
		error(400, 'Invalid filename');
	}

	if (!existsSync(filePath)) error(404, 'Backup not found');

	const nodeStream = createReadStream(filePath);
	const webStream = Readable.toWeb(nodeStream) as ReadableStream;

	return new Response(webStream, {
		headers: {
			'Content-Type': 'application/gzip',
			'Content-Disposition': `attachment; filename="${params.filename}"`,
		},
	});
};

export const DELETE: RequestHandler = ({ params, locals }) => {
	requireOwner(locals.user);

	let filePath: string;
	try {
		filePath = resolveBackupPath(params.filename);
	} catch {
		error(400, 'Invalid filename');
	}

	if (!existsSync(filePath)) error(404, 'Backup not found');

	unlinkSync(filePath);
	return new Response(null, { status: 204 });
};
