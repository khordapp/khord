<script lang="ts">
	import { prefs, type PlatformKey } from '$lib/stores/prefs';
	import { theme as t } from '$lib/theme';

	export let open = false;

	const PLATFORMS: { key: PlatformKey; label: string; color: string }[] = [
		{ key: 'appleMusicUrl',   label: 'Apple Music',   color: '#FC3C44' },
		{ key: 'spotifyUrl',      label: 'Spotify',       color: '#1DB954' },
		{ key: 'youtubeMusicUrl', label: 'YouTube Music', color: '#FF0000' },
		{ key: 'deezerUrl',       label: 'Deezer',        color: '#EF5466' },
	];

	function select(key: PlatformKey) {
		prefs.setPreferredPlatform($prefs === key ? null : key);
		open = false;
	}
</script>

{#if open}
	<button
		class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
		on:click={() => (open = false)}
		aria-label="Close"
	></button>
	<div
		class="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 sm:left-1/2 sm:right-auto sm:w-80 sm:-translate-x-1/2 {$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden"
		role="dialog"
		aria-modal="true"
		aria-label="Choose streaming service"
	>
		<div class="flex items-center justify-between px-5 py-4 border-b {$t.borderBase}">
			<h2 class="text-base font-semibold {$t.textPrimary}">Streaming service</h2>
			<button
				on:click={() => (open = false)}
				aria-label="Close"
				class="p-1 rounded-lg {$t.textMuted} {$t.hoverText} transition-colors"
			>
				<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
					<path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		</div>
		<div class="py-1">
			{#each PLATFORMS as platform}
				<button
					on:click={() => select(platform.key)}
					class="w-full flex items-center gap-3.5 px-5 py-3.5 transition-colors {$t.hoverBg}
						{$prefs === platform.key ? $t.textPrimary : $t.textSecondary}"
				>
					<span class="w-3 h-3 rounded-full shrink-0" style="background-color: {platform.color}"></span>
					<span class="flex-1 text-left text-base">{platform.label}</span>
					{#if $prefs === platform.key}
						<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					{/if}
				</button>
			{/each}
			{#if $prefs}
				<div class="border-t {$t.borderBase} py-1 mt-1">
					<button
						on:click={() => { prefs.setPreferredPlatform(null); open = false; }}
						class="w-full flex items-center px-5 py-3 text-sm {$t.textFaint} {$t.hoverText} {$t.hoverBg} transition-colors"
					>
						Clear preference
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
