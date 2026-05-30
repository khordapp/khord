// GET    /api/admin/thumbnails — cache stats (count, size, oldest). Owner-only.
// DELETE /api/admin/thumbnails — prune { olderThanDays } (0 = all). Owner-only.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/access';
import { getCacheStats, pruneCache, pruneOrphanThumbnails } from '$lib/server/thumbnailCache';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ locals }) => {
	requireOwner(locals.user);
	return json(getCacheStats());
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	requireOwner(locals.user);
	const { olderThanDays = 0 } = await request.json();
	return json(pruneCache(Number(olderThanDays)));
};

export const POST: RequestHandler = ({ locals }) => {
	requireOwner(locals.user);
	const db = getDb();
	const rows = db.prepare('SELECT thumbnail_url FROM songs WHERE thumbnail_url IS NOT NULL').all() as { thumbnail_url: string }[];
	const urls = rows.map(r => r.thumbnail_url);
	return json(pruneOrphanThumbnails(urls));
};
