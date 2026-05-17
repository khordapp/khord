import { writable } from 'svelte/store';

export interface InstanceConfig {
	albumArtDisabled: boolean;
	feedScoped: boolean;
	isOwner: boolean;
	appleMusicEnabled: boolean;
	loaded: boolean;
}

export const instanceConfig = writable<InstanceConfig>({
	albumArtDisabled: false,
	feedScoped: false,
	isOwner: false,
	appleMusicEnabled: false,
	loaded: false
});
