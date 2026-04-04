// Spotify client credentials — server-side only, no user auth required.
// Used solely to look up a Spotify track URL by title + artist.

import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SEARCH_URL = 'https://api.spotify.com/v1/search';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
	if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

	const clientId = publicEnv.PUBLIC_SPOTIFY_CLIENT_ID;
	const clientSecret = privateEnv.SPOTIFY_CLIENT_SECRET;
	if (!clientId || !clientSecret) throw new Error('Spotify credentials not configured');

	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`
		},
		body: 'grant_type=client_credentials'
	});

	if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`);
	const data = await res.json();

	cachedToken = data.access_token;
	tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // 60s buffer
	return cachedToken!;
}

// Returns the Spotify track URL, or null if not found / credentials not configured.
export async function findSpotifyUrl(title: string, artist: string): Promise<string | null> {
	try {
		const token = await getToken();
		const q = `track:${title} artist:${artist}`;
		const params = new URLSearchParams({ q, type: 'track', limit: '1' });

		const res = await fetch(`${SEARCH_URL}?${params}`, {
			headers: { Authorization: `Bearer ${token}` }
		});

		if (!res.ok) return null;
		const data = await res.json();
		return data.tracks?.items?.[0]?.external_urls?.spotify ?? null;
	} catch {
		return null; // non-fatal — Spotify is best-effort
	}
}
