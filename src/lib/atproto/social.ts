import { getAgent } from './agent';
import { SONG_NSID, type KhordSongRecord, type KhordSong } from './lexicons/song';
import { SETLIST_NSID, type KhordSetlistRecord, type KhordSetlist, type KhordSetlistItem } from './lexicons/setlist';

export interface FollowedUser {
	did: string;
	handle: string;
	displayName?: string;
	avatar?: string;
}

export async function getFollowing(did: string): Promise<FollowedUser[]> {
	const results: FollowedUser[] = [];
	let cursor: string | undefined;

	do {
		const res = await getAgent().getFollows({ actor: did, limit: 100, cursor });
		for (const f of res.data.follows) {
			results.push({
				did: f.did,
				handle: f.handle,
				displayName: f.displayName,
				avatar: f.avatar
			});
		}
		cursor = res.data.cursor;
	} while (cursor);

	return results;
}

export async function fetchSongs(did: string, limit = 10): Promise<KhordSong[]> {
	const res = await getAgent().com.atproto.repo.listRecords({
		repo: did,
		collection: SONG_NSID,
		limit
	});
	return res.data.records.map((r) => ({
		uri: r.uri,
		cid: r.cid,
		value: r.value as KhordSongRecord
	}));
}

export async function fetchSetlists(did: string): Promise<KhordSetlist[]> {
	const res = await getAgent().com.atproto.repo.listRecords({
		repo: did,
		collection: SETLIST_NSID,
		limit: 100
	});
	return res.data.records.map((r) => ({
		uri: r.uri,
		cid: r.cid,
		value: r.value as KhordSetlistRecord
	}));
}

export async function fetchSetlist(did: string, rkey: string): Promise<KhordSetlist> {
	const res = await getAgent().com.atproto.repo.getRecord({
		repo: did,
		collection: SETLIST_NSID,
		rkey
	});
	return { uri: res.data.uri, cid: res.data.cid ?? '', value: res.data.value as KhordSetlistRecord };
}

export async function createSetlist(
	did: string,
	title: string,
	items: KhordSetlistItem[]
): Promise<{ uri: string; cid: string }> {
	const res = await getAgent().com.atproto.repo.createRecord({
		repo: did,
		collection: SETLIST_NSID,
		record: {
			$type: SETLIST_NSID,
			title,
			items,
			collaborators: [],
			open: false,
			createdAt: new Date().toISOString()
		}
	});
	return { uri: res.data.uri, cid: res.data.cid };
}

export async function updateSetlist(
	did: string,
	rkey: string,
	record: KhordSetlistRecord
): Promise<void> {
	await getAgent().com.atproto.repo.putRecord({
		repo: did,
		collection: SETLIST_NSID,
		rkey,
		record: { $type: SETLIST_NSID, ...record }
	});
}

export async function deleteSetlist(did: string, rkey: string): Promise<void> {
	await getAgent().com.atproto.repo.deleteRecord({
		repo: did,
		collection: SETLIST_NSID,
		rkey
	});
}
