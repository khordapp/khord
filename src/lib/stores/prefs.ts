import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type PlatformKey = 'appleMusicUrl' | 'spotifyUrl' | 'youtubeMusicUrl' | 'deezerUrl';

const STORAGE_KEY = 'khord_preferred_platform';

function createPrefsStore() {
	const initial = browser ? (localStorage.getItem(STORAGE_KEY) as PlatformKey | null) : null;
	const { subscribe, set } = writable<PlatformKey | null>(initial);

	return {
		subscribe,
		setPreferredPlatform(platform: PlatformKey | null) {
			if (browser) {
				if (platform) localStorage.setItem(STORAGE_KEY, platform);
				else localStorage.removeItem(STORAGE_KEY);
			}
			set(platform);
		}
	};
}

export const prefs = createPrefsStore();
