<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { APP_NAME, VERSION } from '$lib/config';
	import { initAuth, signOut } from '$lib/atproto/agent';
	import { session, isLoggedIn, authReady } from '$lib/stores/auth';
	import { following, followingLoaded } from '$lib/stores/following';
	import { getFollowing } from '$lib/atproto/social';
	import { shareSongOpen, openShareSong } from '$lib/stores/shareSong';
	import { createSetlistOpen, openCreateSetlist } from '$lib/stores/createSetlist';
	import { votes } from '$lib/stores/votes';
	import ShareSongModal from '$lib/components/ShareSongModal.svelte';
	import CreateSetlistModal from '$lib/components/CreateSetlistModal.svelte';
	import StreamingServiceModal from '$lib/components/StreamingServiceModal.svelte';
	import { goto } from '$app/navigation';
	import { instanceConfig } from '$lib/stores/instance';
	import { theme as t } from '$lib/theme';
	import { prefs } from '$lib/stores/prefs';

	const PLATFORM_LABELS: Record<string, string> = {
		spotifyUrl: 'Spotify', appleMusicUrl: 'Apple Music', youtubeMusicUrl: 'YouTube Music',
		tidalUrl: 'Tidal', deezerUrl: 'Deezer', amazonMusicUrl: 'Amazon Music', soundcloudUrl: 'SoundCloud',
	};

	$: currentPlatformLabel = $prefs ? (PLATFORM_LABELS[$prefs] ?? null) : null;

	let serviceSelectorOpen = false;
	let isMobile = false;
	let isLightTheme = false;
	$: if ($t) isLightTheme = t.isLight();

	onMount(async () => {
		const mq = window.matchMedia('(max-width: 639px)');
		isMobile = mq.matches;
		mq.addEventListener('change', (e) => { isMobile = e.matches; });

		if (window.location.pathname === '/oauth/callback') { authReady.set(true); return; }

		// Skip auto-restore if the user explicitly signed out — they'll re-auth via login page.
		let signedOut = false;
		try { signedOut = localStorage.getItem('khord_signed_out') === 'true'; } catch {}

		const s = signedOut ? null : await initAuth(true);

		// Fetch instance config — pass DID when available so isOwner is resolved
		const statusUrl = s ? `/api/auth/status?did=${encodeURIComponent(s.did)}` : '/api/auth/status';
		fetch(statusUrl).then(r => r.json()).then(data => {
			instanceConfig.set({
				albumArtDisabled: data.albumArtDisabled ?? false,
				feedScoped: data.feedScoped ?? false,
				isOwner: data.isOwner ?? false,
				loaded: true
			});
		}).catch(() => {});

		if (s) {
			session.set(s);
			try {
				localStorage.setItem('khord_last_handle', '@' + s.handle);
				localStorage.setItem('khord_last_did', s.did);
				localStorage.removeItem('khord_signed_out');
			} catch {}
			votes.load(s.did).catch(() => {});
			followingLoaded.set(false);
			getFollowing(s.did).then((follows) => {
				following.set(follows);
				followingLoaded.set(true);
			});
		}
		authReady.set(true);
	});

	async function handleLogout() {
		await signOut();
		session.set(null);
		following.set([]);
		followingLoaded.set(false);
		votes.reset();
		goto('/');
	}

	let menuOpen = false;
	let fabOpen = false;
	let aboutOpen = false;

	function toggleMenu() { menuOpen = !menuOpen; }
	function closeMenu() { menuOpen = false; }
	function closeFab() { fabOpen = false; }
</script>

<div class="min-h-screen flex flex-col {$t.pageBg} {$t.textPrimary}">
	<header class="border-b {$t.borderBase} px-6 py-3 flex items-center justify-between" style="padding-top: calc(0.75rem + env(safe-area-inset-top, 0px))">
		<a href="/" class="flex items-center gap-2.5">
			<img
				src={isLightTheme ? '/khord-logo-light.png' : '/khord-logo-dark.png'}
				alt={APP_NAME}
				class="h-9 w-9 rounded-xl"
			/>
			<span class="text-xl font-bold tracking-tight">{APP_NAME.toLowerCase()}</span>
		</a>

		<div class="flex items-center gap-4">
			{#if $isLoggedIn}
				<!-- Streaming selector — desktop only; mobile accesses this from the bottom toolbar -->
				<button
					on:click={() => (serviceSelectorOpen = true)}
					title={currentPlatformLabel ? `Streaming on ${currentPlatformLabel} — change` : 'Set streaming service'}
					class="hidden sm:flex items-center gap-1 transition-opacity hover:opacity-70 {currentPlatformLabel ? '' : $t.textFaint}"
				>
					<span class="text-2xl leading-none" aria-hidden="true">🎧</span>
					<svg viewBox="0 0 10 10" fill="none" class="w-2 h-2 shrink-0" xmlns="http://www.w3.org/2000/svg">
						<path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			{/if}

			<div class="relative">
				{#if $isLoggedIn}
					<button
						on:click={toggleMenu}
						aria-label="Account menu"
						class="flex items-center gap-2 hover:opacity-80 transition-opacity"
					>
						<div class="w-7 h-7 rounded-full overflow-hidden shrink-0 ring-2 {$t.borderStrong}">
							{#if $session?.avatar}
								<img src={$session.avatar} alt={$session.handle} class="w-full h-full object-cover" />
							{:else}
								<div class="w-full h-full {$t.elevatedBg} flex items-center justify-center text-xs font-semibold {$t.textSecondary}">
									{($session?.handle ?? '?')[0].toUpperCase()}
								</div>
							{/if}
						</div>
						<span class="text-sm {$t.textSecondary} max-w-[120px] truncate hidden sm:block">@{$session?.handle}</span>
						<svg viewBox="0 0 10 10" fill="none" class="w-3 h-3 {$t.textMuted} shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				{:else}
					<a href="/login" class="text-sm {$t.textMuted} {$t.hoverText} transition-colors">Sign in</a>
				{/if}

				<!-- Desktop dropdown (sm and up) -->
				{#if menuOpen && !isMobile}
					<button class="fixed inset-0 z-40" aria-label="Close menu" on:click={closeMenu}></button>
					<div class="absolute right-0 mt-2 w-52 z-50 {$t.surfaceBg} border {$t.borderStrong} rounded-xl shadow-xl overflow-hidden">
						<div class="px-4 py-3 border-b {$t.borderBase}">
							<p class="text-xs font-medium {$t.textSecondary} truncate">@{$session?.handle}</p>
						</div>
						<div class="py-1">
							<a href="/" on:click={closeMenu} class="flex items-center gap-2.5 px-4 py-2.5 text-sm {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M2 6.5 8 2l6 4.5V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6 15v-5h4v5" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>
								Feed
							</a>
							<a href="/settings" on:click={closeMenu} class="flex items-center gap-2.5 px-4 py-2.5 text-sm {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" stroke-width="1.25"/><path d="M13.3 6.6a1 1 0 0 0 .2-1.1l-.8-1.4a1 1 0 0 0-1-.5l-1 .2a5 5 0 0 0-.8-.5l-.2-1A1 1 0 0 0 8.8 2H7.2a1 1 0 0 0-1 .8l-.2 1a5 5 0 0 0-.8.5l-1-.2a1 1 0 0 0-1 .5L2.4 6a1 1 0 0 0 .2 1.1l.7.7v.4l-.7.7a1 1 0 0 0-.2 1.1l.8 1.4a1 1 0 0 0 1 .5l1-.2c.3.2.5.3.8.5l.2 1a1 1 0 0 0 1 .8h1.6a1 1 0 0 0 1-.8l.2-1c.3-.2.5-.3.8-.5l1 .2a1 1 0 0 0 1-.5l.8-1.4a1 1 0 0 0-.2-1.1l-.7-.7v-.4l.7-.7Z" stroke="currentColor" stroke-width="1.25"/></svg>
								Settings
							</a>
							<a href="/invite" on:click={closeMenu} class="flex items-center gap-2.5 px-4 py-2.5 text-sm {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 8H14M12 6.5V9.5M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 13s-.5-4 4-4 4 4 4 4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
								Invite
							</a>
							{#if $instanceConfig.isOwner}
								<a href="/admin" on:click={closeMenu} class="flex items-center gap-2.5 px-4 py-2.5 text-sm {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
									<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M8 2a2 2 0 0 1 2 2v.5l2.5 1.5V13H3.5V6L6 4.5V4a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.5 13v-3a1.5 1.5 0 0 1 3 0v3" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>
									Admin
								</a>
							{/if}
							<div class="border-t {$t.borderBase} mt-1 pt-1">
								{#if t.hasPair()}
									<button on:click={t.toggle} class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
										{#if t.isLight()}
											<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.25"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>
											Dark mode
										{:else}
											<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>
											Light mode
										{/if}
									</button>
								{/if}
								<button on:click={() => { closeMenu(); aboutOpen = true; }} class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
									<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.25"/><path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>
									About
								</button>
								<button on:click={() => { closeMenu(); handleLogout(); }} class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
									<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10.5 11 14 8l-3.5-3M14 8H6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
									Sign out
								</button>
							</div>
						</div>
					</div>
				{/if}

				<!-- Mobile drawer (below sm) -->
				{#if menuOpen && isMobile}
					<button class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" aria-label="Close menu" on:click={closeMenu}></button>
					<div
						transition:fly={{ x: 320, duration: 220 }}
						class="fixed right-0 top-0 bottom-0 z-50 w-72 {$t.surfaceBg} border-l {$t.borderStrong} shadow-2xl flex flex-col overflow-y-auto"
					>
						<!-- Drawer header: avatar + close -->
						<div class="flex items-center justify-between px-5 py-5 border-b {$t.borderBase}">
							<div class="flex items-center gap-3 min-w-0">
								<div class="w-10 h-10 rounded-full overflow-hidden shrink-0 ring-2 {$t.borderStrong}">
									{#if $session?.avatar}
										<img src={$session.avatar} alt={$session.handle} class="w-full h-full object-cover" />
									{:else}
										<div class="w-full h-full {$t.elevatedBg} flex items-center justify-center text-sm font-semibold {$t.textSecondary}">
											{($session?.handle ?? '?')[0].toUpperCase()}
										</div>
									{/if}
								</div>
								<span class="text-sm font-medium {$t.textSecondary} truncate">@{$session?.handle}</span>
							</div>
							<button on:click={closeMenu} aria-label="Close menu" class="p-1.5 rounded-lg {$t.textMuted} {$t.hoverText} transition-colors shrink-0">
								<svg viewBox="0 0 14 14" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
									<path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
								</svg>
							</button>
						</div>

						<!-- Nav links -->
						<nav class="flex-1 py-2">
							<a href="/" on:click={closeMenu} class="flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M2 6.5 8 2l6 4.5V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6 15v-5h4v5" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>
								Feed
							</a>
							<a href="/settings" on:click={closeMenu} class="flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" stroke-width="1.25"/><path d="M13.3 6.6a1 1 0 0 0 .2-1.1l-.8-1.4a1 1 0 0 0-1-.5l-1 .2a5 5 0 0 0-.8-.5l-.2-1A1 1 0 0 0 8.8 2H7.2a1 1 0 0 0-1 .8l-.2 1a5 5 0 0 0-.8.5l-1-.2a1 1 0 0 0-1 .5L2.4 6a1 1 0 0 0 .2 1.1l.7.7v.4l-.7.7a1 1 0 0 0-.2 1.1l.8 1.4a1 1 0 0 0 1 .5l1-.2c.3.2.5.3.8.5l.2 1a1 1 0 0 0 1 .8h1.6a1 1 0 0 0 1-.8l.2-1c.3-.2.5-.3.8-.5l1 .2a1 1 0 0 0 1-.5l.8-1.4a1 1 0 0 0-.2-1.1l-.7-.7v-.4l.7-.7Z" stroke="currentColor" stroke-width="1.25"/></svg>
								Settings
							</a>
							<a href="/invite" on:click={closeMenu} class="flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 8H14M12 6.5V9.5M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 13s-.5-4 4-4 4 4 4 4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
								Invite
							</a>
							{#if $instanceConfig.isOwner}
								<a href="/admin" on:click={closeMenu} class="flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
									<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M8 2a2 2 0 0 1 2 2v.5l2.5 1.5V13H3.5V6L6 4.5V4a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6.5 13v-3a1.5 1.5 0 0 1 3 0v3" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>
									Admin
								</a>
							{/if}
						</nav>

						<!-- Bottom: theme toggle + about + sign out -->
						<div class="border-t {$t.borderBase} py-2">
							{#if t.hasPair()}
								<button on:click={t.toggle} class="w-full flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
									{#if t.isLight()}
										<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 shrink-0" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.25"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>
										Dark mode
									{:else}
										<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>
										Light mode
									{/if}
								</button>
							{/if}
							<button on:click={() => { closeMenu(); aboutOpen = true; }} class="w-full flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 shrink-0" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.25"/><path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>
								About
							</button>
							<button on:click={() => { closeMenu(); handleLogout(); }} class="w-full flex items-center gap-4 px-5 py-4 text-base {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10.5 11 14 8l-3.5-3M14 8H6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
		<!-- FAB — desktop only; mobile uses the bottom nav bar in +page.svelte -->
		<div class="fixed bottom-6 right-6 z-30 hidden sm:flex flex-col items-end gap-3">
			{#if fabOpen}
				<button class="fixed inset-0 z-10" aria-label="Close" on:click={closeFab}></button>
				<div class="relative z-20 flex flex-col items-end gap-3">
					<button
						on:click={() => { closeFab(); openShareSong(); }}
						class="flex items-center gap-3 sm:gap-2.5 {$t.elevatedBg} {$t.textPrimary} text-base sm:text-sm font-medium
							px-5 py-3.5 sm:px-4 sm:py-2.5 rounded-full shadow-lg {$t.hoverBgStrong} transition-colors"
					>
						<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 sm:w-4 sm:h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
						Share song
					</button>
					<button
						on:click={() => { closeFab(); openCreateSetlist(); }}
						class="flex items-center gap-3 sm:gap-2.5 {$t.elevatedBg} {$t.textPrimary} text-base sm:text-sm font-medium
							px-5 py-3.5 sm:px-4 sm:py-2.5 rounded-full shadow-lg {$t.hoverBgStrong} transition-colors"
					>
						<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 sm:w-4 sm:h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 5h12M2 8h8M2 11h5M13 9v6M10 12h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
						</svg>
						New mixtape
					</button>
				</div>
			{/if}
			<button
				on:click={() => (fabOpen = !fabOpen)}
				aria-label={fabOpen ? 'Close' : 'Quick actions'}
				class="relative z-20 w-14 h-14 {$t.btnPrimaryBg} {$t.btnPrimaryText} rounded-full shadow-lg flex items-center justify-center
					{$t.btnPrimaryHover} transition-all"
			>
				<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5 transition-transform {fabOpen ? 'rotate-45' : ''}" xmlns="http://www.w3.org/2000/svg">
					<path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
				</svg>
			</button>
		</div>
	{/if}
</div>


{#if aboutOpen}
	<button class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" aria-label="Close" on:click={() => (aboutOpen = false)}></button>
	<div
		transition:fly={{ y: 16, duration: 180 }}
		class="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 sm:left-1/2 sm:right-auto sm:top-24 sm:translate-y-0 sm:-translate-x-1/2 sm:w-full sm:max-w-sm
			{$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden"
		role="dialog"
		aria-modal="true"
		aria-label="About {APP_NAME}"
	>
		<div class="px-5 py-4 border-b {$t.borderBase} flex items-center justify-between">
			<h2 class="text-sm font-semibold {$t.textPrimary}">About {APP_NAME}</h2>
			<button on:click={() => (aboutOpen = false)} class="{$t.textMuted} {$t.hoverText} transition-colors text-lg leading-none" aria-label="Close">✕</button>
		</div>
		<div class="px-5 py-5 space-y-5 text-xs {$t.textFaint}">
			<div class="flex flex-col items-center gap-1 text-center">
				<span class="text-sm font-semibold {$t.textMuted}">{APP_NAME.toLowerCase()}</span>
				<span>v{VERSION}</span>
				<a href="https://www.khord.app" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">Powered by Khord</a>
			</div>
			<div class="space-y-1.5 border-t {$t.borderFaded} pt-4">
				<p class="{$t.textMuted} font-medium mb-2">Data sources</p>
				<p>Music search via <a href="https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">iTunes Search API</a></p>
				<p>Spotify data via <a href="https://developer.spotify.com" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">Spotify Web API</a></p>
				<p>YouTube Music data via <a href="https://developers.google.com/youtube/v3" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">YouTube Data API</a></p>
				<p>Deezer data via <a href="https://developers.deezer.com" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">Deezer API</a></p>
				<p>Identity via <a href="https://atproto.com" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">AT Protocol</a></p>
			</div>
		</div>
	</div>
{/if}

{#if $shareSongOpen}
	<ShareSongModal />
{/if}

{#if $createSetlistOpen}
	<CreateSetlistModal />
{/if}

<StreamingServiceModal bind:open={serviceSelectorOpen} />
