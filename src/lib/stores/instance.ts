import { writable } from 'svelte/store';

export interface InstanceConfig {
	albumArtDisabled: boolean;
	feedScoped: boolean;
	isOwner: boolean;
	loaded: boolean;
}

export const instanceConfig = writable<InstanceConfig>({
	albumArtDisabled: false,
	feedScoped: false,
	isOwner: false,
	loaded: false
});
