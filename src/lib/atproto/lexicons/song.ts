export const SONG_NSID = 'app.khord.song';

export interface KhordSongRecord {
	isrc?: string;
	title: string;
	artist: string;
	album?: string;
	odesliKey?: string;
	thumbnailUrl?: string;
	spotifyUrl?: string;
	appleMusicUrl?: string;
	youtubeMusicUrl?: string;
	deezerUrl?: string;
	tidalUrl?: string;
	amazonMusicUrl?: string;
	soundcloudUrl?: string;
	songlinkUrl?: string;
	note?: string;
	listed?: boolean;
	createdAt: string;
}

export interface KhordSong {
	uri: string;
	cid: string;
	value: KhordSongRecord;
}
