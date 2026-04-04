import { writable } from 'svelte/store';

export interface InstanceConfig {
	albumArtDisabled: boolean;
}

export const instanceConfig = writable<InstanceConfig>({
	albumArtDisabled: false
});
