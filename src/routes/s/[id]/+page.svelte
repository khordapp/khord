<script lang="ts">
	import { session, authReady } from '$lib/stores/auth';
	import { votes } from '$lib/stores/votes';
	import { instanceConfig } from '$lib/stores/instance';
	import { prefs } from '$lib/stores/prefs';
	import { PLATFORMS, STORAGE_KEYS } from '$lib/constants';
	import { theme as t } from '$lib/theme';
	import { PencilSimpleIcon, DotsSixVerticalIcon, PlayIcon, XIcon, ArrowRightIcon, PlusIcon, TrashIcon, ArrowLeftIcon, HeartIcon, SpotifyLogoIcon, UploadSimpleIcon, PushPinIcon } from 'phosphor-svelte';
	import { APP_NAME, APP_URL, thumbUrl } from '$lib/config';
	import { setlistSlug } from '$lib/slug';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { searchTracks, type TrackResult } from '$lib/search';
	import type { PageData } from './$types';
	import type { SongRecord } from '$lib/stores/shareSong';
	import {
		initiateSpotifyAuth, createPlaylist, replacePlaylistTracks,
		searchSpotifyTracks, extractSpotifyId, getSpotifyUser,
		SPOTIFY_RETURN_TO_KEY
	} from '$lib/streaming/spotify';
	import { spotifyTokens, spotifyAuthorized } from '$lib/stores/spotify';

	export let data: PageData;

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
	$: displayItems = $session ? dndItems : dndItems.slice(0, 3);

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

	// Spotify export
	$: spotifyEnabled = !!env.PUBLIC_SPOTIFY_CLIENT_ID;
	let exporting = false;
	let exportDone = false;
	let exportError = '';
	let exportPlaylistUrl = '';
	let showExportDialog = false;
	let hasExistingPlaylist = false;

	function openExportDialog() {
		const storageKey = STORAGE_KEYS.spotifyExport(setlist.id);
		hasExistingPlaylist = browser ? !!localStorage.getItem(storageKey) : false;
		exportDone = false;
		exportError = '';
		exportPlaylistUrl = '';
		showExportDialog = true;
	}

	function closeExportDialog() {
		if (exporting) return;
		showExportDialog = false;
		exportDone = false;
		exportError = '';
		exportPlaylistUrl = '';
	}

	async function exportToSpotify() {
		if (!$spotifyAuthorized) {
			if (browser) localStorage.setItem(STORAGE_KEYS.SPOTIFY_PENDING_EXPORT, String(setlist.id));
			await initiateSpotifyAuth(`/s/${setlistSlug(setlist.title, setlist.id)}`);
			return;
		}
		openExportDialog();
	}

	async function doExport() {
		if (exporting) return;
		exporting = true;
		exportError = '';
		let token: string;
		try {
			token = await spotifyTokens.getValidToken();
		} catch {
			exporting = false;
			spotifyTokens.clear();
			showExportDialog = false;
			if (browser) localStorage.setItem(STORAGE_KEYS.SPOTIFY_PENDING_EXPORT, String(setlist.id));
			await initiateSpotifyAuth(`/s/${setlistSlug(setlist.title, setlist.id)}`);
			return;
		}
		try {
			const user = await getSpotifyUser(token);
			const trackIds: string[] = [];
			for (const item of dndItems) {
				if (!item.record) continue;
				const fromUrl = item.record.spotifyUrl ? extractSpotifyId(item.record.spotifyUrl) : null;
				if (fromUrl) {
					trackIds.push(fromUrl);
				} else {
					const results = await searchSpotifyTracks(
						`${item.record.title} ${item.record.artist}`, token, 1
					);
					if (results.length > 0) trackIds.push(results[0].spotifyId);
				}
			}
			if (trackIds.length === 0) throw new Error('No Spotify tracks found in this mixtape.');
			const storageKey = STORAGE_KEYS.spotifyExport(setlist.id);
			let playlistId = browser ? localStorage.getItem(storageKey) : null;
			if (!playlistId) {
				playlistId = await createPlaylist(user.id, setlist.title, token);
				if (browser) localStorage.setItem(storageKey, playlistId);
			}
			await replacePlaylistTracks(playlistId, trackIds, token);
			exportPlaylistUrl = `https://open.spotify.com/playlist/${playlistId}`;
			hasExistingPlaylist = true;
			exportDone = true;
		} catch (e) {
			exportError = e instanceof Error ? e.message : 'Export failed.';
		} finally {
			exporting = false;
		}
	}

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
				urlsResolvedAt: new Date().toISOString(),
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
		const url = `${APP_URL}/s/${setlistSlug(setlist.title, setlist.id)}`;
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
		// Auto-trigger export after Spotify OAuth redirect
		const pendingExport = localStorage.getItem(STORAGE_KEYS.SPOTIFY_PENDING_EXPORT) === String(setlist.id);
		if (pendingExport) {
			localStorage.removeItem(STORAGE_KEYS.SPOTIFY_PENDING_EXPORT);
			openExportDialog();
		}
	});
</script>

<svelte:head>
	<title>{setlist.title} — {APP_NAME}</title>
	<link rel="canonical" href="{APP_URL}/s/{setlistSlug(setlist.title, setlist.id)}" />
	<meta name="description" content="Listen to the {setlist.title} mixtape on {APP_NAME}." />
	<meta property="og:title" content="{setlist.title} — {APP_NAME}" />
	<meta property="og:description" content="Listen to the {setlist.title} mixtape on {APP_NAME}." />
	<meta property="og:url" content="{APP_URL}/s/{setlistSlug(setlist.title, setlist.id)}" />
	<meta property="og:type" content="music.playlist" />
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

<div class="space-y-6" style="padding-bottom: {$session ? 'calc(5rem + env(safe-area-inset-bottom, 0px))' : '2rem'}">
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
						<PencilSimpleIcon size={16} />
					</button>
				{/if}
			</div>
		{/if}
		<p class="text-sm {$t.textMuted}">
			{dndItems.length} {dndItems.length === 1 ? 'song' : 'songs'} · <a href="/u/{setlist.owner.username}" class="{$t.hoverText} transition-colors">@{setlist.owner.username}</a>
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
			use:dndzone={{ items: displayItems, dragDisabled: !isOwner || !editing, type: 'setlist-items' }}
			on:consider={handleDndConsider}
			on:finalize={handleDndFinalize}
		>
			{#each displayItems as item (item.id)}
				{@const rec = item.record}
				{@const primary = rec ? getPrimaryPlatform(rec) : null}
				<li animate:flip={{ duration: 200 }} class="relative flex items-start gap-3 border-b {$t.borderFaded} pl-5 pr-5 py-4 transition-colors">
					{#if isOwner && editing}
						<div class="cursor-grab active:cursor-grabbing {$t.textFaint} shrink-0">
							<DotsSixVerticalIcon size={16} />
						</div>
					{/if}
					{#if rec}
						{#if !$instanceConfig.albumArtDisabled && rec.thumbnailUrl}
							<img src={thumbUrl(rec.thumbnailUrl)} alt="" class="w-12 h-12 rounded-md object-cover shrink-0" />
						{/if}
						<div class="flex-1 min-w-0">
							<p class="text-base font-semibold {$t.textPrimary} leading-snug line-clamp-2">{rec.title}</p>
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
								<PlayIcon size={16} weight="fill" color="white" class="ml-0.5" />
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
							<XIcon size={16} />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
		{#if !$session}
			<div class="pt-2 pb-6 text-center space-y-4">
				{#if dndItems.length > 3}
					<p class="text-sm {$t.textMuted}">{dndItems.length - 3} more song{dndItems.length - 3 === 1 ? '' : 's'} in this mixtape</p>
				{/if}
				<a href="/login" class="inline-flex items-center gap-2 px-6 py-3 {$t.btnPrimaryBg} {$t.btnPrimaryText} rounded-full text-sm font-semibold shadow-md">
					Join {APP_NAME} to listen
				</a>
			</div>
		{/if}
	{/if}
</div>

{#if $session}
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
				<ArrowRightIcon size={24} />
				<span class="text-[11px] leading-none">Done</span>
			</button>
			<button
				on:click={() => (addOpen = !addOpen)}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {addOpen ? $t.accentText : $t.textMuted}"
			>
				<PlusIcon size={24} />
				<span class="text-[11px] leading-none">Add</span>
			</button>
			<button
				on:click={() => (confirmDeleteOpen = true)}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors text-red-400"
			>
				<TrashIcon size={24} />
				<span class="text-[11px] leading-none">Delete</span>
			</button>
		</div>
	{:else if $instanceConfig.isOwner}
		<!-- Admin toolbar -->
		<div class="flex h-20">
			<button
				on:click={() => history.back()}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
				aria-label="Go back"
			>
				<ArrowLeftIcon size={24} />
				<span class="text-[11px] leading-none">Back</span>
			</button>
			{#if !isOwner}
				<button
					on:click={toggleSetlistLike}
					disabled={setlistLiking}
					class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {setlistLiked ? $t.accentText : $t.textMuted} disabled:opacity-50"
				>
					<span class="flex items-center gap-0.5">
						<HeartIcon size={24} weight={setlistLiked ? "fill" : "regular"} />
						<span class="text-base leading-none -mt-0.5">♪</span>
					</span>
					<span class="text-[11px] leading-none">{setlistLikeCount > 0 ? setlistLikeCount : 'Upnote'}</span>
				</button>
			{/if}
			{#if spotifyEnabled}
				<button
					on:click={exportToSpotify}
					class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
				>
					<SpotifyLogoIcon size={24} />
					<span class="text-[11px] leading-none">Spotify</span>
				</button>
			{/if}
			{#if isOwner}
				<button
					on:click={() => (editing = true)}
					class="flex-1 flex flex-col items-center justify-center"
					aria-label="Edit mixtape"
				>
					<div class="w-11 h-11 {$t.btnPrimaryBg} rounded-full flex items-center justify-center shadow-md">
						<PencilSimpleIcon size={24} class="{$t.btnPrimaryText}" />
					</div>
				</button>
			{/if}
			<button
				on:click={shareSetlist}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
			>
				<UploadSimpleIcon size={24} />
				<span class="text-[11px] leading-none">Share</span>
			</button>
			{#if !isOwner}
				<button
					on:click={() => (proposeOpen = !proposeOpen)}
					class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {proposeOpen ? $t.accentText : $t.textMuted}"
				>
					<PlusIcon size={24} />
					<span class="text-[11px] leading-none">Propose</span>
				</button>
			{/if}
			<button
				on:click={togglePin}
				disabled={pinLoading}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {isPinned ? $t.accentText : $t.textMuted} disabled:opacity-50"
			>
				{#if pinLoading}
					<span class="w-6 h-6 flex items-center justify-center">
						<span class="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin"></span>
					</span>
				{:else}
					<PushPinIcon size={24} weight={isPinned ? "fill" : "regular"} />
				{/if}
				<span class="text-[11px] leading-none">{isPinned ? 'Unpin' : 'Pin'}</span>
			</button>
		</div>
	{:else if isOwner}
		<!-- Owner view toolbar -->
		<div class="flex h-20">
			<button
				on:click={() => history.back()}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
				aria-label="Go back"
			>
				<ArrowLeftIcon size={24} />
				<span class="text-[11px] leading-none">Back</span>
			</button>
			{#if spotifyEnabled}
				<button
					on:click={exportToSpotify}
					class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
				>
					<SpotifyLogoIcon size={24} />
					<span class="text-[11px] leading-none">Spotify</span>
				</button>
			{/if}
			<button
				on:click={() => { editing = true; }}
				class="flex-1 flex flex-col items-center justify-center"
				aria-label="Edit mixtape"
			>
				<div class="w-11 h-11 {$t.btnPrimaryBg} rounded-full flex items-center justify-center shadow-md">
					<PencilSimpleIcon size={24} class="{$t.btnPrimaryText}" />
				</div>
			</button>
			<button
				on:click={shareSetlist}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
			>
				<UploadSimpleIcon size={24} />
				<span class="text-[11px] leading-none">Share</span>
			</button>
		</div>
	{:else if $session}
		<!-- User toolbar -->
		<div class="flex h-20">
			<button
				on:click={() => history.back()}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
				aria-label="Go back"
			>
				<ArrowLeftIcon size={24} />
				<span class="text-[11px] leading-none">Back</span>
			</button>
			<button
				on:click={toggleSetlistLike}
				disabled={setlistLiking}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {setlistLiked ? $t.accentText : $t.textMuted} disabled:opacity-50"
			>
				<span class="flex items-center gap-0.5">
					<HeartIcon size={24} weight={setlistLiked ? "fill" : "regular"} />
					<span class="text-base leading-none -mt-0.5">♪</span>
				</span>
				<span class="text-[11px] leading-none">{setlistLikeCount > 0 ? setlistLikeCount : 'Upnote'}</span>
			</button>
			{#if spotifyEnabled}
				<button
					on:click={exportToSpotify}
					class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
				>
					<SpotifyLogoIcon size={24} />
					<span class="text-[11px] leading-none">Spotify</span>
				</button>
			{/if}
			<button
				on:click={shareSetlist}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {$t.textMuted}"
			>
				<UploadSimpleIcon size={24} />
				<span class="text-[11px] leading-none">Share</span>
			</button>
			<button
				on:click={() => (proposeOpen = !proposeOpen)}
				class="flex-1 flex flex-col items-center justify-center gap-1 transition-colors {proposeOpen ? $t.accentText : $t.textMuted}"
			>
				<PlusIcon size={24} />
				<span class="text-[11px] leading-none">Propose</span>
			</button>
		</div>
	{/if}
</nav>
{/if}

{#if showExportDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			class="absolute inset-0 bg-black/60 backdrop-blur-sm"
			aria-label="Close"
			disabled={exporting}
			on:click={closeExportDialog}
		></button>
		<div class="relative w-full max-w-sm {$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-3">
				<div class="flex items-center gap-3">
					<SpotifyLogoIcon size={28} class="shrink-0 {$t.textPrimary}" />
					<div class="min-w-0">
						<p class="text-sm font-semibold {$t.textPrimary}">Export to Spotify</p>
						<p class="text-xs {$t.textMuted} truncate">{setlist.title}</p>
					</div>
				</div>
				<div class="space-y-1">
					<p class="text-xs {$t.textMuted}">{dndItems.length} {dndItems.length === 1 ? 'song' : 'songs'}</p>
					<p class="text-xs {$t.textMuted}">
						{hasExistingPlaylist
							? 'A Spotify playlist was previously created for this mixtape and will be updated with the current songs.'
							: 'A new Spotify playlist will be created for this mixtape.'}
					</p>
				</div>
				{#if exportError}
					<p class="text-xs text-red-400">{exportError}</p>
				{/if}
				{#if exportDone}
					<p class="text-xs text-green-400">Exported successfully!</p>
				{/if}
			</div>
			<div class="flex border-t {$t.borderBase}">
				{#if exportDone}
					<button
						on:click={closeExportDialog}
						class="flex-1 px-4 py-3.5 text-sm {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors"
					>Close</button>
					<a
						href={exportPlaylistUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="flex-1 px-4 py-3.5 text-sm font-medium text-green-400 hover:text-green-300 border-l {$t.borderBase} transition-colors text-center"
					>View on Spotify →</a>
				{:else}
					<button
						on:click={closeExportDialog}
						disabled={exporting}
						class="flex-1 px-4 py-3.5 text-sm {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors disabled:opacity-40"
					>Cancel</button>
					<button
						on:click={doExport}
						disabled={exporting}
						class="flex-1 px-4 py-3.5 text-sm font-medium {$t.accentText} hover:opacity-80 border-l {$t.borderBase} transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
					>
						{#if exporting}
							<span class="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin inline-block"></span>
							Exporting…
						{:else}
							Export
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
