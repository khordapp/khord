import { writable } from 'svelte/store';
import type { KhordSong } from '$lib/atproto/lexicons/song';
import type { TrackResult } from '$lib/search';

export interface PendingSong {
	title: string;
	artist: string;
	album?: string;
}

export const shareSongOpen = writable(false);
export const lastSharedSong = writable<KhordSong | null>(null);
export const pendingSharedSong = writable<PendingSong | null>(null);
// Pre-filled track from an external share (e.g. Capacitor share extension).
// ShareSongModal reads this on mount and skips the search step.
export const prefilledTrack = writable<TrackResult | null>(null);

export function openShareSong() {
	shareSongOpen.set(true);
}

export function openShareSongWithTrack(track: TrackResult) {
	prefilledTrack.set(track);
	shareSongOpen.set(true);
}

export function closeShareSong() {
	shareSongOpen.set(false);
	prefilledTrack.set(null);
}
