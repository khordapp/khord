import { writable, derived } from 'svelte/store';

export interface KhordSession {
	did: string;
	handle: string;
	avatar?: string;
}

export const session = writable<KhordSession | null>(null);
export const isLoggedIn = derived(session, ($s) => $s !== null);
export const authReady = writable(false);
