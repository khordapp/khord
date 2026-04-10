<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { APP_NAME } from '$lib/config';
	import { initAuth, signOut } from '$lib/atproto/agent';
	import { session, isLoggedIn, authReady } from '$lib/stores/auth';
	import { following, followingLoaded } from '$lib/stores/following';
	import { getFollowing } from '$lib/atproto/social';
	import { shareSongOpen, openShareSong } from '$lib/stores/shareSong';
	import { createSetlistOpen, openCreateSetlist } from '$lib/stores/createSetlist';
	import { votes } from '$lib/stores/votes';
	import ShareSongModal from '$lib/components/ShareSongModal.svelte';
	import CreateSetlistModal from '$lib/components/CreateSetlistModal.svelte';
	import { goto } from '$app/navigation';
	import { instanceConfig } from '$lib/stores/instance';
	import { theme as t } from '$lib/theme';

	onMount(async () => {
		if (window.location.pathname === '/oauth/callback') { authReady.set(true); return; }

		const s = await initAuth(true);

		// Fetch instance config — pass DID when available so isOwner is resolved
		const statusUrl = s ? `/api/auth/status?did=${encodeURIComponent(s.did)}` : '/api/auth/status';
		fetch(statusUrl).then(r => r.json()).then(data => {
			instanceConfig.set({
				albumArtDisabled: data.albumArtDisabled ?? false,
				isOwner: data.isOwner ?? false,
				loaded: true
			});
		}).catch(() => {});

		if (s) {
			session.set(s);
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

	function toggleMenu() { menuOpen = !menuOpen; }
	function closeMenu() { menuOpen = false; }
	function closeFab() { fabOpen = false; }
</script>

<div class="min-h-screen {$t.pageBg} {$t.textPrimary}">
	<header class="border-b {$t.borderBase} px-6 py-3 flex items-center justify-between">
		<a href="/" class="text-xl font-bold tracking-tight">{APP_NAME.toLowerCase()}</a>

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

			{#if menuOpen}
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
							<button on:click={() => { closeMenu(); handleLogout(); }} class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm {$t.textSecondary} {$t.hoverText} {$t.hoverBg} transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10.5 11 14 8l-3.5-3M14 8H6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
								Sign out
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</header>

	<main class="max-w-2xl mx-auto px-6 py-8">
		<slot />
	</main>

	<footer class="border-t {$t.borderBase} mt-16 px-6 py-8">
		<div class="max-w-2xl mx-auto space-y-4 text-xs {$t.textFaint}">
			<!-- Top row: app name + powered-by -->
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
				<span class="font-semibold {$t.textMuted}">{APP_NAME.toLowerCase()}</span>
				<a
					href="https://khord.app"
					target="_blank"
					rel="noopener noreferrer"
					class="{$t.textFaint} {$t.hoverTextSecondary} transition-colors"
				>Powered by Khord</a>
			</div>
			<!-- Bottom row: API attributions -->
			<div class="flex flex-wrap gap-x-4 gap-y-1.5 border-t {$t.borderFaded} pt-4">
				<span>Cross-platform links via <a href="https://odesli.co" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">Odesli</a></span>
				<span>Music search via <a href="https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">iTunes Search API</a></span>
				<span>Spotify data via <a href="https://developer.spotify.com" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">Spotify Web API</a></span>
				<span>Identity via <a href="https://atproto.com" target="_blank" rel="noopener noreferrer" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">AT Protocol</a></span>
			</div>
		</div>
	</footer>

	{#if $isLoggedIn}
		<!-- FAB -->
		<div class="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
			{#if fabOpen}
				<button class="fixed inset-0 z-10" aria-label="Close" on:click={closeFab}></button>
				<div class="relative z-20 flex flex-col items-end gap-2">
					<button
						on:click={() => { closeFab(); openShareSong(); }}
						class="flex items-center gap-2.5 {$t.elevatedBg} {$t.textPrimary} text-sm font-medium
							px-4 py-2.5 rounded-full shadow-lg {$t.hoverBgStrong} transition-colors"
					>
						<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
						Share song
					</button>
					<button
						on:click={() => { closeFab(); openCreateSetlist(); }}
						class="flex items-center gap-2.5 {$t.elevatedBg} {$t.textPrimary} text-sm font-medium
							px-4 py-2.5 rounded-full shadow-lg {$t.hoverBgStrong} transition-colors"
					>
						<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 5h12M2 8h8M2 11h5M13 9v6M10 12h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
						</svg>
						New setlist
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

{#if $shareSongOpen}
	<ShareSongModal />
{/if}

{#if $createSetlistOpen}
	<CreateSetlistModal />
{/if}
