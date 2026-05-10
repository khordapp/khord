import { writable } from 'svelte/store';

export const importPlaylistOpen = writable(false);

export function openImportPlaylist() {
	importPlaylistOpen.set(true);
}

export function closeImportPlaylist() {
	importPlaylistOpen.set(false);
}
