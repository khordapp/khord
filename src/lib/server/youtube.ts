// YouTube Data API v3 — server-side only.
// Searches for a track by title + artist and returns a YouTube Music URL.
// NOTE: YouTube Data API v3 search costs 100 units/call; free quota is 10,000/day (~100 searches).
// Enable/disable via the `youtube_music_enabled` instance setting in the admin panel.

import { env } from '$env/dynamic/private';

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

// Returns a YouTube Music URL for the best-matching track, or null if not found / disabled / no key.
export async function findYoutubeMusicUrl(title: string, artist: string): Promise<string | null> {
	const apiKey = env.YOUTUBE_API_KEY;
	if (!apiKey) return null;

	try {
		const params = new URLSearchParams({
			part: 'id',
			q: `${title} ${artist}`,
			type: 'video',
			videoCategoryId: '10', // Music
			maxResults: '1',
			key: apiKey
		});

		const res = await fetch(`${SEARCH_URL}?${params}`);
		if (!res.ok) {
			console.warn(`[youtube] API error ${res.status} for "${title}" by "${artist}"`);
			return null;
		}

		const data = await res.json();
		const videoId: string | undefined = data.items?.[0]?.id?.videoId;
		if (!videoId) return null;

		return `https://music.youtube.com/watch?v=${videoId}`;
	} catch {
		return null; // non-fatal
	}
}
