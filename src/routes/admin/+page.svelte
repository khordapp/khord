<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { session, isLoggedIn, authReady } from '$lib/stores/auth';
	import { instanceConfig } from '$lib/stores/instance';
	import { APP_NAME } from '$lib/config';
	import { theme as t } from '$lib/theme';

	// ── Auth gate ────────────────────────────────────────────────────────────────
	// Wait for both authReady and instanceConfig.loaded before checking ownership
	$: if ($authReady && $instanceConfig.loaded && browser) {
		if (!$isLoggedIn || !$instanceConfig.isOwner) goto('/');
	}

	// ── Types ────────────────────────────────────────────────────────────────────
	interface Stats {
		registeredCount: number;
		songsCount: number;
		bannedCount: number;
		cursorSeq: number;
		maxUsers: number;
		pendingRequestsCount: number;
	}

	interface User {
		did: string;
		registeredAt: string;
		handle: string | null;
		displayName: string | null;
		avatar: string | null;
	}

	interface Ban {
		did: string;
		reason: string | null;
		bannedAt: string;
		handle: string | null;
		displayName: string | null;
		avatar: string | null;
	}

	// ── State ────────────────────────────────────────────────────────────────────
	type Tab = 'users' | 'bans' | 'requests' | 'settings' | 'cache';
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

	// Ban form
	let banDid = '';
	let banReason = '';
	let banSubmitting = false;
	let banFormError = '';

	// ── Access requests ───────────────────────────────────────────────────────────
	interface AccessRequest {
		id: number;
		handle: string;
		did: string;
		status: 'pending' | 'approved' | 'declined';
		requestedAt: string;
		reviewedAt: string | null;
	}

	let requests: AccessRequest[] = [];
	let requestsLoading = false;
	let requestsError = false;
	let requestsFilter: 'pending' | 'all' = 'pending';

	async function loadRequests() {
		const did = $session?.did;
		if (!did || requestsLoading) return;
		requestsLoading = true;
		requestsError = false;
		try {
			const params = new URLSearchParams({ did });
			if (requestsFilter === 'pending') params.set('status', 'pending');
			const r = await fetch(`/api/admin/requests?${params}`);
			if (!r.ok) throw new Error();
			const data = await r.json();
			requests = data.requests;
		} catch {
			requestsError = true;
		} finally {
			requestsLoading = false;
		}
	}

	async function reviewRequest(requestId: number, action: 'approve' | 'decline') {
		const ownerDid = $session?.did;
		if (!ownerDid) return;
		await fetch('/api/admin/requests', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ownerDid, requestId, action })
		});
		await Promise.all([loadRequests(), loadStats()]);
	}

	// ── Instance settings ─────────────────────────────────────────────────────────
	interface InstanceSettings {
		album_art_disabled: boolean;
		registration_closed: boolean;
		max_users: number;
	}

	let settings: InstanceSettings | null = null;
	let settingsLoading = false;
	let settingsError = false;
	let settingsSaving = false;
	let settingsSaved = false;

	// Local editable copies
	let albumArtDisabled = false;
	let registrationClosed = false;
	let inviteOnly = false;
	let maxUsers = 0;
	let feedScoped = false;
	let spotifyEnabled = false;
	let youtubeMusicEnabled = false;

	async function loadSettings() {
		const did = $session?.did;
		if (!did || settingsLoading) return;
		settingsLoading = true;
		settingsError = false;
		try {
			const r = await fetch(`/api/admin/settings?did=${encodeURIComponent(did)}`);
			if (!r.ok) throw new Error();
			const raw = await r.json();
			albumArtDisabled = raw.album_art_disabled === 'true';
			registrationClosed = raw.registration_closed === 'true';
			inviteOnly = raw.invite_only === 'true';
			maxUsers = parseInt(raw.max_users ?? '0', 10) || 0;
			feedScoped = raw.feed_scoped === 'true';
			spotifyEnabled = raw.spotify_enabled !== 'false';
			youtubeMusicEnabled = raw.youtube_music_enabled === 'true';
			settings = { album_art_disabled: albumArtDisabled, registration_closed: registrationClosed, max_users: maxUsers };
		} catch {
			settingsError = true;
		} finally {
			settingsLoading = false;
		}
	}

	async function saveSettings() {
		const ownerDid = $session?.did;
		if (!ownerDid) return;
		settingsSaving = true;
		try {
			const r = await fetch('/api/admin/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					ownerDid,
					settings: {
						album_art_disabled: String(albumArtDisabled),
						registration_closed: String(registrationClosed),
						invite_only: String(inviteOnly),
						max_users: String(maxUsers),
						feed_scoped: String(feedScoped),
						spotify_enabled: String(spotifyEnabled),
						youtube_music_enabled: String(youtubeMusicEnabled)
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

	// ── Data loading ─────────────────────────────────────────────────────────────
	async function loadStats() {
		const did = $session?.did;
		if (!did) return;
		try {
			const r = await fetch(`/api/admin/stats?did=${encodeURIComponent(did)}`);
			if (!r.ok) throw new Error();
			stats = await r.json();
		} catch {
			statsError = true;
		}
	}

	let resolvingHandles = false;
	let resolveResult: { resolved: number; failed: number; total: number } | null = null;

	async function resolveHandles() {
		const did = $session?.did;
		if (!did || resolvingHandles) return;
		resolvingHandles = true;
		resolveResult = null;
		try {
			const r = await fetch(`/api/admin/users/resolve-handles?did=${encodeURIComponent(did)}`, { method: 'POST' });
			if (!r.ok) throw new Error();
			resolveResult = await r.json();
			if (resolveResult && resolveResult.resolved > 0) await loadUsers();
		} catch {
			resolveResult = { resolved: 0, failed: -1, total: 0 };
		} finally {
			resolvingHandles = false;
		}
	}

	async function loadUsers(append = false) {
		const did = $session?.did;
		if (!did || usersLoading) return;
		usersLoading = true;
		usersError = false;
		try {
			const params = new URLSearchParams({ did, limit: '50' });
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
		const did = $session?.did;
		if (!did || bansLoading) return;
		bansLoading = true;
		bansError = false;
		try {
			const r = await fetch(`/api/admin/bans?did=${encodeURIComponent(did)}`);
			if (!r.ok) throw new Error();
			const data = await r.json();
			bans = data.bans;
		} catch {
			bansError = true;
		} finally {
			bansLoading = false;
		}
	}

	// ── Ban / unban actions ───────────────────────────────────────────────────────
	async function banUser(targetDid: string, reason?: string) {
		const ownerDid = $session?.did;
		if (!ownerDid) return;
		await fetch('/api/admin/bans', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ownerDid, targetDid, reason: reason || undefined })
		});
		await Promise.all([loadBans(), loadStats()]);
	}

	async function unbanUser(targetDid: string) {
		const ownerDid = $session?.did;
		if (!ownerDid) return;
		// Optimistic remove
		bans = bans.filter((b) => b.did !== targetDid);
		await fetch('/api/admin/bans', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ownerDid, targetDid })
		});
		await loadStats();
	}

	async function submitBanForm() {
		banFormError = '';
		const target = banDid.trim();
		if (!target) { banFormError = 'Enter a DID.'; return; }
		if (!target.startsWith('did:')) { banFormError = 'Must be a valid DID (starts with did:).'; return; }
		banSubmitting = true;
		try {
			await banUser(target, banReason.trim() || undefined);
			banDid = '';
			banReason = '';
		} finally {
			banSubmitting = false;
		}
	}

	// ── Mount ────────────────────────────────────────────────────────────────────
	onMount(() => {
		// Wait for auth + config before loading
		const check = () => {
			if ($authReady && $instanceConfig.loaded && $isLoggedIn && $instanceConfig.isOwner) {
				loadStats();
				loadUsers();
				loadBans();
			}
		};
		// If already ready, run immediately; otherwise wait via reactivity
		check();
	});

	// Also trigger load once auth + config confirm ownership
	let dataLoaded = false;
	$: if ($authReady && $instanceConfig.loaded && $isLoggedIn && $instanceConfig.isOwner && !dataLoaded) {
		dataLoaded = true;
		loadStats();
		loadUsers();
		loadBans();
		loadRequests();
		loadSettings();
		loadCacheStats();
	}

	// Reload requests when filter changes
	$: if (dataLoaded) loadRequests();

	// ── Thumbnail cache ───────────────────────────────────────────────────────────
	interface CacheStats {
		count: number;
		totalBytes: number;
		oldestMtime: string | null;
	}

	let cacheStats: CacheStats | null = null;
	let cacheStatsLoading = false;
	let cacheStatsError = false;
	let pruneAge = 90; // days
	let pruning = false;
	let pruneResult: { count: number; bytesFreed: number } | null = null;
	let pruneError = false;

	async function loadCacheStats() {
		const did = $session?.did;
		if (!did || cacheStatsLoading) return;
		cacheStatsLoading = true;
		cacheStatsError = false;
		try {
			const r = await fetch(`/api/admin/thumbnails?did=${encodeURIComponent(did)}`);
			if (!r.ok) throw new Error();
			cacheStats = await r.json();
		} catch {
			cacheStatsError = true;
		} finally {
			cacheStatsLoading = false;
		}
	}

	async function runPrune(olderThanDays: number) {
		const did = $session?.did;
		if (!did || pruning) return;
		pruning = true;
		pruneResult = null;
		pruneError = false;
		try {
			const r = await fetch('/api/admin/thumbnails', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ownerDid: did, olderThanDays })
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

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	// ── Helpers ───────────────────────────────────────────────────────────────────
	function truncateDid(did: string) {
		return did.length > 24 ? did.slice(0, 12) + '…' + did.slice(-8) : did;
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatCompact(n: number) {
		return new Intl.NumberFormat(undefined, { notation: 'compact', maximumSignificantDigits: 3 }).format(n);
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
					{stats.registeredCount}{#if stats.maxUsers > 0}<span class="text-sm font-normal {$t.textMuted}"> / {stats.maxUsers}</span>{/if}
				</p>
			</div>
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {$t.textMuted} uppercase tracking-wider font-medium">Songs</p>
				<p class="text-xl font-bold">{stats.songsCount.toLocaleString()}</p>
			</div>
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {$t.textMuted} uppercase tracking-wider font-medium">Banned</p>
				<p class="text-xl font-bold">{stats.bannedCount}</p>
			</div>
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {$t.textMuted} uppercase tracking-wider font-medium">Cursor</p>
				<p class="text-xl font-bold font-mono text-sm">{formatCompact(stats.cursorSeq)}</p>
			</div>
		{:else if statsError}
			<div class="col-span-4 {$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 space-y-1.5">
				<p class="text-sm font-medium {$t.textPrimary}">SQLite database not connected</p>
				<p class="text-xs {$t.textMuted}">User management, ban enforcement, feed indexing, and instance settings require a running SQLite database. See the <a href="https://github.com/khordapp/khord/blob/main/README.md#deployment-architecture" target="_blank" rel="noopener noreferrer" class="{$t.linkText} {$t.linkTextHover} underline">deployment guide</a> for setup instructions.</p>
			</div>
		{:else}
			{#each [0, 1, 2, 3] as _}
				<div class="{$t.surfaceBg} border {$t.borderBase} rounded-xl px-4 py-3 animate-pulse h-16"></div>
			{/each}
		{/if}
	</div>

	<!-- Tab navigation -->
	<!-- Mobile: select picker -->
	<div class="sm:hidden">
		<div class="relative {$t.surfaceBg} border {$t.borderStrong} rounded-lg">
			<select
				bind:value={activeTab}
				class="w-full pl-4 pr-10 py-2.5 text-sm appearance-none bg-transparent {$t.textPrimary} cursor-pointer outline-none"
			>
				<option value="users">Users{stats ? ` — ${stats.registeredCount}` : ''}</option>
				<option value="bans">Bans{stats?.bannedCount ? ` — ${stats.bannedCount}` : ''}</option>
				<option value="requests">Requests{stats?.pendingRequestsCount ? ` — ${stats.pendingRequestsCount} pending` : ''}</option>
				<option value="settings">Settings</option>
				<option value="cache">Cache</option>
			</select>
			<div class="absolute inset-y-0 right-3 flex items-center pointer-events-none {$t.textMuted}">
				<svg viewBox="0 0 10 10" fill="none" class="w-3 h-3" xmlns="http://www.w3.org/2000/svg">
					<path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</div>
		</div>
	</div>
	<!-- Desktop: tab bar -->
	<div class="hidden sm:flex gap-1 border-b {$t.borderBase}">
		{#each [['users', 'Users'], ['bans', 'Bans'], ['requests', 'Requests'], ['settings', 'Settings'], ['cache', 'Cache']] as [id, label]}
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
			<div class="flex items-center gap-3">
				<button
					on:click={resolveHandles}
					disabled={resolvingHandles}
					class="flex items-center gap-1.5 text-xs {$t.textMuted} {$t.hoverText} border {$t.borderBase} {$t.hoverBorderBase} px-2.5 py-1 rounded-full disabled:opacity-50 transition-colors"
				>
					{#if resolvingHandles}
						<span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
						Resolving…
					{:else}
						<svg viewBox="0 0 24 24" fill="none" class="w-3 h-3" xmlns="http://www.w3.org/2000/svg">
							<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Resolve missing handles
					{/if}
				</button>
				{#if resolveResult}
					<span class="text-xs {resolveResult.failed === -1 ? 'text-red-400' : $t.textFaint}">
						{#if resolveResult.failed === -1}
							Failed — database error
						{:else if resolveResult.total === 0}
							All handles already resolved
						{:else}
							{resolveResult.resolved} resolved{resolveResult.failed > 0 ? `, ${resolveResult.failed} failed` : ''}
						{/if}
					</span>
				{/if}
			</div>
			{#if usersError}
				<p class="text-sm {$t.textMuted}">Could not load users — database offline.</p>
			{:else if users.length === 0 && usersLoading}
				<div class="space-y-2">
					{#each [0, 1, 2, 3] as _}
						<div class="{$t.surfaceBg} border {$t.borderBase} rounded-lg h-14 animate-pulse"></div>
					{/each}
				</div>
			{:else if users.length === 0}
				<p class="text-sm {$t.textMuted}">No registered users yet.</p>
			{:else}
				<div class="space-y-1">
					{#each users as user (user.did)}
						<div class="flex items-center gap-3 {$t.surfaceBg} border {$t.borderBase} rounded-lg px-3 py-2.5">
							<!-- Avatar -->
							<div class="w-8 h-8 rounded-full overflow-hidden shrink-0 {$t.elevatedBg} flex items-center justify-center text-xs font-semibold {$t.textMuted}">
								{#if user.avatar}
									<img src="/api/thumbnail?url={encodeURIComponent(user.avatar)}" alt="" class="w-full h-full object-cover" />
								{:else}
									{(user.handle ?? user.did)[0].toUpperCase()}
								{/if}
							</div>
							<!-- Identity -->
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium {$t.textPrimary} truncate">
									{#if user.handle}<a href="https://bsky.app/profile/{user.handle}" target="_blank" rel="noopener noreferrer" class="{$t.linkText} hover:underline">@{user.handle}</a>{:else}<span class="font-mono text-xs">{truncateDid(user.did)}</span>{/if}
								</p>
								<p class="text-xs {$t.textFaint} truncate font-mono">{user.did} · {formatDate(user.registeredAt)}</p>
							</div>
							<!-- Ban button — don't show for self -->
							{#if user.did !== $session?.did}
								<button
									on:click={() => {
										const reason = prompt(`Reason for banning ${user.handle ?? user.did} (optional):`);
										if (reason !== null) banUser(user.did, reason);
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
			<!-- Add ban form -->
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl p-4 space-y-3">
				<p class="text-sm font-medium {$t.textSecondary}">Ban a user</p>
				<div class="space-y-2">
					<input
						bind:value={banDid}
						placeholder="did:plc:…"
						class="w-full text-sm font-mono {$t.surfaceBg} border {$t.borderStrong} rounded-lg px-3 py-2 {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none focus:ring-1 focus:ring-current"
					/>
					<input
						bind:value={banReason}
						placeholder="Reason (optional)"
						class="w-full text-sm {$t.surfaceBg} border {$t.borderStrong} rounded-lg px-3 py-2 {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none focus:ring-1 focus:ring-current"
					/>
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

			<!-- Current bans -->
			{#if bansError}
				<p class="text-sm {$t.textMuted}">Could not load bans — database offline.</p>
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
					{#each bans as ban (ban.did)}
						<div class="flex items-center gap-3 {$t.surfaceBg} border {$t.borderBase} rounded-lg px-3 py-2.5">
							<div class="w-8 h-8 rounded-full overflow-hidden shrink-0 {$t.elevatedBg} flex items-center justify-center text-xs font-semibold {$t.textMuted}">
								{#if ban.avatar}
									<img src="/api/thumbnail?url={encodeURIComponent(ban.avatar)}" alt="" class="w-full h-full object-cover" />
								{:else}
									{(ban.handle ?? ban.did)[0].toUpperCase()}
								{/if}
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium {$t.textPrimary} truncate">
									{#if ban.handle}<a href="https://bsky.app/profile/{ban.handle}" target="_blank" rel="noopener noreferrer" class="{$t.linkText} hover:underline">@{ban.handle}</a>{:else}<span class="font-mono text-xs">{truncateDid(ban.did)}</span>{/if}
								</p>
								<p class="text-xs {$t.textFaint} truncate">
									{formatDate(ban.bannedAt)}{#if ban.reason} · {ban.reason}{/if}
								</p>
							</div>
							<button
								on:click={() => unbanUser(ban.did)}
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
			<!-- Filter toggle -->
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
				<p class="text-sm {$t.textMuted}">Could not load requests — database offline.</p>
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
							<!-- Avatar placeholder -->
							<div class="w-8 h-8 rounded-full shrink-0 {$t.elevatedBg} flex items-center justify-center text-xs font-semibold {$t.textMuted}">
								{req.handle ? req.handle[0].toUpperCase() : '?'}
							</div>
							<!-- Identity -->
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium {$t.textPrimary} truncate">
									{#if req.handle}
										<a href="https://bsky.app/profile/{req.handle}" target="_blank" rel="noopener noreferrer" class="{$t.linkText} hover:underline">@{req.handle}</a>
									{:else}
										<span class="font-mono text-xs">{req.did}</span>
									{/if}
								</p>
								<p class="text-xs {$t.textFaint} truncate">
									{formatDate(req.requestedAt)}
									{#if req.status !== 'pending'}
										· <span class="{req.status === 'approved' ? 'text-green-400' : 'text-red-400'}">{req.status}</span>
									{/if}
								</p>
							</div>
							<!-- Actions -->
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
				<p class="text-sm {$t.textMuted}">Could not load settings — database offline.</p>
			{:else if settingsLoading && !settings}
				<div class="space-y-3">
					{#each [0, 1, 2] as _}
						<div class="{$t.surfaceBg} border {$t.borderBase} rounded-xl h-16 animate-pulse"></div>
					{/each}
				</div>
			{:else}
				<!-- Album art -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">Album art</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Show thumbnail images on song cards.</p>
					</div>
					<button
						role="switch"
						aria-checked={!albumArtDisabled}
						aria-label="Toggle album art"
						on:click={() => (albumArtDisabled = !albumArtDisabled)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors
							{!albumArtDisabled ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform
							{!albumArtDisabled ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Registration -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">Open registration</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Allow new users to sign up. Existing users are unaffected.</p>
					</div>
					<button
						role="switch"
						aria-checked={!registrationClosed}
						aria-label="Toggle open registration"
						on:click={() => (registrationClosed = !registrationClosed)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors
							{!registrationClosed ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform
							{!registrationClosed ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Invite-only -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">Invite-only</p>
						<p class="text-xs {$t.textMuted} mt-0.5">New users must request access. Existing registered users are unaffected. Review requests in the Requests tab.</p>
					</div>
					<button
						role="switch"
						aria-checked={inviteOnly}
						aria-label="Toggle invite-only mode"
						on:click={() => (inviteOnly = !inviteOnly)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors
							{inviteOnly ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform
							{inviteOnly ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Feed scoping -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">Instance-scoped feed</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Only show songs shared from this instance. Songs shared on other Khord instances by followed users will not appear.</p>
					</div>
					<button
						role="switch"
						aria-checked={feedScoped}
						aria-label="Toggle instance-scoped feed"
						on:click={() => (feedScoped = !feedScoped)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors
							{feedScoped ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform
							{feedScoped ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Spotify -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">Spotify links</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Resolve Spotify URLs when sharing songs. Requires <code class="font-mono">PUBLIC_SPOTIFY_CLIENT_ID</code> and <code class="font-mono">SPOTIFY_CLIENT_SECRET</code> env vars.</p>
					</div>
					<button
						role="switch"
						aria-checked={spotifyEnabled}
						aria-label="Toggle Spotify links"
						on:click={() => (spotifyEnabled = !spotifyEnabled)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors
							{spotifyEnabled ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform
							{spotifyEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- YouTube Music -->
				<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {$t.textPrimary}">YouTube Music links</p>
						<p class="text-xs {$t.textMuted} mt-0.5">Resolve YouTube Music URLs when sharing songs. Requires <code class="font-mono">YOUTUBE_API_KEY</code> env var. Uses ~100 YouTube Data API quota units per song shared.</p>
					</div>
					<button
						role="switch"
						aria-checked={youtubeMusicEnabled}
						aria-label="Toggle YouTube Music links"
						on:click={() => (youtubeMusicEnabled = !youtubeMusicEnabled)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors
							{youtubeMusicEnabled ? $t.btnPrimaryBg : $t.elevatedBg} border {$t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {$t.pageBg} shadow transition-transform
							{youtubeMusicEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
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
						<p class="text-xs {$t.textMuted}">{stats.registeredCount} / {maxUsers} currently registered</p>
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
			{/if}
		</div>
	{/if}

	<!-- Cache tab -->
	{#if activeTab === 'cache'}
		<div class="space-y-6 max-w-md">
			<!-- Stats card -->
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
					{#if cacheStats.count === 0}
						<p class="text-xs {$t.textFaint}">No thumbnails cached yet. They populate automatically as songs are viewed.</p>
					{/if}
				{/if}
				<button
					on:click={loadCacheStats}
					disabled={cacheStatsLoading}
					class="flex items-center gap-1.5 text-xs {$t.textMuted} {$t.hoverText} border {$t.borderBase} {$t.hoverBorderBase} px-2.5 py-1 rounded-full disabled:opacity-50 transition-colors"
				>
					<svg viewBox="0 0 24 24" fill="none" class="w-3 h-3 {cacheStatsLoading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg">
						<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					Refresh
				</button>
			</div>

			<!-- Prune controls -->
			<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-xl p-4 space-y-4">
				<div>
					<p class="text-sm font-medium {$t.textPrimary}">Prune old thumbnails</p>
					<p class="text-xs {$t.textMuted} mt-0.5">Remove cached images older than the selected window. They'll be re-fetched and re-cached on next view.</p>
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
					on:click={() => { if (confirm('Delete all cached thumbnails? They will be re-fetched as songs are viewed.')) runPrune(0); }}
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
		</div>
	{/if}
</div>
