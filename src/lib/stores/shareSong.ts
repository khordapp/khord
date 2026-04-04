import { writable } from 'svelte/store';
import type { KhordSong } from '$lib/atproto/lexicons/song';

export const shareSongOpen = writable(false);
export const lastSharedSong = writable<KhordSong | null>(null);

export function openShareSong() {
	shareSongOpen.set(true);
}

export function closeShareSong() {
	shareSongOpen.set(false);
}
