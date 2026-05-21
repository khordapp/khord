import type { PageServerLoad } from './$types';
import type { KhordSetlistRecord } from '$lib/atproto/lexicons/setlist';
import type { FollowedUser } from '$lib/atproto/social';

// Module-level cache — persists across requests in the Node process.
// DIDs and PDS assignments are stable; handle→DID changes only on handle rename.
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

		// 2+3 run in parallel with profile (profile only needs `did`, not the PDS)
		const profilePromise = fetch(
			`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`
		);

		// 2. Find PDS from DID document
		let pds = 'https://bsky.social';
		if (did.startsWith('did:plc:')) {
			const cachedPds = pdsCache.get(did);
			if (cachedPds) {
				pds = cachedPds;
			} else {
				const plcRes = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
				if (plcRes.ok) {
					const doc = await plcRes.json();
					const endpoint = (doc.service ?? []).find(
						(s: { id: string }) => s.id === '#atproto_pds'
					)?.serviceEndpoint;
					if (endpoint) pds = endpoint;
				}
				pdsCache.set(did, pds);
			}
		}

		// 3. Fetch the setlist record (public endpoint, no auth needed)
		const recordRes = await fetch(
			`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.khord.setlist&rkey=${encodeURIComponent(rkey)}`
		);
		if (!recordRes.ok) return { setlist: null, sharedBy: null };
		const { uri, cid, value } = await recordRes.json();

		// 4. Await profile (started in parallel with steps 2+3)
		let sharedBy: FollowedUser = { did, handle };
		const profileRes = await profilePromise;
		if (profileRes.ok) {
			const p = await profileRes.json();
			sharedBy = { did, handle: p.handle ?? handle, displayName: p.displayName, avatar: p.avatar };
		}

		return {
			setlist: { uri, cid, value: value as KhordSetlistRecord },
			sharedBy
		};
	} catch {
		return { setlist: null, sharedBy: null };
	}
};
