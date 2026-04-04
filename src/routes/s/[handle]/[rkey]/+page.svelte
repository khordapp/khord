<script lang="ts">
	import { page } from '$app/state';
	import { session, authReady } from '$lib/stores/auth';
	import { fetchSetlist, updateSetlist, deleteSetlist } from '$lib/atproto/social';
	import type { KhordSetlist, KhordSetlistItem, KhordSetlistRecord } from '$lib/atproto/lexicons/setlist';
	import type { KhordSongRecord } from '$lib/atproto/lexicons/song';
	import { SONG_NSID } from '$lib/atproto/lexicons/song';
	import { getAgent } from '$lib/atproto/agent';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { goto } from '$app/navigation';
	import { APP_NAME, APP_URL } from '$lib/config';
	import { instanceConfig } from '$lib/stores/instance';
	import StreamingPill from '$lib/components/StreamingPill.svelte';
	import { theme as t } from '$lib/theme';
	import { searchTracks, type TrackResult } from '$lib/search';
	import { extractPlatformUrls, getCanonicalEntity, type OdesliResponse } from '$lib/odesli/client';

	const handle: string = page.params.handle ?? '';
	const rkey: string = page.params.rkey ?? '';

	interface DndItem {
		id: string;
		item: KhordSetlistItem;
		record: KhordSongRecord | null;
	}

	let setlist: KhordSetlist | null = null;
	let dndItems: DndItem[] = [];
	let loading = true;
	let error = '';
	let voteCounts = new Map<string, number>();
	let saving = false;
	let deleting = false;
	let confirmDeleteOpen = false;
	let editingTitle = false;
	let titleDraft = '';
	let titleInputEl: HTMLInputElement | undefined;

	// Add song
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
		try {
			addResults = await searchTracks(addQuery.trim());
		} catch {
			addResults = [];
		} finally {
			addSearching = false;
		}
	}

	function focusEl(el: HTMLElement) { el.focus(); }

	async function addSongToSetlist(track: TrackResult) {
		if (!$session || !setlist || addResolving) return;
		addResolving = true;
		addError = '';
		addQuery = '';
		addResults = [];
		try {
			let record: KhordSongRecord = {
				title: track.title,
				artist: track.artist,
				...(track.album && { album: track.album }),
				createdAt: new Date().toISOString()
			};

			if (track.appleMusicUrl) {
				const res = await fetch(`/api/resolve?url=${encodeURIComponent(track.appleMusicUrl)}`);
				if (!res.ok) throw new Error(`Could not resolve song links (${res.status})`);
				const odesliResult: OdesliResponse = await res.json();
				const platformUrls = extractPlatformUrls(odesliResult);
				const entity = getCanonicalEntity(odesliResult);
				record = {
					...record,
					title: entity?.title ?? track.title,
					artist: entity?.artistName ?? track.artist,
					...platformUrls
				};
			}

			const createRes = await getAgent().com.atproto.repo.createRecord({
				repo: $session.did,
				collection: SONG_NSID,
				record: { $type: SONG_NSID, ...record, listed: addShareToFeed }
			});

			const newItem: KhordSetlistItem = {
				songUri: createRes.data.uri,
				songCid: createRes.data.cid,
				addedBy: $session.did,
				addedAt: new Date().toISOString(),
				snapshot: {
					title: record.title,
					artist: record.artist,
					...(record.album && { album: record.album }),
					...(record.thumbnailUrl && { thumbnailUrl: record.thumbnailUrl }),
					...(record.spotifyUrl && { spotifyUrl: record.spotifyUrl }),
					...(record.appleMusicUrl && { appleMusicUrl: record.appleMusicUrl }),
					...(record.tidalUrl && { tidalUrl: record.tidalUrl }),
					...(record.deezerUrl && { deezerUrl: record.deezerUrl }),
					...(record.amazonMusicUrl && { amazonMusicUrl: record.amazonMusicUrl }),
					...(record.soundcloudUrl && { soundcloudUrl: record.soundcloudUrl }),
					...(record.songlinkUrl && { songlinkUrl: record.songlinkUrl })
				}
			};

			const updated: KhordSetlistRecord = {
				...setlist.value,
				items: [...setlist.value.items, newItem]
			};
			await updateSetlist($session.did, rkey, updated);
			setlist = { ...setlist, value: updated };
			dndItems = [...dndItems, { id: newItem.songUri, item: newItem, record }];
		} catch (e) {
			addError = e instanceof Error ? e.message : 'Failed to add song.';
		} finally {
			addResolving = false;
		}
	}

	// Share compose
	const POST_LIMIT = 300;
	let shareOpen = false;
	let shareText = '';
	let sharePosting = false;
	let sharePosted = false;

	$: shareCharsLeft = POST_LIMIT - [...shareText].length;
	$: shareOver = shareCharsLeft < 0;

	function openShare() {
		if (!setlist) return;
		const setlistUrl = `${APP_URL}/s/${handle}/${rkey}`;
		const lines = [`${setlist.value.title} — a setlist on ${APP_NAME}`];
		if (setlist.value.description) lines.push(setlist.value.description);
		lines.push(setlistUrl);
		shareText = lines.join('\n\n');
		shareOpen = true;
	}

	async function submitShare() {
		if (!$session || sharePosting || shareOver) return;
		sharePosting = true;
		try {
			const setlistUrl = `${APP_URL}/s/${handle}/${rkey}`;
			const encoder = new TextEncoder();
			const urlIndex = shareText.lastIndexOf(setlistUrl);
			const facets = urlIndex >= 0 ? [{
				index: {
					byteStart: encoder.encode(shareText.slice(0, urlIndex)).length,
					byteEnd: encoder.encode(shareText.slice(0, urlIndex)).length + encoder.encode(setlistUrl).length
				},
				features: [{ $type: 'app.bsky.richtext.facet#link', uri: setlistUrl }]
			}] : [];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (getAgent().app.bsky.feed.post.create as any)(
				{ repo: $session.did },
				{ $type: 'app.bsky.feed.post', text: shareText, ...(facets.length ? { facets } : {}), createdAt: new Date().toISOString() }
			);
			shareOpen = false;
			sharePosted = true;
			setTimeout(() => { sharePosted = false; }, 3000);
		} finally {
			sharePosting = false;
		}
	}



	$: isOwn = $session?.handle === handle;

	async function load() {
		loading = true;
		error = '';
		try {
			const profile = await getAgent().getProfile({ actor: handle });
			const creatorDid = profile.data.did;
			setlist = await fetchSetlist(creatorDid, rkey);
			const records = await Promise.allSettled(
				setlist.value.items.map((item) => {
					const parts = item.songUri.split('/');
					const repoDid = parts[2];
					const itemRkey = parts[parts.length - 1];
					return getAgent().com.atproto.repo.getRecord({
						repo: repoDid,
						collection: SONG_NSID,
						rkey: itemRkey
					}).then((r) => r.data.value as KhordSongRecord);
				})
			);
			dndItems = setlist.value.items.map((item, i) => {
				const live = records[i].status === 'fulfilled'
					? (records[i] as PromiseFulfilledResult<KhordSongRecord>).value
					: null;
				const record: KhordSongRecord | null = live ?? (item.snapshot ? { ...item.snapshot, createdAt: item.addedAt } : null);
				return { id: item.songUri, item, record };
			});

			const uris = setlist.value.items.map((i) => i.songUri);
			if (uris.length > 0) {
				try {
					const res = await fetch(`/api/votes/counts?uris=${uris.map(encodeURIComponent).join(',')}`);
					if (res.ok) {
						const data = await res.json();
						voteCounts = new Map(Object.entries(data.counts as Record<string, number>));
					}
				} catch {
					// non-fatal
				}
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load setlist.';
		} finally {
			loading = false;
		}
	}

	$: if ($authReady) load();

	function handleDndConsider(e: CustomEvent<{ items: DndItem[] }>) {
		dndItems = e.detail.items;
	}

	async function handleDndFinalize(e: CustomEvent<{ items: DndItem[] }>) {
		dndItems = e.detail.items;
		if (!setlist || !$session || !isOwn) return;
		saving = true;
		try {
			const updated: KhordSetlistRecord = { ...setlist.value, items: dndItems.map((d) => d.item) };
			await updateSetlist($session.did, rkey, updated);
			setlist = { ...setlist, value: updated };
		} finally {
			saving = false;
		}
	}

	async function removeItem(songUri: string) {
		if (!setlist || !$session || !isOwn) return;
		saving = true;
		try {
			const updated: KhordSetlistRecord = {
				...setlist.value,
				items: setlist.value.items.filter((i) => i.songUri !== songUri)
			};
			await updateSetlist($session.did, rkey, updated);
			setlist = { ...setlist, value: updated };
			dndItems = dndItems.filter((d) => d.id !== songUri);
		} finally {
			saving = false;
		}
	}

	async function saveTitle() {
		if (!setlist || !$session || !isOwn || !titleDraft.trim()) return;
		saving = true;
		try {
			const updated: KhordSetlistRecord = { ...setlist.value, title: titleDraft.trim() };
			await updateSetlist($session.did, rkey, updated);
			setlist = { ...setlist, value: updated };
			editingTitle = false;
		} finally {
			saving = false;
		}
	}

	function startEditTitle() {
		titleDraft = setlist?.value.title ?? '';
		editingTitle = true;
		setTimeout(() => titleInputEl?.focus(), 0);
	}

	async function handleDelete() {
		if (!$session || deleting) return;
		deleting = true;
		try {
			await deleteSetlist($session.did, rkey);
			goto('/');
		} finally {
			deleting = false;
		}
	}

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		if (d < 7) return `${d}d ago`;
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>{setlist?.value.title ?? 'Setlist'} — {APP_NAME}</title>
</svelte:head>

<!-- Delete confirm modal -->
{#if confirmDeleteOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Cancel" on:click={() => (confirmDeleteOpen = false)}></button>
		<div class="relative w-full max-w-sm {t.surfaceBg} border {t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-2">
				<h2 class="text-sm font-semibold {t.textPrimary}">Delete setlist?</h2>
				<p class="text-xs {t.textMuted}">"{setlist?.value.title}" will be permanently deleted from your AT Protocol account.</p>
			</div>
			<div class="flex border-t {t.borderBase}">
				<button on:click={() => (confirmDeleteOpen = false)} class="flex-1 px-4 py-3 text-sm {t.textMuted} {t.hoverText} {t.hoverBg} transition-colors">Cancel</button>
				<button on:click={handleDelete} disabled={deleting}
					class="flex-1 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950 border-l {t.borderBase} transition-colors disabled:opacity-50">
					{#if deleting}<span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>{:else}Delete{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Share compose modal -->
{#if shareOpen}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Cancel" on:click={() => (shareOpen = false)}></button>
		<div class="relative w-full max-w-sm {t.surfaceBg} border {t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-4 pt-4 pb-2 border-b {t.borderBase} flex items-center justify-between">
				<span class="text-sm font-semibold {t.textPrimary}">Share setlist</span>
				<button on:click={() => (shareOpen = false)} aria-label="Close" class="{t.textMuted} {t.hoverTextSecondary} transition-colors">
					<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
						<path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			</div>
			{#if $session?.avatar || $session?.handle}
				<div class="flex items-center gap-2.5 px-4 pt-3">
					{#if $session.avatar}
						<img src={$session.avatar} alt={$session.handle} class="w-8 h-8 rounded-full object-cover shrink-0" />
					{:else}
						<div class="w-8 h-8 rounded-full {t.elevatedBg} flex items-center justify-center text-xs font-semibold {t.textSecondary} shrink-0">
							{($session.handle ?? '?')[0].toUpperCase()}
						</div>
					{/if}
					<span class="text-xs {t.textMuted}">@{$session.handle}</span>
				</div>
			{/if}
			<textarea
				bind:value={shareText}
				rows="5"
				class="w-full bg-transparent text-sm {t.textPrimary} placeholder:{t.textFaint} px-4 py-3 resize-none focus:outline-none"
				placeholder="Write something…"
			></textarea>
			<div class="flex items-center justify-between px-4 pb-3">
				<span class="text-xs {shareOver ? 'text-red-400' : shareCharsLeft <= 20 ? 'text-amber-400' : t.textFaint}">
					{shareCharsLeft}
				</span>
				<div class="flex items-center gap-2">
					<button on:click={() => (shareOpen = false)} class="text-xs {t.textMuted} {t.hoverTextSecondary} px-3 py-1.5 transition-colors">Cancel</button>
					<button
						on:click={submitShare}
						disabled={sharePosting || shareOver || shareText.trim().length === 0}
						class="text-xs font-semibold {t.btnPrimaryBg} {t.btnPrimaryText} px-3 py-1.5 rounded-full {t.btnPrimaryHover} transition-colors disabled:opacity-40"
					>
						{#if sharePosting}
							<span class="inline-flex items-center gap-1.5">
								<span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
								Posting…
							</span>
						{:else}
							Post
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<section class="space-y-6">
	<!-- Header -->
	<div class="space-y-1">
		<div class="flex items-start justify-between gap-4">
			{#if editingTitle && isOwn}
				<form on:submit|preventDefault={saveTitle} class="flex items-center gap-2 flex-1">
					<input
						bind:this={titleInputEl}
						bind:value={titleDraft}
						maxlength="100"
						class="flex-1 {t.elevatedBg} border {t.borderStrong} rounded-lg px-3 py-1.5 text-lg font-bold {t.textPrimary} focus:outline-none {t.hoverBorderStrong} transition-colors"
					/>
					<button type="submit" disabled={saving} class="text-xs {t.textSecondary} {t.hoverText} px-2 py-1 border {t.borderStrong} rounded-lg transition-colors disabled:opacity-50">Save</button>
					<button type="button" on:click={() => (editingTitle = false)} class="text-xs {t.textMuted} {t.hoverTextSecondary}">Cancel</button>
				</form>
			{:else}
				<div class="flex items-center gap-2 min-w-0">
					<h1 class="text-xl font-bold truncate">{setlist?.value.title ?? '…'}</h1>
					{#if isOwn && !loading}
						<button on:click={startEditTitle} aria-label="Edit title" class="{t.textFaint} {t.hoverTextSecondary} transition-colors shrink-0">
							<svg viewBox="0 0 14 14" fill="none" class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg">
								<path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
							</svg>
						</button>
					{/if}
				</div>
			{/if}

			{#if !loading}
				<div class="flex items-center gap-2 shrink-0">
					<!-- Share button -->
					{#if $session}
						<button
							on:click={openShare}
							class="flex items-center gap-1.5 text-xs {sharePosted ? t.textPrimary : `${t.textMuted} ${t.hoverText}`} transition-colors"
							aria-label="Share setlist"
						>
							{#if sharePosted}
								<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
									<path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
								<span>Posted</span>
							{:else}
								<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
									<path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
								<span>Share</span>
							{/if}
						</button>
					{/if}

					<!-- Delete button (owner only) -->
					{#if isOwn}
						<button on:click={() => (confirmDeleteOpen = true)} aria-label="Delete setlist" class="{t.textFaint} hover:text-red-400 transition-colors">
							<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
								<path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M9 4v7.5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
					{/if}
				</div>
			{/if}
		</div>

		{#if setlist}
			<p class="text-xs {t.textMuted}">
				{setlist.value.items.length} {setlist.value.items.length === 1 ? 'song' : 'songs'}
				· by @{handle}
				· {timeAgo(setlist.value.createdAt)}
				{#if saving}<span class="{t.textFaint} ml-1">Saving…</span>{/if}
			</p>
		{/if}
	</div>

	<div class="flex items-center justify-between gap-4">
		<a href="/" class="inline-flex items-center gap-1.5 text-xs {t.textMuted} {t.hoverText} transition-colors">
			<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3" xmlns="http://www.w3.org/2000/svg">
				<path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			Back to feed
		</a>

		{#if isOwn && !loading}
			<button
				on:click={() => (addOpen = !addOpen)}
				class="flex items-center gap-1.5 text-xs {addOpen ? `${t.textPrimary} ${t.elevatedBg} ${t.borderStrong}` : `${t.textMuted} ${t.hoverText} border-transparent`}
					border px-2.5 py-1 rounded-full transition-colors"
			>
				<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0 transition-transform {addOpen ? 'rotate-45' : ''}" xmlns="http://www.w3.org/2000/svg">
					<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
				Add song
			</button>
		{/if}
	</div>

	{#if addOpen && isOwn}
		<div class="{t.surfaceBg} border {t.borderBase} rounded-xl px-4 py-3 space-y-2">
			<div class="relative">
				<input
					type="search"
					bind:value={addQuery}
					placeholder="Search for a song…"
					disabled={addResolving}
					use:focusEl
					class="w-full {t.elevatedBg} border {t.borderStrong} rounded-lg pl-8 pr-3 py-2 text-sm {t.textPrimary}
						placeholder:{t.textMuted} focus:outline-none {t.hoverBorderStrong} transition-colors disabled:opacity-50"
				/>
				<span class="absolute left-2.5 top-1/2 -translate-y-1/2 {t.textMuted} text-sm pointer-events-none">♪</span>
				{#if addSearching || addResolving}
					<span class="absolute right-3 top-1/2 -translate-y-1/2">
						<span class="block w-3.5 h-3.5 border-2 {t.borderStrong} border-t-white rounded-full animate-spin"></span>
					</span>
				{/if}
			</div>

			{#if addError}
				<p class="text-xs text-red-400">{addError}</p>
			{/if}

			{#if addQuery.trim().length >= 2}
				<div class="rounded-lg border {t.borderBase} {t.recessedBg} overflow-hidden max-h-52 overflow-y-auto">
					{#if addSearching && addResults.length === 0}
						<div class="px-4 py-3 space-y-2.5">
							{#each [1, 2, 3] as _}
								<div class="space-y-1.5">
									<div class="h-3.5 w-2/3 {t.elevatedBg} rounded animate-pulse"></div>
									<div class="h-3 w-1/3 {t.elevatedBg} rounded animate-pulse"></div>
								</div>
							{/each}
						</div>
					{:else if addResults.length > 0}
						<ul>
							{#each addResults as result}
								{@const alreadyAdded = dndItems.some(
									(d) => d.record?.title === result.title && d.record?.artist === result.artist
								)}
								<li>
									<button
										on:click={() => !alreadyAdded && addSongToSetlist(result)}
										disabled={alreadyAdded || addResolving}
										class="w-full text-left px-4 py-3 border-b {t.borderBase} last:border-0 transition-colors
											{alreadyAdded ? 'opacity-40 cursor-default' : t.hoverBg}"
									>
										<p class="text-sm {t.textPrimary} truncate">{result.title}</p>
										<p class="text-xs {t.textMuted} truncate">
											{result.artist}{result.album ? ` · ${result.album}` : ''}
										</p>
									</button>
								</li>
							{/each}
						</ul>
					{:else if !addSearching}
						<div class="px-4 py-4 text-center {t.textMuted} text-sm">No results found.</div>
					{/if}
				</div>
			{/if}

			<label class="flex items-center gap-2 cursor-pointer select-none pt-1">
				<input type="checkbox" bind:checked={addShareToFeed} class="rounded accent-violet-500" />
				<span class="text-xs {t.textMuted}">Also share to feed</span>
			</label>
		</div>
	{/if}

	{#if loading}
		<p class="{t.textMuted} text-sm">Loading…</p>
	{:else if error}
		<p class="text-red-400 text-sm">{error}</p>
	{:else if dndItems.length === 0}
		<div class="rounded-xl border {t.borderBase} {t.surfaceBg} px-5 py-10 text-center space-y-2">
			<p class="{t.textSecondary} text-sm font-medium">This setlist is empty</p>
			<p class="{t.textMuted} text-xs">Select songs in the Feed tab and add them to a setlist.</p>
		</div>
	{:else}
		{#if isOwn && dndItems.length > 1}
			<p class="text-xs {t.textFaint} flex items-center gap-1.5">
				<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
					<path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
				</svg>
				Drag to reorder
			</p>
		{/if}

		<div
			use:dndzone={{ items: dndItems, flipDurationMs: 150, dragDisabled: !isOwn }}
			on:consider={handleDndConsider}
			on:finalize={handleDndFinalize}
			class="space-y-2"
		>
			{#each dndItems as dndItem (dndItem.id)}
				<div animate:flip={{ duration: 150 }}
					class="flex items-center gap-3 rounded-xl border {t.borderBase} {t.surfaceBg} px-4 py-3
						{isOwn ? 'cursor-grab active:cursor-grabbing' : ''}"
				>
					{#if isOwn}
						<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4 {t.textFaint} shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
						</svg>
					{/if}

					{#if !$instanceConfig.albumArtDisabled && dndItem.record?.thumbnailUrl}
						<img src={dndItem.record.thumbnailUrl} alt="" aria-hidden="true" class="w-10 h-10 rounded-md object-cover shrink-0" />
					{/if}

					<div class="flex-1 min-w-0">
						{#if dndItem.record}
							<p class="text-sm font-semibold {t.textPrimary} truncate">{dndItem.record.title}</p>
							<p class="text-xs {t.textMuted} truncate">{dndItem.record.artist}{dndItem.record.album ? ` · ${dndItem.record.album}` : ''}</p>
						{:else}
							<p class="text-sm {t.textMuted} truncate">{dndItem.id}</p>
						{/if}
					</div>

					{#if (voteCounts.get(dndItem.id) ?? 0) > 0}
						<span class="text-xs {t.textMuted} shrink-0 tabular-nums">♪ {voteCounts.get(dndItem.id)}</span>
					{/if}

					{#if dndItem.record}
						<StreamingPill record={dndItem.record} />
						{#if dndItem.record.songlinkUrl}
							<a
								href={dndItem.record.songlinkUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="text-xs {t.linkText} {t.linkTextHover} border {t.linkBorder} {t.linkBorderHover} px-2.5 py-1 rounded-full transition-colors shrink-0"
							>
								song.link
							</a>
						{/if}
					{/if}

					{#if isOwn}
						<button
							on:click={() => removeItem(dndItem.id)}
							aria-label="Remove from setlist"
							class="{t.textFaint} hover:text-red-400 transition-colors shrink-0"
						>
							<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
								<path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>
