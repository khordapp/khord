export const SETLIST_NSID = 'app.khord.setlist';

export interface KhordSetlistItemSnapshot {
	title: string;
	artist: string;
	album?: string;
	thumbnailUrl?: string;
	spotifyUrl?: string;
	appleMusicUrl?: string;
	youtubeMusicUrl?: string;
	tidalUrl?: string;
	deezerUrl?: string;
	amazonMusicUrl?: string;
	soundcloudUrl?: string;
	songlinkUrl?: string;
}

export interface KhordSetlistItem {
	songUri: string;
	songCid: string;
	addedBy: string;
	addedAt: string;
	snapshot?: KhordSetlistItemSnapshot;
}

export interface KhordSetlistRecord {
	title: string;
	description?: string;
	items: KhordSetlistItem[];
	collaborators?: string[];
	open?: boolean;
	instanceUrl?: string;
	createdAt: string;
}

export interface KhordSetlist {
	uri: string;
	cid: string;
	value: KhordSetlistRecord;
}
