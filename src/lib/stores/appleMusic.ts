import { writable } from 'svelte/store';

// Tracks whether the current user has authorized Apple Music.
// Initialized by calling initMusicKit() on mount — MusicKit JS restores
// previous auth state from its own localStorage automatically.
export const appleMusicAuthorized = writable<boolean>(false);
