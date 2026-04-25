// GET  /api/admin/thumbnails?did=   — cache stats (count, size, oldest)
// DELETE /api/admin/thumbnails       — prune { ownerDid, olderThanDays } (0 = all)

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isOwner } from '$lib/server/access';
import { getCacheStats, pruneCache } from '$lib/server/thumbnailCache';

export const GET: RequestHandler = ({ url }) => {
	const did = url.searchParams.get('did') ?? '';
	if (!isOwner(did)) error(403, 'Forbidden');
	return json(getCacheStats());
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { ownerDid, olderThanDays = 0 } = await request.json();
	if (!isOwner(ownerDid)) error(403, 'Forbidden');
	const result = pruneCache(Number(olderThanDays));
	return json(result);
};
