<script lang="ts">
	import type { KhordSongRecord } from '$lib/atproto/lexicons/song';
	import { prefs } from '$lib/stores/prefs';
	import type { PlatformKey } from '$lib/stores/prefs';
	import { theme as t } from '$lib/theme';

	export let record: KhordSongRecord;

	const PLATFORMS: { key: PlatformKey; label: string; brand: { bg: string; text: string; border: string } }[] = [
		{ key: 'spotifyUrl',      label: 'Spotify',       brand: { bg: '#1DB954', text: '#000000', border: '#1DB954' } },
		{ key: 'appleMusicUrl',   label: 'Apple Music',   brand: { bg: '#FC3C44', text: '#ffffff', border: '#FC3C44' } },
		{ key: 'youtubeMusicUrl', label: 'YouTube Music', brand: { bg: '#FF0000', text: '#ffffff', border: '#FF0000' } },
		{ key: 'tidalUrl',        label: 'Tidal',         brand: { bg: '#000000', text: '#ffffff', border: '#ffffff' } },
		{ key: 'deezerUrl',       label: 'Deezer',        brand: { bg: '#EF5466', text: '#ffffff', border: '#EF5466' } },
		{ key: 'amazonMusicUrl',  label: 'Amazon Music',  brand: { bg: '#00A8E1', text: '#ffffff', border: '#00A8E1' } },
		{ key: 'soundcloudUrl',   label: 'SoundCloud',    brand: { bg: '#FF5500', text: '#ffffff', border: '#FF5500' } },
	];

	$: all = PLATFORMS.filter((p) => record[p.key]);
	$: pref = $prefs ? (all.find((p) => p.key === $prefs) ?? null) : null;
	$: first = pref ?? all[0] ?? null;
	$: rest = all.filter((p) => p !== first);

	let open = false;
</script>

{#if first}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="relative shrink-0" on:click|stopPropagation on:keydown|stopPropagation>
		<div class="flex items-stretch h-7">
			<a
				href={record[first.key] as string}
				target="_blank"
				rel="noopener noreferrer"
				style="background-color:{first.brand.bg}; color:{first.brand.text}; border-color:{first.brand.border}"
				class="text-xs border flex items-center px-2.5 {rest.length > 0 ? 'rounded-l-full' : 'rounded-full'} hover:opacity-80 transition-opacity whitespace-nowrap"
			>
				{first.label}
			</a>
			{#if rest.length > 0}
				<button
					on:click={() => (open = !open)}
					aria-label="More streaming options"
					style="background-color:{first.brand.bg}; color:{first.brand.text}; border-color:{first.brand.border}"
					class="border border-l-0 flex items-center px-1.5 rounded-r-full hover:opacity-80 transition-opacity"
				>
					<svg viewBox="0 0 10 10" fill="none" class="w-2.5 h-2.5" xmlns="http://www.w3.org/2000/svg">
						<path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			{/if}
		</div>

		{#if open}
			<button class="fixed inset-0 z-10" aria-label="Close" on:click={() => (open = false)}></button>
			<div class="absolute left-0 top-full mt-1.5 z-20 {t.surfaceBg} border {t.borderStrong} rounded-xl shadow-xl overflow-hidden min-w-[140px]">
				{#each rest as platform}
					<a
						href={record[platform.key] as string}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center px-3 py-2 text-xs {t.textSecondary} {t.hoverText} {t.hoverBg} transition-colors"
					>
						{platform.label}
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}
