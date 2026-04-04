// Apple MusicKit JS integration
// Docs: https://developer.apple.com/documentation/musickitjs
//
// Prerequisites (Apple Developer account required):
//   1. Register an App ID with MusicKit capability at developer.apple.com
//   2. Create a MusicKit private key — download the .p8 file
//   3. Generate a developer token (JWT) using your Team ID, Key ID, and private key
//      Tool: https://github.com/pelauimagineering/apple-music-token-generator
//      or: npx create-apple-jwt --team-id TEAMID --key-id KEYID --key-file AuthKey_KEYID.p8
//   4. Set PUBLIC_APPLE_MUSIC_DEV_TOKEN=<token> in .env (tokens last up to 6 months)

import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';

// Minimal MusicKit JS types
declare global {
	interface Window {
		MusicKit: {
			configure(config: MusicKitConfig): Promise<MusicKitInstance>;
			getInstance(): MusicKitInstance;
		};
	}
}

interface MusicKitConfig {
	developerToken: string;
	app: { name: string; build: string };
}

export interface MusicKitInstance {
	isAuthorized: boolean;
	musicUserToken: string;
	authorize(): Promise<string>;
	unauthorize(): Promise<void>;
}

let _instance: MusicKitInstance | null = null;

function loadScript(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (document.getElementById('musickit-js')) {
			resolve();
			return;
		}
		const script = document.createElement('script');
		script.id = 'musickit-js';
		script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('Failed to load MusicKit JS'));
		document.head.appendChild(script);
	});
}

// Call on app init (e.g. settings page mount) to restore previous auth state.
// Returns true if the user is already authorized.
export async function initMusicKit(): Promise<boolean> {
	if (!browser) return false;

	const developerToken = env.PUBLIC_APPLE_MUSIC_DEV_TOKEN;
	if (!developerToken) {
		console.warn('PUBLIC_APPLE_MUSIC_DEV_TOKEN is not set — Apple Music unavailable');
		return false;
	}

	await loadScript();

	_instance = await window.MusicKit.configure({
		developerToken,
		app: { name: 'Khord', build: '1' }
	});

	return _instance.isAuthorized;
}

// Triggers the Apple Music authorization popup. Must be called from a user gesture.
export async function authorizeAppleMusic(): Promise<string> {
	if (!_instance) await initMusicKit();
	if (!_instance) throw new Error('MusicKit not initialized');
	return _instance.authorize();
}

export async function unauthorizeAppleMusic(): Promise<void> {
	if (!_instance) return;
	await _instance.unauthorize();
}

export function getMusicKit(): MusicKitInstance {
	if (!_instance) throw new Error('MusicKit not initialized');
	return _instance;
}

export function extractAppleMusicId(url: string): string | null {
	// https://music.apple.com/us/album/name/ALBUM_ID?i=TRACK_ID
	const match = url.match(/[?&]i=(\d+)/);
	return match ? match[1] : null;
}

export function getEmbedUrl(trackId: string, country = 'us'): string {
	return `https://embed.music.apple.com/${country}/album/song/${trackId}`;
}

export interface AppleMusicTrackResult {
	appleMusicUrl: string;
	title: string;
	artist: string;
	album?: string;
	year?: string;
	isrc?: string;
}

// Search the Apple Music catalog; requires MusicKit to be initialized and authorized.
export async function searchAppleMusicTracks(
	query: string,
	storefront = 'us',
	limit = 6
): Promise<AppleMusicTrackResult[]> {
	const developerToken = env.PUBLIC_APPLE_MUSIC_DEV_TOKEN;
	if (!developerToken) return [];

	let musicUserToken: string;
	try {
		musicUserToken = getMusicKit().musicUserToken;
		if (!musicUserToken) return [];
	} catch {
		return [];
	}

	const params = new URLSearchParams({ term: query, types: 'songs', limit: String(limit) });
	const res = await fetch(
		`https://api.music.apple.com/v1/catalog/${storefront}/search?${params}`,
		{
			headers: {
				Authorization: `Bearer ${developerToken}`,
				'Music-User-Token': musicUserToken
			}
		}
	);

	if (!res.ok) return [];
	const data = await res.json();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (data.results?.songs?.data ?? []).map((item: any) => ({
		appleMusicUrl: item.attributes?.url,
		title: item.attributes?.name,
		artist: item.attributes?.artistName,
		album: item.attributes?.albumName,
		year: item.attributes?.releaseDate?.split('-')[0],
		isrc: item.attributes?.isrc
	}));
}
