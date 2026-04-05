import { writable } from 'svelte/store';

export interface InstanceConfig {
	albumArtDisabled: boolean;
	isOwner: boolean;
}

export const instanceConfig = writable<InstanceConfig>({
	albumArtDisabled: false,
	isOwner: false
});
