<script lang="ts">
	import { prefs } from '$lib/stores/prefs';
	import { APP_NAME } from '$lib/config';
	import { theme as t } from '$lib/theme';
	import StreamingServiceModal from '$lib/components/StreamingServiceModal.svelte';

	$: hasPair = t.hasPair();
	$: isLight = t.isLight();

	const PLATFORM_LABELS: Record<string, string> = {
		spotifyUrl: 'Spotify', appleMusicUrl: 'Apple Music', youtubeMusicUrl: 'YouTube Music',
		tidalUrl: 'Tidal', deezerUrl: 'Deezer', amazonMusicUrl: 'Amazon Music', soundcloudUrl: 'SoundCloud',
	};

	$: currentLabel = $prefs ? (PLATFORM_LABELS[$prefs] ?? null) : null;

	let modalOpen = false;
</script>

<svelte:head>
	<title>Settings — {APP_NAME}</title>
</svelte:head>

<div class="max-w-sm space-y-8">
	<h1 class="text-2xl font-bold">Settings</h1>

	{#if hasPair}
		<div class="space-y-3">
			<div class="space-y-1">
				<h2 class="text-sm font-semibold {$t.textPrimary}">Appearance</h2>
				<p class="text-xs {$t.textMuted}">Choose between dark and light mode.</p>
			</div>
			<button
				on:click={() => t.toggle()}
				class="flex items-center justify-between w-full px-4 py-3 rounded-lg border transition-colors
					{$t.borderStrong} {$t.surfaceBg} {$t.textSecondary} {$t.hoverBorderStrong} {$t.hoverText}"
			>
				<span class="text-sm">{isLight ? 'Light mode' : 'Dark mode'}</span>
				<span class="text-xs {$t.textMuted}">Switch to {isLight ? 'dark' : 'light'}</span>
			</button>
		</div>
	{/if}

	<div class="space-y-3">
		<div class="space-y-1">
			<h2 class="text-sm font-semibold {$t.textPrimary}">Preferred streaming service</h2>
			<p class="text-xs {$t.textMuted}">
				When set, this platform's link will always appear first on each song. Others are shown in a
				collapsed list.
			</p>
		</div>
		<button
			on:click={() => (modalOpen = true)}
			class="w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors
				{$t.borderStrong} {$t.surfaceBg} {$t.textSecondary} {$t.hoverBorderStrong} {$t.hoverText}"
		>
			<span class="text-sm">{currentLabel ?? 'None set'}</span>
			<span class="text-xs {$t.textMuted}">Change</span>
		</button>
	</div>

	<StreamingServiceModal bind:open={modalOpen} />
</div>
