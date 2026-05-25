<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { APP_NAME, VERSION } from '$lib/config';
	import { session, isLoggedIn, authReady, logout, avatarVersion } from '$lib/stores/auth';
	import { shareSongOpen, openShareSong } from '$lib/stores/shareSong';
	import { createSetlistOpen, openCreateSetlist } from '$lib/stores/createSetlist';
	import { importPlaylistOpen, openImportPlaylist, closeImportPlaylist } from '$lib/stores/importPlaylist';
	import { votes } from '$lib/stores/votes';
	import ShareSongModal from '$lib/components/ShareSongModal.svelte';
	import CreateSetlistModal from '$lib/components/CreateSetlistModal.svelte';
	import StreamingServiceModal from '$lib/components/StreamingServiceModal.svelte';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { instanceConfig } from '$lib/stores/instance';
	import { theme as t } from '$lib/theme';
	import { prefs, type PlatformKey } from '$lib/stores/prefs';
	import { CaretDownIcon, XIcon, HouseIcon, CheckIcon, GearIcon, UserPlusIcon, BuildingsIcon, SunIcon, MoonIcon, InfoIcon, SignOutIcon, PlusIcon, ListPlusIcon, ArrowSquareInIcon } from 'phosphor-svelte';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	const PLATFORM_LABELS: Record<string, string> = {
		spotifyUrl: 'Spotify', appleMusicUrl: 'Apple Music', youtubeMusicUrl: 'YouTube Music',
		tidalUrl: 'Tidal', deezerUrl: 'Deezer', amazonMusicUrl: 'Amazon Music', soundcloudUrl: 'SoundCloud',
	};

	const DRAWER_PLATFORMS: { key: PlatformKey; label: string; color: string }[] = [
		{ key: 'appleMusicUrl',   label: 'Apple Music',   color: '#FC3C44' },
		{ key: 'spotifyUrl',      label: 'Spotify',       color: '#1DB954' },
		{ key: 'youtubeMusicUrl', label: 'YouTube Music', color: '#FF0000' },
		{ key: 'deezerUrl',       label: 'Deezer',        color: '#EF5466' },
	];

	$: currentPlatformLabel = $prefs ? (PLATFORM_LABELS[$prefs] ?? null) : null;

	let serviceSelectorOpen = false;
	let isLightTheme = false;
	let themeHasPair = false;
	$: if ($t) {
		isLightTheme = t.isLight();
		themeHasPair = t.hasPair();
	}

	const PAGE_BG_HEX: Record<string, string> = {
		'bg-stone-950': '#0c0a09', 'bg-stone-100': '#f5f5f4',
		'bg-slate-950': '#020617', 'bg-slate-100': '#f1f5f9',
		'bg-gray-950':  '#030712',
		'bg-neutral-950': '#0a0a0a', 'bg-neutral-100': '#f5f5f5',
		'bg-zinc-100':  '#f4f4f5',
		'bg-blue-950':  '#172554',
		'bg-teal-950':  '#042f2e',
		'bg-emerald-950': '#022c22',
		'bg-rose-950':  '#4c0519',
		'bg-violet-950': '#2e1065',
	};
	$: if (typeof window !== 'undefined') {
		document.body.style.backgroundColor = PAGE_BG_HEX[$t.pageBg] ?? '';
	}

	$: if (typeof window !== 'undefined') syncStatusBar(isLightTheme);

	function syncStatusBar(light: boolean) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const w = window as any;
		if (w.KhordStatusBar?.setLightMode) {
			w.KhordStatusBar.setLightMode(light);
			return;
		}
		const StatusBar = w.Capacitor?.Plugins?.StatusBar;
		if (!StatusBar) return;
		StatusBar.setStyle({ style: light ? 'DARK' : 'LIGHT' });
		StatusBar.setBackgroundColor({ color: light ? '#f4f4f5' : '#09090b' });
	}

	onMount(async () => {

		// Session from SSR — set store immediately so no flicker
		if (data.user) {
			session.set(data.user);
		}

		// Fetch instance config
		fetch('/api/auth/status').then(r => r.json()).then(d => {
			instanceConfig.set({
				albumArtDisabled: d.albumArtDisabled ?? false,
				feedScoped: d.feedScoped ?? false,
				isOwner: d.isOwner ?? false,
				appleMusicEnabled: d.appleMusicEnabled ?? false,
				loaded: true
			});
		}).catch(() => {});

		if (data.user) {
			votes.load().catch(() => {});
			// Register a notification token in Capacitor Preferences so the
			// background fetch task can authenticate against /api/feed/new.
			const Prefs = (window as any).Capacitor?.Plugins?.Preferences;
			if (Prefs) {
				fetch('/api/auth/notif-token', { method: 'POST' })
					.then(r => r.ok ? r.json() : null)
					.then(async (d) => {
						if (!d?.token) return;
						await Prefs.set({ key: 'notif_token', value: d.token });
						await Prefs.set({ key: 'instance_url', value: window.location.origin });
						const existing = await Prefs.get({ key: 'notif_last_seen' });
						if (!existing?.value) {
							await Prefs.set({ key: 'notif_last_seen', value: new Date().toISOString() });
						}
					})
					.catch(() => {});
			}
		}

		authReady.set(true);
	});

	async function handleLogout() {
		await logout();
		votes.reset();
		goto('/');
	}

	$: avatarSrc = $session ? `/api/avatar/${$session.id}?v=${$avatarVersion}` : '';

	let menuOpen = false;
	let fabOpen = false;
	let aboutOpen = false;
	let importUrl = '';

	function toggleMenu() { menuOpen = !menuOpen; }
	function closeMenu() { menuOpen = false; }
	function closeFab() { fabOpen = false; }

	$: isAppleMusicPlaylist = /music\.apple\.com\/[a-z]{2}\/playlist\//.test(importUrl);
	$: showAppleMusicWarning = isAppleMusicPlaylist && !$instanceConfig.appleMusicEnabled;

	function handleImportSubmit() {
		const url = importUrl.trim();
		if (!url || showAppleMusicWarning) return;
		closeImportPlaylist();
		importUrl = '';
		goto(`/share?url=${encodeURIComponent(url)}`);
	}
</script>

<div class="min-h-screen flex flex-col {$t.pageBg} {$t.textPrimary}">
	{#if $navigating}
		<div class="fixed top-0 left-0 right-0 z-[100] h-0.5 overflow-hidden">
			<div class="w-full h-full {$t.btnPrimaryBg} animate-nav-progress"></div>
		</div>
	{/if}
	<header class="border-b {$t.borderBase} px-6 py-3 flex items-center justify-between" style="padding-top: calc(0.75rem + env(safe-area-inset-top, 0px))">
		<a href="/" class="flex items-center gap-2.5">
			<img
				src="/khord-logo.png"
				alt={APP_NAME}
				class="h-9 w-9 rounded-xl"
			/>
			<span class="text-xl font-bold tracking-tight">{APP_NAME.toLowerCase()}</span>
		</a>

		<div class="flex items-center gap-4">
			<div class="relative">
				{#if $isLoggedIn}
					<button
						on:click={toggleMenu}
						aria-label="Account menu"
						class="flex items-center gap-2 hover:opacity-80 transition-opacity"
					>
						<div class="w-7 h-7 rounded-full overflow-hidden shrink-0 ring-2 {$t.borderStrong} relative">
							<div class="absolute inset-0 {$t.elevatedBg} flex items-center justify-center text-xs font-semibold {$t.textSecondary}">
								{($session?.username ?? '?')[0].toUpperCase()}
							</div>
							{#if $session?.hasAvatar && avatarSrc}
								{#key $avatarVersion}
									<img src={avatarSrc} alt="" class="absolute inset-0 w-full h-full object-cover"
										on:error={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
								{/key}
							{/if}
						</div>
						<span class="text-sm {$t.textSecondary} max-w-[120px] truncate hidden sm:block">@{$session?.username}</span>
						<CaretDownIcon size={12} class="shrink-0 {$t.textMuted}" />
					</button>
				{:else}
					<a href="/login" class="text-sm {$t.textMuted} {$t.hoverText} transition-colors">Sign in</a>
				{/if}

				<!-- Account drawer (all screen sizes) -->
				{#if menuOpen}
					<button class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" aria-label="Close menu" on:click={closeMenu}></button>
					<div
						transition:fly={{ x: 320, duration: 220 }}
						class="fixed right-0 top-0 bottom-0 z-50 w-72 {$t.surfaceBg} border-l {$t.borderStrong} shadow-2xl flex flex-col overflow-y-auto"
						style="padding-top: env(safe-area-inset-top, 0px)"
					>
						<div class="flex items-center justify-between px-5 py-5 border-b {$t.borderBase}">
							<div class="flex items-center gap-3 min-w-0">
								<div class="w-10 h-10 rounded-full overflow-hidden shrink-0 ring-2 {$t.borderStrong} relative">
									<div class="absolute inset-0 {$t.elevatedBg} flex items-center justify-center text-sm font-semibold {$t.textSecondary}">
										{($session?.username ?? '?')[0].toUpperCase()}
									</div>
									{#if $session?.hasAvatar && avatarSrc}
										{#key $avatarVersion}
											<img src={avatarSrc} alt="" class="absolute inset-0 w-full h-full object-cover"
												on:error={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
										{/key}
									{/if}
								</div>
								<span class="text-sm font-medium {$t.textSecondary} truncate">@{$session?.username}</span>
							</div>
							<button on:click={closeMenu} aria-label="Close menu" class="p-1.5 rounded-lg {$t.textMuted} {$t.hoverText} transition-colors shrink-0">
								<XIcon size={20} />
							</button>
						</div>

						<nav class="flex-1 py-2">
							<a href="/" on:click={closeMenu} class="flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<HouseIcon size={20} class="shrink-0" />
								Feed
							</a>
							<!-- Streaming service inline selector -->
							<div class="border-b {$t.borderBase} pb-1 mb-1">
								<p class="px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider {$t.textMuted}">Streaming service</p>
								{#each DRAWER_PLATFORMS as platform}
									<button
										on:click={() => prefs.setPreferredPlatform($prefs === platform.key ? null : platform.key)}
										class="w-full flex items-center gap-4 px-5 py-4 text-base transition-colors {$t.hoverBg}
											{$prefs === platform.key ? $t.textPrimary : $t.textSecondary}"
									>
										<span class="w-4 h-4 rounded-full shrink-0" style="background-color: {platform.color}"></span>
										<span class="flex-1 text-left">{platform.label}</span>
										{#if $prefs === platform.key}
											<CheckIcon size={16} class="shrink-0" />
										{/if}
									</button>
								{/each}
								{#if $prefs}
									<button
										on:click={() => prefs.setPreferredPlatform(null)}
										class="w-full flex items-center px-5 py-3 text-sm {$t.textFaint} {$t.hoverText} {$t.hoverBg} transition-colors"
									>
										Clear preference
									</button>
								{/if}
							</div>
							<a href="/settings" on:click={closeMenu} class="flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<GearIcon size={20} class="shrink-0" />
								All Settings
							</a>
							<a href="/invite" on:click={closeMenu} class="flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<UserPlusIcon size={20} class="shrink-0" />
								Invite
							</a>
							{#if $instanceConfig.isOwner}
								<a href="/admin" on:click={closeMenu} class="flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
									<BuildingsIcon size={20} class="shrink-0" />
									Admin
								</a>
							{/if}
						</nav>

						<div class="border-t {$t.borderBase} py-2">
							{#if themeHasPair}
								<button on:click={t.toggle} class="w-full flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
									{#if isLightTheme}
										<SunIcon size={20} class="shrink-0" />
										Dark mode
									{:else}
										<MoonIcon size={20} class="shrink-0" />
										Light mode
									{/if}
								</button>
							{/if}
							<button on:click={() => { closeMenu(); aboutOpen = true; }} class="w-full flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<InfoIcon size={20} class="shrink-0" />
								About
							</button>
							<button on:click={() => { closeMenu(); handleLogout(); }} class="w-full flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<SignOutIcon size={20} class="shrink-0" />
								Sign out
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</header>

	<main class="flex-1 w-full max-w-2xl mx-auto px-6 pb-6 sm:py-8">
		<slot />
	</main>

	{#if $isLoggedIn}
		<div class="fixed bottom-6 right-6 z-30 hidden sm:flex flex-col items-end gap-3">
			{#if fabOpen}
				<button class="fixed inset-0 z-10" aria-label="Close" on:click={closeFab}></button>
				<div class="relative z-20 flex flex-col items-end gap-3">
					<button
						on:click={() => { closeFab(); openShareSong(); }}
						class="flex items-center gap-3 sm:gap-2.5 {$t.elevatedBg} {$t.textPrimary} text-base sm:text-sm font-medium
							px-5 py-3.5 sm:px-4 sm:py-2.5 rounded-full shadow-lg {$t.hoverBgStrong} transition-colors"
					>
						<PlusIcon size={20} class="shrink-0 sm:w-4 sm:h-4" />
						Share song
					</button>
					<button
						on:click={() => { closeFab(); openCreateSetlist(); }}
						class="flex items-center gap-3 sm:gap-2.5 {$t.elevatedBg} {$t.textPrimary} text-base sm:text-sm font-medium
							px-5 py-3.5 sm:px-4 sm:py-2.5 rounded-full shadow-lg {$t.hoverBgStrong} transition-colors"
					>
						<ListPlusIcon size={20} class="shrink-0 sm:w-4 sm:h-4" />
						New mixtape
					</button>
					<button
						on:click={() => { closeFab(); openImportPlaylist(); }}
						class="flex items-center gap-3 sm:gap-2.5 {$t.elevatedBg} {$t.textPrimary} text-base sm:text-sm font-medium
							px-5 py-3.5 sm:px-4 sm:py-2.5 rounded-full shadow-lg {$t.hoverBgStrong} transition-colors"
					>
						<ArrowSquareInIcon size={20} class="shrink-0 sm:w-4 sm:h-4" />
						Import playlist
					</button>
				</div>
			{/if}
			<button
				on:click={() => (fabOpen = !fabOpen)}
				aria-label={fabOpen ? 'Close' : 'Quick actions'}
				class="relative z-20 w-14 h-14 {$t.btnPrimaryBg} {$t.btnPrimaryText} rounded-full shadow-lg flex items-center justify-center
					{$t.btnPrimaryHover} transition-all"
			>
				<PlusIcon size={20} class="transition-transform {fabOpen ? 'rotate-45' : ''}" />
			</button>
		</div>
	{/if}
</div>

{#if aboutOpen}
	<button class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" aria-label="Close" on:click={() => (aboutOpen = false)}></button>
	<div
		transition:fly={{ y: 320, duration: 260 }}
		class="fixed z-50 bottom-0 left-0 right-0 flex flex-col
			sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:right-auto sm:-translate-y-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-sm
			{$t.surfaceBg} border-t border-l border-r sm:border {$t.borderStrong}
			rounded-t-3xl sm:rounded-2xl shadow-2xl
			max-h-[88dvh] sm:max-h-none sm:overflow-hidden"
		role="dialog"
		aria-modal="true"
		aria-label="About {APP_NAME}"
	>
		<div class="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
			<div class="w-10 h-1 rounded-full {$t.borderStrong} bg-current opacity-30"></div>
		</div>

		<div class="px-6 py-4 border-b {$t.borderBase} flex items-center justify-between shrink-0">
			<h2 class="text-base font-semibold {$t.textPrimary}">About {APP_NAME}</h2>
			<button on:click={() => (aboutOpen = false)} class="{$t.textMuted} {$t.hoverText} transition-colors text-xl leading-none" aria-label="Close">✕</button>
		</div>

		<div class="overflow-y-auto px-6 py-6 space-y-6 text-sm {$t.textFaint}">
			<div class="flex flex-col items-center gap-3 text-center">
				<img src="/khord-logo.png" alt={APP_NAME} class="h-24 w-24 rounded-3xl shadow-lg" />
				<div>
					<p class="text-xl font-bold {$t.textPrimary}">{APP_NAME}</p>
					<p class="mt-0.5">v{VERSION}</p>
				</div>
				<a href="https://www.khord.app" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">www.khord.app</a>
			</div>

			<div class="space-y-3 border-t {$t.borderFaded} pt-5">
				<p class="{$t.textSecondary} font-semibold">Data sources</p>
				<p>Music search via <a href="https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">iTunes Search API</a></p>
				<p>Spotify data via <a href="https://developer.spotify.com" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">Spotify Web API</a></p>
				<p>YouTube Music data via <a href="https://developers.google.com/youtube/v3" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">YouTube Data API</a></p>
				<p>Deezer data via <a href="https://developers.deezer.com" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">Deezer API</a></p>
			</div>
		</div>

		<div class="shrink-0 sm:hidden" style="height: env(safe-area-inset-bottom, 12px)"></div>
	</div>
{/if}

{#if $shareSongOpen}
	<ShareSongModal />
{/if}

{#if $createSetlistOpen}
	<CreateSetlistModal />
{/if}

{#if $importPlaylistOpen}
	<button class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" aria-label="Close" on:click={() => { closeImportPlaylist(); importUrl = ''; }}></button>
	<div
		class="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 sm:left-1/2 sm:right-auto sm:top-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-sm
			{$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden"
		role="dialog"
		aria-modal="true"
		aria-label="Import playlist"
	>
		<div class="px-5 py-4 border-b {$t.borderBase} flex items-center justify-between">
			<h2 class="text-sm font-semibold {$t.textPrimary}">Import playlist</h2>
			<button on:click={() => { closeImportPlaylist(); importUrl = ''; }} class="{$t.textMuted} {$t.hoverText} transition-colors text-lg leading-none" aria-label="Close">✕</button>
		</div>
		<div class="px-5 py-5 space-y-4">
			<p class="text-xs {$t.textMuted}">Paste a playlist link from Spotify, Apple Music, Deezer, or YouTube Music.</p>
			<input
				bind:value={importUrl}
				type="url"
				placeholder="https://open.spotify.com/playlist/…"
				style="font-size: 16px;"
				class="w-full px-3 py-2.5 rounded-lg border {$t.borderStrong} {$t.surfaceBg} {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none {$t.focusRing}"
				on:keydown={(e) => e.key === 'Enter' && handleImportSubmit()}
			/>
			{#if showAppleMusicWarning}
				<p class="text-xs text-amber-400">Apple Music playlist import is not enabled on this instance. Contact your instance admin.</p>
			{/if}
			<div class="flex gap-2 justify-end">
				<button
					on:click={() => { closeImportPlaylist(); importUrl = ''; }}
					class="px-4 py-2 rounded-lg border {$t.borderStrong} {$t.textMuted} text-sm {$t.hoverBg} transition-colors"
				>
					Cancel
				</button>
				<button
					on:click={handleImportSubmit}
					disabled={!importUrl.trim() || showAppleMusicWarning}
					class="px-4 py-2 rounded-lg text-sm font-semibold {$t.btnPrimaryBg} {$t.btnPrimaryText} {$t.btnPrimaryHover} transition-colors disabled:opacity-40"
				>
					Import
				</button>
			</div>
		</div>
	</div>
{/if}

<StreamingServiceModal bind:open={serviceSelectorOpen} />
