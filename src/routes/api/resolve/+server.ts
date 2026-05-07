import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findSpotifyUrl } from '$lib/server/spotify';
import { findYoutubeMusicUrl } from '$lib/server/youtube';
import { findDeezerUrl } from '$lib/server/deezer';
import { getSetting } from '$lib/server/settings';

export const GET: RequestHandler = async ({ url }) => {
	const spotifyEnabled      = getSetting('spotify_enabled', 'true') === 'true';
	const youtubeMusicEnabled = getSetting('youtube_music_enabled', 'false') === 'true';

	const title  = url.searchParams.get('title');
	const artist = url.searchParams.get('artist');
	if (!title || !artist) error(400, 'title and artist required');

	const t0 = performance.now();
	const [spotifyUrl, youtubeMusicUrl, deezerUrl] = await Promise.all([
		spotifyEnabled      ? findSpotifyUrl(title, artist)      : Promise.resolve(null),
		youtubeMusicEnabled ? findYoutubeMusicUrl(title, artist) : Promise.resolve(null),
		findDeezerUrl(title, artist),
	]);
	const found = [spotifyUrl && 'spotify', youtubeMusicUrl && 'youtube', deezerUrl && 'deezer'].filter(Boolean).join('+') || 'none';
	console.log(`[resolve] found=${found} spotify=${spotifyEnabled} youtube=${youtubeMusicEnabled} total=${(performance.now() - t0).toFixed(0)}ms`);
	return json({
		spotifyUrl:      spotifyUrl      ?? undefined,
		youtubeMusicUrl: youtubeMusicUrl ?? undefined,
		deezerUrl:       deezerUrl       ?? undefined,
	});
};
