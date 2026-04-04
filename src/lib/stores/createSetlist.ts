import { writable } from 'svelte/store';

export const createSetlistOpen = writable(false);

export function openCreateSetlist() {
	createSetlistOpen.set(true);
}

export function closeCreateSetlist() {
	createSetlistOpen.set(false);
}
