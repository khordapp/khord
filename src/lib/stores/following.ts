import { writable, derived } from 'svelte/store';
import type { FollowedUser } from '$lib/atproto/social';

export const following = writable<FollowedUser[]>([]);
export const followingLoaded = writable(false);

// Set of DIDs for fast membership checks
export const followingDids = derived(following, ($f) => new Set($f.map((u) => u.did)));
