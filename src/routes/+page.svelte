<script lang="ts">
	import { isLoggedIn, session, authReady } from '$lib/stores/auth';
	import { following, followingLoaded } from '$lib/stores/following';
	import { fetchSongs, fetchSetlists, createSetlist } from '$lib/atproto/social';
	import type { FollowedUser } from '$lib/atproto/social';
	import type { KhordSongRecord } from '$lib/atproto/lexicons/song';
	import { SONG_NSID } from '$lib/atproto/lexicons/song';
	import type { KhordSetlist } from '$lib/atproto/lexicons/setlist';
	import { lastSharedSong, pendingSharedSong, type PendingSong } from '$lib/stores/shareSong';
	import SongCard from '$lib/components/SongCard.svelte';
	import { APP_NAME, APP_TAGLINE, AUTH_PROVIDER_NAME, APP_URL } from '$lib/config';
	import { instanceConfig } from '$lib/stores/instance';
	import { getAgent } from '$lib/atproto/agent';
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { theme as t } from '$lib/theme';
	import { prefs } from '$lib/stores/prefs';
	import LandingContent from '$lib/landing.svelte';

	type Tab = 'all' | 'following' | 'daily' | 'setlists';

	interface FeedItem {
		uri: string;
		cid: string;
		record: KhordSongRecord;
		sharedBy: FollowedUser;
	}

	let activeTab: Tab = (browser && (sessionStorage.getItem('khord_tab') as Tab)) || 'all';

	// ── All Songs ─────────────────────────────────────────────────────────────
	let allItems: FeedItem[] = [];
	let allLoading = false;
	let allError = '';
	let allLastRefreshed: Date | null = null;

	// ── Following (derived from allItems) ─────────────────────────────────────
	let voteCounts = new Map<string, number>();
	let selectedUris = new Set<string>();
	$: followedDids = new Set($following.map((f) => f.did));
	$: feedItems = allItems.filter((i) => followedDids.has(i.sharedBy.did));
	let dailySelectedUris = new Set<string>();
	let removing = false;
	let confirmOpen = false;
	let deletedUris = new Set<string>();
	let createSetlistOpen = false;
	let newSetlistTitle = '';
	let creatingSetlist = false;
	// URIs that will be used when the create setlist modal is submitted
	let setlistPendingUris = new Set<string>();

	$: confirmItems = [...selectedUris]
		.map((uri) => allItems.find((i) => i.uri === uri))
		.filter((i) => i?.sharedBy.did === $session?.did)
		.filter(Boolean) as FeedItem[];

	$: ownSelected = [...selectedUris].filter(
		(uri) => allItems.find((i) => i.uri === uri)?.sharedBy.did === $session?.did
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

	function openCreateSetlist(uris: Set<string>, title = '') {
		setlistPendingUris = new Set(uris);
		newSetlistTitle = title;
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
			ownSelected.forEach((uri) => deletedUris.add(uri));
			allItems = allItems.filter((i) => !ownSelected.includes(i.uri));
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
				const item = allItems.find((i) => i.uri === uri)!;
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

	async function loadAllSongs() {
		if (allLoading) return;
		allLoading = true;
		allError = '';
		try {
			if (!$session) return;
			const self: FollowedUser = { did: $session.did, handle: $session.handle };

			// AppView + own PDS in parallel — own PDS fills historical gaps the indexer may not have
			const [res, ownSongs] = await Promise.all([
				fetch('/api/feed?all=true&limit=50'),
				fetchSongs($session.did)
					.then((songs) => songs.map((s) => ({ uri: s.uri, cid: s.cid, record: s.value, sharedBy: self })))
					.catch(() => [] as FeedItem[])
			]);

			if (res.ok) {
				const data = await res.json();
				const appViewItems = data.items as FeedItem[];
				const appViewUris = new Set(appViewItems.map((i) => i.uri));
				// When feed_scoped is active, skip the PDS merge — own songs from other instances
				// would bypass the scope filter since PDS records carry no instance info.
				const ownNotInAppView = data.feedScoped ? [] : ownSongs.filter((i) => !appViewUris.has(i.uri));
				const preserved = allItems.filter((i) => !appViewUris.has(i.uri) && !ownNotInAppView.some((o) => o.uri === i.uri) && !deletedUris.has(i.uri));
				const merged = [...appViewItems, ...ownNotInAppView, ...preserved].sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
				allItems = merged;
				allLastRefreshed = new Date();
				loadVoteCounts(allItems.map((i) => i.uri));
				return;
			}

			// AppView unavailable — fall back to querying all registered users' PDSes
			const usersRes = await fetch(`/api/registered-users?did=${encodeURIComponent($session.did)}`);
			if (!usersRes.ok) {
				allError = 'Could not load songs.';
				return;
			}
			const { users } = await usersRes.json() as { users: FollowedUser[] };
			const raw = await loadFeedFromPds($session, users.filter((u) => u.did !== $session!.did));
			allItems = deletedUris.size > 0 ? raw.filter((i) => !deletedUris.has(i.uri)) : raw;
			allLastRefreshed = new Date();
			loadVoteCounts(allItems.map((i) => i.uri));
		} catch (e) {
			console.error('[loadAllSongs]', e);
			allError = e instanceof Error ? e.message : 'Could not load songs.';
		} finally {
			allLoading = false;
		}
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

	$: if (browser && $session) loadAllSongs();

	$: if ($lastSharedSong && $session) {
		pendingItem = null;
		clearTimeout(pendingClearTimeout);
		const self: FollowedUser = { did: $session.did, handle: $session.handle };
		const incoming = $lastSharedSong;
		lastSharedSong.set(null);
		if (!allItems.some((i) => i.uri === incoming.uri)) {
			allItems = [{ uri: incoming.uri, cid: incoming.cid, record: incoming.value, sharedBy: self }, ...allItems];
		}
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	// ── Daily ─────────────────────────────────────────────────────────────────
	function localDateStr(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function formatDateLabel(dateStr: string): string {
		const d = new Date(dateStr + 'T12:00:00');
		const today = localDateStr(new Date());
		const yesterday = localDateStr(new Date(Date.now() - 86400000));
		if (dateStr === today) return 'Today';
		if (dateStr === yesterday) return 'Yesterday';
		return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
	}

	let dailyDate = localDateStr(new Date()); // local date, not UTC
	let showDateModal = false;

	$: datesWithActivity = (() => {
		const counts = new Map<string, number>();
		for (const item of allItems) {
			const d = localDateStr(new Date(item.record.createdAt));
			counts.set(d, (counts.get(d) ?? 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0]));
	})();

	$: dailyItems = allItems.filter((i) => localDateStr(new Date(i.record.createdAt)) === dailyDate);
	$: if (dailyDate) dailySelectedUris = new Set(); // reset selection when date changes

	// ── Setlists ──────────────────────────────────────────────────────────────
	let setlists: KhordSetlist[] = [];
	let setlistsLoading = false;
	let setlistsLoaded = false;
	let setlistsLastRefreshed: Date | null = null;

	async function loadSetlists() {
		if (!$session || setlistsLoading) return;
		setlistsLoading = true;
		try {
			const all = await fetchSetlists($session.did);
			setlists = $instanceConfig.feedScoped
				? all.filter((s) => !s.value.instanceUrl || s.value.instanceUrl === APP_URL)
				: all;
			setlistsLoaded = true;
			setlistsLastRefreshed = new Date();
		} finally {
			setlistsLoading = false;
		}
	}

	// ── Pending share placeholder ──────────────────────────────────────────────
	let pendingItem: PendingSong | null = null;
	let pendingClearTimeout: ReturnType<typeof setTimeout>;

	$: if ($pendingSharedSong) {
		pendingItem = $pendingSharedSong;
		pendingSharedSong.set(null);
		switchTab('all');
		tick().then(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
		// Safety: clear placeholder after 30s if resolution never completes
		clearTimeout(pendingClearTimeout);
		pendingClearTimeout = setTimeout(() => { pendingItem = null; }, 30000);
	}

	const TABS: Tab[] = ['all', 'following', 'daily', 'setlists'];

	let tabEls: (HTMLButtonElement | null)[] = [];
	let indicatorLeft = 0;
	let indicatorWidth = 0;

	// Swipe state (exposed for live visual feedback)
	let swipeDx = 0;
	let isSwiping = false;

	// Live indicator position that tracks the finger during swipe
	let liveIndicatorLeft = 0;
	let liveIndicatorWidth = 0;
	$: {
		if (!isSwiping || Math.abs(swipeDx) < 8) {
			liveIndicatorLeft = indicatorLeft;
			liveIndicatorWidth = indicatorWidth;
		} else {
			const idx = TABS.indexOf(activeTab);
			const ratio = Math.max(-1, Math.min(1, swipeDx / 60));
			const targetIdx = Math.max(0, Math.min(TABS.length - 1, idx + (ratio < 0 ? 1 : -1)));
			const targetEl = tabEls[targetIdx];
			if (targetEl && targetIdx !== idx) {
				const p = Math.abs(ratio);
				liveIndicatorLeft = indicatorLeft + (targetEl.offsetLeft - indicatorLeft) * p;
				liveIndicatorWidth = indicatorWidth + (targetEl.offsetWidth - indicatorWidth) * p;
			} else {
				liveIndicatorLeft = indicatorLeft;
				liveIndicatorWidth = indicatorWidth;
			}
		}
	}
	// Swipe progress and target index, used by tab label opacity
	$: swipeP = isSwiping ? Math.min(1, Math.abs(swipeDx) / 60) : 0;
	$: swipeTargetIdx = (() => {
		if (!isSwiping || Math.abs(swipeDx) < 8) return -1;
		const idx = TABS.indexOf(activeTab);
		return Math.max(0, Math.min(TABS.length - 1, idx + (swipeDx < 0 ? 1 : -1)));
	})();

	$: activeTabIdx = TABS.indexOf(activeTab);
	// 1:1 swipe tracking; rubber-band at the first/last tab edges
	$: effectiveSwipeDx = (() => {
		if (!isSwiping) return 0;
		const atStart = activeTabIdx === 0 && swipeDx > 0;
		const atEnd = activeTabIdx === TABS.length - 1 && swipeDx < 0;
		return (atStart || atEnd) ? swipeDx * 0.2 : swipeDx;
	})();

	function updateIndicator() {
		const idx = TABS.indexOf(activeTab);
		const el = tabEls[idx];
		if (el) {
			indicatorLeft = el.offsetLeft;
			indicatorWidth = el.offsetWidth;
		}
	}

	function switchTab(tab: Tab) {
		activeTab = tab;
		sessionStorage.setItem('khord_tab', tab);
		if (tab === 'setlists' && !setlistsLoaded) loadSetlists();
		tick().then(updateIndicator);
	}

	// ── Pull to refresh ───────────────────────────────────────────────────────
	const PULL_THRESHOLD = 80;
	let pullDistance = 0;
	let pullRefreshing = false;

	async function triggerPullRefresh() {
		if (pullRefreshing) return;
		pullRefreshing = true;
		try {
			if (activeTab === 'all' || activeTab === 'following' || activeTab === 'daily') await loadAllSongs();
			else { setlistsLoaded = false; await loadSetlists(); }
		} finally {
			pullRefreshing = false;
		}
	}

	onMount(() => {
		switchTab(activeTab);

		const SWIPE_THRESHOLD = 60;
		const DIR_LOCK_THRESHOLD = 10;

		let startY = 0;
		let startX = 0;
		let currentX = 0;
		let active = false;
		let swipeDir: 'horizontal' | 'vertical' | null = null;

		function onTouchStart(e: TouchEvent) {
			startY = e.touches[0].clientY;
			startX = e.touches[0].clientX;
			currentX = startX;
			active = true;
			swipeDir = null;
			swipeDx = 0;
			isSwiping = false;
		}

		function onTouchMove(e: TouchEvent) {
			if (!active) return;
			currentX = e.touches[0].clientX;
			const dx = currentX - startX;
			const dy = e.touches[0].clientY - startY;

			if (!swipeDir && (Math.abs(dx) > DIR_LOCK_THRESHOLD || Math.abs(dy) > DIR_LOCK_THRESHOLD)) {
				swipeDir = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
			}

			if (swipeDir === 'horizontal') {
				swipeDx = dx;
				isSwiping = true;
				e.preventDefault();
			} else if (swipeDir === 'vertical') {
				if (window.scrollY > 0 || pullRefreshing) { pullDistance = 0; active = false; return; }
				if (dy > 0) {
					pullDistance = Math.min(dy, PULL_THRESHOLD * 1.5);
					if (pullDistance > 8) e.preventDefault();
				} else {
					pullDistance = 0;
					active = false;
				}
			}
		}

		function onTouchEnd() {
			if (swipeDir === 'vertical') {
				if (pullDistance >= PULL_THRESHOLD) triggerPullRefresh();
				pullDistance = 0;
			} else if (swipeDir === 'horizontal') {
				const dx = currentX - startX;
				const idx = TABS.indexOf(activeTab);
				if (dx < -SWIPE_THRESHOLD && idx < TABS.length - 1) switchTab(TABS[idx + 1]);
				else if (dx > SWIPE_THRESHOLD && idx > 0) switchTab(TABS[idx - 1]);
			}
			active = false;
			swipeDir = null;
			swipeDx = 0;
			isSwiping = false;
		}

		window.addEventListener('touchstart', onTouchStart, { passive: true });
		window.addEventListener('touchmove', onTouchMove, { passive: false });
		window.addEventListener('touchend', onTouchEnd, { passive: true });

		return () => {
			window.removeEventListener('touchstart', onTouchStart);
			window.removeEventListener('touchmove', onTouchMove);
			window.removeEventListener('touchend', onTouchEnd);
		};
	});
</script>

<svelte:head>
	<title>{APP_NAME} — {APP_TAGLINE}</title>
</svelte:head>

<!-- Modals -->
{#if showDateModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-6">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Cancel" on:click={() => (showDateModal = false)}></button>
		<div class="relative w-full max-w-sm {$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-6 pt-5 pb-2 flex items-center justify-between">
				<h2 class="text-base font-semibold {$t.textPrimary}">Days with songs</h2>
				<button on:click={() => (showDateModal = false)} class="text-sm {$t.textMuted} {$t.hoverText} transition-colors">Done</button>
			</div>
			{#if datesWithActivity.length === 0}
				<p class="px-6 py-5 text-sm {$t.textMuted}">No songs yet.</p>
			{:else}
				<ul class="max-h-80 overflow-y-auto divide-y {$t.borderFaded}">
					{#each datesWithActivity as [dateStr, count]}
						<li>
							<button
								on:click={() => { dailyDate = dateStr; showDateModal = false; }}
								class="w-full flex items-center justify-between px-6 py-3.5 text-base transition-colors {dateStr === dailyDate ? `${$t.accentText} ${$t.accentBg}` : `${$t.textSecondary} ${$t.hoverBg} ${$t.hoverText}`}"
							>
								<span>{formatDateLabel(dateStr)}</span>
								<span class="text-sm {dateStr === dailyDate ? $t.accentText : $t.textFaint}">{count} {count === 1 ? 'song' : 'songs'}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}

{#if confirmOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Cancel" on:click={() => (confirmOpen = false)}></button>
		<div class="relative w-full max-w-sm {$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-3">
				<h2 class="text-sm font-semibold {$t.textPrimary}">
					Remove {confirmItems.length} {confirmItems.length === 1 ? 'song' : 'songs'}?
				</h2>
				<ul class="space-y-1.5 max-h-48 overflow-y-auto">
					{#each confirmItems as item}
						<li class="flex items-center gap-2 text-xs {$t.textMuted}">
							<span class="{$t.textFaint} shrink-0">♪</span>
							<span class="truncate">
								<span class="{$t.textSecondary}">{item.record.title}</span>
								{#if item.record.artist}
									<span class="{$t.textFaint}"> — {item.record.artist}</span>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
				<p class="text-xs {$t.textMuted}">This will permanently delete {confirmItems.length === 1 ? 'this record' : 'these records'} from your AT Protocol account.</p>
			</div>
			<div class="flex border-t {$t.borderBase}">
				<button on:click={() => (confirmOpen = false)} class="flex-1 px-4 py-3 text-sm {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors">Cancel</button>
				<button
					on:click={async () => { confirmOpen = false; await removeSelected(); }}
					disabled={removing}
					class="flex-1 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950 border-l {$t.borderBase} transition-colors disabled:opacity-50"
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
		<div class="relative w-full max-w-sm {$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-4">
				<h2 class="text-sm font-semibold {$t.textPrimary}">New mixtape</h2>
				<div class="space-y-1.5">
					<input
						bind:value={newSetlistTitle}
						placeholder="Name your mixtape…"
						maxlength="100"
						class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg px-3 py-2 text-base sm:text-sm {$t.textPrimary} placeholder:{$t.textMuted} focus:outline-none {$t.hoverBorderStrong} transition-colors"
					/>
				</div>
				<ul class="space-y-1.5 max-h-40 overflow-y-auto">
					{#each [...setlistPendingUris].map(uri => allItems.find(i => i.uri === uri)).filter(Boolean) as item}
						<li class="flex items-center gap-2 text-xs {$t.textMuted}">
							<span class="{$t.textFaint} shrink-0">♪</span>
							<span class="truncate">
								<span class="{$t.textSecondary}">{item!.record.title}</span>
								<span class="{$t.textFaint}"> — {item!.record.artist}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
			<div class="flex border-t {$t.borderBase}">
				<button on:click={() => (createSetlistOpen = false)} class="flex-1 px-4 py-3 text-sm {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors">Cancel</button>
				<button
					on:click={handleCreateSetlist}
					disabled={creatingSetlist || !newSetlistTitle.trim()}
					class="flex-1 px-4 py-3 text-sm font-medium {$t.textPrimary} {$t.hoverBg} border-l {$t.borderBase} transition-colors disabled:opacity-50"
				>
					{#if creatingSetlist}<span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>{:else}Create{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if !$authReady}
	<div class="flex items-center justify-center py-24">
		<span class="text-2xl font-bold {$t.textFaint} tracking-tight">{APP_NAME.toLowerCase()}</span>
	</div>
{:else if $isLoggedIn}
	<section class="space-y-4">
		<!-- Pull to refresh indicator -->
		<div
			class="flex items-center justify-center overflow-hidden transition-[height] duration-150"
			style="height: {pullRefreshing ? 40 : Math.min(pullDistance * 0.45, 40)}px"
		>
			{#if pullRefreshing}
				<span class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin {$t.textFaint}"></span>
			{:else}
				<svg
					viewBox="0 0 24 24" fill="none" class="w-5 h-5 {$t.textFaint}"
					style="opacity: {Math.min(pullDistance / PULL_THRESHOLD, 1)}; transform: rotate({Math.min(pullDistance / PULL_THRESHOLD, 1) * 180}deg)"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			{/if}
		</div>

		<!-- Streaming service hint -->
		{#if !$prefs}
			<p class="text-sm {$t.textFaint} px-1">
				🎧 <a href="/settings" class="{$t.textMuted} hover:{$t.textSecondary} underline underline-offset-2 transition-colors">Set a streaming service</a> to open songs in one tap.
			</p>
		{/if}

		<!-- Sticky toolbar -->
		<div class="sticky top-0 z-20 -mx-6 px-6 py-3 {$t.headerBg} backdrop-blur-sm border-b {$t.borderFaded}">
			<!-- Tabs row — underline style with animated indicator -->
			<nav class="relative flex items-center border-b {$t.borderFaded}">
				{#each [['all', 'All Songs'], ['following', 'Following'], ['daily', 'Daily'], ['setlists', 'Mixtapes']] as [tab, label], i}
					<button
						bind:this={tabEls[i]}
						on:click={() => switchTab(tab as Tab)}
						class="px-4 py-2 text-base font-medium whitespace-nowrap
							{activeTab === tab ? $t.textPrimary : `${$t.textMuted} ${$t.hoverTextSecondary}`}"
						style={isSwiping
							? `opacity: ${activeTab === tab ? 1 - swipeP * 0.35 : i === swipeTargetIdx ? 0.5 + swipeP * 0.5 : ''}; transition: none;`
							: ''}
					>
						{label}
					</button>
				{/each}
				<div
					class="absolute bottom-0 h-0.5 {$t.btnPrimaryBg} rounded-full pointer-events-none"
					style="left: {liveIndicatorLeft}px; width: {liveIndicatorWidth}px; transition: {isSwiping ? 'none' : 'all 200ms ease-out'};"
				></div>

			</nav>

			<!-- All Songs / Following: shared action buttons -->
			{#if activeTab === 'all' || activeTab === 'following'}
				<p class="text-xs mt-1 invisible select-none" aria-hidden="true">&nbsp;</p>
				<div class="flex items-center gap-2 mt-2">
					<button
						on:click={loadAllSongs}
						disabled={allLoading}
						aria-label="Refresh"
						class="flex items-center gap-1.5 text-xs {$t.textMuted} {$t.hoverText} border {$t.borderBase} {$t.hoverBorderBase} px-2.5 py-1 rounded-full disabled:opacity-40 transition-colors"
					>
						<svg viewBox="0 0 24 24" fill="none" class="w-3.5 h-3.5 {allLoading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg">
							<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Refresh
					</button>
					{#if selectedUris.size > 0}
						<button
							on:click={() => openCreateSetlist(selectedUris)}
							class="flex items-center gap-1.5 text-xs {$t.accentText} {$t.accentTextHover} border {$t.accentBorder} {$t.accentBorderHover}
								{$t.accentBg} px-2.5 py-1 rounded-full transition-colors"
						>
							<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
								<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
							Mixtape ({selectedUris.size})
						</button>
						<button
							on:click={() => (confirmOpen = true)}
							disabled={removing}
							class="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700
								bg-red-950 px-2.5 py-1 rounded-full disabled:opacity-50 transition-colors"
						>
							<svg viewBox="0 0 24 24" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
								<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							Remove {selectedUris.size}
						</button>
					{/if}
				</div>

			<!-- Daily: refresh + date picker + setlist button -->
			{:else if activeTab === 'daily'}
				<p class="text-xs mt-1 invisible select-none" aria-hidden="true">&nbsp;</p>
				<div class="flex items-center gap-2 mt-2">
					<button
						on:click={loadAllSongs}
						disabled={allLoading}
						aria-label="Refresh"
						title="Reload songs"
						class="flex items-center gap-1.5 text-xs {$t.textMuted} {$t.hoverText} border {$t.borderBase} {$t.hoverBorderBase} px-2.5 py-1 rounded-full disabled:opacity-40 transition-colors"
					>
						<svg viewBox="0 0 24 24" fill="none" class="w-3.5 h-3.5 {allLoading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg">
							<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Refresh
					</button>
					<button
						on:click={() => (showDateModal = true)}
						title="Pick a date"
						class="flex items-center gap-1.5 text-xs {$t.textSecondary} border {$t.borderStrong} {$t.hoverBorderStrong} px-2.5 py-1 rounded-full transition-colors"
					>
						<svg viewBox="0 0 24 24" fill="none" class="w-3.5 h-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						{formatDateLabel(dailyDate)}
					</button>
					{#if dailyItems.length > 0}
						<button
							on:click={() => {
							const isAll = dailySelectedUris.size === 0;
							const uris = isAll ? new Set(dailyItems.map(i => i.uri)) : dailySelectedUris;
							const title = isAll ? `Daily Mixtape ${new Date(dailyDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' })}` : '';
							openCreateSetlist(uris, title);
						}}
							class="flex items-center gap-1.5 text-xs {$t.accentText} {$t.accentTextHover} border {$t.accentBorder} {$t.accentBorderHover}
								{$t.accentBg} px-2.5 py-1 rounded-full transition-colors"
						>
							<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
								<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
							{dailySelectedUris.size > 0 ? `Mixtape (${dailySelectedUris.size})` : 'Mixtape all'}
						</button>
					{/if}
				</div>

			<!-- Setlists: refresh -->
			{:else if activeTab === 'setlists'}
				<p class="text-xs mt-1 invisible select-none" aria-hidden="true">&nbsp;</p>
				<div class="flex items-center gap-2 mt-2">
					<button
						on:click={loadSetlists}
						disabled={setlistsLoading}
						aria-label="Refresh mixtapes"
						title="Reload your mixtapes"
						class="flex items-center gap-1.5 text-xs {$t.textMuted} {$t.hoverText} border {$t.borderBase} {$t.hoverBorderBase} px-2.5 py-1 rounded-full disabled:opacity-40 transition-colors"
					>
						<svg viewBox="0 0 24 24" fill="none" class="w-3.5 h-3.5 {setlistsLoading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg">
							<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Refresh
					</button>
				</div>
			{/if}
		</div>

		<!-- Tab carousel — all panels live side by side; the strip translates 1:1 with the finger -->
		<div class="relative overflow-x-clip">
		{#each TABS as tab, i}
			{@const offset = i - activeTabIdx}
			<div
				class="{offset === 0 ? 'w-full' : 'absolute top-0 left-0 w-full pointer-events-none select-none'}"
				style="transform: translateX(calc({offset * 100}% + {offset * 20 + effectiveSwipeDx}px)); transition: {isSwiping ? 'none' : 'transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'}; will-change: transform;"
				inert={offset !== 0}
			>
			{#if tab === 'all'}
				{#if allLastRefreshed}
					<p class="text-xs {$t.textFaint} mt-2">Updated {allLastRefreshed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
				{/if}
				{#if allLoading && allItems.length === 0 && !pendingItem}
					<p class="{$t.textMuted} text-sm">Loading…</p>
				{:else if allError}
					<p class="text-red-400 text-sm">{allError}</p>
				{:else if allItems.length === 0 && !pendingItem}
					<div class="rounded-xl border {$t.borderBase} {$t.surfaceBg} px-5 py-10 text-center space-y-2">
						<p class="{$t.textSecondary} text-sm font-medium">No songs yet</p>
						<p class="{$t.textMuted} text-xs">Songs shared by anyone on this instance will appear here.</p>
					</div>
				{:else}
					<div class="space-y-0 sm:space-y-3">
						{#if pendingItem}
							<div class="rounded-xl border {$t.borderBase} {$t.surfaceBg} pl-5 pr-16 py-3 flex items-center gap-3 relative">
								<div class="w-12 h-12 rounded {$t.recessedBg} shrink-0 animate-pulse"></div>
								<div class="flex-1 min-w-0 space-y-1">
									<p class="text-sm font-semibold {$t.textPrimary} truncate">{pendingItem.title}</p>
									<p class="text-xs {$t.textMuted} truncate">{pendingItem.artist}{pendingItem.album ? ` · ${pendingItem.album}` : ''}</p>
									<p class="text-xs {$t.textFaint}">Resolving streaming links…</p>
								</div>
								<div class="absolute right-4 inset-y-0 flex items-center">
									<div class="w-10 h-10 rounded-full {$t.recessedBg} flex items-center justify-center">
										<span class="w-4 h-4 border-2 {$t.borderStrong} border-t-transparent rounded-full animate-spin"></span>
									</div>
								</div>
							</div>
						{/if}
						{#each allItems as item (item.uri)}
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

			{:else if tab === 'following'}
				{#if allLastRefreshed}
					<p class="text-xs {$t.textFaint} mt-2">Updated {allLastRefreshed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
				{/if}
				{#if !$followingLoaded || allLoading}
					<p class="{$t.textMuted} text-sm">Loading…</p>
				{:else if allError}
					<p class="text-red-400 text-sm">{allError}</p>
				{:else if feedItems.length === 0}
					<div class="rounded-xl border {$t.borderBase} {$t.surfaceBg} px-5 py-10 space-y-6">
						<div class="text-center space-y-2">
							<p class="{$t.textSecondary} text-sm font-medium">Your following feed is empty</p>
							<p class="{$t.textMuted} text-xs">Songs shared by people you follow on {AUTH_PROVIDER_NAME} will appear here.</p>
						</div>
						<ol class="space-y-4 text-sm max-w-xs mx-auto">
							<li class="flex gap-3">
								<span class="{$t.textFaint} font-mono text-xs mt-0.5 shrink-0">1</span>
								<div>
									<p class="{$t.textSecondary} font-medium">Follow people on {AUTH_PROVIDER_NAME}</p>
									<p class="{$t.textMuted} text-xs mt-0.5">{APP_NAME} uses your {AUTH_PROVIDER_NAME} follows — anyone you follow there shows up here.</p>
								</div>
							</li>
							<li class="flex gap-3">
								<span class="{$t.textFaint} font-mono text-xs mt-0.5 shrink-0">2</span>
								<div>
									<p class="{$t.textSecondary} font-medium">Share a song</p>
									<p class="{$t.textMuted} text-xs mt-0.5">Tap <span class="{$t.textSecondary}">+</span> to search for a song and share it.</p>
								</div>
							</li>
						</ol>
					</div>
				{:else}
					<div class="space-y-0 sm:space-y-3">
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

			{:else if tab === 'daily'}
				<p class="text-xs {$t.textFaint} mt-2">
					{dailyItems.length} {dailyItems.length === 1 ? 'song' : 'songs'} shared on {new Date(dailyDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
				</p>
				{#if !$followingLoaded || allLoading}
					<p class="{$t.textMuted} text-sm">Loading…</p>
				{:else if dailyItems.length === 0}
					<div class="rounded-xl border {$t.borderBase} {$t.surfaceBg} px-5 py-10 text-center space-y-2">
						<p class="{$t.textSecondary} text-sm font-medium">No songs shared</p>
						<p class="{$t.textMuted} text-xs">Try a different date, or share something.</p>
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

			{:else if tab === 'setlists'}
				{#if setlistsLastRefreshed}
					<p class="text-xs {$t.textFaint} mt-2">Updated {setlistsLastRefreshed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
				{/if}
				{#if setlistsLoading}
					<p class="{$t.textMuted} text-sm">Loading mixtapes…</p>
				{:else if setlists.length === 0}
					<div class="rounded-xl border {$t.borderBase} {$t.surfaceBg} px-5 py-10 text-center space-y-2">
						<p class="{$t.textSecondary} text-sm font-medium">No mixtapes yet</p>
						<p class="{$t.textMuted} text-xs">Select songs in the Feed tab to create your first mixtape.</p>
					</div>
				{:else}
					<div class="space-y-2">
						{#each setlists as setlist (setlist.uri)}
							{@const rkey = setlist.uri.split('/').pop()!}
							<a
								href="/s/{$session?.handle}/{rkey}"
								class="flex items-center justify-between gap-4 rounded-xl border {$t.borderBase} {$t.surfaceBg} px-5 py-4
									{$t.hoverBorderBase} {$t.hoverBg} transition-colors"
							>
								<div class="min-w-0">
									<p class="text-sm font-semibold {$t.textPrimary} truncate">{setlist.value.title}</p>
									<p class="text-xs {$t.textMuted} mt-0.5">
										{setlist.value.items.length} {setlist.value.items.length === 1 ? 'song' : 'songs'}
										· {new Date(setlist.value.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
									</p>
								</div>
								<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 {$t.textFaint} shrink-0" xmlns="http://www.w3.org/2000/svg">
									<path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							</a>
						{/each}
					</div>
				{/if}
			{/if}
			</div>
		{/each}
		</div>
	</section>
{:else}
	<div class="space-y-4">
		<section class="relative overflow-hidden {$t.heroGradient} rounded-2xl px-8 py-14 space-y-8">
			<!-- Badge -->
			<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full {$t.elevatedBg} border {$t.borderStrong} text-xs {$t.textSecondary} font-medium">
				<span class="w-1.5 h-1.5 rounded-full bg-current {$t.accentText} shrink-0"></span>
				Music on every platform
			</span>

			<!-- Headline + subhead -->
			<div class="space-y-4 max-w-md">
				<h1 class="text-4xl font-bold {$t.textPrimary} leading-tight">{APP_TAGLINE}</h1>
				<p class="{$t.textSecondary} text-base leading-relaxed">
					A place for music fans to share what they're listening to, discover songs from friends, and build mixtapes together.
				</p>
			</div>

			<!-- Streaming service pills -->
			<div class="flex flex-wrap gap-2">
				{#each ['Spotify', 'Apple Music', 'Tidal', 'Deezer', 'SoundCloud'] as service}
					<span class="px-3 py-1 text-xs rounded-full {$t.elevatedBg} border {$t.borderBase} {$t.textMuted}">{service}</span>
				{/each}
			</div>

			<!-- CTA -->
			<div class="space-y-2">
				<a href="/login" class="inline-flex items-center gap-2 {$t.btnPrimaryBg} {$t.btnPrimaryText} text-sm font-semibold px-5 py-2.5 rounded-lg {$t.btnPrimaryHover} transition-colors">
					Get started
					<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
						<path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</a>
				<p class="text-xs {$t.textMuted}">Log in with your existing {AUTH_PROVIDER_NAME} account to get started.</p>
			</div>
		</section>

		<LandingContent />
	</div>
{/if}
