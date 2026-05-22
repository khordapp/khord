import type { PageServerLoad } from './$types';
import type { KhordSetlistRecord } from '$lib/atproto/lexicons/setlist';
import type { FollowedUser } from '$lib/atproto/social';
import { env } from '$env/dynamic/public';

// Module-level cache — persists across requests in the Node process.
interface CacheEntry<T> { value: T; expiresAt: number }

function makeCache<T>(ttlMs: number) {
	const map = new Map<string, CacheEntry<T>>();
	return {
		get(key: string): T | undefined {
			const e = map.get(key);
			if (!e) return undefined;
			if (Date.now() > e.expiresAt) { map.delete(key); return undefined; }
			return e.value;
		},
		set(key: string, value: T) {
			map.set(key, { value, expiresAt: Date.now() + ttlMs });
		}
	};
}

const didCache = makeCache<string>(5 * 60 * 1000);   // handle → DID, 5 min
const pdsCache = makeCache<string>(30 * 60 * 1000);  // DID → PDS, 30 min

async function resolvePdsViaPLC(did: string, fetchFn: typeof fetch): Promise<string | null> {
	const cached = pdsCache.get(did);
	if (cached) return cached;
	try {
		const res = await fetchFn(`https://plc.directory/${encodeURIComponent(did)}`);
		if (!res.ok) return null;
		const doc = await res.json();
		const endpoint = (doc.service ?? []).find(
			(s: { id: string }) => s.id === '#atproto_pds'
		)?.serviceEndpoint;
		if (endpoint) {
			pdsCache.set(did, endpoint);
			return endpoint;
		}
	} catch { /* non-fatal */ }
	return null;
}

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { handle, rkey } = params;

	try {
		// 1. Resolve handle → DID (skip if param is already a DID)
		let did: string;
		if (handle.startsWith('did:')) {
			did = handle;
		} else {
			const cached = didCache.get(handle);
			if (cached) {
				did = cached;
			} else {
				const resolveRes = await fetch(
					`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
				);
				if (!resolveRes.ok) return { setlist: null, sharedBy: null };
				did = (await resolveRes.json()).did;
				didCache.set(handle, did);
			}
		}

		// Profile only needed for handle-based URLs (external share links / OG tags).
		// DID-based URLs are in-app navigation — no crawler, OG tags irrelevant.
		const profilePromise = handle.startsWith('did:')
			? null
			: fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);

		// 2. Try configured PDS directly — all instance users share one PDS.
		// Fall back to PLC only if getRecord fails (rare: third-party PDS users).
		const configuredPds = (env.PUBLIC_ATP_PDS_URL ?? 'https://bsky.social').replace(/\/$/, '');
		let recordRes = await fetch(
			`${configuredPds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.khord.setlist&rkey=${encodeURIComponent(rkey)}`
		);
		if (!recordRes.ok) {
			const fallbackPds = await resolvePdsViaPLC(did, fetch);
			if (fallbackPds && fallbackPds !== configuredPds) {
				recordRes = await fetch(
					`${fallbackPds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.khord.setlist&rkey=${encodeURIComponent(rkey)}`
				);
			}
			if (!recordRes.ok) return { setlist: null, sharedBy: null };
		}
		const { uri, cid, value } = await recordRes.json();

		// 3. Await profile if fetched (handle-based URLs only)
		let sharedBy: FollowedUser = { did, handle: handle.startsWith('did:') ? '' : handle };
		const profileRes = profilePromise ? await profilePromise : null;
		if (profileRes?.ok) {
			const p = await profileRes.json();
			sharedBy = { did, handle: p.handle ?? sharedBy.handle, displayName: p.displayName, avatar: p.avatar };
		}

		return {
			setlist: { uri, cid, value: value as KhordSetlistRecord },
			sharedBy
		};
	} catch {
		return { setlist: null, sharedBy: null };
	}
};
