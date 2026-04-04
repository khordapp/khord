import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type MusicService = 'spotify' | 'apple';

const STORAGE_KEY = 'khord_music_service';

function createMusicServiceStore() {
	const initial: MusicService | null = browser
		? (localStorage.getItem(STORAGE_KEY) as MusicService | null)
		: null;

	const { subscribe, set } = writable<MusicService | null>(initial);

	return {
		subscribe,
		select(service: MusicService) {
			if (browser) localStorage.setItem(STORAGE_KEY, service);
			set(service);
		},
		clear() {
			if (browser) localStorage.removeItem(STORAGE_KEY);
			set(null);
		}
	};
}

export const musicService = createMusicServiceStore();
