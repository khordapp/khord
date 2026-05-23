import { writable, derived } from 'svelte/store';

export interface KhordSession {
	id: number;
	username: string;
	email: string;
	displayName: string | null;
	role: string;
	hasAvatar: boolean;
}

export const session = writable<KhordSession | null>(null);
export const isLoggedIn = derived(session, ($s) => $s !== null);
export const authReady = writable(false);
export const avatarVersion = writable(0);

export async function logout(): Promise<void> {
	await fetch('/api/auth/logout', { method: 'POST' });
	session.set(null);
}
