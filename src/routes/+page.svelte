<script lang="ts">
	import { isLoggedIn, session, authReady } from '$lib/stores/auth';
	import { following, followingLoaded } from '$lib/stores/following';
	import { fetchSongs, fetchSetlists, createSetlist } from '$lib/atproto/social';
	import type { FollowedUser } from '$lib/atproto/social';
	import type { KhordSongRecord } from '$lib/atproto/lexicons/song';
	import { SONG_NSID } from '$lib/atproto/lexicons/song';
	import type { KhordSetlist } from '$lib/atproto/lexicons/setlist';
	import { lastSharedSong } from '$lib/stores/shareSong';
	import SongCard from '$lib/components/SongCard.svelte';
	import { APP_NAME, APP_TAGLINE, AUTH_PROVIDER_NAME } from '$lib/config';
	import { getAgent } from '$lib/atproto/agent';
	import { goto } from '$app/navigation';

	type Tab = 'feed' | 'daily' | 'setlists';

	interface FeedItem {
		uri: string;
		cid: string;
		record: KhordSongRecord;
		sharedBy: FollowedUser;
	}

	let activeTab: Tab = 'feed';

	// ── Feed ──────────────────────────────────────────────────────────────────
	let feedItems: FeedItem[] = [];
	let feedLoading = false;
	let feedError = '';
	let lastRefreshed: Date | null = null;
	let selectedUris = new Set<string>();
	let removing = false;
	let confirmOpen = false;
	let createSetlistOpen = false;
	let newSetlistTitle = '';
	let creatingSetlist = false;

	$: confirmItems = [...selectedUris]
		.map((uri) => feedItems.find((i) => i.uri === uri))
		.filter((i) => i?.sharedBy.did === $session?.did)
		.filter(Boolean) as FeedItem[];

	$: ownSelected = [...selectedUris].filter(
		(uri) => feedItems.find((i) => i.uri === uri)?.sharedBy.did === $session?.did
	);

	function toggleSelected(uri: string) {
		selectedUris = new Set(
			selectedUris.has(uri)
				? [...selectedUris].filter((u) => u !== uri)
				: [...selectedUris, uri]
		);
	}

	async function removeSelected() {
		if (!$session || removing) return;
		removing = true;
		try {
			await Promise.allSettled(
				ownSelected.map((uri) =>
					getAgent().com.atproto.repo.deleteRecord({
						repo: $session!.did,
						collection: SONG_NSID,
						rkey: uri.split('/').pop()!
					})
				)
			);
			feedItems = feedItems.filter((i) => !ownSelected.includes(i.uri));
			selectedUris = new Set([...selectedUris].filter((u) => !ownSelected.includes(u)));
		} finally {
			removing = false;
		}
	}

	async function handleCreateSetlist() {
		if (!$session || creatingSetlist || !newSetlistTitle.trim()) return;
		creatingSetlist = true;
		try {
			const items = [...selectedUris].map((uri) => {
				const item = feedItems.find((i) => i.uri === uri)!;
				return { songUri: uri, songCid: item.cid, addedBy: $session!.did, addedAt: new Date().toISOString() };
			});
			const { uri } = await createSetlist($session.did, newSetlistTitle.trim(), items);
			const rkey = uri.split('/').pop()!;
			createSetlistOpen = false;
			newSetlistTitle = '';
			selectedUris = new Set();
			goto(`/setlists/${$session.handle}/${rkey}`);
		} finally {
			creatingSetlist = false;
		}
	}

	async function loadFeedFromAppView(dids: string[]): Promise<FeedItem[] | null> {
		const res = await fetch(`/api/feed?dids=${dids.join(',')}&limit=50`);
		if (!res.ok) return null;
		const data = await res.json();
		return data.items as FeedItem[];
	}

	async function loadFeedFromPds(
		currentSession: { did: string; handle: string },
		follows: FollowedUser[]
	): Promise<FeedItem[]> {
		const self: FollowedUser = { did: currentSession.did, handle: currentSession.handle };
		const accounts = [self, ...follows];
		const results = await Promise.allSettled(
			accounts.map((user) =>
				fetchSongs(user.did).then((songs) =>
					songs.map((s) => ({ uri: s.uri, cid: s.cid, record: s.value, sharedBy: user }))
				)
			)
		);
		return results
			.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
			.sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
	}

	async function loadFeed(
		currentSession: { did: string; handle: string } | null,
		follows: FollowedUser[]
	) {
		if (!currentSession) return;
		feedLoading = true;
		feedError = '';
		try {
			const dids = [currentSession.did, ...follows.map((f) => f.did)];
			const appViewItems = await loadFeedFromAppView(dids);
			feedItems = appViewItems ?? await loadFeedFromPds(currentSession, follows);
			lastRefreshed = new Date();
		} catch (e) {
			feedError = e instanceof Error ? e.message : 'Could not load feed.';
		} finally {
			feedLoading = false;
		}
	}

	async function refreshFeed() {
		await loadFeed($session, $following);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	$: if ($followingLoaded) loadFeed($session, $following);

	$: if ($lastSharedSong && $session) {
		const self: FollowedUser = { did: $session.did, handle: $session.handle };
		const incoming = $lastSharedSong;
		if (!feedItems.some((i) => i.uri === incoming.uri)) {
			feedItems = [{ uri: incoming.uri, cid: incoming.cid, record: incoming.value, sharedBy: self }, ...feedItems];
		}
	}

	// ── Daily ─────────────────────────────────────────────────────────────────
	let dailyDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

	$: dailyItems = feedItems.filter((i) => i.record.createdAt.slice(0, 10) === dailyDate);

	// ── Setlists ──────────────────────────────────────────────────────────────
	let setlists: KhordSetlist[] = [];
	let setlistsLoading = false;
	let setlistsLoaded = false;

	async function loadSetlists() {
		if (!$session || setlistsLoading) return;
		setlistsLoading = true;
		try {
			setlists = await fetchSetlists($session.did);
			setlistsLoaded = true;
		} finally {
			setlistsLoading = false;
		}
	}

	function switchTab(tab: Tab) {
		activeTab = tab;
		if (tab === 'setlists' && !setlistsLoaded) loadSetlists();
	}
</script>

<svelte:head>
	<title>{APP_NAME} — {APP_TAGLINE}</title>
</svelte:head>

<!-- Modals -->
{#if confirmOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Cancel" on:click={() => (confirmOpen = false)}></button>
		<div class="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-3">
				<h2 class="text-sm font-semibold text-zinc-100">
					Remove {confirmItems.length} {confirmItems.length === 1 ? 'song' : 'songs'}?
				</h2>
				<ul class="space-y-1.5 max-h-48 overflow-y-auto">
					{#each confirmItems as item}
						<li class="flex items-center gap-2 text-xs text-zinc-400">
							<span class="text-zinc-600 shrink-0">♪</span>
							<span class="truncate">
								<span class="text-zinc-200">{item.record.title}</span>
								{#if item.record.artist}
									<span class="text-zinc-500"> — {item.record.artist}</span>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
				<p class="text-xs text-zinc-500">This will permanently delete {confirmItems.length === 1 ? 'this record' : 'these records'} from your AT Protocol account.</p>
			</div>
			<div class="flex border-t border-zinc-800">
				<button on:click={() => (confirmOpen = false)} class="flex-1 px-4 py-3 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">Cancel</button>
				<button
					on:click={async () => { confirmOpen = false; await removeSelected(); }}
					disabled={removing}
					class="flex-1 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950 border-l border-zinc-800 transition-colors disabled:opacity-50"
				>
					{#if removing}<span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>{:else}Remove{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if createSetlistOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Cancel" on:click={() => (createSetlistOpen = false)}></button>
		<div class="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-4">
				<h2 class="text-sm font-semibold text-zinc-100">New setlist</h2>
				<div class="space-y-1.5">
					<input
						bind:value={newSetlistTitle}
						placeholder="Name your setlist…"
						maxlength="100"
						class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
					/>
				</div>
				<ul class="space-y-1.5 max-h-40 overflow-y-auto">
					{#each [...selectedUris].map(uri => feedItems.find(i => i.uri === uri)).filter(Boolean) as item}
						<li class="flex items-center gap-2 text-xs text-zinc-400">
							<span class="text-zinc-600 shrink-0">♪</span>
							<span class="truncate">
								<span class="text-zinc-200">{item!.record.title}</span>
								<span class="text-zinc-500"> — {item!.record.artist}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
			<div class="flex border-t border-zinc-800">
				<button on:click={() => (createSetlistOpen = false)} class="flex-1 px-4 py-3 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">Cancel</button>
				<button
					on:click={handleCreateSetlist}
					disabled={creatingSetlist || !newSetlistTitle.trim()}
					class="flex-1 px-4 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-800 border-l border-zinc-800 transition-colors disabled:opacity-50"
				>
					{#if creatingSetlist}<span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>{:else}Create{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if !$authReady}
	<div class="flex items-center justify-center py-24">
		<span class="text-2xl font-bold text-zinc-700 tracking-tight">{APP_NAME.toLowerCase()}</span>
	</div>
{:else if $isLoggedIn}
	<section class="space-y-4">
		<!-- Sticky toolbar -->
		<div class="sticky top-0 z-20 -mx-6 px-6 py-3 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800/60">
			<!-- Tabs -->
			<div class="flex items-center justify-between gap-4">
				<nav class="flex items-center gap-1">
					{#each [['feed', 'Feed'], ['daily', 'Daily'], ['setlists', 'Setlists']] as [tab, label]}
						<button
							on:click={() => switchTab(tab as Tab)}
							class="px-3 py-1.5 text-sm rounded-full transition-colors
								{activeTab === tab
									? 'bg-zinc-800 text-zinc-100 font-medium'
									: 'text-zinc-500 hover:text-zinc-300'}"
						>
							{label}
						</button>
					{/each}
				</nav>

				<!-- Feed actions -->
				{#if activeTab === 'feed'}
					<div class="flex items-center gap-2">
						{#if selectedUris.size > 0}
							<button
								on:click={() => (createSetlistOpen = true)}
								class="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 border border-violet-900 hover:border-violet-700
									bg-violet-950 px-2.5 py-1 rounded-full transition-colors"
							>
								<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
									<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
								</svg>
								Setlist
							</button>
							<button
								on:click={() => (confirmOpen = true)}
								disabled={removing}
								class="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700
									bg-red-950 px-2.5 py-1 rounded-full disabled:opacity-50 transition-colors"
							>
								<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
									<path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M9 4v7.5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
								Remove {selectedUris.size}
							</button>
						{/if}
						<button
							on:click={refreshFeed}
							disabled={feedLoading}
							aria-label="Refresh feed"
							class="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-40 transition-colors"
						>
							<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 {feedLoading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg">
								<path d="M13.5 8a5.5 5.5 0 1 1-1.4-3.6L14 2.5V6h-3.5l1.8-1.8A4 4 0 1 0 12 8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							Refresh
						</button>
					</div>
				{/if}

				<!-- Daily actions -->
				{#if activeTab === 'daily'}
					<input
						type="date"
						bind:value={dailyDate}
						max={new Date().toISOString().slice(0, 10)}
						class="bg-transparent text-xs text-zinc-400 border border-zinc-700 rounded-lg px-2 py-1 focus:outline-none focus:border-zinc-500"
					/>
				{/if}
			</div>

			<!-- Subtitle -->
			{#if activeTab === 'feed'}
				<p class="text-zinc-600 text-xs mt-1">
					{#if lastRefreshed}
						Updated {lastRefreshed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
					{:else}
						Songs shared by people you follow.
					{/if}
				</p>
			{:else if activeTab === 'daily'}
				<p class="text-zinc-600 text-xs mt-1">
					{dailyItems.length} {dailyItems.length === 1 ? 'song' : 'songs'} shared on {new Date(dailyDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
				</p>
			{/if}
		</div>

		<!-- Feed tab -->
		{#if activeTab === 'feed'}
			{#if !$followingLoaded || feedLoading}
				<p class="text-zinc-500 text-sm">Loading your feed…</p>
			{:else if feedError}
				<p class="text-red-400 text-sm">{feedError}</p>
			{:else if feedItems.length === 0}
				<div class="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-10 space-y-6">
					<div class="text-center space-y-2">
						<p class="text-zinc-200 text-sm font-medium">Your feed is empty</p>
						<p class="text-zinc-500 text-xs">Songs shared by people you follow on {AUTH_PROVIDER_NAME} will appear here.</p>
					</div>
					<ol class="space-y-4 text-sm max-w-xs mx-auto">
						<li class="flex gap-3">
							<span class="text-zinc-600 font-mono text-xs mt-0.5 shrink-0">1</span>
							<div>
								<p class="text-zinc-300 font-medium">Follow people on {AUTH_PROVIDER_NAME}</p>
								<p class="text-zinc-500 text-xs mt-0.5">{APP_NAME} uses your {AUTH_PROVIDER_NAME} follows — anyone you follow there shows up in your feed.</p>
							</div>
						</li>
						<li class="flex gap-3">
							<span class="text-zinc-600 font-mono text-xs mt-0.5 shrink-0">2</span>
							<div>
								<p class="text-zinc-300 font-medium">Share a song</p>
								<p class="text-zinc-500 text-xs mt-0.5">Tap <span class="text-zinc-400">+</span> to search for a song and share it.</p>
							</div>
						</li>
						<li class="flex gap-3">
							<span class="text-zinc-600 font-mono text-xs mt-0.5 shrink-0">3</span>
							<div>
								<p class="text-zinc-300 font-medium">Listen on any platform</p>
								<p class="text-zinc-500 text-xs mt-0.5">Every shared song links to Spotify, Apple Music, and more.</p>
							</div>
						</li>
					</ol>
				</div>
			{:else}
				<div class="space-y-3">
					{#each feedItems as item (item.uri)}
						<SongCard
							uri={item.uri}
							cid={item.cid}
							record={item.record}
							sharedBy={item.sharedBy}
							selected={selectedUris.has(item.uri)}
							onselect={toggleSelected}
						/>
					{/each}
				</div>
			{/if}

		<!-- Daily tab -->
		{:else if activeTab === 'daily'}
			{#if !$followingLoaded || feedLoading}
				<p class="text-zinc-500 text-sm">Loading…</p>
			{:else if dailyItems.length === 0}
				<div class="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-10 text-center space-y-2">
					<p class="text-zinc-200 text-sm font-medium">No songs shared this day</p>
					<p class="text-zinc-500 text-xs">Try a different date, or share something.</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each dailyItems as item (item.uri)}
						<SongCard
							uri={item.uri}
							cid={item.cid}
							record={item.record}
							sharedBy={item.sharedBy}
							selected={false}
							onselect={() => {}}
						/>
					{/each}
				</div>
			{/if}

		<!-- Setlists tab -->
		{:else if activeTab === 'setlists'}
			{#if setlistsLoading}
				<p class="text-zinc-500 text-sm">Loading setlists…</p>
			{:else if setlists.length === 0}
				<div class="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-10 text-center space-y-2">
					<p class="text-zinc-200 text-sm font-medium">No setlists yet</p>
					<p class="text-zinc-500 text-xs">Select songs in the Feed tab to create your first setlist.</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each setlists as setlist (setlist.uri)}
						{@const rkey = setlist.uri.split('/').pop()!}
						<a
							href="/setlists/{$session?.handle}/{rkey}"
							class="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4
								hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors"
						>
							<div class="min-w-0">
								<p class="text-sm font-semibold text-zinc-100 truncate">{setlist.value.title}</p>
								<p class="text-xs text-zinc-500 mt-0.5">
									{setlist.value.items.length} {setlist.value.items.length === 1 ? 'song' : 'songs'}
									· {new Date(setlist.value.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
								</p>
							</div>
							<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 text-zinc-600 shrink-0" xmlns="http://www.w3.org/2000/svg">
								<path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</a>
					{/each}
				</div>
			{/if}
		{/if}
	</section>
{:else}
	<section class="space-y-6">
		<div class="space-y-2">
			<h1 class="text-3xl font-bold">{APP_TAGLINE}</h1>
			<p class="text-zinc-400">
				Share songs with anyone — they listen on whatever service they use.
				Your feed is your lineup: only music from people you follow.
			</p>
		</div>
		<a href="/login" class="inline-block bg-white text-black text-sm font-medium px-4 py-2 rounded-md hover:bg-zinc-200 transition-colors">
			Get started
		</a>
	</section>
{/if}
