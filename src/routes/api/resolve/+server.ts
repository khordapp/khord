import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveUrl, getCanonicalEntity } from '$lib/odesli/client';
import { findSpotifyUrl } from '$lib/server/spotify';
import { findYoutubeMusicUrl } from '$lib/server/youtube';
import { getSetting } from '$lib/server/settings';

// In-process cache — results are stable so we cache indefinitely per process.
// Prevents redundant Odesli + Spotify hits when multiple users share the same song.
const cache = new Map<string, unknown>();

export const GET: RequestHandler = async ({ url }) => {
	const spotifyEnabled      = getSetting('spotify_enabled', 'true') === 'true';
	const youtubeMusicEnabled = getSetting('youtube_music_enabled', 'false') === 'true';

	// Phase 1 fast path — Spotify + YouTube only, no Odesli.
	// Called immediately after the user picks a song; title/artist come from iTunes search results.
	if (url.searchParams.get('phase') === '1') {
		const title  = url.searchParams.get('title');
		const artist = url.searchParams.get('artist');
		if (!title || !artist) error(400, 'title and artist required for phase=1');
		const t0 = performance.now();
		const [spotifyUrl, youtubeMusicUrl] = await Promise.all([
			spotifyEnabled      ? findSpotifyUrl(title, artist)       : Promise.resolve(null),
			youtubeMusicEnabled ? findYoutubeMusicUrl(title, artist)  : Promise.resolve(null),
		]);
		console.log(`[resolve/fast] spotify=${spotifyEnabled} youtube=${youtubeMusicEnabled} total=${(performance.now()-t0).toFixed(0)}ms`);
		return json({ spotifyUrl: spotifyUrl ?? undefined, youtubeMusicUrl: youtubeMusicUrl ?? undefined });
	}

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

	// Title/artist hints from iTunes search — lets us start Spotify in parallel with Odesli.
	const hintTitle  = url.searchParams.get('title')  ?? undefined;
	const hintArtist = url.searchParams.get('artist') ?? undefined;

	try {
		const t0 = performance.now();

		// If we have iTunes hints, start Spotify and YouTube Music in parallel with Odesli.
		// Odesli title/artist takes precedence if it differs; early results are reused.
		let earlySpotifyPromise: Promise<string | null> = Promise.resolve(null);
		let earlyYoutubePromise: Promise<string | null> = Promise.resolve(null);
		if (hintTitle && hintArtist) {
			if (spotifyEnabled)      earlySpotifyPromise = findSpotifyUrl(hintTitle, hintArtist);
			if (youtubeMusicEnabled) earlyYoutubePromise = findYoutubeMusicUrl(hintTitle, hintArtist);
		}

		const result = await resolveUrl(cleanUrl);
		const tOdesli = performance.now() - t0;

		// Odesli omits Spotify and YouTube Music — look them up directly.
		const entity = getCanonicalEntity(result);
		let tSpotify = 0;
		let tYoutube = 0;
		if (entity?.title && entity?.artistName) {
			const finalTitle  = entity.title;
			const finalArtist = entity.artistName;
			const tLookup = performance.now();

			// Use early results if hints were available; otherwise search with Odesli metadata.
			const spotifyPromise = spotifyEnabled
				? (hintTitle && hintArtist ? earlySpotifyPromise : findSpotifyUrl(finalTitle, finalArtist))
				: Promise.resolve(null);
			const youtubePromise = youtubeMusicEnabled
				? (hintTitle && hintArtist ? earlyYoutubePromise : findYoutubeMusicUrl(finalTitle, finalArtist))
				: Promise.resolve(null);

			const [spotifyUrl, youtubeMusicUrl] = await Promise.all([spotifyPromise, youtubePromise]);
			tSpotify = spotifyEnabled ? performance.now() - tLookup : 0;
			tYoutube = youtubeMusicEnabled ? performance.now() - tLookup : 0;
			if (spotifyUrl) {
				result.linksByPlatform['spotify'] = { country: 'US', url: spotifyUrl, entityUniqueId: '' };
			}
			if (youtubeMusicUrl) {
				result.linksByPlatform['youtubeMusic'] = { country: 'US', url: youtubeMusicUrl, entityUniqueId: '' };
			}
		}

		const tTotal = performance.now() - t0;
		const parallelServices = [
			hintTitle && hintArtist && spotifyEnabled      ? 'spotify'      : '',
			hintTitle && hintArtist && youtubeMusicEnabled ? 'youtube'       : '',
		].filter(Boolean).join('+');
		const parallel = parallelServices ? ` (${parallelServices} parallel)` : '';
		console.log(`[resolve] odesli=${tOdesli.toFixed(0)}ms spotify=${tSpotify.toFixed(0)}ms youtube=${tYoutube.toFixed(0)}ms total=${tTotal.toFixed(0)}ms${parallel} url=${cleanUrl}`);

		cache.set(cleanUrl, result);
		return json(result);
	} catch (e) {
		error(502, e instanceof Error ? e.message : 'Odesli resolution failed');
	}
};
