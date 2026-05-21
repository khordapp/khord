import type { PageServerLoad } from './$types';
import type { KhordSetlistRecord } from '$lib/atproto/lexicons/setlist';
import type { FollowedUser } from '$lib/atproto/social';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { handle, rkey } = params;

	try {
		// 1. Resolve handle → DID (skip if param is already a DID)
		let did: string;
		if (handle.startsWith('did:')) {
			did = handle;
		} else {
			const resolveRes = await fetch(
				`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
			);
			if (!resolveRes.ok) return { setlist: null, sharedBy: null };
			did = (await resolveRes.json()).did;
		}

		// 2+3 run in parallel with 4: PLC lookup → PDS → record, and profile fetch
		// both only need the DID so they can start at the same time.
		const [recordRes, profileRes] = await Promise.all([
			// PLC directory → PDS URL → setlist record (sequential chain)
			(async () => {
				let pds = 'https://bsky.social';
				if (did.startsWith('did:plc:')) {
					const plcRes = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
					if (plcRes.ok) {
						const doc = await plcRes.json();
						const endpoint = (doc.service ?? []).find(
							(s: { id: string }) => s.id === '#atproto_pds'
						)?.serviceEndpoint;
						if (endpoint) pds = endpoint;
					}
				}
				return fetch(
					`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.khord.setlist&rkey=${encodeURIComponent(rkey)}`
				);
			})(),
			// Public profile for display name + avatar
			fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`)
		]);

		if (!recordRes.ok) return { setlist: null, sharedBy: null };
		const { uri, cid, value } = await recordRes.json();

		let sharedBy: FollowedUser = { did, handle };
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
