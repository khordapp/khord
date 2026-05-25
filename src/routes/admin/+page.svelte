<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { session, isLoggedIn, authReady } from '$lib/stores/auth';
	import { instanceConfig } from '$lib/stores/instance';
	import { APP_NAME } from '$lib/config';
	import { theme as t } from '$lib/theme';
	import { CaretDownIcon, ArrowsClockwiseIcon } from 'phosphor-svelte';

	// ── Auth gate ────────────────────────────────────────────────────────────────
	$: if ($authReady && $instanceConfig.loaded && browser) {
		if (!$isLoggedIn || !$instanceConfig.isOwner) goto('/');
	}

	// ── Types ────────────────────────────────────────────────────────────────────
	interface Stats {
		userCount: number;
		songsCount: number;
		bannedCount: number;
		setlistCount: number;
		pendingRequestsCount: number;
	}

	interface User {
		id: number;
		username: string;
		email: string;
		displayName: string | null;
		role: string;
		createdAt: string;
	}

	interface Ban {
		userId: number;
		username: string;
		email: string;
		displayName: string | null;
		reason: string | null;
		bannedAt: string;
	}

	interface AccessRequest {
		id: number;
		username: string;
		email: string;
		status: 'pending' | 'approved' | 'declined';
		requestedAt: string;
		reviewedAt: string | null;
	}

	interface PinnedSetlist {
		id: number;
		title: string;
		createdAt: string;
		itemCount: number;
		owner: { userId: number; username: string; displayName?: string };
	}

	interface CacheStats {
		count: number;
		totalBytes: number;
		oldestMtime: string | null;
	}

	// ── State ────────────────────────────────────────────────────────────────────
	type Tab = 'users' | 'bans' | 'requests' | 'settings' | 'pins' | 'cache';
	let activeTab: Tab = 'users';

	let stats: Stats | null = null;
	let statsError = false;

	let users: User[] = [];
	let usersLoading = false;
	let usersError = false;
	let usersCursor: string | null = null;
	let usersHasMore = false;

	let bans: Ban[] = [];
	let bansLoading = false;
	let bansError = false;

	let banUsername = '';
	let banReason = '';
	let banPurgeContent = false;
	let banSubmitting = false;
	let banFormError = '';

	let requests: AccessRequest[] = [];
	let requestsLoading = false;
	let requestsError = false;
	let requestsFilter: 'pending' | 'all' = 'pending';

	// ── Instance settings ─────────────────────────────────────────────────────────
	interface InstanceSettings { album_art_disabled: boolean; registration_closed: boolean; max_users: number; }
	let settings: InstanceSettings | null = null;
	let settingsLoading = false;
	let settingsError = false;
	let settingsSaving = false;
	let settingsSaved = false;
	let albumArtDisabled = false;
	let registrationClosed = false;
	let inviteOnly = false;
	let maxUsers = 0;
	let feedScoped = false;
	let spotifyEnabled = false;
	let youtubeMusicEnabled = false;
	let appleMusicEnabled = false;
	let appleMusicDevToken = '';

	// ── Thumbnail cache ───────────────────────────────────────────────────────────
	let cacheStats: CacheStats | null = null;
	let cacheStatsLoading = false;
	let cacheStatsError = false;
	let pruneAge = 90;
	let pruning = false;
	let pruneResult: { count: number; bytesFreed: number } | null = null;
	let pruneError = false;
	let orphanPruning = false;
	let orphanPruneResult: { count: number; bytesFreed: number } | null = null;
	let orphanPruneError = false;

	async function runOrphanPrune() {
		if (orphanPruning) return;
		orphanPruning = true;
		orphanPruneResult = null;
		orphanPruneError = false;
		try {
			const r = await fetch('/api/admin/thumbnails', { method: 'POST' });
			if (!r.ok) throw new Error();
			orphanPruneResult = await r.json();
			await loadCacheStats();
		} catch {
			orphanPruneError = true;
		} finally {
			orphanPruning = false;
		}
	}

	// ── Pinned setlists ───────────────────────────────────────────────────────────
	let pins: PinnedSetlist[] = [];
	let pinsLoading = false;
	let pinsError = false;
	let pinInput = '';
	let pinSubmitting = false;
	let pinFormError = '';

	// ── Instance reset ────────────────────────────────────────────────────────────
	let resetModalOpen = false;
	let resetInput = '';
	let resetting = false;
	let resetError = false;
	let resetSuccess = false;

	// ── Data loaders ─────────────────────────────────────────────────────────────
	async function loadStats() {
		statsError = false;
		try {
			const r = await fetch('/api/admin/stats');
			if (!r.ok) throw new Error();
			stats = await r.json();
		} catch {
			statsError = true;
		}
	}

	async function loadUsers(append = false) {
		if (usersLoading) return;
		usersLoading = true;
		usersError = false;
		try {
			const params = new URLSearchParams({ limit: '50' });
			if (append && usersCursor) params.set('cursor', usersCursor);
			const r = await fetch(`/api/admin/users?${params}`);
			if (!r.ok) throw new Error();
			const data = await r.json();
			users = append ? [...users, ...data.users] : data.users;
			usersCursor = data.cursor;
			usersHasMore = !!data.cursor;
		} catch {
			usersError = true;
		} finally {
			usersLoading = false;
		}
	}

	async function loadBans() {
		if (bansLoading) return;
		bansLoading = true;
		bansError = false;
		try {
			const r = await fetch('/api/admin/bans');
			if (!r.ok) throw new Error();
			bans = (await r.json()).bans;
		} catch {
			bansError = true;
		} finally {
			bansLoading = false;
		}
	}

	async function loadRequests() {
		if (requestsLoading) return;
		requestsLoading = true;
		requestsError = false;
		try {
			const params = new URLSearchParams();
			if (requestsFilter === 'pending') params.set('status', 'pending');
			else params.set('status', 'all');
			const r = await fetch(`/api/admin/requests?${params}`);
			if (!r.ok) throw new Error();
			requests = (await r.json()).requests;
		} catch {
			requestsError = true;
		} finally {
			requestsLoading = false;
		}
	}

	async function loadSettings() {
		if (settingsLoading) return;
		settingsLoading = true;
		settingsError = false;
		try {
			const r = await fetch('/api/admin/settings');
			if (!r.ok) throw new Error();
			const raw = await r.json();
			albumArtDisabled   = raw.album_art_disabled === 'true';
			registrationClosed = raw.registration_closed === 'true';
			inviteOnly         = raw.invite_only === 'true';
			maxUsers           = parseInt(raw.max_users ?? '0', 10) || 0;
			feedScoped         = raw.feed_scoped === 'true';
			spotifyEnabled     = raw.spotify_enabled !== 'false';
			youtubeMusicEnabled = raw.youtube_music_enabled === 'true';
			appleMusicEnabled  = raw.apple_music_enabled === 'true';
			appleMusicDevToken = raw.apple_music_dev_token ?? '';
			settings = { album_art_disabled: albumArtDisabled, registration_closed: registrationClosed, max_users: maxUsers };
		} catch {
			settingsError = true;
		} finally {
			settingsLoading = false;
		}
	}

	async function saveSettings() {
		settingsSaving = true;
		try {
			const r = await fetch('/api/admin/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					settings: {
						album_art_disabled:    String(albumArtDisabled),
						registration_closed:   String(registrationClosed),
						invite_only:           String(inviteOnly),
						max_users:             String(maxUsers),
						feed_scoped:           String(feedScoped),
						spotify_enabled:       String(spotifyEnabled),
						youtube_music_enabled: String(youtubeMusicEnabled),
						apple_music_enabled:   String(appleMusicEnabled),
						apple_music_dev_token: appleMusicDevToken,
					}
				})
			});
			if (!r.ok) throw new Error();
			settingsSaved = true;
			setTimeout(() => (settingsSaved = false), 2500);
		} catch {
			settingsError = true;
		} finally {
			settingsSaving = false;
		}
	}

	async function loadCacheStats() {
		if (cacheStatsLoading) return;
		cacheStatsLoading = true;
		cacheStatsError = false;
		try {
			const r = await fetch('/api/admin/thumbnails');
			if (!r.ok) throw new Error();
			cacheStats = await r.json();
		} catch {
			cacheStatsError = true;
		} finally {
			cacheStatsLoading = false;
		}
	}

	async function runPrune(olderThanDays: number) {
		if (pruning) return;
		pruning = true;
		pruneResult = null;
		pruneError = false;
		try {
			const r = await fetch('/api/admin/thumbnails', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ olderThanDays })
			});
			if (!r.ok) throw new Error();
			pruneResult = await r.json();
			await loadCacheStats();
		} catch {
			pruneError = true;
		} finally {
			pruning = false;
		}
	}

	// ── Ban / unban ───────────────────────────────────────────────────────────────
	async function banUser(targetUserId: number, reason?: string, purgeContent = false) {
		await fetch('/api/admin/bans', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ targetUserId, reason: reason || undefined, purgeContent })
		});
		await Promise.all([loadBans(), loadStats()]);
	}

	async function unbanUser(targetUserId: number) {
		bans = bans.filter((b) => b.userId !== targetUserId);
		await fetch('/api/admin/bans', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ targetUserId })
		});
		await loadStats();
	}

	async function submitBanForm() {
		banFormError = '';
		const username = banUsername.trim();
		if (!username) { banFormError = 'Enter a username.'; return; }
		const found = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
		if (!found) { banFormError = `User "${username}" not found in the user list. Load all users first.`; return; }
		banSubmitting = true;
		try {
			await banUser(found.id, banReason.trim() || undefined, banPurgeContent);
			banUsername = '';
			banReason = '';
			banPurgeContent = false;
		} finally {
			banSubmitting = false;
		}
	}

	// ── Requests ─────────────────────────────────────────────────────────────────
	async function reviewRequest(requestId: number, action: 'approve' | 'decline') {
		await fetch('/api/admin/requests', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ requestId, action })
		});
		await Promise.all([loadRequests(), loadStats()]);
	}

	// ── Pinned setlists ───────────────────────────────────────────────────────────
	async function loadPins() {
		if (pinsLoading) return;
		pinsLoading = true;
		pinsError = false;
		try {
			const r = await fetch('/api/pinned-setlists');
			if (!r.ok) throw new Error();
			pins = (await r.json()).pins;
		} catch {
			pinsError = true;
		} finally {
			pinsLoading = false;
		}
	}

	function parseSetlistId(input: string): number | null {
		const trimmed = input.trim();
		// Direct integer
		const n = parseInt(trimmed, 10);
		if (!isNaN(n) && String(n) === trimmed) return n;
		// URL like /s/123 or https://.../ or s/123
		const match = trimmed.match(/\/s\/(\d+)/);
		if (match) return parseInt(match[1], 10);
		return null;
	}

	async function addPin() {
		pinFormError = '';
		const setlistId = parseSetlistId(pinInput);
		if (!setlistId) { pinFormError = 'Enter a setlist ID or URL like /s/123.'; return; }
		pinSubmitting = true;
		try {
			const r = await fetch('/api/pinned-setlists', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ setlistId })
			});
			if (!r.ok) throw new Error();
			await loadPins();
			pinInput = '';
		} catch {
			pinFormError = 'Failed to add pin.';
		} finally {
			pinSubmitting = false;
		}
	}

	async function removePin(setlistId: number) {
		pins = pins.filter((p) => p.id !== setlistId);
		await fetch('/api/pinned-setlists', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ setlistId })
		});
	}

	// ── Reset ─────────────────────────────────────────────────────────────────────
	async function resetInstance() {
		if (resetInput !== 'RESET') return;
		resetting = true;
		resetError = false;
		try {
			const r = await fetch('/api/admin/reset', { method: 'POST' });
			if (!r.ok) throw new Error();
			resetSuccess = true;
			resetModalOpen = false;
			resetInput = '';
			stats = null;
			users = [];
			await loadStats();
		} catch {
			resetError = true;
		} finally {
			resetting = false;
		}
	}

	// ── Mount ─────────────────────────────────────────────────────────────────────
	let dataLoaded = false;
	$: if ($authReady && $instanceConfig.loaded && $isLoggedIn && $instanceConfig.isOwner && !dataLoaded) {
		dataLoaded = true;
		loadStats();
		loadUsers();
		loadBans();
		loadRequests();
		loadSettings();
		loadCacheStats();
		loadPins();
	}

	$: if (dataLoaded) loadRequests();

	// ── Helpers ───────────────────────────────────────────────────────────────────
	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}
</script>

<svelte:head>
	<title>Admin — {APP_NAME}</title>
</svelte:head>

<div class="space-y-8 max-w-2xl">
	<div>
		<h1 class="text-2xl font-bold">Admin</h1>
		<p class="text-sm {$t.textSecondary} mt-1">Instance management</p>
	</div>

	<!-- Stats row -->
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
		{#if stats}
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {$t.textMuted} uppercase tracking-wider font-medium">Users</p>
				<p class="text-xl font-bold">
					{stats.userCount}{#if stats && maxUsers > 0}<span class="text-sm font-normal {$t.textMuted}"> / {maxUsers}</span>{/if}
				</p>
			</div>
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {$t.textMuted} uppercase tracking-wider font-medium">Songs</p>
				<p class="text-xl font-bold">{stats.songsCount.toLocaleString()}</p>
			</div>
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {$t.textMuted} uppercase tracking-wider font-medium">Mixtapes</p>
				<p class="text-xl font-bold">{stats.setlistCount.toLocaleString()}</p>
			</div>
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {$t.textMuted} uppercase tracking-wider font-medium">Banned</p>
				<p class="text-xl font-bold">{stats.bannedCount}</p>
			</div>
		{:else if statsError}
			<div class="col-span-4 {$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4">
				<p class="text-sm {$t.textMuted}">Could not load stats.</p>
			</div>
		{:else}
			{#each [0, 1, 2, 3] as _}
				<div class="{$t.surfaceBg} border {$t.borderBase} rounded-xl px-4 py-3 animate-pulse h-16"></div>
			{/each}
		{/if}
	</div>

	<!-- Mobile: section picker -->
	<div class="sm:hidden space-y-1.5">
		<div class="relative {$t.elevatedBg} border {$t.borderStrong} rounded-lg">
			<select
				bind:value={activeTab}
				class="w-full pl-4 pr-10 py-3 text-sm font-medium appearance-none bg-transparent {$t.textPrimary} cursor-pointer outline-none"
			>
				<option value="users">Users{stats ? ` — ${stats.userCount}` : ''}</option>
				<option value="bans">Bans{stats?.bannedCount ? ` — ${stats.bannedCount}` : ''}</option>
				<option value="requests">Requests{stats?.pendingRequestsCount ? ` — ${stats.pendingRequestsCount} pending` : ''}</option>
				<option value="settings">Settings</option>
				<option value="pins">Pinned Mixtapes</option>
				<option value="cache">Cache</option>
			</select>
			<div class="absolute inset-y-0 right-3 flex items-center pointer-events-none {$t.accentText}">
				<CaretDownIcon size={12} />
			</div>
		</div>
	</div>

	<!-- Desktop: tab bar -->
	<div class="hidden sm:flex gap-1 border-b {$t.borderBase}">
		{#each [['users', 'Users'], ['bans', 'Bans'], ['requests', 'Requests'], ['settings', 'Settings'], ['pins', 'Pinned'], ['cache', 'Cache']] as [id, label]}
			<button
				on:click={() => (activeTab = id as Tab)}
				class="px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
					{activeTab === id
						? `border-current ${$t.textPrimary}`
						: `border-transparent ${$t.textMuted} ${$t.hoverText}`}"
			>
				{label}{#if id === 'bans' && stats?.bannedCount}&nbsp;({stats.bannedCount}){/if}{#if id === 'requests' && stats?.pendingRequestsCount}&nbsp;<span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-black text-[10px] font-bold leading-none">{stats.pendingRequestsCount}</span>{/if}
			</button>
		{/each}
	</div>

	<!-- Users tab -->
	{#if activeTab === 'users'}
		<div class="space-y-3">
			{#if usersError}
				<p class="text-sm {$t.textMuted}">Could not load users.</p>
			{:else if users.length === 0 && usersLoading}
				<div class="space-y-2">
					{#each [0, 1, 2, 3] as _}
						<div class="{$t.surfaceBg} border {$t.borderBase} rounded-lg h-14 animate-pulse"></div>
					{/each}
				</div>
			{:else if users.length === 0}
				<p class="text-sm {$t.textMuted}">No users yet.</p>
			{:else}
				<div class="space-y-1">
					{#each users as user (user.id)}
						<div class="flex items-center gap-3 {$t.surfaceBg} border {$t.borderBase} rounded-lg px-3 py-2.5">
							<div class="w-8 h-8 rounded-full shrink-0 {$t.elevatedBg} flex items-center justify-center text-xs font-semibold {$t.textMuted}">
								{user.username[0].toUpperCase()}
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium {$t.textPrimary} truncate">
									{user.displayName ?? user.username}
									{#if user.role === 'admin'}<span class="ml-1 text-xs {$t.accentText}">(admin)</span>{/if}
								</p>
								<p class="text-xs {$t.textFaint} truncate">@{user.username} · {user.email} · {formatDate(user.createdAt)}</p>
							</div>
							{#if user.id !== $session?.id}
								<button
									on:click={() => {
										const reason = prompt(`Reason for banning @${user.username} (optional):`);
										if (reason !== null) banUser(user.id, reason);
									}}
									class="text-xs px-2.5 py-1 rounded border {$t.borderStrong} {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors shrink-0"
								>
									Ban
								</button>
							{/if}
						</div>
					{/each}
				</div>
				{#if usersHasMore}
					<button
						on:click={() => loadUsers(true)}
						disabled={usersLoading}
						class="w-full text-sm py-2 rounded-lg border {$t.borderBase} {$t.textMuted} {$t.hoverBg} transition-colors disabled:opacity-50"
					>
						{usersLoading ? 'Loading…' : 'Load more'}
					</button>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Bans tab -->
	{#if activeTab === 'bans'}
		<div class="space-y-6">
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl p-4 space-y-3">
				<p class="text-sm font-medium {$t.textSecondary}">Ban a user by username</p>
				<div class="space-y-2">
					<input
						bind:value={banUsername}
						placeholder="username"
						class="w-full text-sm {$t.surfaceBg} border {$t.borderStrong} rounded-lg px-3 py-2 {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none focus:ring-1 focus:ring-current"
					/>
					<input
						bind:value={banReason}
						placeholder="Reason (optional)"
						class="w-full text-sm {$t.surfaceBg} border {$t.borderStrong} rounded-lg px-3 py-2 {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none focus:ring-1 focus:ring-current"
					/>
					<label class="flex items-center gap-2 cursor-pointer select-none">
						<input type="checkbox" bind:checked={banPurgeContent} class="rounded" />
						<span class="text-sm {$t.textMuted}">Delete all their songs, votes, mixtapes, and proposals</span>
					</label>
					{#if banFormError}
						<p class="text-xs text-red-400">{banFormError}</p>
					{/if}
					<button
						on:click={submitBanForm}
						disabled={banSubmitting}
						class="text-sm font-medium px-4 py-2 rounded-lg {$t.btnPrimaryBg} {$t.btnPrimaryText} {$t.btnPrimaryHover} transition-colors disabled:opacity-50"
					>
						{banSubmitting ? 'Banning…' : 'Ban user'}
					</button>
				</div>
			</div>

			{#if bansError}
				<p class="text-sm {$t.textMuted}">Could not load bans.</p>
			{:else if bans.length === 0 && bansLoading}
				<div class="space-y-2">
					{#each [0, 1] as _}
						<div class="{$t.surfaceBg} border {$t.borderBase} rounded-lg h-14 animate-pulse"></div>
					{/each}
				</div>
			{:else if bans.length === 0}
				<p class="text-sm {$t.textMuted}">No banned users.</p>
			{:else}
				<div class="space-y-1">
					{#each bans as ban (ban.userId)}
						<div class="flex items-center gap-3 {$t.surfaceBg} border {$t.borderBase} rounded-lg px-3 py-2.5">
							<div class="w-8 h-8 rounded-full shrink-0 {$t.elevatedBg} flex items-center justify-center text-xs font-semibold {$t.textMuted}">
								{ban.username[0].toUpperCase()}
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium {$t.textPrimary} truncate">@{ban.username}</p>
								<p class="text-xs {$t.textFaint} truncate">
									{formatDate(ban.bannedAt)}{#if ban.reason} · {ban.reason}{/if}
								</p>
							</div>
							<button
								on:click={() => unbanUser(ban.userId)}
								class="text-xs px-2.5 py-1 rounded border {$t.borderStrong} {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors shrink-0"
							>
								Unban
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Requests tab -->
	{#if activeTab === 'requests'}
		<div class="space-y-4">
			<div class="flex items-center gap-2">
				<button
					on:click={() => (requestsFilter = 'pending')}
					class="text-xs px-3 py-1 rounded-full border transition-colors
						{requestsFilter === 'pending'
							? `${$t.btnPrimaryBg} ${$t.btnPrimaryText} border-transparent`
							: `${$t.borderStrong} ${$t.textMuted} ${$t.hoverText} ${$t.hoverBg}`}"
				>
					Pending
				</button>
				<button
					on:click={() => (requestsFilter = 'all')}
					class="text-xs px-3 py-1 rounded-full border transition-colors
						{requestsFilter === 'all'
							? `${$t.btnPrimaryBg} ${$t.btnPrimaryText} border-transparent`
							: `${$t.borderStrong} ${$t.textMuted} ${$t.hoverText} ${$t.hoverBg}`}"
				>
					All
				</button>
			</div>

			{#if requestsError}
				<p class="text-sm {$t.textMuted}">Could not load requests.</p>
			{:else if requests.length === 0 && requestsLoading}
				<div class="space-y-2">
					{#each [0, 1, 2] as _}
						<div class="{$t.surfaceBg} border {$t.borderBase} rounded-lg h-14 animate-pulse"></div>
					{/each}
				</div>
			{:else if requests.length === 0}
				<p class="text-sm {$t.textMuted}">
					{requestsFilter === 'pending' ? 'No pending access requests.' : 'No access requests yet.'}
				</p>
			{:else}
				<div class="space-y-1">
					{#each requests as req (req.id)}
						<div class="flex items-center gap-3 {$t.surfaceBg} border {$t.borderBase} rounded-lg px-3 py-2.5">
							<div class="w-8 h-8 rounded-full shrink-0 {$t.elevatedBg} flex items-center justify-center text-xs font-semibold {$t.textMuted}">
								{req.username[0].toUpperCase()}
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium {$t.textPrimary} truncate">@{req.username}</p>
								<p class="text-xs {$t.textFaint} truncate">
									{req.email} · {formatDate(req.requestedAt)}
									{#if req.status !== 'pending'}
										· <span class="{req.status === 'approved' ? 'text-green-400' : 'text-red-400'}">{req.status}</span>
									{/if}
								</p>
							</div>
							{#if req.status === 'pending'}
								<div class="flex items-center gap-1.5 shrink-0">
									<button
										on:click={() => reviewRequest(req.id, 'approve')}
										class="text-xs px-2.5 py-1 rounded border border-green-700 text-green-400 hover:bg-green-950 transition-colors"
									>
										Approve
									</button>
									<button
										on:click={() => reviewRequest(req.id, 'decline')}
										class="text-xs px-2.5 py-1 rounded border {$t.borderStrong} {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors"
									>
										Decline
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Settings tab -->
	{#if activeTab === 'settings'}
		<div class="space-y-6 max-w-md">
			{#if settingsError}
				<p class="text-sm {$t.textMuted}">Could not load settings.</p>
			{:else if settingsLoading && !settings}
				<div class="space-y-3">
					{#each [0, 1, 2] as _}
						<div class="{$t.surfaceBg} border {$t.borderBase} rounded-xl h-16 animate-pulse"></div>
					{/each}
				</div>
			{:else}
				{@const mkToggle = (checked: boolean, label: string, on: () => void) => ({ checked, label, on })}

				<!-- Album art -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">Album art</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Show thumbnail images on song cards.</p>
					</div>
					<button
						role="switch" aria-checked={!albumArtDisabled} aria-label="Toggle album art"
						on:click={() => (albumArtDisabled = !albumArtDisabled)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors {!albumArtDisabled ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform {!albumArtDisabled ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Registration -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">Open registration</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Allow new users to sign up. Existing users are unaffected.</p>
					</div>
					<button
						role="switch" aria-checked={!registrationClosed} aria-label="Toggle open registration"
						on:click={() => (registrationClosed = !registrationClosed)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors {!registrationClosed ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform {!registrationClosed ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Invite-only -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">Invite-only</p>
						<p class="text-xs {$t.textMuted} mt-0.5">New users must request access. Review requests in the Requests tab.</p>
					</div>
					<button
						role="switch" aria-checked={inviteOnly} aria-label="Toggle invite-only mode"
						on:click={() => (inviteOnly = !inviteOnly)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors {inviteOnly ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform {inviteOnly ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Spotify -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">Spotify links</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Requires <code class="font-mono">PUBLIC_SPOTIFY_CLIENT_ID</code> and <code class="font-mono">SPOTIFY_CLIENT_SECRET</code> env vars.</p>
					</div>
					<button
						role="switch" aria-checked={spotifyEnabled} aria-label="Toggle Spotify links"
						on:click={() => (spotifyEnabled = !spotifyEnabled)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors {spotifyEnabled ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform {spotifyEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- YouTube Music -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">YouTube Music links</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Requires <code class="font-mono">YOUTUBE_API_KEY</code> env var.</p>
					</div>
					<button
						role="switch" aria-checked={youtubeMusicEnabled} aria-label="Toggle YouTube Music links"
						on:click={() => (youtubeMusicEnabled = !youtubeMusicEnabled)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors {youtubeMusicEnabled ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform {youtubeMusicEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Apple Music -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 space-y-4">
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="text-sm font-medium {$t.textPrimary}">Apple Music playlist import</p>
							<p class="text-xs {$t.textMuted} mt-0.5">Lets users import playlists from Apple Music. Requires a MusicKit developer token. Tokens expire after up to 6 months.</p>
						</div>
						<button
							role="switch" aria-checked={appleMusicEnabled} aria-label="Toggle Apple Music playlist import"
							on:click={() => (appleMusicEnabled = !appleMusicEnabled)}
							class="relative shrink-0 w-10 h-6 rounded-full transition-colors {appleMusicEnabled ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
						>
							<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform {appleMusicEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
						</button>
					</div>
					<div class="space-y-1">
						<label for="apple-music-token" class="text-xs font-medium {$t.textMuted}">Developer token</label>
						<input
							id="apple-music-token"
							type="password"
							bind:value={appleMusicDevToken}
							placeholder="Paste MusicKit JWT…"
							autocomplete="off"
							class="w-full {$t.recessedBg} border {$t.borderStrong} rounded-lg px-3 py-2 text-sm
								{$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none focus:ring-1 focus:ring-current"
						/>
					</div>
				</div>

				<!-- Max users -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 space-y-3">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">User cap</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Maximum registered users. Set to 0 for unlimited.</p>
					</div>
					<input
						type="number"
						min="0"
						bind:value={maxUsers}
						class="w-32 text-sm {$t.surfaceBg} border {$t.borderStrong} rounded-lg px-3 py-2
							{$t.textPrimary} focus:outline-none focus:ring-1 focus:ring-current"
					/>
					{#if stats && maxUsers > 0}
						<p class="text-xs {$t.textMuted}">{stats.userCount} / {maxUsers} currently registered</p>
					{/if}
				</div>

				<!-- Save -->
				<button
					on:click={saveSettings}
					disabled={settingsSaving}
					class="text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50
						{settingsSaved
							? 'bg-green-900 text-green-300 border border-green-700'
							: `${$t.btnPrimaryBg} ${$t.btnPrimaryText} ${$t.btnPrimaryHover}`}"
				>
					{settingsSaving ? 'Saving…' : settingsSaved ? 'Saved!' : 'Save settings'}
				</button>

				<!-- Danger zone -->
				<div class="border border-red-900 rounded-xl p-4 space-y-3 mt-4">
					<div>
						<p class="text-sm font-semibold text-red-400">Danger zone</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Permanently wipe all users, songs, votes, and mixtapes. Bans and instance settings are preserved.</p>
					</div>
					<button
						on:click={() => { resetModalOpen = true; resetInput = ''; resetError = false; resetSuccess = false; }}
						class="text-sm font-medium px-4 py-2 rounded-lg border border-red-800 text-red-400 hover:bg-red-950 transition-colors"
					>
						Reset instance…
					</button>
					{#if resetSuccess}
						<p class="text-xs text-green-400">Instance reset complete.</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Reset confirmation modal -->
	{#if resetModalOpen}
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div
			class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
			on:click|self={() => !resetting && (resetModalOpen = false)}
		>
			<div class="{$t.surfaceBg} border border-red-800 rounded-2xl p-6 space-y-4 w-full max-w-sm">
				<h2 class="text-base font-bold text-red-400">Reset instance</h2>
				<div class="text-sm space-y-2">
					<p class="{$t.textMuted}">This will permanently delete:</p>
					<ul class="list-disc list-inside space-y-0.5 {$t.textFaint} text-xs">
						<li>All users and sessions</li>
						<li>All songs, votes, mixtapes, and proposals</li>
						<li>All access requests</li>
					</ul>
					<p class="{$t.textMuted}">Bans and instance settings are preserved.</p>
				</div>
				<div class="space-y-2">
					<p class="text-xs {$t.textMuted}">Type <span class="text-red-400 font-mono font-bold">RESET</span> to confirm:</p>
					<input
						bind:value={resetInput}
						placeholder="RESET"
						disabled={resetting}
						class="w-full text-base font-mono {$t.surfaceBg} border border-red-800 rounded-lg px-3 py-2 {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none focus:ring-1 focus:ring-red-700"
					/>
					{#if resetError}
						<p class="text-xs text-red-400">Reset failed — check server logs.</p>
					{/if}
				</div>
				<div class="flex gap-2 justify-end">
					<button
						on:click={() => { resetModalOpen = false; resetInput = ''; resetError = false; }}
						disabled={resetting}
						class="text-sm px-4 py-2 rounded-lg border {$t.borderStrong} {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						on:click={resetInstance}
						disabled={resetting || resetInput !== 'RESET'}
						class="text-sm font-medium px-4 py-2 rounded-lg border border-red-700 bg-red-950 text-red-300 hover:bg-red-900 transition-colors disabled:opacity-40"
					>
						{resetting ? 'Resetting…' : 'Reset instance'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Pins tab -->
	{#if activeTab === 'pins'}
		<div class="space-y-6 max-w-md">
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl p-4 space-y-3">
				<p class="text-sm font-medium {$t.textSecondary}">Pin a mixtape</p>
				<div class="space-y-2">
					<input
						bind:value={pinInput}
						placeholder="Setlist ID or URL (e.g. /s/42)"
						class="w-full text-sm {$t.surfaceBg} border {$t.borderStrong} rounded-lg px-3 py-2 {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none focus:ring-1 focus:ring-current font-mono"
					/>
					{#if pinFormError}
						<p class="text-xs text-red-400">{pinFormError}</p>
					{/if}
					<button
						on:click={addPin}
						disabled={pinSubmitting}
						class="text-sm font-medium px-4 py-2 rounded-lg {$t.btnPrimaryBg} {$t.btnPrimaryText} {$t.btnPrimaryHover} transition-colors disabled:opacity-50"
					>
						{pinSubmitting ? 'Adding…' : 'Add pin'}
					</button>
				</div>
			</div>

			{#if pinsError}
				<p class="text-sm {$t.textMuted}">Could not load pins.</p>
			{:else if pinsLoading && pins.length === 0}
				<div class="space-y-2">
					{#each [0, 1] as _}
						<div class="{$t.surfaceBg} border {$t.borderBase} rounded-lg h-14 animate-pulse"></div>
					{/each}
				</div>
			{:else if pins.length === 0}
				<p class="text-sm {$t.textMuted}">No pinned mixtapes yet.</p>
			{:else}
				<div class="space-y-1">
					{#each pins as pin (pin.id)}
						<div class="flex items-center gap-3 {$t.surfaceBg} border {$t.borderBase} rounded-lg px-3 py-2.5">
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium {$t.textPrimary} truncate">{pin.title}</p>
								<p class="text-xs {$t.textFaint} truncate">
									@{pin.owner.username} · {pin.itemCount} songs · /s/{pin.id}
								</p>
							</div>
							<div class="flex items-center gap-2 shrink-0">
								<a
									href="/s/{pin.id}"
									target="_blank"
									rel="noopener noreferrer"
									class="text-xs px-2.5 py-1 rounded border {$t.borderStrong} {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors"
								>View</a>
								<button
									on:click={() => removePin(pin.id)}
									class="text-xs px-2.5 py-1 rounded border border-red-900 text-red-400 hover:bg-red-950 transition-colors"
								>Unpin</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Cache tab -->
	{#if activeTab === 'cache'}
		<div class="space-y-6 max-w-md">
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl p-4 space-y-3">
				<p class="text-sm font-medium {$t.textSecondary}">Thumbnail cache</p>
				{#if cacheStatsLoading && !cacheStats}
					<div class="{$t.recessedBg} rounded-lg h-16 animate-pulse"></div>
				{:else if cacheStatsError}
					<p class="text-sm {$t.textMuted}">Could not read cache directory.</p>
				{:else if cacheStats}
					<div class="grid grid-cols-3 gap-3">
						<div class="{$t.recessedBg} rounded-lg px-3 py-2.5 space-y-0.5">
							<p class="text-xs {$t.textFaint} uppercase tracking-wider font-medium">Images</p>
							<p class="text-lg font-bold">{cacheStats.count.toLocaleString()}</p>
						</div>
						<div class="{$t.recessedBg} rounded-lg px-3 py-2.5 space-y-0.5">
							<p class="text-xs {$t.textFaint} uppercase tracking-wider font-medium">Size</p>
							<p class="text-lg font-bold">{formatBytes(cacheStats.totalBytes)}</p>
						</div>
						<div class="{$t.recessedBg} rounded-lg px-3 py-2.5 space-y-0.5">
							<p class="text-xs {$t.textFaint} uppercase tracking-wider font-medium">Oldest</p>
							<p class="text-base font-semibold">
								{cacheStats.oldestMtime
									? new Date(cacheStats.oldestMtime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
									: '—'}
							</p>
						</div>
					</div>
				{/if}
				<button
					on:click={loadCacheStats}
					disabled={cacheStatsLoading}
					class="flex items-center gap-1.5 text-xs {$t.textMuted} {$t.hoverText} border {$t.borderBase} {$t.hoverBorderBase} px-2.5 py-1 rounded-full disabled:opacity-50 transition-colors"
				>
					<ArrowsClockwiseIcon size={12} class="{cacheStatsLoading ? 'animate-spin' : ''}" />
					Refresh
				</button>
			</div>

			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl p-4 space-y-4">
				<div>
					<p class="text-sm font-medium {$t.textPrimary}">Prune old thumbnails</p>
					<p class="text-xs {$t.textMuted} mt-0.5">Remove cached images older than the selected window. They'll be re-fetched on next view.</p>
				</div>
				<div class="flex items-center gap-2 flex-wrap">
					<select
						bind:value={pruneAge}
						class="text-sm {$t.surfaceBg} border {$t.borderStrong} rounded-lg px-3 py-2 {$t.textPrimary} focus:outline-none focus:ring-1 focus:ring-current"
					>
						<option value={30}>Older than 30 days</option>
						<option value={60}>Older than 60 days</option>
						<option value={90}>Older than 90 days</option>
						<option value={180}>Older than 180 days</option>
					</select>
					<button
						on:click={() => runPrune(pruneAge)}
						disabled={pruning || cacheStats?.count === 0}
						class="text-sm font-medium px-4 py-2 rounded-lg {$t.btnPrimaryBg} {$t.btnPrimaryText} {$t.btnPrimaryHover} transition-colors disabled:opacity-50"
					>
						{pruning ? 'Pruning…' : 'Prune'}
					</button>
				</div>
				<button
					on:click={() => { if (confirm('Delete all cached thumbnails?')) runPrune(0); }}
					disabled={pruning || cacheStats?.count === 0}
					class="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
				>
					Clear all thumbnails
				</button>
				{#if pruneResult}
					<p class="text-xs {$t.textFaint}">
						{#if pruneResult.count === 0}
							No thumbnails matched — nothing removed.
						{:else}
							Removed {pruneResult.count.toLocaleString()} {pruneResult.count === 1 ? 'thumbnail' : 'thumbnails'} · {formatBytes(pruneResult.bytesFreed)} freed.
						{/if}
					</p>
				{:else if pruneError}
					<p class="text-xs text-red-400">Prune failed — check server logs.</p>
				{/if}
			</div>

			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl p-4 space-y-4">
				<div>
					<p class="text-sm font-medium {$t.textPrimary}">Prune orphan thumbnails</p>
					<p class="text-xs {$t.textMuted} mt-0.5">Remove cached images no longer referenced by any song. Safe to run at any time — missing thumbnails are re-fetched on next view.</p>
				</div>
				<button
					on:click={runOrphanPrune}
					disabled={orphanPruning || cacheStats?.count === 0}
					class="text-sm font-medium px-4 py-2 rounded-lg {$t.btnPrimaryBg} {$t.btnPrimaryText} {$t.btnPrimaryHover} transition-colors disabled:opacity-50"
				>
					{orphanPruning ? 'Scanning…' : 'Prune orphans'}
				</button>
				{#if orphanPruneResult}
					<p class="text-xs {$t.textFaint}">
						{#if orphanPruneResult.count === 0}
							No orphan thumbnails found — nothing removed.
						{:else}
							Removed {orphanPruneResult.count.toLocaleString()} {orphanPruneResult.count === 1 ? 'thumbnail' : 'thumbnails'} · {formatBytes(orphanPruneResult.bytesFreed)} freed.
						{/if}
					</p>
				{:else if orphanPruneError}
					<p class="text-xs text-red-400">Prune failed — check server logs.</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
