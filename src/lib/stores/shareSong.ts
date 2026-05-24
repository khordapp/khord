import { writable } from 'svelte/store';
import type { TrackResult } from '$lib/search';

export interface SongRecord {
	title: string;
	artist: string;
	album?: string;
	thumbnailUrl?: string;
	spotifyUrl?: string;
	appleMusicUrl?: string;
	youtubeMusicUrl?: string;
	deezerUrl?: string;
	tidalUrl?: string;
	amazonMusicUrl?: string;
	soundcloudUrl?: string;
	note?: string;
	createdAt: string;
	urlsResolvedAt?: string;
}

export interface SharedSong {
	id: number;
	record: SongRecord;
}

export interface PendingSong {
	title: string;
	artist: string;
	album?: string;
}

export const shareSongOpen = writable(false);
export const lastSharedSong = writable<SharedSong | null>(null);
export const pendingSharedSong = writable<PendingSong | null>(null);
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
