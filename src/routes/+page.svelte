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
	import { theme as t } from '$lib/theme';
	import LandingContent from '$lib/landing.svelte';

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
	let voteCounts = new Map<string, number>();
	let lastRefreshed: Date | null = null;
	let selectedUris = new Set<string>();
	let dailySelectedUris = new Set<string>();
	let removing = false;
	let confirmOpen = false;
	let createSetlistOpen = false;
	let newSetlistTitle = '';
	let creatingSetlist = false;
	// URIs that will be used when the create setlist modal is submitted
	let setlistPendingUris = new Set<string>();

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

	function toggleDailySelected(uri: string) {
		dailySelectedUris = new Set(
			dailySelectedUris.has(uri)
				? [...dailySelectedUris].filter((u) => u !== uri)
				: [...dailySelectedUris, uri]
		);
	}

	function openCreateSetlist(uris: Set<string>) {
		setlistPendingUris = new Set(uris);
		newSetlistTitle = '';
		createSetlistOpen = true;
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
			const items = [...setlistPendingUris].map((uri) => {
				const item = feedItems.find((i) => i.uri === uri)!;
				const r = item.record;
				return {
					songUri: uri,
					songCid: item.cid,
					addedBy: $session!.did,
					addedAt: new Date().toISOString(),
					snapshot: {
						title: r.title,
						artist: r.artist,
						...(r.album && { album: r.album }),
						...(r.thumbnailUrl && { thumbnailUrl: r.thumbnailUrl }),
						...(r.spotifyUrl && { spotifyUrl: r.spotifyUrl }),
						...(r.appleMusicUrl && { appleMusicUrl: r.appleMusicUrl }),
						...(r.youtubeMusicUrl && { youtubeMusicUrl: r.youtubeMusicUrl }),
						...(r.tidalUrl && { tidalUrl: r.tidalUrl }),
						...(r.deezerUrl && { deezerUrl: r.deezerUrl }),
						...(r.amazonMusicUrl && { amazonMusicUrl: r.amazonMusicUrl }),
						...(r.soundcloudUrl && { soundcloudUrl: r.soundcloudUrl }),
						...(r.songlinkUrl && { songlinkUrl: r.songlinkUrl })
					}
				};
			});
			const { uri } = await createSetlist($session.did, newSetlistTitle.trim(), items);
			const rkey = uri.split('/').pop()!;
			createSetlistOpen = false;
			newSetlistTitle = '';
			selectedUris = new Set();
			dailySelectedUris = new Set();
			setlistPendingUris = new Set();
			goto(`/s/${$session.handle}/${rkey}`);
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

	async function loadVoteCounts(uris: string[]) {
		if (uris.length === 0) return;
		try {
			const res = await fetch(`/api/votes/counts?uris=${uris.map(encodeURIComponent).join(',')}`);
			if (!res.ok) return;
			const data = await res.json();
			voteCounts = new Map(Object.entries(data.counts as Record<string, number>));
		} catch {
			// non-fatal — counts just won't show
		}
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
			loadVoteCounts(feedItems.map((i) => i.uri));
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
	$: if (dailyDate) dailySelectedUris = new Set(); // reset selection when date changes

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
		<div class="relative w-full max-w-sm {t.surfaceBg} border {t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-3">
				<h2 class="text-sm font-semibold {t.textPrimary}">
					Remove {confirmItems.length} {confirmItems.length === 1 ? 'song' : 'songs'}?
				</h2>
				<ul class="space-y-1.5 max-h-48 overflow-y-auto">
					{#each confirmItems as item}
						<li class="flex items-center gap-2 text-xs {t.textMuted}">
							<span class="{t.textFaint} shrink-0">♪</span>
							<span class="truncate">
								<span class="{t.textSecondary}">{item.record.title}</span>
								{#if item.record.artist}
									<span class="{t.textFaint}"> — {item.record.artist}</span>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
				<p class="text-xs {t.textMuted}">This will permanently delete {confirmItems.length === 1 ? 'this record' : 'these records'} from your AT Protocol account.</p>
			</div>
			<div class="flex border-t {t.borderBase}">
				<button on:click={() => (confirmOpen = false)} class="flex-1 px-4 py-3 text-sm {t.textMuted} {t.hoverText} {t.hoverBg} transition-colors">Cancel</button>
				<button
					on:click={async () => { confirmOpen = false; await removeSelected(); }}
					disabled={removing}
					class="flex-1 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950 border-l {t.borderBase} transition-colors disabled:opacity-50"
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
		<div class="relative w-full max-w-sm {t.surfaceBg} border {t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-4">
				<h2 class="text-sm font-semibold {t.textPrimary}">New setlist</h2>
				<div class="space-y-1.5">
					<input
						bind:value={newSetlistTitle}
						placeholder="Name your setlist…"
						maxlength="100"
						class="w-full {t.elevatedBg} border {t.borderStrong} rounded-lg px-3 py-2 text-sm {t.textPrimary} placeholder:{t.textMuted} focus:outline-none {t.hoverBorderStrong} transition-colors"
					/>
				</div>
				<ul class="space-y-1.5 max-h-40 overflow-y-auto">
					{#each [...setlistPendingUris].map(uri => feedItems.find(i => i.uri === uri)).filter(Boolean) as item}
						<li class="flex items-center gap-2 text-xs {t.textMuted}">
							<span class="{t.textFaint} shrink-0">♪</span>
							<span class="truncate">
								<span class="{t.textSecondary}">{item!.record.title}</span>
								<span class="{t.textFaint}"> — {item!.record.artist}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
			<div class="flex border-t {t.borderBase}">
				<button on:click={() => (createSetlistOpen = false)} class="flex-1 px-4 py-3 text-sm {t.textMuted} {t.hoverText} {t.hoverBg} transition-colors">Cancel</button>
				<button
					on:click={handleCreateSetlist}
					disabled={creatingSetlist || !newSetlistTitle.trim()}
					class="flex-1 px-4 py-3 text-sm font-medium {t.textPrimary} {t.hoverBg} border-l {t.borderBase} transition-colors disabled:opacity-50"
				>
					{#if creatingSetlist}<span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>{:else}Create{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if !$authReady}
	<div class="flex items-center justify-center py-24">
		<span class="text-2xl font-bold {t.textFaint} tracking-tight">{APP_NAME.toLowerCase()}</span>
	</div>
{:else if $isLoggedIn}
	<section class="space-y-4">
		<!-- Sticky toolbar -->
		<div class="sticky top-0 z-20 -mx-6 px-6 py-3 {t.headerBg} backdrop-blur-sm border-b {t.borderFaded}">
			<!-- Tabs -->
			<div class="flex items-center justify-between gap-4">
				<nav class="flex items-center gap-1">
					{#each [['feed', 'Feed'], ['daily', 'Daily'], ['setlists', 'Setlists']] as [tab, label]}
						<button
							on:click={() => switchTab(tab as Tab)}
							class="px-3 py-1.5 text-sm rounded-full transition-colors
								{activeTab === tab
									? `${t.elevatedBg} ${t.textPrimary} font-medium`
									: `${t.textMuted} ${t.hoverTextSecondary}`}"
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
								on:click={() => openCreateSetlist(selectedUris)}
								class="flex items-center gap-1.5 text-xs {t.accentText} {t.accentTextHover} border {t.accentBorder} {t.accentBorderHover}
									{t.accentBg} px-2.5 py-1 rounded-full transition-colors"
							>
								<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
									<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
								</svg>
								Setlist ({selectedUris.size})
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
							title="Reload songs from everyone you follow"
							class="flex items-center gap-1.5 text-xs {t.textMuted} {t.hoverText} border {t.borderBase} {t.hoverBorderBase} px-2.5 py-1 rounded-full disabled:opacity-40 transition-colors"
						>
							<svg viewBox="0 0 16 16" fill="none" class="w-3 h-3 {feedLoading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg">
								<path d="M13.5 8a5.5 5.5 0 1 1-1.4-3.6L14 2.5V6h-3.5l1.8-1.8A4 4 0 1 0 12 8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							Refresh
						</button>
					</div>
				{/if}

				<!-- Daily actions -->
				{#if activeTab === 'daily'}
					<div class="flex items-center gap-2">
						{#if dailyItems.length > 0}
							<button
								on:click={() => openCreateSetlist(dailySelectedUris.size > 0 ? dailySelectedUris : new Set(dailyItems.map(i => i.uri)))}
								class="flex items-center gap-1.5 text-xs {t.accentText} {t.accentTextHover} border {t.accentBorder} {t.accentBorderHover}
									{t.accentBg} px-2.5 py-1 rounded-full transition-colors"
							>
								<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
									<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
								</svg>
								{dailySelectedUris.size > 0 ? `Setlist (${dailySelectedUris.size})` : 'Setlist all'}
							</button>
						{/if}
						<input
							type="date"
							bind:value={dailyDate}
							max={new Date().toISOString().slice(0, 10)}
							class="bg-transparent text-xs {t.textSecondary} border {t.borderStrong} rounded-lg px-2 py-1 focus:outline-none {t.hoverBorderStrong} transition-colors"
						/>
					</div>
				{/if}
			</div>

			<!-- Subtitle -->
			{#if activeTab === 'feed'}
				<p class="{t.textFaint} text-xs mt-1">
					{#if lastRefreshed}
						Updated {lastRefreshed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
					{:else}
						Songs shared by people you follow.
					{/if}
				</p>
			{:else if activeTab === 'daily'}
				<p class="{t.textFaint} text-xs mt-1">
					{dailyItems.length} {dailyItems.length === 1 ? 'song' : 'songs'} shared on {new Date(dailyDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
				</p>
			{/if}
		</div>

		<!-- Feed tab -->
		{#if activeTab === 'feed'}
			{#if !$followingLoaded || feedLoading}
				<p class="{t.textMuted} text-sm">Loading your feed…</p>
			{:else if feedError}
				<p class="text-red-400 text-sm">{feedError}</p>
			{:else if feedItems.length === 0}
				<div class="rounded-xl border {t.borderBase} {t.surfaceBg} px-5 py-10 space-y-6">
					<div class="text-center space-y-2">
						<p class="{t.textSecondary} text-sm font-medium">Your feed is empty</p>
						<p class="{t.textMuted} text-xs">Songs shared by people you follow on {AUTH_PROVIDER_NAME} will appear here.</p>
					</div>
					<ol class="space-y-4 text-sm max-w-xs mx-auto">
						<li class="flex gap-3">
							<span class="{t.textFaint} font-mono text-xs mt-0.5 shrink-0">1</span>
							<div>
								<p class="{t.textSecondary} font-medium">Follow people on {AUTH_PROVIDER_NAME}</p>
								<p class="{t.textMuted} text-xs mt-0.5">{APP_NAME} uses your {AUTH_PROVIDER_NAME} follows — anyone you follow there shows up in your feed.</p>
							</div>
						</li>
						<li class="flex gap-3">
							<span class="{t.textFaint} font-mono text-xs mt-0.5 shrink-0">2</span>
							<div>
								<p class="{t.textSecondary} font-medium">Share a song</p>
								<p class="{t.textMuted} text-xs mt-0.5">Tap <span class="{t.textSecondary}">+</span> to search for a song and share it.</p>
							</div>
						</li>
						<li class="flex gap-3">
							<span class="{t.textFaint} font-mono text-xs mt-0.5 shrink-0">3</span>
							<div>
								<p class="{t.textSecondary} font-medium">Listen on any platform</p>
								<p class="{t.textMuted} text-xs mt-0.5">Every shared song links to Spotify, Apple Music, and more.</p>
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
							voteCount={voteCounts.get(item.uri) ?? 0}
						/>
					{/each}
				</div>
			{/if}

		<!-- Daily tab -->
		{:else if activeTab === 'daily'}
			{#if !$followingLoaded || feedLoading}
				<p class="{t.textMuted} text-sm">Loading…</p>
			{:else if dailyItems.length === 0}
				<div class="rounded-xl border {t.borderBase} {t.surfaceBg} px-5 py-10 text-center space-y-2">
					<p class="{t.textSecondary} text-sm font-medium">No songs shared this day</p>
					<p class="{t.textMuted} text-xs">Try a different date, or share something.</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each dailyItems as item (item.uri)}
						<SongCard
							uri={item.uri}
							cid={item.cid}
							record={item.record}
							sharedBy={item.sharedBy}
							selected={dailySelectedUris.has(item.uri)}
							onselect={toggleDailySelected}
							voteCount={voteCounts.get(item.uri) ?? 0}
						/>
					{/each}
				</div>
			{/if}

		<!-- Setlists tab -->
		{:else if activeTab === 'setlists'}
			{#if setlistsLoading}
				<p class="{t.textMuted} text-sm">Loading setlists…</p>
			{:else if setlists.length === 0}
				<div class="rounded-xl border {t.borderBase} {t.surfaceBg} px-5 py-10 text-center space-y-2">
					<p class="{t.textSecondary} text-sm font-medium">No setlists yet</p>
					<p class="{t.textMuted} text-xs">Select songs in the Feed tab to create your first setlist.</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each setlists as setlist (setlist.uri)}
						{@const rkey = setlist.uri.split('/').pop()!}
						<a
							href="/s/{$session?.handle}/{rkey}"
							class="flex items-center justify-between gap-4 rounded-xl border {t.borderBase} {t.surfaceBg} px-5 py-4
								{t.hoverBorderBase} {t.hoverBg} transition-colors"
						>
							<div class="min-w-0">
								<p class="text-sm font-semibold {t.textPrimary} truncate">{setlist.value.title}</p>
								<p class="text-xs {t.textMuted} mt-0.5">
									{setlist.value.items.length} {setlist.value.items.length === 1 ? 'song' : 'songs'}
									· {new Date(setlist.value.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
								</p>
							</div>
							<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 {t.textFaint} shrink-0" xmlns="http://www.w3.org/2000/svg">
								<path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</a>
					{/each}
				</div>
			{/if}
		{/if}
	</section>
{:else}
	<div class="space-y-4">
		<section class="relative overflow-hidden {t.heroGradient} rounded-2xl px-8 py-14 space-y-8">
			<!-- Badge -->
			<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full {t.elevatedBg} border {t.borderStrong} text-xs {t.textSecondary} font-medium">
				<span class="w-1.5 h-1.5 rounded-full bg-current {t.accentText} shrink-0"></span>
				Music on every platform
			</span>

			<!-- Headline + subhead -->
			<div class="space-y-4 max-w-md">
				<h1 class="text-4xl font-bold {t.textPrimary} leading-tight">{APP_TAGLINE}</h1>
				<p class="{t.textSecondary} text-base leading-relaxed">
					A place for music fans to share what they're listening to, discover songs from friends, and build setlists together.
				</p>
			</div>

			<!-- Streaming service pills -->
			<div class="flex flex-wrap gap-2">
				{#each ['Spotify', 'Apple Music', 'Tidal', 'Deezer', 'SoundCloud'] as service}
					<span class="px-3 py-1 text-xs rounded-full {t.elevatedBg} border {t.borderBase} {t.textMuted}">{service}</span>
				{/each}
			</div>

			<!-- CTA -->
			<div class="space-y-2">
				<a href="/login" class="inline-flex items-center gap-2 {t.btnPrimaryBg} {t.btnPrimaryText} text-sm font-semibold px-5 py-2.5 rounded-lg {t.btnPrimaryHover} transition-colors">
					Get started
					<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
						<path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</a>
				<p class="text-xs {t.textMuted}">Log in with your existing {AUTH_PROVIDER_NAME} account to get started.</p>
			</div>
		</section>

		<LandingContent />
	</div>
{/if}
