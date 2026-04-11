// POST /api/admin/users/resolve-handles?did=
// Resolves AT Protocol DIDs → handles for any registered user missing one.
// Hits the public AT Protocol API sequentially to stay well within rate limits.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDbRw } from '$lib/server/db';
import { isOwner } from '$lib/server/access';

export const POST: RequestHandler = async ({ url }) => {
	const did = url.searchParams.get('did') ?? '';
	if (!isOwner(did)) error(403, 'Forbidden');

	const db = getDbRw();
	if (!db) error(503, 'Database unavailable');

	// Find all registered users with no handle in actors
	const rows = db.prepare(`
		SELECT r.did FROM registered_users r
		LEFT JOIN actors a ON a.did = r.did
		WHERE a.handle IS NULL OR a.handle = ''
	`).all() as { did: string }[];

	let resolved = 0;
	let failed = 0;

	for (const row of rows) {
		try {
			const res = await fetch(
				`https://public.api.bsky.app/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(row.did)}`
			);
			if (!res.ok) { failed++; continue; }
			const data = await res.json();
			const handle: string | undefined = data.handle;
			if (!handle || handle === 'handle.invalid') { failed++; continue; }

			db.prepare(`
				INSERT INTO actors(did, handle) VALUES(?, ?)
				ON CONFLICT(did) DO UPDATE SET handle = excluded.handle
			`).run(row.did, handle);
			resolved++;
		} catch {
			failed++;
		}
	}

	return json({ resolved, failed, total: rows.length });
};
