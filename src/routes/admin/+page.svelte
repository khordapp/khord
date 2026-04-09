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
	type Tab = 'users' | 'bans' | 'settings';
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
	let maxUsers = 0;
	let feedScoped = false;

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
			maxUsers = parseInt(raw.max_users ?? '0', 10) || 0;
			feedScoped = raw.feed_scoped === 'true';
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
						max_users: String(maxUsers),
						feed_scoped: String(feedScoped)
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
		loadSettings();
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
		<p class="text-sm {t.textSecondary} mt-1">Instance management</p>
	</div>

	<!-- Stats row -->
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
		{#if stats}
			<div class="{t.surfaceBg} border {t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {t.textMuted} uppercase tracking-wider font-medium">Users</p>
				<p class="text-xl font-bold">
					{stats.registeredCount}{#if stats.maxUsers > 0}<span class="text-sm font-normal {t.textMuted}"> / {stats.maxUsers}</span>{/if}
				</p>
			</div>
			<div class="{t.surfaceBg} border {t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {t.textMuted} uppercase tracking-wider font-medium">Songs</p>
				<p class="text-xl font-bold">{stats.songsCount.toLocaleString()}</p>
			</div>
			<div class="{t.surfaceBg} border {t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {t.textMuted} uppercase tracking-wider font-medium">Banned</p>
				<p class="text-xl font-bold">{stats.bannedCount}</p>
			</div>
			<div class="{t.surfaceBg} border {t.borderStrong} rounded-xl px-4 py-3 space-y-0.5">
				<p class="text-xs {t.textMuted} uppercase tracking-wider font-medium">Cursor</p>
				<p class="text-xl font-bold font-mono text-sm">{formatCompact(stats.cursorSeq)}</p>
			</div>
		{:else if statsError}
			<div class="col-span-4 text-sm {t.textMuted}">Stats unavailable — database offline.</div>
		{:else}
			{#each [0, 1, 2, 3] as _}
				<div class="{t.surfaceBg} border {t.borderBase} rounded-xl px-4 py-3 animate-pulse h-16"></div>
			{/each}
		{/if}
	</div>

	<!-- Tab bar -->
	<div class="flex gap-1 border-b {t.borderBase}">
		{#each [['users', 'Users'], ['bans', 'Bans'], ['settings', 'Settings']] as [id, label]}
			<button
				on:click={() => (activeTab = id as Tab)}
				class="px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
					{activeTab === id
						? `border-current ${t.textPrimary}`
						: `border-transparent ${t.textMuted} ${t.hoverText}`}"
			>
				{label}{#if id === 'bans' && stats?.bannedCount}&nbsp;({stats.bannedCount}){/if}
			</button>
		{/each}
	</div>

	<!-- Users tab -->
	{#if activeTab === 'users'}
		<div class="space-y-3">
			{#if usersError}
				<p class="text-sm {t.textMuted}">Could not load users — database offline.</p>
			{:else if users.length === 0 && usersLoading}
				<div class="space-y-2">
					{#each [0, 1, 2, 3] as _}
						<div class="{t.surfaceBg} border {t.borderBase} rounded-lg h-14 animate-pulse"></div>
					{/each}
				</div>
			{:else if users.length === 0}
				<p class="text-sm {t.textMuted}">No registered users yet.</p>
			{:else}
				<div class="space-y-1">
					{#each users as user (user.did)}
						<div class="flex items-center gap-3 {t.surfaceBg} border {t.borderBase} rounded-lg px-3 py-2.5">
							<!-- Avatar -->
							<div class="w-8 h-8 rounded-full overflow-hidden shrink-0 {t.elevatedBg} flex items-center justify-center text-xs font-semibold {t.textMuted}">
								{#if user.avatar}
									<img src="/api/thumbnail?url={encodeURIComponent(user.avatar)}" alt="" class="w-full h-full object-cover" />
								{:else}
									{(user.handle ?? user.did)[0].toUpperCase()}
								{/if}
							</div>
							<!-- Identity -->
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium {t.textPrimary} truncate">
									{#if user.handle}@{user.handle}{:else}<span class="font-mono text-xs">{truncateDid(user.did)}</span>{/if}
								</p>
								<p class="text-xs {t.textFaint} truncate">{formatDate(user.registeredAt)}</p>
							</div>
							<!-- Ban button — don't show for self -->
							{#if user.did !== $session?.did}
								<button
									on:click={() => {
										const reason = prompt(`Reason for banning ${user.handle ?? user.did} (optional):`);
										if (reason !== null) banUser(user.did, reason);
									}}
									class="text-xs px-2.5 py-1 rounded border {t.borderStrong} {t.textMuted} {t.hoverText} {t.hoverBg} transition-colors shrink-0"
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
						class="w-full text-sm py-2 rounded-lg border {t.borderBase} {t.textMuted} {t.hoverBg} transition-colors disabled:opacity-50"
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
			<div class="{t.surfaceBg} border {t.borderStrong} rounded-xl p-4 space-y-3">
				<p class="text-sm font-medium {t.textSecondary}">Ban a user</p>
				<div class="space-y-2">
					<input
						bind:value={banDid}
						placeholder="did:plc:…"
						class="w-full text-sm font-mono {t.surfaceBg} border {t.borderStrong} rounded-lg px-3 py-2 {t.textPrimary} placeholder:{t.textFaint} focus:outline-none focus:ring-1 focus:ring-current"
					/>
					<input
						bind:value={banReason}
						placeholder="Reason (optional)"
						class="w-full text-sm {t.surfaceBg} border {t.borderStrong} rounded-lg px-3 py-2 {t.textPrimary} placeholder:{t.textFaint} focus:outline-none focus:ring-1 focus:ring-current"
					/>
					{#if banFormError}
						<p class="text-xs text-red-400">{banFormError}</p>
					{/if}
					<button
						on:click={submitBanForm}
						disabled={banSubmitting}
						class="text-sm font-medium px-4 py-2 rounded-lg {t.btnPrimaryBg} {t.btnPrimaryText} {t.btnPrimaryHover} transition-colors disabled:opacity-50"
					>
						{banSubmitting ? 'Banning…' : 'Ban user'}
					</button>
				</div>
			</div>

			<!-- Current bans -->
			{#if bansError}
				<p class="text-sm {t.textMuted}">Could not load bans — database offline.</p>
			{:else if bans.length === 0 && bansLoading}
				<div class="space-y-2">
					{#each [0, 1] as _}
						<div class="{t.surfaceBg} border {t.borderBase} rounded-lg h-14 animate-pulse"></div>
					{/each}
				</div>
			{:else if bans.length === 0}
				<p class="text-sm {t.textMuted}">No banned users.</p>
			{:else}
				<div class="space-y-1">
					{#each bans as ban (ban.did)}
						<div class="flex items-center gap-3 {t.surfaceBg} border {t.borderBase} rounded-lg px-3 py-2.5">
							<div class="w-8 h-8 rounded-full overflow-hidden shrink-0 {t.elevatedBg} flex items-center justify-center text-xs font-semibold {t.textMuted}">
								{#if ban.avatar}
									<img src="/api/thumbnail?url={encodeURIComponent(ban.avatar)}" alt="" class="w-full h-full object-cover" />
								{:else}
									{(ban.handle ?? ban.did)[0].toUpperCase()}
								{/if}
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium {t.textPrimary} truncate">
									{#if ban.handle}@{ban.handle}{:else}<span class="font-mono text-xs">{truncateDid(ban.did)}</span>{/if}
								</p>
								<p class="text-xs {t.textFaint} truncate">
									{formatDate(ban.bannedAt)}{#if ban.reason} · {ban.reason}{/if}
								</p>
							</div>
							<button
								on:click={() => unbanUser(ban.did)}
								class="text-xs px-2.5 py-1 rounded border {t.borderStrong} {t.textMuted} {t.hoverText} {t.hoverBg} transition-colors shrink-0"
							>
								Unban
							</button>
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
				<p class="text-sm {t.textMuted}">Could not load settings — database offline.</p>
			{:else if settingsLoading && !settings}
				<div class="space-y-3">
					{#each [0, 1, 2] as _}
						<div class="{t.surfaceBg} border {t.borderBase} rounded-xl h-16 animate-pulse"></div>
					{/each}
				</div>
			{:else}
				<!-- Album art -->
				<div class="{t.surfaceBg} border {t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {t.textPrimary}">Album art</p>
						<p class="text-xs {t.textMuted} mt-0.5">Show thumbnail images on song cards.</p>
					</div>
					<button
						role="switch"
						aria-checked={!albumArtDisabled}
						aria-label="Toggle album art"
						on:click={() => (albumArtDisabled = !albumArtDisabled)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors
							{!albumArtDisabled ? t.btnPrimaryBg : t.elevatedBg} border {t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {t.pageBg} shadow transition-transform
							{!albumArtDisabled ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Registration -->
				<div class="{t.surfaceBg} border {t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {t.textPrimary}">Open registration</p>
						<p class="text-xs {t.textMuted} mt-0.5">Allow new users to sign up. Existing users are unaffected.</p>
					</div>
					<button
						role="switch"
						aria-checked={!registrationClosed}
						aria-label="Toggle open registration"
						on:click={() => (registrationClosed = !registrationClosed)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors
							{!registrationClosed ? t.btnPrimaryBg : t.elevatedBg} border {t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {t.pageBg} shadow transition-transform
							{!registrationClosed ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Feed scoping -->
				<div class="{t.surfaceBg} border {t.borderStrong} rounded-xl px-4 py-4 flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium {t.textPrimary}">Instance-scoped feed</p>
						<p class="text-xs {t.textMuted} mt-0.5">Only show songs shared from this instance. Songs shared on other Khord instances by followed users will not appear.</p>
					</div>
					<button
						role="switch"
						aria-checked={feedScoped}
						aria-label="Toggle instance-scoped feed"
						on:click={() => (feedScoped = !feedScoped)}
						class="relative shrink-0 w-10 h-6 rounded-full transition-colors
							{feedScoped ? t.btnPrimaryBg : t.elevatedBg} border {t.borderStrong}"
					>
						<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full {t.pageBg} shadow transition-transform
							{feedScoped ? 'translate-x-4' : 'translate-x-0'}"></span>
					</button>
				</div>

				<!-- Max users -->
				<div class="{t.surfaceBg} border {t.borderStrong} rounded-xl px-4 py-4 space-y-3">
					<div>
						<p class="text-sm font-medium {t.textPrimary}">User cap</p>
						<p class="text-xs {t.textMuted} mt-0.5">Maximum registered users. Set to 0 for unlimited.</p>
					</div>
					<input
						type="number"
						min="0"
						bind:value={maxUsers}
						class="w-32 text-sm {t.surfaceBg} border {t.borderStrong} rounded-lg px-3 py-2
							{t.textPrimary} focus:outline-none focus:ring-1 focus:ring-current"
					/>
					{#if stats && maxUsers > 0}
						<p class="text-xs {t.textMuted}">{stats.registeredCount} / {maxUsers} currently registered</p>
					{/if}
				</div>

				<!-- Save -->
				<button
					on:click={saveSettings}
					disabled={settingsSaving}
					class="text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50
						{settingsSaved
							? 'bg-green-900 text-green-300 border border-green-700'
							: `${t.btnPrimaryBg} ${t.btnPrimaryText} ${t.btnPrimaryHover}`}"
				>
					{settingsSaving ? 'Saving…' : settingsSaved ? 'Saved!' : 'Save settings'}
				</button>
			{/if}
		</div>
	{/if}
</div>
