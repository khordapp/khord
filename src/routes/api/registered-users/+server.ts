// GET /api/registered-users
// Returns all registered users with their handle/display info from the actors table.
// Used by the All Songs tab as a fallback when the AppView DB has no indexed songs.
// Requires an active session (did= query param).

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ url }) => {
	const did = url.searchParams.get('did') ?? '';
	if (!did) error(401, 'Unauthorized');

	const db = getDb();
	if (!db) error(503, 'DB unavailable');

	const rows = db.prepare(`
		SELECT r.did, a.handle, a.display_name, a.avatar
		FROM registered_users r
		LEFT JOIN actors a ON a.did = r.did
	`).all() as { did: string; handle: string | null; display_name: string | null; avatar: string | null }[];

	return json({
		users: rows.map((r) => ({
			did: r.did,
			handle: r.handle ?? r.did,
			displayName: r.display_name ?? undefined,
			avatar: r.avatar ?? undefined,
		})),
	});
};
