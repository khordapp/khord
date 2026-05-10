<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isLoggedIn, authReady } from '$lib/stores/auth';
	import { openShareSongWithTrack } from '$lib/stores/shareSong';
	import { theme as t } from '$lib/theme';

	export let data: { track: import('$lib/search').TrackResult };

	onMount(() => {
		// Wait for auth to settle before deciding what to do.
		const unsub = authReady.subscribe((ready) => {
			if (!ready) return;
			unsub();
			if ($isLoggedIn) {
				openShareSongWithTrack(data.track);
				goto('/', { replaceState: true });
			} else {
				goto('/login', { replaceState: true });
			}
		});
	});
</script>

<!-- Brief loading state shown while auth settles -->
<div class="min-h-dvh flex items-center justify-center {$t.pageBg}">
	<p class="text-sm {$t.textMuted}">Opening…</p>
</div>
