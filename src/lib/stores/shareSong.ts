import { writable } from 'svelte/store';
import type { KhordSong } from '$lib/atproto/lexicons/song';

export interface PendingSong {
	title: string;
	artist: string;
	album?: string;
}

export const shareSongOpen = writable(false);
export const lastSharedSong = writable<KhordSong | null>(null);
export const pendingSharedSong = writable<PendingSong | null>(null);

export function openShareSong() {
	shareSongOpen.set(true);
}

export function closeShareSong() {
	shareSongOpen.set(false);
}
