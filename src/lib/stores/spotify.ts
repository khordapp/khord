import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { refreshSpotifyToken, type SpotifyTokens } from '$lib/streaming/spotify';

const STORAGE_KEY = 'khord_spotify_tokens';

function loadTokens(): SpotifyTokens | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as SpotifyTokens) : null;
	} catch {
		return null;
	}
}

function createSpotifyStore() {
	const { subscribe, set, update } = writable<SpotifyTokens | null>(loadTokens());

	return {
		subscribe,
		save(tokens: SpotifyTokens) {
			if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
			set(tokens);
		},
		clear() {
			if (browser) localStorage.removeItem(STORAGE_KEY);
			set(null);
		},
		// Returns a valid access token, refreshing if within 60s of expiry.
		async getValidToken(): Promise<string> {
			const tokens = get({ subscribe });
			if (!tokens) throw new Error('Not connected to Spotify');

			if (Date.now() < tokens.expiresAt - 60_000) {
				return tokens.accessToken;
			}

			const refreshed = await refreshSpotifyToken(tokens.refreshToken);
			if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(refreshed));
			set(refreshed);
			return refreshed.accessToken;
		}
	};
}

export const spotifyTokens = createSpotifyStore();

export const spotifyAuthorized = derived(
	spotifyTokens,
	($tokens) => $tokens !== null
);
