<script lang="ts">
	import { prefs, type PlatformKey } from '$lib/stores/prefs';
	import { APP_NAME } from '$lib/config';
	import { theme as t } from '$lib/theme';

	const PLATFORMS: { key: PlatformKey; label: string }[] = [
		{ key: 'spotifyUrl',      label: 'Spotify' },
		{ key: 'appleMusicUrl',   label: 'Apple Music' },
		{ key: 'youtubeMusicUrl', label: 'YouTube Music' },
		{ key: 'tidalUrl',        label: 'Tidal' },
		{ key: 'deezerUrl',       label: 'Deezer' },
		{ key: 'amazonMusicUrl',  label: 'Amazon Music' },
		{ key: 'soundcloudUrl',   label: 'SoundCloud' },
	];

	function select(key: PlatformKey) {
		prefs.setPreferredPlatform($prefs === key ? null : key);
	}
</script>

<svelte:head>
	<title>Settings — {APP_NAME}</title>
</svelte:head>

<div class="max-w-sm space-y-8">
	<h1 class="text-2xl font-bold">Settings</h1>

	<div class="space-y-3">
		<div class="space-y-1">
			<h2 class="text-sm font-semibold {t.textPrimary}">Preferred streaming service</h2>
			<p class="text-xs {t.textMuted}">
				When set, this platform's link will always appear first on each song. Others are shown in a
				collapsed list. Tap again to clear.
			</p>
		</div>

		<div class="space-y-1.5">
			{#each PLATFORMS as platform}
				<button
					on:click={() => select(platform.key)}
					class="w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors
						{$prefs === platform.key
							? `${t.borderHighlight} ${t.elevatedBg} ${t.textPrimary}`
							: `${t.borderStrong} ${t.surfaceBg} ${t.textSecondary} ${t.hoverBorderStrong} ${t.hoverText}`}"
				>
					<span class="text-sm">{platform.label}</span>
					{#if $prefs === platform.key}
						<span class="text-xs {t.textMuted}">preferred</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</div>
