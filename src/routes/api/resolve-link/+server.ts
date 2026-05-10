import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchSpotifyTrack } from '$lib/server/spotify';
import { env } from '$env/dynamic/private';
import type { TrackResult } from '$lib/search';

// Detect which streaming platform a URL belongs to and extract its track ID.
function detectPlatform(raw: string): { platform: string; id: string } | null {
	let u: URL;
	try { u = new URL(raw); } catch { return null; }
	const host = u.hostname.replace(/^www\./, '');

	if (host === 'open.spotify.com') {
		const match = u.pathname.match(/^\/track\/([A-Za-z0-9]+)/);
		if (match) return { platform: 'spotify', id: match[1] };
	}

	if (host === 'music.apple.com') {
		// ?i=trackId (track within an album page)
		const qi = u.searchParams.get('i');
		if (qi && /^\d+$/.test(qi)) return { platform: 'apple', id: qi };
		// /song/{name}/{id} or /song/{id}
		const parts = u.pathname.split('/').filter(Boolean);
		if (parts.includes('song')) {
			const id = parts[parts.length - 1];
			if (/^\d+$/.test(id)) return { platform: 'apple', id };
		}
	}

	if (host === 'deezer.com') {
		// /track/{id} or /{locale}/track/{id}
		const match = u.pathname.match(/\/track\/(\d+)/);
		if (match) return { platform: 'deezer', id: match[1] };
	}

	if (host === 'music.youtube.com' || host === 'youtube.com') {
		const v = u.searchParams.get('v');
		if (v) return { platform: 'youtube', id: v };
	}

	if (host === 'youtu.be') {
		const id = u.pathname.slice(1).split('?')[0];
		if (id) return { platform: 'youtube', id };
	}

	return null;
}

async function metaFromSpotify(id: string): Promise<TrackResult | null> {
	const track = await fetchSpotifyTrack(id);
	if (!track) return null;
	return {
		title:       track.title,
		artist:      track.artist,
		album:       track.album,
		artworkUrl:  track.artworkUrl,
		spotifyUrl:  `https://open.spotify.com/track/${id}`,
	};
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
			title:        item.trackName,
			artist:       item.artistName,
			album:        item.collectionName,
			year:         item.releaseDate?.split('-')[0],
			appleMusicUrl: item.trackViewUrl,
			artworkUrl:   item.artworkUrl100?.replace('100x100bb', '600x600bb'),
		};
	} catch {
		return null;
	}
}

async function metaFromDeezer(id: string): Promise<TrackResult | null> {
	try {
		const res = await fetch(`https://api.deezer.com/track/${id}`);
		if (!res.ok) return null;
		const data = await res.json();
		if (data.error) return null;
		return {
			title:     data.title,
			artist:    data.artist?.name ?? '',
			album:     data.album?.title,
			artworkUrl: data.album?.cover_big,
			deezerUrl: `https://www.deezer.com/track/${id}`,
		};
	} catch {
		return null;
	}
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
		// channelTitle is often "Artist - Topic" for music; strip " - Topic" suffix if present
		const artist = snippet.channelTitle?.replace(/ - Topic$/, '') ?? '';
		return {
			title:          snippet.title,
			artist,
			artworkUrl:     snippet.thumbnails?.high?.url,
			youtubeMusicUrl: `https://music.youtube.com/watch?v=${id}`,
		};
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const streamingUrl = url.searchParams.get('url');
	if (!streamingUrl) error(400, 'url required');

	const detected = detectPlatform(streamingUrl);
	if (!detected) error(400, 'Unrecognised streaming URL');

	const { platform, id } = detected;

	let track: TrackResult | null = null;
	if (platform === 'spotify') track = await metaFromSpotify(id);
	else if (platform === 'apple')   track = await metaFromApple(id);
	else if (platform === 'deezer')  track = await metaFromDeezer(id);
	else if (platform === 'youtube') track = await metaFromYoutube(id);

	if (!track) error(422, `Could not fetch metadata from ${platform}`);

	return json({ track, platform });
};
