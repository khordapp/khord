import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveUrl, getCanonicalEntity } from '$lib/odesli/client';
import { findSpotifyUrl } from '$lib/server/spotify';

// In-process cache — results are stable so we cache indefinitely per process.
// Prevents redundant Odesli + Spotify hits when multiple users share the same song.
const cache = new Map<string, unknown>();

export const GET: RequestHandler = async ({ url }) => {
	const songUrl = url.searchParams.get('url');
	if (!songUrl) error(400, 'Missing url parameter');

	// Normalise iTunes affiliate URLs → clean music.apple.com links
	// e.g. https://itunes.apple.com/us/album/x/id123?i=456&uo=4
	//   → https://music.apple.com/us/album/x/123?i=456
	let cleanUrl: string;
	try {
		const u = new URL(songUrl);
		u.hostname = u.hostname.replace('itunes.apple.com', 'music.apple.com');
		u.pathname = u.pathname.replace(/\/id(\d+)/, '/$1');
		u.searchParams.delete('uo');
		cleanUrl = u.toString();
	} catch {
		cleanUrl = songUrl;
	}

	if (cache.has(cleanUrl)) {
		return json(cache.get(cleanUrl));
	}

	try {
		const result = await resolveUrl(cleanUrl);

		// Odesli omits Spotify — look it up directly via client credentials.
		const entity = getCanonicalEntity(result);
		if (entity?.title && entity?.artistName) {
			const spotifyUrl = await findSpotifyUrl(entity.title, entity.artistName);
			if (spotifyUrl) {
				result.linksByPlatform['spotify'] = { country: 'US', url: spotifyUrl, entityUniqueId: '' };
			}
		}

		cache.set(cleanUrl, result);
		return json(result);
	} catch (e) {
		error(502, e instanceof Error ? e.message : 'Odesli resolution failed');
	}
};
