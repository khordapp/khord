import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findSpotifyUrl } from '$lib/server/spotify';
import { findYoutubeMusicUrl } from '$lib/server/youtube';
import { findDeezerUrl } from '$lib/server/deezer';
import { getSetting } from '$lib/server/settings';

async function findAppleMusicUrl(title: string, artist: string): Promise<string | null> {
	try {
		const params = new URLSearchParams({ term: `${title} ${artist}`, entity: 'song', limit: '1' });
		const res = await fetch(`https://itunes.apple.com/search?${params}`);
		if (!res.ok) return null;
		const data = await res.json();
		return data.results?.[0]?.trackViewUrl ?? null;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const spotifyEnabled      = getSetting('spotify_enabled', 'true') === 'true';
	const youtubeMusicEnabled = getSetting('youtube_music_enabled', 'false') === 'true';

	const title  = url.searchParams.get('title');
	const artist = url.searchParams.get('artist');
	if (!title || !artist) error(400, 'title and artist required');

	const t0 = performance.now();
	const [spotifyUrl, youtubeMusicUrl, deezerUrl, appleMusicUrl] = await Promise.all([
		spotifyEnabled      ? findSpotifyUrl(title, artist)      : Promise.resolve(null),
		youtubeMusicEnabled ? findYoutubeMusicUrl(title, artist) : Promise.resolve(null),
		findDeezerUrl(title, artist),
		findAppleMusicUrl(title, artist),
	]);
	const found = [spotifyUrl && 'spotify', youtubeMusicUrl && 'youtube', deezerUrl && 'deezer', appleMusicUrl && 'apple'].filter(Boolean).join('+') || 'none';
	console.log(`[resolve] found=${found} spotify=${spotifyEnabled} youtube=${youtubeMusicEnabled} total=${(performance.now() - t0).toFixed(0)}ms`);
	return json({
		spotifyUrl:      spotifyUrl      ?? undefined,
		appleMusicUrl:   appleMusicUrl   ?? undefined,
		youtubeMusicUrl: youtubeMusicUrl ?? undefined,
		deezerUrl:       deezerUrl       ?? undefined,
	});
};
