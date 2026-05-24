// Spotify Web API + OAuth PKCE helpers
// Docs: https://developer.spotify.com/documentation/web-api
//
// Prerequisites (free Spotify developer account):
//   1. Create an app at https://developer.spotify.com/dashboard
//   2. Add redirect URI: ${PUBLIC_APP_URL}/spotify/callback
//   3. Set PUBLIC_SPOTIFY_CLIENT_ID=<your-client-id> in .env

import { env } from '$env/dynamic/public';

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';
const SPOTIFY_API = 'https://api.spotify.com/v1';

const SCOPES = [
	'user-read-email',
	'user-read-private',
	'user-library-modify',
	'user-library-read',
	'playlist-modify-public',
	'playlist-modify-private'
].join(' ');

const VERIFIER_KEY = 'spotify_pkce_verifier';
const STATE_KEY = 'spotify_pkce_state';
export const SPOTIFY_RETURN_TO_KEY = 'spotify_return_to';

// --- PKCE helpers ---

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
	const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
	const verifier = base64url(verifierBytes);
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	const challenge = base64url(new Uint8Array(digest));
	return { verifier, challenge };
}

function getRedirectUri(): string {
	// Use window.location.origin so the URI always matches the actual running
	// domain exactly — avoids mismatches caused by env-var misconfiguration and
	// ensures the Spotify native app (which validates the URI strictly on iOS)
	// sees the same value that was sent in the authorize request.
	return `${window.location.origin}/spotify/callback`;
}

// --- Auth flow ---

export async function initiateSpotifyAuth(returnTo = '/settings'): Promise<void> {
	const clientId = env.PUBLIC_SPOTIFY_CLIENT_ID;
	if (!clientId) throw new Error('PUBLIC_SPOTIFY_CLIENT_ID is not set');

	const { verifier, challenge } = await generatePKCE();
	const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

	// Use localStorage so the callback page can read these values even when
	// it opens in regular Safari instead of the PWA context (iOS).
	localStorage.setItem(VERIFIER_KEY, verifier);
	localStorage.setItem(STATE_KEY, state);
	localStorage.setItem(SPOTIFY_RETURN_TO_KEY, returnTo);

	const params = new URLSearchParams({
		client_id: clientId,
		response_type: 'code',
		redirect_uri: getRedirectUri(),
		code_challenge_method: 'S256',
		code_challenge: challenge,
		scope: SCOPES,
		state
	});

	window.location.href = `${SPOTIFY_ACCOUNTS}/authorize?${params}`;
}

export interface SpotifyTokens {
	accessToken: string;
	refreshToken: string;
	expiresAt: number; // ms timestamp
}

export async function exchangeSpotifyCode(
	code: string,
	returnedState: string
): Promise<SpotifyTokens> {
	const clientId = env.PUBLIC_SPOTIFY_CLIENT_ID;
	if (!clientId) throw new Error('PUBLIC_SPOTIFY_CLIENT_ID is not set');

	const verifier = localStorage.getItem(VERIFIER_KEY);
	const expectedState = localStorage.getItem(STATE_KEY);

	localStorage.removeItem(VERIFIER_KEY);
	localStorage.removeItem(STATE_KEY);

	if (!verifier) throw new Error('No PKCE verifier found — please try signing in again.');
	if (returnedState !== expectedState) throw new Error('State mismatch — possible CSRF. Please try again.');

	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		redirect_uri: getRedirectUri(),
		client_id: clientId,
		code_verifier: verifier
	});

	const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});

	if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);

	const data = await res.json();
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresAt: Date.now() + data.expires_in * 1000
	};
}

export async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyTokens> {
	const clientId = env.PUBLIC_SPOTIFY_CLIENT_ID;
	if (!clientId) throw new Error('PUBLIC_SPOTIFY_CLIENT_ID is not set');

	const body = new URLSearchParams({
		grant_type: 'refresh_token',
		refresh_token: refreshToken,
		client_id: clientId
	});

	const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});

	if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);

	const data = await res.json();
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token ?? refreshToken,
		expiresAt: Date.now() + data.expires_in * 1000
	};
}

// --- Web API ---

async function apiRequest(
	path: string,
	accessToken: string,
	options: RequestInit = {}
): Promise<Response> {
	return fetch(`${SPOTIFY_API}${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			...options.headers
		}
	});
}

export async function getSpotifyUser(accessToken: string): Promise<{ id: string; display_name: string }> {
	const res = await apiRequest('/me', accessToken);
	if (!res.ok) throw new Error(`Spotify error ${res.status}`);
	return res.json();
}

export async function saveTrack(trackId: string, accessToken: string): Promise<void> {
	const res = await apiRequest('/me/tracks', accessToken, {
		method: 'PUT',
		body: JSON.stringify({ ids: [trackId] })
	});
	if (!res.ok) throw new Error(`Failed to save track: ${res.status}`);
}

export async function removeSavedTrack(trackId: string, accessToken: string): Promise<void> {
	const res = await apiRequest('/me/tracks', accessToken, {
		method: 'DELETE',
		body: JSON.stringify({ ids: [trackId] })
	});
	if (!res.ok) throw new Error(`Failed to remove track: ${res.status}`);
}

export async function isTrackSaved(trackId: string, accessToken: string): Promise<boolean> {
	const res = await apiRequest(`/me/tracks/contains?ids=${trackId}`, accessToken);
	if (!res.ok) return false;
	const data = await res.json();
	return data[0] ?? false;
}

export async function createPlaylist(
	userId: string,
	name: string,
	accessToken: string,
	isPublic = false
): Promise<string> {
	const res = await apiRequest(`/users/${userId}/playlists`, accessToken, {
		method: 'POST',
		body: JSON.stringify({ name, public: isPublic, description: 'Created with Khord' })
	});
	if (!res.ok) throw new Error(`Failed to create playlist: ${res.status}`);
	const data = await res.json();
	return data.id;
}

export async function addTracksToPlaylist(
	playlistId: string,
	trackIds: string[],
	accessToken: string
): Promise<void> {
	const uris = trackIds.map((id) => `spotify:track:${id}`);
	// Spotify allows max 100 tracks per request
	for (let i = 0; i < uris.length; i += 100) {
		const res = await apiRequest(`/playlists/${playlistId}/tracks`, accessToken, {
			method: 'POST',
			body: JSON.stringify({ uris: uris.slice(i, i + 100) })
		});
		if (!res.ok) throw new Error(`Failed to add tracks: ${res.status}`);
	}
}

// --- URL helpers ---

export interface SpotifyTrackResult {
	spotifyId: string;
	title: string;
	artist: string;
	album?: string;
	year?: string;
	isrc?: string;
}

export async function searchSpotifyTracks(
	query: string,
	accessToken: string,
	limit = 6
): Promise<SpotifyTrackResult[]> {
	const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) });
	const res = await apiRequest(`/search?${params}`, accessToken);
	if (!res.ok) throw new Error(`Spotify search failed (${res.status})`);
	const data = await res.json();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (data.tracks?.items ?? []).map((item: any) => ({
		spotifyId: item.id,
		title: item.name,
		artist: item.artists.map((a: { name: string }) => a.name).join(', '),
		album: item.album?.name,
		year: item.album?.release_date?.split('-')[0],
		isrc: item.external_ids?.isrc
	}));
}

export function extractSpotifyId(input: string): string | null {
	const urlMatch = input.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
	if (urlMatch) return urlMatch[1];
	const uriMatch = input.match(/spotify:track:([a-zA-Z0-9]+)/);
	if (uriMatch) return uriMatch[1];
	return null;
}

export async function getTrack(trackId: string, accessToken: string) {
	const res = await apiRequest(`/tracks/${trackId}`, accessToken);
	if (!res.ok) throw new Error(`Spotify error ${res.status}`);
	return res.json();
}

export async function getTrackIsrc(trackId: string, accessToken: string): Promise<string | null> {
	const track = await getTrack(trackId, accessToken);
	return track.external_ids?.isrc ?? null;
}

export function getTrackUrl(trackId: string): string {
	return `https://open.spotify.com/track/${trackId}`;
}

export function getTrackUri(trackId: string): string {
	return `spotify:track:${trackId}`;
}

export async function replacePlaylistTracks(
	playlistId: string,
	trackIds: string[],
	accessToken: string
): Promise<void> {
	const uris = trackIds.map((id) => `spotify:track:${id}`);
	// PUT replaces the full playlist (max 100 tracks)
	const res = await apiRequest(`/playlists/${playlistId}/tracks`, accessToken, {
		method: 'PUT',
		body: JSON.stringify({ uris: uris.slice(0, 100) })
	});
	if (!res.ok) throw new Error(`Failed to replace tracks: ${res.status}`);
	// POST appends remaining batches beyond 100
	for (let i = 100; i < uris.length; i += 100) {
		const r = await apiRequest(`/playlists/${playlistId}/tracks`, accessToken, {
			method: 'POST',
			body: JSON.stringify({ uris: uris.slice(i, i + 100) })
		});
		if (!r.ok) throw new Error(`Failed to add tracks: ${r.status}`);
	}
}
