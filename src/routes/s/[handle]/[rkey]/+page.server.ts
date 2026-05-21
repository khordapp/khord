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

		// 2. Find PDS from DID document
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

		// 3. Fetch the setlist record (public endpoint, no auth needed)
		const recordRes = await fetch(
			`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.khord.setlist&rkey=${encodeURIComponent(rkey)}`
		);
		if (!recordRes.ok) return { setlist: null, sharedBy: null };
		const { uri, cid, value } = await recordRes.json();

		// 4. Fetch public profile for display name + avatar
		let sharedBy: FollowedUser = { did, handle };
		const profileRes = await fetch(
			`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`
		);
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
