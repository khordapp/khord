<script lang="ts">
	import { onMount } from 'svelte';
	import { exchangeSpotifyCode } from '$lib/streaming/spotify';
	import { spotifyTokens } from '$lib/stores/spotify';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { theme as t } from '$lib/theme';

	let error = '';

	onMount(async () => {
		const params = page.url.searchParams;
		const code = params.get('code');
		const state = params.get('state');
		const errorParam = params.get('error');

		if (errorParam) {
			error = errorParam === 'access_denied'
				? 'Authorization was cancelled.'
				: `Spotify error: ${errorParam}`;
			return;
		}

		if (!code || !state) {
			error = 'Invalid callback — missing code or state.';
			return;
		}

		try {
			const tokens = await exchangeSpotifyCode(code, state);
			spotifyTokens.save(tokens);
			goto('/settings');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Authorization failed. Please try again.';
		}
	});
</script>

<svelte:head>
	<title>Connecting Spotify… — Khord</title>
</svelte:head>

<div class="flex flex-col items-center justify-center py-24 space-y-4 text-center">
	{#if error}
		<p class="text-red-400 text-sm max-w-sm">{error}</p>
		<a href="/settings" class="text-sm {$t.textMuted} {$t.hoverText} transition-colors">
			← Back to settings
		</a>
	{:else}
		<div class="w-6 h-6 border-2 {$t.borderStrong} border-t-white rounded-full animate-spin"></div>
		<p class="{$t.textMuted} text-sm">Connecting Spotify…</p>
	{/if}
</div>
