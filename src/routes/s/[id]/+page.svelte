<script lang="ts">
	import { session, authReady } from '$lib/stores/auth';
	import { votes } from '$lib/stores/votes';
	import { instanceConfig } from '$lib/stores/instance';
	import { prefs, type PlatformKey } from '$lib/stores/prefs';
	import { theme as t } from '$lib/theme';
	import { APP_NAME, APP_URL, thumbUrl } from '$lib/config';
	import { goto } from '$app/navigation';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { searchTracks, type TrackResult } from '$lib/search';
	import type { PageData } from './$types';
	import type { SongRecord } from '$lib/stores/shareSong';

	export let data: PageData;

	const PLATFORMS: { key: PlatformKey; label: string; color: string }[] = [
		{ key: 'appleMusicUrl',   label: 'Apple Music',   color: '#FC3C44' },
		{ key: 'spotifyUrl',      label: 'Spotify',       color: '#1DB954' },
		{ key: 'youtubeMusicUrl', label: 'YouTube Music', color: '#FF0000' },
		{ key: 'deezerUrl',       label: 'Deezer',        color: '#EF5466' },
	];

	function getPrimaryPlatform(rec: SongRecord) {
		const available = PLATFORMS.filter((p) => rec[p.key as keyof SongRecord]);
		return available.find((p) => p.key === $prefs) ?? available[0] ?? null;
	}

	interface DndItem {
		id: number; // setlist_item.id
		songId?: number;
		record: SongRecord | null;
		addedAt: string;
		addedBy?: string;
	}

	let isLightTheme = false;
	$: if ($t) isLightTheme = t.isLight();

	let setlist = data.setlist;
	let dndItems: DndItem[] = setlist.items.map((item) => ({
		id: item.id,
		songId: item.songId,
		record: item.record,
		addedAt: item.addedAt,
		addedBy: item.addedBy,
	}));

	$: isOwner = $session?.id === setlist.owner.userId;

	// Vote state
	let setlistLikeCount = 0;
	let setlistLiking = false;
	$: setlistLiked = $votes.setlists.has(setlist.id);

	async function loadVoteCounts() {
		const songIds = dndItems.filter(i => i.songId).map(i => i.songId!);
		const parts: string[] = [];
		if (songIds.length) parts.push(`songIds=${songIds.join(',')}`);
		parts.push(`setlistIds=${setlist.id}`);
		const res = await fetch(`/api/votes/counts?${parts.join('&')}`);
		if (!res.ok) return;
		const d = await res.json();
		setlistLikeCount = d.setlists?.[setlist.id] ?? 0;
		songVoteCounts = new Map(Object.entries(d.songs ?? {}).map(([k, v]) => [Number(k), v as number]));
	}

	let songVoteCounts = new Map<number, number>();

	async function toggleSetlistLike() {
		if (!$session || setlistLiking) return;
		setlistLiking = true;
		const wasLiked = setlistLiked;
		setlistLikeCount = Math.max(0, setlistLikeCount + (wasLiked ? -1 : 1));
		try {
			if (wasLiked) await votes.unlikeSetlist(setlist.id);
			else await votes.likeSetlist(setlist.id);
		} catch {
			setlistLikeCount = Math.max(0, setlistLikeCount + (wasLiked ? 1 : -1));
		} finally {
			setlistLiking = false;
		}
	}

	// Edit mode
	let editing = false;

	// Resolve missing streaming URLs
	let resolving = false;
	$: unresolvedCount = dndItems.filter(i => i.songId && i.record && !i.record.urlsResolvedAt).length;

	function resolveUnresolved() {
		if (resolving) return;
		resolving = true;
		const targets = dndItems.filter(i => i.songId && i.record && !i.record.urlsResolvedAt);
		let remaining = targets.length;
		if (remaining === 0) { resolving = false; return; }
		for (const item of targets) {
			const p = new URLSearchParams({ title: item.record!.title, artist: item.record!.artist });
			fetch(`/api/resolve?${p}`)
				.then(r => r.ok ? r.json() : {})
				.then((resolved: { spotifyUrl?: string; appleMusicUrl?: string; deezerUrl?: string; youtubeMusicUrl?: string }) => {
					dndItems = dndItems.map(i => i.id !== item.id ? i : {
						...i,
						record: {
							...i.record!,
							...(resolved.spotifyUrl      && { spotifyUrl:      resolved.spotifyUrl }),
							...(resolved.appleMusicUrl   && { appleMusicUrl:   resolved.appleMusicUrl }),
							...(resolved.deezerUrl       && { deezerUrl:       resolved.deezerUrl }),
							...(resolved.youtubeMusicUrl && { youtubeMusicUrl: resolved.youtubeMusicUrl }),
							urlsResolvedAt: new Date().toISOString(),
						}
					});
					return fetch(`/api/songs/${item.songId}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(resolved),
					});
				})
				.catch(() => {})
				.finally(() => { if (--remaining === 0) resolving = false; });
		}
	}

	// Title editing
	let editingTitle = false;
	let titleDraft = '';
	let titleInputEl: HTMLInputElement | undefined;
	let saving = false;

	async function startEditTitle() {
		if (!editing) return;
		titleDraft = setlist.title;
		editingTitle = true;
		setTimeout(() => titleInputEl?.focus(), 50);
	}

	async function saveTitle() {
		if (!titleDraft.trim() || titleDraft === setlist.title) { editingTitle = false; return; }
		saving = true;
		try {
			const res = await fetch(`/api/setlists/${setlist.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: titleDraft.trim() })
			});
			if (res.ok) setlist = { ...setlist, title: titleDraft.trim() };
		} finally {
			saving = false;
			editingTitle = false;
		}
	}

	// Drag reorder
	let reordering = false;

	async function handleDndConsider(e: CustomEvent) {
		dndItems = e.detail.items;
	}

	async function handleDndFinalize(e: CustomEvent) {
		dndItems = e.detail.items;
		if (!isOwner) return;
		reordering = true;
		try {
			await fetch(`/api/setlists/${setlist.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items: dndItems.map((item) => ({ id: item.id })) })
			});
		} finally {
			reordering = false;
		}
	}

	// Remove item
	async function removeItem(itemId: number) {
		await fetch(`/api/setlists/${setlist.id}/items/${itemId}`, { method: 'DELETE' });
		dndItems = dndItems.filter((i) => i.id !== itemId);
	}

	// Delete setlist
	let confirmDeleteOpen = false;
	let deleting = false;

	async function deleteSetlist() {
		deleting = true;
		try {
			await fetch(`/api/setlists/${setlist.id}`, { method: 'DELETE' });
			goto('/');
		} finally {
			deleting = false;
			confirmDeleteOpen = false;
		}
	}

	// Add song panel
	let addOpen = false;
	let addQuery = '';
	let addSearching = false;
	let addResults: TrackResult[] = [];
	let addResolving = false;
	let addError = '';
	let addShareToFeed = false;
	let addDebounceTimer: ReturnType<typeof setTimeout>;

	$: if (addQuery.trim().length >= 2) {
		clearTimeout(addDebounceTimer);
		addDebounceTimer = setTimeout(doAddSearch, 350);
	} else {
		clearTimeout(addDebounceTimer);
		addResults = [];
	}

	async function doAddSearch() {
		addSearching = true;
		try { addResults = await searchTracks(addQuery.trim()); }
		catch { addResults = []; }
		finally { addSearching = false; }
	}

	async function addSong(track: TrackResult) {
		if (!$session || addResolving) return;
		addResolving = true;
		addError = '';
		addQuery = '';
		addResults = [];
		try {
			let resolved: { spotifyUrl?: string; youtubeMusicUrl?: string; deezerUrl?: string } = {};
			if (track.title && track.artist) {
				const p = new URLSearchParams({ title: track.title, artist: track.artist });
				const r = await fetch(`/api/resolve?${p}`);
				if (r.ok) resolved = await r.json();
			}

			const record: SongRecord = {
				title: track.title,
				artist: track.artist,
				...(track.album && { album: track.album }),
				...(track.artworkUrl && { thumbnailUrl: track.artworkUrl }),
				...(track.appleMusicUrl && { appleMusicUrl: track.appleMusicUrl }),
				...(resolved.spotifyUrl && { spotifyUrl: resolved.spotifyUrl }),
				...(resolved.youtubeMusicUrl && { youtubeMusicUrl: resolved.youtubeMusicUrl }),
				...(resolved.deezerUrl && { deezerUrl: resolved.deezerUrl }),
				createdAt: new Date().toISOString()
			};

			const songRes = await fetch('/api/songs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...record, listed: addShareToFeed ? 1 : 0 })
			});
			if (!songRes.ok) throw new Error('Failed to create song');
			const { id: songId } = await songRes.json();

			const itemRes = await fetch(`/api/setlists/${setlist.id}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ songId, snapshot: record })
			});
			if (!itemRes.ok) throw new Error('Failed to add to setlist');
			const { id: itemId, position } = await itemRes.json();

			dndItems = [...dndItems, { id: itemId, songId, record, addedAt: new Date().toISOString(), addedBy: $session.username }];
		} catch (e) {
			addError = e instanceof Error ? e.message : 'Failed to add song.';
		} finally {
			addResolving = false;
		}
	}

	// Proposals
	interface Proposal {
		id: number;
		snapshot: SongRecord;
		note?: string;
		createdAt: string;
		proposer: { userId: number; username: string; displayName?: string };
	}
	let proposals: Proposal[] = [];
	let proposalsLoaded = false;

	async function loadProposals() {
		if (!isOwner) return;
		const res = await fetch(`/api/proposals?setlistId=${setlist.id}`);
		if (res.ok) { proposals = (await res.json()).proposals; proposalsLoaded = true; }
	}

	async function acceptProposal(proposal: Proposal) {
		const res = await fetch(`/api/proposals/${proposal.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'accept' })
		});
		if (!res.ok) return;
		const { songId } = await res.json();
		proposals = proposals.filter((p) => p.id !== proposal.id);
		dndItems = [...dndItems, {
			id: Date.now(), // temp until reload
			songId,
			record: proposal.snapshot,
			addedAt: new Date().toISOString()
		}];
	}

	async function declineProposal(proposal: Proposal) {
		await fetch(`/api/proposals/${proposal.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'decline' })
		});
		proposals = proposals.filter((p) => p.id !== proposal.id);
	}

	// Propose a song (non-owner)
	let proposeOpen = false;
	let proposeQuery = '';
	let proposeSearching = false;
	let proposeResults: TrackResult[] = [];
	let proposeResolving = false;
	let proposeNote = '';
	let proposeError = '';
	let proposed = false;
	let proposeDebounceTimer: ReturnType<typeof setTimeout>;

	$: if (proposeQuery.trim().length >= 2) {
		clearTimeout(proposeDebounceTimer);
		proposeDebounceTimer = setTimeout(doProposeSearch, 350);
	} else {
		clearTimeout(proposeDebounceTimer);
		proposeResults = [];
	}

	async function doProposeSearch() {
		proposeSearching = true;
		try { proposeResults = await searchTracks(proposeQuery.trim()); }
		catch { proposeResults = []; }
		finally { proposeSearching = false; }
	}

	async function submitProposal(track: TrackResult) {
		if (!$session || proposeResolving) return;
		proposeResolving = true;
		proposeError = '';
		try {
			let resolved: { spotifyUrl?: string; youtubeMusicUrl?: string; deezerUrl?: string } = {};
			if (track.title && track.artist) {
				const p = new URLSearchParams({ title: track.title, artist: track.artist });
				const r = await fetch(`/api/resolve?${p}`);
				if (r.ok) resolved = await r.json();
			}
			const snapshot: SongRecord = {
				title: track.title, artist: track.artist,
				...(track.album && { album: track.album }),
				...(track.artworkUrl && { thumbnailUrl: track.artworkUrl }),
				...(track.appleMusicUrl && { appleMusicUrl: track.appleMusicUrl }),
				...(resolved.spotifyUrl && { spotifyUrl: resolved.spotifyUrl }),
				...(resolved.youtubeMusicUrl && { youtubeMusicUrl: resolved.youtubeMusicUrl }),
				...(resolved.deezerUrl && { deezerUrl: resolved.deezerUrl }),
				createdAt: new Date().toISOString()
			};
			const res = await fetch('/api/proposals', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ setlistId: setlist.id, snapshot, note: proposeNote.trim() || undefined })
			});
			if (!res.ok) throw new Error('Failed to submit proposal');
			proposed = true;
			setTimeout(() => { proposed = false; proposeOpen = false; proposeQuery = ''; proposeNote = ''; proposeResults = []; }, 2000);
		} catch (e) {
			proposeError = e instanceof Error ? e.message : 'Proposal failed.';
		} finally {
			proposeResolving = false;
		}
	}

	// Pin/unpin (admin only)
	$: isPinned = false; // loaded separately if needed
	let pinLoading = false;

	async function togglePin() {
		if (!$instanceConfig.isOwner || pinLoading) return;
		pinLoading = true;
		try {
			if (isPinned) {
				await fetch('/api/pinned-setlists', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ setlistId: setlist.id })
				});
				isPinned = false;
			} else {
				await fetch('/api/pinned-setlists', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ setlistId: setlist.id })
				});
				isPinned = true;
			}
		} finally {
			pinLoading = false;
		}
	}

	// Share
	function shareSetlist() {
		const url = `${APP_URL}/s/${setlist.id}`;
		if (navigator.share) {
			navigator.share({ title: setlist.title, url }).catch(() => {});
		} else {
			navigator.clipboard.writeText(url).catch(() => {});
		}
	}

	// Init
	import { onMount } from 'svelte';
	onMount(async () => {
		loadVoteCounts();
		if (isOwner) {
			loadProposals();
			// Check if pinned
			const pinRes = await fetch('/api/pinned-setlists');
			if (pinRes.ok) {
				const { pins } = await pinRes.json();
				isPinned = pins.some((p: any) => p.id === setlist.id);
			}
		}
	});
</script>

<svelte:head>
	<title>{setlist.title} — {APP_NAME}</title>
</svelte:head>

{#if confirmDeleteOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Cancel" on:click={() => (confirmDeleteOpen = false)}></button>
		<div class="relative w-full max-w-sm {$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-2">
				<p class="text-sm font-semibold {$t.textPrimary}">Delete this mixtape?</p>
				<p class="text-xs {$t.textMuted}">This cannot be undone.</p>
			</div>
			<div class="flex border-t {$t.borderBase}">
				<button on:click={() => (confirmDeleteOpen = false)} class="flex-1 px-4 py-3 text-sm {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors">Cancel</button>
				<button on:click={deleteSetlist} disabled={deleting} class="flex-1 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950 border-l {$t.borderBase} transition-colors disabled:opacity-50">
					{deleting ? 'Deleting…' : 'Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}

<div class="space-y-6" style="padding-bottom: calc(5rem + env(safe-area-inset-bottom, 0px))">
	<!-- Header -->
	<div class="space-y-1">
		{#if editingTitle && isOwner && editing}
			<input
				bind:this={titleInputEl}
				bind:value={titleDraft}
				on:blur={saveTitle}
				on:keydown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { editingTitle = false; } }}
				disabled={saving}
				class="text-2xl font-bold w-full {$t.textPrimary} bg-transparent border-b {$t.borderStrong} focus:outline-none pb-0.5"
			/>
		{:else}
			<div class="flex items-start gap-2">
				<h1 class="text-2xl font-bold {$t.textPrimary} flex-1">{setlist.title}</h1>
				{#if isOwner && editing}
					<button on:click={startEditTitle} class="{$t.textFaint} hover:opacity-70 transition-opacity mt-1 shrink-0" title="Edit title" aria-label="Edit title">
						<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
							<path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5Z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				{/if}
			</div>
		{/if}
		<p class="text-sm {$t.textMuted}">
			{dndItems.length} {dndItems.length === 1 ? 'song' : 'songs'} · @{setlist.owner.username}
			{#if setlistLikeCount > 0}
				<span class="{setlistLiked ? $t.accentText : ''}"> · ♥ {setlistLikeCount}</span>
			{/if}
		</p>
	</div>

	<!-- Add song panel (owner, edit mode) -->
	{#if addOpen && isOwner && editing}
		<div class="rounded-xl border {$t.borderStrong} {$t.surfaceBg} p-4 space-y-3">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium {$t.textPrimary}">Add a song</p>
				<label class="flex items-center gap-2 text-xs {$t.textMuted} cursor-pointer select-none">
					<input type="checkbox" bind:checked={addShareToFeed} class="rounded" />
					Also share to feed
				</label>
			</div>
			<div class="relative">
				<input
					type="search"
					bind:value={addQuery}
					placeholder="Search for a song…"
					disabled={addResolving}
					class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg pl-9 pr-3 py-2 text-base sm:text-sm {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none {$t.focusRing} disabled:opacity-50"
				/>
				<span class="absolute left-3 top-1/2 -translate-y-1/2 {$t.textMuted} pointer-events-none">♪</span>
				{#if addSearching || addResolving}
					<span class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin"></span>
				{/if}
			</div>
			{#if addError}<p class="text-xs text-red-400">{addError}</p>{/if}
			{#if addResults.length > 0}
				<div class="rounded-lg border {$t.borderBase} {$t.recessedBg} overflow-hidden max-h-52 overflow-y-auto">
					<ul>
						{#each addResults as result}
							<li>
								<button
									on:click={() => addSong(result)}
									disabled={addResolving}
									class="w-full text-left px-4 py-3 border-b {$t.borderBase} last:border-0 transition-colors {$t.hoverBg}"
								>
									<p class="text-sm {$t.textPrimary} truncate">{result.title}</p>
									<p class="text-xs {$t.textMuted} truncate">{result.artist}{result.album ? ` · ${result.album}` : ''}</p>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Propose a song panel (non-owner) -->
	{#if proposeOpen && $session && !isOwner}
		<div class="rounded-xl border {$t.borderStrong} {$t.surfaceBg} p-4 space-y-3">
			<p class="text-sm font-medium {$t.textPrimary}">Propose a song</p>
			{#if proposed}
				<p class="text-sm {$t.accentText}">Proposal submitted!</p>
			{:else}
				<div class="relative">
					<input type="search" bind:value={proposeQuery} placeholder="Search for a song…" disabled={proposeResolving}
						class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg pl-9 pr-3 py-2 text-base sm:text-sm {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none {$t.focusRing} disabled:opacity-50"
					/>
					<span class="absolute left-3 top-1/2 -translate-y-1/2 {$t.textMuted} pointer-events-none">♪</span>
					{#if proposeSearching || proposeResolving}
						<span class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin"></span>
					{/if}
				</div>
				{#if proposeResults.length > 0}
					<div class="rounded-lg border {$t.borderBase} {$t.recessedBg} overflow-hidden max-h-48 overflow-y-auto">
						<ul>
							{#each proposeResults as result}
								<li>
									<button on:click={() => submitProposal(result)} disabled={proposeResolving}
										class="w-full text-left px-4 py-3 border-b {$t.borderBase} last:border-0 transition-colors {$t.hoverBg}"
									>
										<p class="text-sm {$t.textPrimary} truncate">{result.title}</p>
										<p class="text-xs {$t.textMuted} truncate">{result.artist}</p>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				{#if proposeError}<p class="text-xs text-red-400">{proposeError}</p>{/if}
				<textarea bind:value={proposeNote} placeholder="Add a note… (optional)" rows="2"
					class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg px-3 py-2 text-sm {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none {$t.focusRing} resize-none"
				></textarea>
			{/if}
		</div>
	{/if}

	<!-- Proposals (owner) -->
	{#if isOwner && proposalsLoaded && proposals.length > 0}
		<div class="space-y-3">
			<p class="text-xs font-semibold {$t.textFaint} uppercase tracking-wider">Proposals ({proposals.length})</p>
			{#each proposals as proposal}
				<div class="rounded-xl border {$t.borderStrong} {$t.surfaceBg} p-4 space-y-3">
					<div class="flex items-start gap-3">
						{#if !$instanceConfig.albumArtDisabled && proposal.snapshot.thumbnailUrl}
							<img src={thumbUrl(proposal.snapshot.thumbnailUrl)} alt="" class="w-10 h-10 rounded object-cover shrink-0" />
						{/if}
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium {$t.textPrimary} truncate">{proposal.snapshot.title}</p>
							<p class="text-xs {$t.textMuted} truncate">{proposal.snapshot.artist}</p>
							<p class="text-xs {$t.textFaint} mt-0.5">Proposed by @{proposal.proposer.username}</p>
							{#if proposal.note}<p class="text-xs {$t.textSecondary} mt-1">"{proposal.note}"</p>{/if}
						</div>
					</div>
					<div class="flex gap-2">
						<button on:click={() => acceptProposal(proposal)} class="flex-1 text-sm font-medium {$t.btnPrimaryBg} {$t.btnPrimaryText} px-3 py-1.5 rounded-lg {$t.btnPrimaryHover} transition-colors">Accept</button>
						<button on:click={() => declineProposal(proposal)} class="flex-1 text-sm {$t.textMuted} border {$t.borderStrong} px-3 py-1.5 rounded-lg {$t.hoverBg} transition-colors">Decline</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Propose a song panel (non-owner, logged in) — kept inline above song list -->

	<!-- Song list -->
	{#if dndItems.length === 0}
		<div class="rounded-xl border {$t.borderBase} {$t.surfaceBg} px-5 py-10 text-center space-y-2">
			<p class="{$t.textSecondary} text-sm font-medium">No songs yet</p>
			{#if isOwner}<p class="{$t.textMuted} text-xs">Add songs using the button above.</p>{/if}
		</div>
	{:else}
		<ul
			use:dndzone={{ items: dndItems, dragDisabled: !isOwner || !editing, type: 'setlist-items' }}
			on:consider={handleDndConsider}
			on:finalize={handleDndFinalize}
		>
			{#each dndItems as item (item.id)}
				{@const rec = item.record}
				{@const primary = rec ? getPrimaryPlatform(rec) : null}
				<li animate:flip={{ duration: 200 }} class="relative flex items-center gap-3 border-b {$t.borderFaded} pl-5 pr-5 py-4 transition-colors">
					{#if isOwner && editing}
						<div class="cursor-grab active:cursor-grabbing {$t.textFaint} shrink-0">
							<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
								<path d="M5 5h1M5 8h1M5 11h1M10 5h1M10 8h1M10 11h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
						</div>
					{/if}
					{#if rec}
						{#if !$instanceConfig.albumArtDisabled && rec.thumbnailUrl}
							<img src={thumbUrl(rec.thumbnailUrl)} alt="" class="w-12 h-12 rounded-md object-cover shrink-0" />
						{/if}
						<div class="flex-1 min-w-0">
							<p class="text-base font-semibold {$t.textPrimary} leading-snug truncate">{rec.title}</p>
							<p class="text-sm {$t.textMuted} mt-0.5 truncate">{rec.artist}{rec.album ? ` · ${rec.album}` : ''}</p>
						</div>
						{#if primary && !editing}
							<a
								href={rec[primary.key as keyof SongRecord] as string}
								title="Listen on {primary.label}"
								class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md hover:opacity-80 transition-opacity"
								style="background-color: {primary.color}"
								on:click|stopPropagation
							>
								<svg viewBox="0 0 10 10" fill="white" class="w-4 h-4 ml-0.5" xmlns="http://www.w3.org/2000/svg">
									<path d="M2 1.5l6 3.5-6 3.5V1.5Z"/>
								</svg>
							</a>
						{/if}
					{:else}
						<div class="flex-1 min-w-0">
							<p class="text-sm {$t.textFaint}">Song unavailable</p>
						</div>
					{/if}
					{#if isOwner && editing}
						<button
							on:click={() => removeItem(item.id)}
							aria-label="Remove"
							class="{$t.textFaint} hover:text-red-400 transition-colors shrink-0"
						>
							<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
								<path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<!-- Fixed bottom toolbar -->
<nav
	class="fixed bottom-0 left-0 right-0 z-30"
	style="
		background: {isLightTheme ? 'rgba(255,255,255,0.60)' : 'rgba(9,9,11,0.60)'};
		backdrop-filter: blur(32px) saturate(200%) brightness({isLightTheme ? '108%' : '120%'});
		-webkit-backdrop-filter: blur(32px) saturate(200%) brightness({isLightTheme ? '108%' : '120%'});
		border-top: 1px solid {isLightTheme ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)'};
		box-shadow: inset 0 1px 0 {isLightTheme ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.07)'}, 0 -8px 32px {isLightTheme ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.35)'};
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
	"
>
	<div class="absolute inset-0 pointer-events-none" style="background: linear-gradient(to bottom, {isLightTheme ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.05)'} 0%, transparent 60%);"></div>
	{#if isOwner && editing}
		<!-- Edit mode toolbar -->
		<div class="flex h-20">
			<button
				on:click={() => { editing = false; addOpen = false; }}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
			>
				<svg viewBox="0 0 16 16" fill="none" class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
					<path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span class="text-[11px] leading-none">Done</span>
			</button>
			<button
				on:click={() => (addOpen = !addOpen)}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {addOpen ? $t.accentText : $t.textMuted}"
			>
				<svg viewBox="0 0 16 16" fill="none" class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
					<path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
				<span class="text-[11px] leading-none">Add</span>
			</button>
			{#if unresolvedCount > 0}
				<button
					on:click={resolveUnresolved}
					disabled={resolving}
					class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {resolving ? $t.textFaint : $t.accentText} disabled:opacity-60"
				>
					{#if resolving}
						<span class="w-6 h-6 flex items-center justify-center">
							<span class="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin"></span>
						</span>
					{:else}
						<svg viewBox="0 0 16 16" fill="none" class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
							<path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
							<path d="M13.5 2.5v3.5H10" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					{/if}
					<span class="text-[11px] leading-none">{resolving ? 'Resolving…' : `Resolve (${unresolvedCount})`}</span>
				</button>
			{/if}
			{#if $instanceConfig.isOwner}
				<button
					on:click={togglePin}
					disabled={pinLoading}
					class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {isPinned ? $t.accentText : $t.textMuted} disabled:opacity-50"
				>
					<svg viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
						<path d="M12 20v-7M9 3h6l1 5-2 2v2H10V10L8 8l1-5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					<span class="text-[11px] leading-none">{isPinned ? 'Unpin' : 'Pin'}</span>
				</button>
			{:else}
				<div class="flex-1"></div>
			{/if}
			<button
				on:click={() => (confirmDeleteOpen = true)}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors text-red-400"
			>
				<svg viewBox="0 0 16 16" fill="none" class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
					<path d="M3 4.5h10M6 4.5V3.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M12 4.5l-.6 8.5a1 1 0 0 1-1 .9H5.6a1 1 0 0 1-1-.9L4 4.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span class="text-[11px] leading-none">Delete</span>
			</button>
		</div>
	{:else if isOwner}
		<!-- Owner view toolbar -->
		<div class="flex h-20">
			<button
				on:click={toggleSetlistLike}
				disabled={setlistLiking || !$session}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {setlistLiked ? $t.accentText : $t.textMuted} disabled:opacity-50"
			>
				<span class="flex items-center gap-0.5">
					<svg viewBox="0 0 24 24" fill={setlistLiked ? 'currentColor' : 'none'} class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
						<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					<span class="text-base leading-none -mt-0.5">♪</span>
				</span>
				<span class="text-[11px] leading-none">{setlistLikeCount > 0 ? setlistLikeCount : 'Upnote'}</span>
			</button>
			<button
				on:click={shareSetlist}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
			>
				<svg viewBox="0 0 24 24" fill="none" class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
					<path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 3v13.5M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span class="text-[11px] leading-none">Share</span>
			</button>
			<button
				on:click={() => { editing = true; }}
				class="flex-1 flex flex-col items-center justify-center"
				aria-label="Edit mixtape"
			>
				<div class="w-11 h-11 {$t.btnPrimaryBg} rounded-full flex items-center justify-center shadow-md">
					<svg viewBox="0 0 16 16" fill="none" class="w-6 h-6 {$t.btnPrimaryText}" xmlns="http://www.w3.org/2000/svg">
						<path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5Z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</div>
			</button>
			<button
				on:click={() => history.back()}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
				aria-label="Go back"
			>
				<svg viewBox="0 0 24 24" fill="none" class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
					<path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span class="text-[11px] leading-none">Back</span>
			</button>
			<div class="flex-1"></div>
		</div>
	{:else if $session}
		<!-- Non-owner toolbar -->
		<div class="flex h-20">
			<button
				on:click={toggleSetlistLike}
				disabled={setlistLiking}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {setlistLiked ? $t.accentText : $t.textMuted} disabled:opacity-50"
			>
				<span class="flex items-center gap-0.5">
					<svg viewBox="0 0 24 24" fill={setlistLiked ? 'currentColor' : 'none'} class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
						<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					<span class="text-base leading-none -mt-0.5">♪</span>
				</span>
				<span class="text-[11px] leading-none">{setlistLikeCount > 0 ? setlistLikeCount : 'Upnote'}</span>
			</button>
			<button
				on:click={shareSetlist}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
			>
				<svg viewBox="0 0 24 24" fill="none" class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
					<path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 3v13.5M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span class="text-[11px] leading-none">Share</span>
			</button>
			<button
				on:click={() => (proposeOpen = !proposeOpen)}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {proposeOpen ? $t.accentText : $t.textMuted}"
			>
				<svg viewBox="0 0 16 16" fill="none" class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
					<path d="M8 2v10M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
				<span class="text-[11px] leading-none">Propose</span>
			</button>
			<button
				on:click={() => history.back()}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
				aria-label="Go back"
			>
				<svg viewBox="0 0 24 24" fill="none" class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
					<path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span class="text-[11px] leading-none">Back</span>
			</button>
		</div>
	{:else}
		<!-- Logged-out toolbar -->
		<div class="flex h-20">
			<button
				on:click={() => history.back()}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
				aria-label="Go back"
			>
				<svg viewBox="0 0 24 24" fill="none" class="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
					<path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span class="text-[11px] leading-none">Back</span>
			</button>
		</div>
	{/if}
</nav>
