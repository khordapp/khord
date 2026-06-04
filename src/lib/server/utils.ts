import { error } from '@sveltejs/kit';

// ── DB row interfaces ─────────────────────────────────────────────────────────

export interface SongRow {
	id: number;
	user_id: number;
	title: string;
	artist: string;
	album: string | null;
	thumbnail_url: string | null;
	spotify_url: string | null;
	apple_music_url: string | null;
	youtube_music_url: string | null;
	deezer_url: string | null;
	tidal_url: string | null;
	amazon_music_url: string | null;
	soundcloud_url: string | null;
	note: string | null;
	listed: number;
	created_at: string;
	updated_at: string;
	urls_resolved_at: string | null;
}

export interface SetlistRow {
	id: number;
	user_id: number;
	title: string;
	description: string | null;
	open: number;
	tags: string;
	created_at: string;
	updated_at: string;
	// joined fields
	username?: string;
	display_name?: string | null;
}

export interface SetlistItemRow {
	id: number;
	setlist_id: number;
	song_id: number | null;
	position: number;
	snapshot: string | null;
	added_at: string;
	added_by_user_id: number | null;
	adder_username?: string | null;
	// joined song fields (prefixed or not)
	title?: string;
	artist?: string;
	album?: string | null;
	thumbnail_url?: string | null;
	spotify_url?: string | null;
	apple_music_url?: string | null;
	youtube_music_url?: string | null;
	deezer_url?: string | null;
	tidal_url?: string | null;
	amazon_music_url?: string | null;
	soundcloud_url?: string | null;
	note?: string | null;
	song_created_at?: string;
}

export interface ProposalRow {
	id: number;
	setlist_id: number;
	proposer_user_id: number;
	snapshot: string;
	note: string | null;
	status: string;
	created_at: string;
	setlist_owner_id?: number;
	// joined user fields
	username?: string;
	display_name?: string | null;
}

export interface UserRow {
	id: number;
	username: string;
	email: string;
	display_name: string | null;
	role: string;
	created_at: string;
}

/** Parse a route param as a positive integer, throwing 400 if invalid. */
export function getParamId(param: string | undefined): number {
	const id = param ? parseInt(param, 10) : 0;
	if (!id || isNaN(id)) error(400, 'Invalid id');
	return id;
}

/** Map a songs DB row to the standard record shape used in API responses. */
export function mapSongRecord(r: Record<string, any>) {
	return {
		title:           r.title,
		artist:          r.artist,
		album:           r.album           ?? undefined,
		thumbnailUrl:    r.thumbnail_url   ?? undefined,
		spotifyUrl:      r.spotify_url     ?? undefined,
		appleMusicUrl:   r.apple_music_url ?? undefined,
		youtubeMusicUrl: r.youtube_music_url ?? undefined,
		deezerUrl:       r.deezer_url      ?? undefined,
		tidalUrl:        r.tidal_url       ?? undefined,
		amazonMusicUrl:  r.amazon_music_url ?? undefined,
		soundcloudUrl:   r.soundcloud_url  ?? undefined,
		note:            r.note            ?? undefined,
		createdAt:       r.created_at ?? r.song_created_at,
	};
}
