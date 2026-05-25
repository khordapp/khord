<script lang="ts">
	import { onMount } from 'svelte';
	import type { SongRecord } from '$lib/stores/shareSong';
	import { prefs } from '$lib/stores/prefs';
	import type { PlatformKey } from '$lib/stores/prefs';
	import { theme as t } from '$lib/theme';
	import { PlayIcon, CaretDownIcon, XIcon } from 'phosphor-svelte';

	export let record: SongRecord;

	const PLATFORMS: { key: PlatformKey; label: string; brand: { bg: string; text: string; border: string } }[] = [
		{ key: 'appleMusicUrl',   label: 'Apple',   brand: { bg: '#FC3C44', text: '#ffffff', border: '#FC3C44' } },
		{ key: 'spotifyUrl',      label: 'Spotify', brand: { bg: '#1DB954', text: '#000000', border: '#1DB954' } },
		{ key: 'youtubeMusicUrl', label: 'YouTube', brand: { bg: '#FF0000', text: '#ffffff', border: '#FF0000' } },
		{ key: 'deezerUrl',       label: 'Deezer',  brand: { bg: '#EF5466', text: '#ffffff', border: '#EF5466' } },
	];

	$: all = PLATFORMS.filter((p) => record[p.key]);
	$: pref = $prefs ? (all.find((p) => p.key === $prefs) ?? null) : null;
	$: first = pref ?? all[0] ?? null;
	$: rest = all.filter((p) => p !== first);

	let open = false;
	let isMobile = false;
	let isNative = false;

	function openPlatformUrl(e: MouseEvent, url: string) {
		if (isNative) {
			e.preventDefault();
			window.open(url, '_system');
		}
	}

	onMount(() => {
		isNative = !!(window as any).Capacitor?.isNativePlatform();
		const mq = window.matchMedia('(max-width: 639px)');
		isMobile = mq.matches;
		const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});
</script>

{#if first}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="relative shrink-0" on:click|stopPropagation on:keydown|stopPropagation>
		<div class="flex items-stretch h-7">
			<a
				href={record[first.key] as string}
				target="_blank"
				rel="noopener noreferrer"
				title="Listen on {first.label}"
				style="color:{first.brand.bg}"
				class="text-xs flex items-center gap-1.5 px-2.5 hover:opacity-70 transition-opacity whitespace-nowrap"
				on:click={(e) => openPlatformUrl(e, record[first.key] as string)}
			>
				<PlayIcon size={20} weight="fill" class="shrink-0" />
				{first.label}
			</a>
			{#if rest.length > 0}
				<button
					on:click={() => (open = !open)}
					aria-label="More streaming options"
					title="More streaming platforms"
					style="color:{first.brand.bg}"
					class="flex items-center px-1.5 hover:opacity-70 transition-opacity"
				>
					<CaretDownIcon size={10} />
				</button>
			{/if}
		</div>

		{#if open && !isMobile}
			<button class="fixed inset-0 z-10" aria-label="Close" on:click={() => (open = false)}></button>
			<div class="absolute left-0 top-full mt-1.5 z-20 {$t.surfaceBg} border {$t.borderStrong} rounded-xl shadow-xl overflow-hidden min-w-[140px]">
				{#each rest as platform}
					<a
						href={record[platform.key] as string}
						target="_blank"
						rel="noopener noreferrer"
						title="Listen on {platform.label}"
						class="flex items-center px-3 py-2 text-xs {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors"
						on:click={(e) => openPlatformUrl(e, record[platform.key] as string)}
					>
						{platform.label}
					</a>
				{/each}
				<div class="border-t {$t.borderBase}">
					<a
						href="/settings"
						title="Set your preferred streaming service"
						class="flex items-center px-3 py-2 text-xs {$t.textFaint} {$t.hoverText} {$t.hoverBg} transition-colors"
					>
						Set default…
					</a>
				</div>
			</div>
		{/if}

		{#if open && isMobile}
			<button class="fixed inset-0 z-40 bg-black/50" aria-label="Close" on:click={() => (open = false)}></button>
			<div class="fixed inset-x-0 bottom-0 z-50 {$t.surfaceBg} border-t {$t.borderStrong} rounded-t-2xl shadow-2xl overflow-hidden">
				<div class="flex items-center justify-between px-4 pt-4 pb-3 border-b {$t.borderBase}">
					<span class="text-sm font-semibold {$t.textPrimary}">Listen on…</span>
					<button on:click={() => (open = false)} aria-label="Close" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">
						<XIcon size={16} />
					</button>
				</div>
				{#each rest as platform}
					<a
						href={record[platform.key] as string}
						target="_blank"
						rel="noopener noreferrer"
						on:click={(e) => { openPlatformUrl(e, record[platform.key] as string); open = false; }}
						class="flex items-center gap-3 px-4 py-3.5 {$t.textSecondary} {$t.hoverBg} transition-colors border-b {$t.borderFaded}"
					>
						<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: {platform.brand.bg}"></span>
						{platform.label}
					</a>
				{/each}
				<a
					href="/settings"
					on:click={() => (open = false)}
					class="flex items-center px-4 py-3.5 text-sm {$t.textFaint} {$t.hoverText} {$t.hoverBg} transition-colors"
				>
					Set default streaming service…
				</a>
				<div class="h-6"></div>
			</div>
		{/if}
	</div>
{/if}
