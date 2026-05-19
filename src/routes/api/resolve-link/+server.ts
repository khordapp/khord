import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchSpotifyTrack, fetchSpotifyPlaylist } from '$lib/server/spotify';
import { fetchAppleMusicPlaylist } from '$lib/server/apple';
import { getSetting } from '$lib/server/settings';
import { env } from '$env/dynamic/private';
import type { TrackResult } from '$lib/search';

export interface PlaylistTrack {
	title: string;
	artist: string;
	album?: string;
	artworkUrl?: string;
	sourceUrl: string;
}

export interface PlaylistData {
	title: string;
	tracks: PlaylistTrack[];
}

type Detected =
	| { type: 'track'; platform: string; id: string }
	| { type: 'playlist'; platform: string; id: string; storefront?: string }
	| null;

function detect(raw: string): Detected {
	let u: URL;
	try { u = new URL(raw); } catch { return null; }
	const host = u.hostname.replace(/^www\./, '');

	if (host === 'open.spotify.com') {
		const track = u.pathname.match(/^\/track\/([A-Za-z0-9]+)/);
		if (track) return { type: 'track', platform: 'spotify', id: track[1] };
		const playlist = u.pathname.match(/^\/playlist\/([A-Za-z0-9]+)/);
		if (playlist) return { type: 'playlist', platform: 'spotify', id: playlist[1] };
	}

	if (host === 'music.apple.com') {
		const qi = u.searchParams.get('i');
		if (qi && /^\d+$/.test(qi)) return { type: 'track', platform: 'apple', id: qi };
		const parts = u.pathname.split('/').filter(Boolean);
		if (parts.includes('song')) {
			const id = parts[parts.length - 1];
			if (/^\d+$/.test(id)) return { type: 'track', platform: 'apple', id };
		}
		// Apple Music playlists: /{storefront}/playlist/{name}/{id} — id starts with "pl."
		if (parts.includes('playlist')) {
			const playlistIdx = parts.indexOf('playlist');
			const id = parts[parts.length - 1];
			const storefront = playlistIdx > 0 ? parts[playlistIdx - 1] : 'us';
			if (id?.startsWith('pl.')) return { type: 'playlist', platform: 'apple', id, storefront };
		}
	}

	if (host === 'deezer.com') {
		const track = u.pathname.match(/\/track\/(\d+)/);
		if (track) return { type: 'track', platform: 'deezer', id: track[1] };
		const playlist = u.pathname.match(/\/playlist\/(\d+)/);
		if (playlist) return { type: 'playlist', platform: 'deezer', id: playlist[1] };
	}

	if (host === 'music.youtube.com' || host === 'youtube.com') {
		const v = u.searchParams.get('v');
		if (v) return { type: 'track', platform: 'youtube', id: v };
		const list = u.searchParams.get('list');
		if (list) return { type: 'playlist', platform: 'youtube', id: list };
	}

	if (host === 'youtu.be') {
		const id = u.pathname.slice(1).split('?')[0];
		if (id) return { type: 'track', platform: 'youtube', id };
	}

	return null;
}

// ── Track metadata fetchers ───────────────────────────────────────────────────

async function metaFromSpotify(id: string): Promise<TrackResult | null> {
	const track = await fetchSpotifyTrack(id);
	if (!track) return null;
	return { ...track, spotifyUrl: `https://open.spotify.com/track/${id}` };
}

async function metaFromApple(id: string): Promise<TrackResult | null> {
	try {
		const res = await fetch(`https://itunes.apple.com/lookup?id=${id}&entity=song`);
		if (!res.ok) return null;
		const data = await res.json();
		const item = (data.results ?? []).find((r: { wrapperType?: string; kind?: string }) =>
			r.wrapperType === 'track' || r.kind === 'song'
		);
		if (!item) return null;
		return {
			title: item.trackName, artist: item.artistName, album: item.collectionName,
			year: item.releaseDate?.split('-')[0], appleMusicUrl: item.trackViewUrl,
			artworkUrl: item.artworkUrl100?.replace('100x100bb', '600x600bb'),
		};
	} catch { return null; }
}

async function metaFromDeezer(id: string): Promise<TrackResult | null> {
	try {
		const res = await fetch(`https://api.deezer.com/track/${id}`);
		if (!res.ok) return null;
		const data = await res.json();
		if (data.error) return null;
		return {
			title: data.title, artist: data.artist?.name ?? '',
			album: data.album?.title, artworkUrl: data.album?.cover_big,
			deezerUrl: `https://www.deezer.com/track/${id}`,
		};
	} catch { return null; }
}

async function metaFromYoutube(id: string): Promise<TrackResult | null> {
	const apiKey = env.YOUTUBE_API_KEY;
	if (!apiKey) return null;
	try {
		const params = new URLSearchParams({ part: 'snippet', id, key: apiKey });
		const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
		if (!res.ok) return null;
		const data = await res.json();
		const snippet = data.items?.[0]?.snippet;
		if (!snippet) return null;
		return {
			title: snippet.title, artist: snippet.channelTitle?.replace(/ - Topic$/, '') ?? '',
			artworkUrl: snippet.thumbnails?.high?.url,
			youtubeMusicUrl: `https://music.youtube.com/watch?v=${id}`,
		};
	} catch { return null; }
}

// ── Playlist fetchers ─────────────────────────────────────────────────────────

async function playlistFromSpotify(id: string): Promise<PlaylistData | null> {
	const data = await fetchSpotifyPlaylist(id);
	if (!data) return null;
	return {
		title: data.title,
		tracks: data.tracks.map(t => ({
			title: t.title, artist: t.artist, album: t.album, artworkUrl: t.artworkUrl,
			sourceUrl: `https://open.spotify.com/track/${t.id}`,
		})),
	};
}

async function playlistFromDeezer(id: string): Promise<PlaylistData | null> {
	try {
		const res = await fetch(`https://api.deezer.com/playlist/${id}/tracks?limit=50`);
		if (!res.ok) return null;
		const data = await res.json();
		if (data.error) return null;

		// Fetch playlist title separately
		const metaRes = await fetch(`https://api.deezer.com/playlist/${id}`);
		const meta = metaRes.ok ? await metaRes.json() : null;

		const tracks: PlaylistTrack[] = (data.data ?? []).map((t: {
			id: number; title: string; artist?: { name: string };
			album?: { title?: string; cover_big?: string };
		}) => ({
			title: t.title, artist: t.artist?.name ?? '',
			album: t.album?.title, artworkUrl: t.album?.cover_big,
			sourceUrl: `https://www.deezer.com/track/${t.id}`,
		}));
		return { title: meta?.title ?? 'Deezer Playlist', tracks };
	} catch { return null; }
}

async function playlistFromYoutube(id: string): Promise<PlaylistData | null> {
	const apiKey = env.YOUTUBE_API_KEY;
	if (!apiKey) return null;
	try {
		const params = new URLSearchParams({ part: 'snippet', playlistId: id, maxResults: '50', key: apiKey });
		const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
		if (!res.ok) return null;
		const data = await res.json();

		// Fetch playlist title
		const metaParams = new URLSearchParams({ part: 'snippet', id, key: apiKey });
		const metaRes = await fetch(`https://www.googleapis.com/youtube/v3/playlists?${metaParams}`);
		const meta = metaRes.ok ? await metaRes.json() : null;
		const title = meta?.items?.[0]?.snippet?.title ?? 'YouTube Playlist';

		const tracks: PlaylistTrack[] = (data.items ?? [])
			.filter((item: { snippet?: { resourceId?: { videoId?: string } } }) => item?.snippet?.resourceId?.videoId)
			.map((item: { snippet: { title: string; channelTitle?: string; thumbnails?: { high?: { url: string } }; resourceId: { videoId: string } } }) => ({
				title: item.snippet.title,
				artist: item.snippet.channelTitle?.replace(/ - Topic$/, '') ?? '',
				artworkUrl: item.snippet.thumbnails?.high?.url,
				sourceUrl: `https://music.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
			}));
		return { title, tracks };
	} catch { return null; }
}

async function playlistFromApple(id: string, storefront = 'us'): Promise<PlaylistData | null> {
	const data = await fetchAppleMusicPlaylist(id, storefront);
	if (!data) return null;
	return { title: data.title, tracks: data.tracks };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url }) => {
	const streamingUrl = url.searchParams.get('url');
	if (!streamingUrl) error(400, 'url required');

	const detected = detect(streamingUrl);
	if (!detected) error(400, 'Unrecognised streaming URL');

	const { type, platform, id } = detected;

	if (type === 'playlist') {
		let playlist: PlaylistData | null = null;
		const storefront = 'storefront' in detected ? detected.storefront : undefined;
		if (platform === 'spotify')      playlist = await playlistFromSpotify(id);
		else if (platform === 'deezer')  playlist = await playlistFromDeezer(id);
		else if (platform === 'youtube') playlist = await playlistFromYoutube(id);
		else if (platform === 'apple') {
			const enabled = getSetting('apple_music_enabled', 'false') === 'true';
			if (!enabled) error(400, 'Apple Music playlist import is not enabled on this instance.');
			playlist = await playlistFromApple(id, storefront);
		}
		else error(400, 'Playlist imports are supported for Spotify, Apple Music, Deezer, and YouTube Music.');

		if (!playlist) error(422, `Could not load playlist from ${platform}`);
		return json({ type: 'playlist', platform, playlist });
	}

	// Track
	let track: TrackResult | null = null;
	if (platform === 'spotify') track = await metaFromSpotify(id);
	else if (platform === 'apple')   track = await metaFromApple(id);
	else if (platform === 'deezer')  track = await metaFromDeezer(id);
	else if (platform === 'youtube') track = await metaFromYoutube(id);

	if (!track) error(422, `Could not fetch metadata from ${platform}`);
	return json({ type: 'track', platform, track });
};
