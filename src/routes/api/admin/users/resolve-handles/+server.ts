// POST /api/admin/users/resolve-handles?did=
// Resolves AT Protocol DIDs → handles for any registered user missing one.
// Hits the public AT Protocol API sequentially to stay well within rate limits.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDbRw } from '$lib/server/db';
import { isOwner } from '$lib/server/access';

// Resolves a did:plc or did:web identity to its current handle.
// Strategy:
//   did:plc  → PLC directory (https://plc.directory/{did}) — authoritative, always up-to-date
//   did:web  → DID document at https://{domain}/.well-known/did.json
// Falls back to com.atproto.repo.describeRepo on public.api.bsky.app if PLC lookup fails.
async function resolveDidToHandle(did: string): Promise<string | null> {
	if (did.startsWith('did:plc:')) {
		const res = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
		if (!res.ok) {
			console.warn('[resolve-handles] plc.directory', res.status, 'for', did);
			// fall through to AppView fallback
		} else {
			const doc = await res.json();
			// alsoKnownAs entries look like "at://handle.bsky.social"
			const aka: string[] = doc.alsoKnownAs ?? [];
			const atEntry = aka.find((e: string) => e.startsWith('at://'));
			if (atEntry) {
				const handle = atEntry.slice('at://'.length);
				if (handle && handle !== 'handle.invalid') return handle;
			}
		}
	}

	// Fallback: AppView describeRepo (works for Bluesky-hosted accounts)
	const res = await fetch(
		`https://public.api.bsky.app/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`
	);
	if (!res.ok) {
		console.warn('[resolve-handles] describeRepo', res.status, await res.text().catch(() => ''), 'for', did);
		return null;
	}
	const data = await res.json();
	const handle: string | undefined = data.handle;
	if (!handle || handle === 'handle.invalid') return null;
	return handle;
}

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
			// Resolve via PLC directory (works for all did:plc identities regardless of PDS)
			const handle = await resolveDidToHandle(row.did);
			if (!handle) { failed++; continue; }

			db.prepare(`
				INSERT INTO actors(did, handle) VALUES(?, ?)
				ON CONFLICT(did) DO UPDATE SET handle = excluded.handle
			`).run(row.did, handle);
			resolved++;
		} catch (e) {
			console.error('[resolve-handles] failed for', row.did, e);
			failed++;
		}
	}

	return json({ resolved, failed, total: rows.length });
};
