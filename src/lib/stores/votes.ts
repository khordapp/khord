import { writable, get } from 'svelte/store';
import { getAgent } from '$lib/atproto/agent';
import { VOTE_NSID, type KhordVoteRecord } from '$lib/atproto/lexicons/vote';

// Maps song URI → vote record rkey for the current user's upvotes
const _map = writable<Map<string, string>>(new Map());

export const votes = {
	subscribe: _map.subscribe,

	async load(did: string) {
		// Always load from PDS — we need the vote rkeys to support unlike.
		// The AppView /api/votes endpoint is used for display-only vote counts
		// in future, but rkey resolution requires the user's own PDS.
		const res = await getAgent().com.atproto.repo.listRecords({
			repo: did,
			collection: VOTE_NSID,
			limit: 100
		});
		const map = new Map<string, string>();
		for (const r of res.data.records) {
			const v = r.value as KhordVoteRecord;
			if (v.direction === 'up') {
				map.set(v.subject.uri, r.uri.split('/').pop()!);
			}
		}
		_map.set(map);
	},

	async like(did: string, songUri: string, songCid: string) {
		const res = await getAgent().com.atproto.repo.createRecord({
			repo: did,
			collection: VOTE_NSID,
			record: {
				$type: VOTE_NSID,
				subject: { uri: songUri, cid: songCid },
				direction: 'up',
				createdAt: new Date().toISOString()
			}
		});
		const rkey = res.data.uri.split('/').pop()!;
		_map.update((m) => new Map(m).set(songUri, rkey));
	},

	async unlike(did: string, songUri: string) {
		const rkey = get(_map).get(songUri);
		if (!rkey) return;
		await getAgent().com.atproto.repo.deleteRecord({
			repo: did,
			collection: VOTE_NSID,
			rkey
		});
		_map.update((m) => {
			const next = new Map(m);
			next.delete(songUri);
			return next;
		});
	},

	reset() {
		_map.set(new Map());
	}
};
