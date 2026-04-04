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

	onMount(async () => {
		fetch('/api/auth/status').then(r => r.json()).then(data => {
			instanceConfig.set({ albumArtDisabled: data.albumArtDisabled ?? false });
		}).catch(() => {});

		// Skip on the OAuth callback page — it handles auth itself.
		// Use window.location directly: the page store may not yet reflect the
		// current URL when the layout mounts, which would cause a race where the
		// layout calls initAuth() first and consumes the OAuth state from storage.
		if (window.location.pathname === '/oauth/callback') { authReady.set(true); return; }

		const s = await initAuth(true);
		if (s) {
			session.set(s);
			votes.load(s.did).catch(() => {}); // best-effort
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
	let mobileMenuOpen = false;

	function toggleMenu() { menuOpen = !menuOpen; }
	function closeMenu() { menuOpen = false; }
	function toggleMobileMenu() { mobileMenuOpen = !mobileMenuOpen; }
	function closeMobileMenu() { mobileMenuOpen = false; }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
	<header class="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
		<a href="/" class="text-xl font-bold tracking-tight">{APP_NAME.toLowerCase()}</a>

		<!-- Desktop nav -->
		<nav class="hidden sm:flex items-center gap-3 text-sm text-zinc-400">
			<button on:click={() => goto('/')} class="hover:text-zinc-100 transition-colors">Feed</button>
			{#if $isLoggedIn}
				<button
					on:click={openShareSong}
					class="bg-white text-black text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-zinc-200 transition-colors"
				>
					+ Share song
				</button>
				<button
					on:click={openCreateSetlist}
					class="text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
				>
					+ Setlist
				</button>

				<!-- Avatar dropdown -->
				<div class="relative">
					<button
						on:click={toggleMenu}
						aria-label="Account menu"
						class="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden
							ring-2 ring-transparent hover:ring-zinc-600 transition-all"
					>
						{#if $session?.avatar}
							<img src={$session.avatar} alt={$session.handle} class="w-full h-full object-cover" />
						{:else}
							<div class="w-full h-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-300">
								{($session?.handle ?? '?')[0].toUpperCase()}
							</div>
						{/if}
					</button>

					{#if menuOpen}
						<button class="fixed inset-0 z-40" aria-label="Close menu" on:click={closeMenu}></button>
						<div class="absolute right-0 mt-2 w-48 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
							<div class="px-4 py-3 border-b border-zinc-800">
								<p class="text-xs text-zinc-500 truncate">@{$session?.handle}</p>
							</div>
							<div class="py-1">
								<a href="/settings" on:click={closeMenu} class="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
									<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" stroke-width="1.25"/><path d="M13.3 6.6a1 1 0 0 0 .2-1.1l-.8-1.4a1 1 0 0 0-1-.5l-1 .2a5 5 0 0 0-.8-.5l-.2-1A1 1 0 0 0 8.8 2H7.2a1 1 0 0 0-1 .8l-.2 1a5 5 0 0 0-.8.5l-1-.2a1 1 0 0 0-1 .5L2.4 6a1 1 0 0 0 .2 1.1l.7.7v.4l-.7.7a1 1 0 0 0-.2 1.1l.8 1.4a1 1 0 0 0 1 .5l1-.2c.3.2.5.3.8.5l.2 1a1 1 0 0 0 1 .8h1.6a1 1 0 0 0 1-.8l.2-1c.3-.2.5-.3.8-.5l1 .2a1 1 0 0 0 1-.5l.8-1.4a1 1 0 0 0-.2-1.1l-.7-.7v-.4l.7-.7Z" stroke="currentColor" stroke-width="1.25"/></svg>
									Settings
								</a>
								<a href="/invite" on:click={closeMenu} class="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
									<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 8H14M12 6.5V9.5M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 13s-.5-4 4-4 4 4 4 4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
									Invite
								</a>
								<button on:click={() => { closeMenu(); handleLogout(); }} class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
									<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10.5 11 14 8l-3.5-3M14 8H6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
									Sign out
								</button>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<a href="/login" class="hover:text-zinc-100 transition-colors">Sign in</a>
			{/if}
		</nav>

		<!-- Mobile hamburger -->
		<div class="sm:hidden relative">
			<button
				on:click={toggleMobileMenu}
				aria-label="Menu"
				class="flex flex-col justify-center items-center w-8 h-8 gap-1.5 text-zinc-400 hover:text-zinc-100 transition-colors"
			>
				{#if mobileMenuOpen}
					<!-- X icon -->
					<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
						<path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				{:else}
					<!-- Hamburger icon -->
					<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
						<path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				{/if}
			</button>

			{#if mobileMenuOpen}
				<button class="fixed inset-0 z-40" aria-label="Close menu" on:click={closeMobileMenu}></button>
				<div class="absolute right-0 mt-2 w-56 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
					{#if $isLoggedIn}
						<div class="px-4 py-3 border-b border-zinc-800">
							<p class="text-xs text-zinc-500 truncate">@{$session?.handle}</p>
						</div>
					{/if}
					<div class="py-1">
						<button on:click={() => { closeMobileMenu(); goto('/'); }} class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
							<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M2 6.5 8 2l6 4.5V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6 15v-5h4v5" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>
							Feed
						</button>
						{#if $isLoggedIn}
							<button on:click={() => { closeMobileMenu(); openShareSong(); }} class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
								Share song
							</button>
							<button on:click={() => { closeMobileMenu(); openCreateSetlist(); }} class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M2 5h12M2 8h8M2 11h5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>
								New setlist
							</button>
							<a href="/settings" on:click={closeMobileMenu} class="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" stroke-width="1.25"/><path d="M13.3 6.6a1 1 0 0 0 .2-1.1l-.8-1.4a1 1 0 0 0-1-.5l-1 .2a5 5 0 0 0-.8-.5l-.2-1A1 1 0 0 0 8.8 2H7.2a1 1 0 0 0-1 .8l-.2 1a5 5 0 0 0-.8.5l-1-.2a1 1 0 0 0-1 .5L2.4 6a1 1 0 0 0 .2 1.1l.7.7v.4l-.7.7a1 1 0 0 0-.2 1.1l.8 1.4a1 1 0 0 0 1 .5l1-.2c.3.2.5.3.8.5l.2 1a1 1 0 0 0 1 .8h1.6a1 1 0 0 0 1-.8l.2-1c.3-.2.5-.3.8-.5l1 .2a1 1 0 0 0 1-.5l.8-1.4a1 1 0 0 0-.2-1.1l-.7-.7v-.4l.7-.7Z" stroke="currentColor" stroke-width="1.25"/></svg>
								Settings
							</a>
							<a href="/invite" on:click={closeMobileMenu} class="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 8H14M12 6.5V9.5M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 13s-.5-4 4-4 4 4 4 4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
								Invite
							</a>
							<button on:click={() => { closeMobileMenu(); handleLogout(); }} class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10.5 11 14 8l-3.5-3M14 8H6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
								Sign out
							</button>
						{:else}
							<a href="/login" on:click={closeMobileMenu} class="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3.5-3L10 5M13.5 8H5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
								Sign in
							</a>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</header>
	<main class="max-w-2xl mx-auto px-6 py-8">
		<slot />
	</main>

	<footer class="border-t border-zinc-800 mt-16 px-6 py-8">
		<div class="max-w-2xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-600">
			<span class="font-medium text-zinc-500">{APP_NAME.toLowerCase()}</span>
			<div class="flex flex-wrap gap-x-4 gap-y-1.5 items-center">
				<span>Cross-platform links via <a href="https://odesli.co" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-300 transition-colors">Odesli</a></span>
				<span>Music search via <a href="https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-300 transition-colors">iTunes Search API</a></span>
				<span>Spotify data via <a href="https://developer.spotify.com" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-300 transition-colors">Spotify Web API</a></span>
				<span>Identity via <a href="https://atproto.com" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-300 transition-colors">AT Protocol</a></span>
			</div>
		</div>
	</footer>

	{#if $isLoggedIn}
		<!-- FAB -->
		<div class="fixed bottom-6 right-6 z-30">
			<button
				on:click={openShareSong}
				aria-label="Share a song"
				class="w-14 h-14 bg-white text-black rounded-full shadow-lg flex items-center justify-center
					text-2xl hover:bg-zinc-200 transition-all"
			>
				+
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
