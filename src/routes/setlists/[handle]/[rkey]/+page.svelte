<script lang="ts">
	import { page } from '$app/state';
	import { session } from '$lib/stores/auth';
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
	import { prefs } from '$lib/stores/prefs';
	import type { PlatformKey } from '$lib/stores/prefs';

	const handle: string = page.params.handle ?? '';
	const rkey: string = page.params.rkey ?? '';

	const PLATFORMS: { key: PlatformKey; label: string; brand: { bg: string; text: string; border: string } }[] = [
		{ key: 'spotifyUrl',      label: 'Spotify',       brand: { bg: '#1DB954', text: '#000000', border: '#1DB954' } },
		{ key: 'appleMusicUrl',   label: 'Apple Music',   brand: { bg: '#FC3C44', text: '#ffffff', border: '#FC3C44' } },
		{ key: 'youtubeMusicUrl', label: 'YouTube Music', brand: { bg: '#FF0000', text: '#ffffff', border: '#FF0000' } },
		{ key: 'tidalUrl',        label: 'Tidal',         brand: { bg: '#000000', text: '#ffffff', border: '#ffffff' } },
		{ key: 'deezerUrl',       label: 'Deezer',        brand: { bg: '#EF5466', text: '#ffffff', border: '#EF5466' } },
		{ key: 'amazonMusicUrl',  label: 'Amazon Music',  brand: { bg: '#00A8E1', text: '#ffffff', border: '#00A8E1' } },
		{ key: 'soundcloudUrl',   label: 'SoundCloud',    brand: { bg: '#FF5500', text: '#ffffff', border: '#FF5500' } },
	];

	function getStreamingOptions(record: KhordSongRecord, preferred: PlatformKey | null) {
		const all = PLATFORMS.filter((p) => record[p.key]);
		const pref = preferred ? (all.find((p) => p.key === preferred) ?? null) : null;
		const first = pref ?? all[0] ?? null;
		const rest = all.filter((p) => p !== first);
		return { first, rest };
	}

	interface DndItem {
		id: string;
		item: KhordSetlistItem;
		record: KhordSongRecord | null;
	}

	let setlist: KhordSetlist | null = null;
	let dndItems: DndItem[] = [];
	let loading = true;
	let error = '';
	let saving = false;
	let deleting = false;
	let confirmDeleteOpen = false;
	let editingTitle = false;
	let titleDraft = '';
	let titleInputEl: HTMLInputElement | undefined;

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
		const setlistUrl = `${APP_URL}/setlists/${handle}/${rkey}`;
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
			const setlistUrl = `${APP_URL}/setlists/${handle}/${rkey}`;
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

	// Per-row streaming dropdown
	let openDropdownId: string | null = null;

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
			dndItems = setlist.value.items.map((item, i) => ({
				id: item.songUri,
				item,
				record: records[i].status === 'fulfilled' ? (records[i] as PromiseFulfilledResult<KhordSongRecord>).value : null
			}));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load setlist.';
		} finally {
			loading = false;
		}
	}

	load();

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
		// Focus after Svelte updates the DOM
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
		<div class="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-2">
				<h2 class="text-sm font-semibold text-zinc-100">Delete setlist?</h2>
				<p class="text-xs text-zinc-500">"{setlist?.value.title}" will be permanently deleted from your AT Protocol account.</p>
			</div>
			<div class="flex border-t border-zinc-800">
				<button on:click={() => (confirmDeleteOpen = false)} class="flex-1 px-4 py-3 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">Cancel</button>
				<button on:click={handleDelete} disabled={deleting}
					class="flex-1 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950 border-l border-zinc-800 transition-colors disabled:opacity-50">
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
		<div class="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-4 pt-4 pb-2 border-b border-zinc-800 flex items-center justify-between">
				<span class="text-sm font-semibold text-zinc-100">Share setlist</span>
				<button on:click={() => (shareOpen = false)} aria-label="Close" class="text-zinc-500 hover:text-zinc-300 transition-colors">
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
						<div class="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0">
							{($session.handle ?? '?')[0].toUpperCase()}
						</div>
					{/if}
					<span class="text-xs text-zinc-500">@{$session.handle}</span>
				</div>
			{/if}
			<textarea
				bind:value={shareText}
				rows="5"
				class="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-600 px-4 py-3 resize-none focus:outline-none"
				placeholder="Write something…"
			></textarea>
			<div class="flex items-center justify-between px-4 pb-3">
				<span class="text-xs {shareOver ? 'text-red-400' : shareCharsLeft <= 20 ? 'text-amber-400' : 'text-zinc-600'}">
					{shareCharsLeft}
				</span>
				<div class="flex items-center gap-2">
					<button on:click={() => (shareOpen = false)} class="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 transition-colors">Cancel</button>
					<button
						on:click={submitShare}
						disabled={sharePosting || shareOver || shareText.trim().length === 0}
						class="text-xs font-semibold bg-white text-black px-3 py-1.5 rounded-full hover:bg-zinc-200 transition-colors disabled:opacity-40"
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
						class="flex-1 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-1.5 text-lg font-bold text-zinc-100 focus:outline-none focus:border-zinc-400"
					/>
					<button type="submit" disabled={saving} class="text-xs text-zinc-300 hover:text-zinc-100 px-2 py-1 border border-zinc-700 rounded-lg transition-colors disabled:opacity-50">Save</button>
					<button type="button" on:click={() => (editingTitle = false)} class="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
				</form>
			{:else}
				<div class="flex items-center gap-2 min-w-0">
					<h1 class="text-xl font-bold truncate">{setlist?.value.title ?? '…'}</h1>
					{#if isOwn && !loading}
						<button on:click={startEditTitle} aria-label="Edit title" class="text-zinc-600 hover:text-zinc-400 transition-colors shrink-0">
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
							class="flex items-center gap-1.5 text-xs {sharePosted ? 'text-white' : 'text-zinc-500 hover:text-zinc-200'} transition-colors"
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
						<button on:click={() => (confirmDeleteOpen = true)} aria-label="Delete setlist" class="text-zinc-600 hover:text-red-400 transition-colors">
							<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
								<path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M9 4v7.5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
					{/if}
				</div>
			{/if}
		</div>

		{#if setlist}
			<p class="text-xs text-zinc-500">
				{setlist.value.items.length} {setlist.value.items.length === 1 ? 'song' : 'songs'}
				· by @{handle}
				· {timeAgo(setlist.value.createdAt)}
				{#if saving}<span class="text-zinc-600 ml-1">Saving…</span>{/if}
			</p>
		{/if}
	</div>

	<a href="/" class="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
		<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3" xmlns="http://www.w3.org/2000/svg">
			<path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
		Back to feed
	</a>

	{#if loading}
		<p class="text-zinc-500 text-sm">Loading…</p>
	{:else if error}
		<p class="text-red-400 text-sm">{error}</p>
	{:else if dndItems.length === 0}
		<div class="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-10 text-center space-y-2">
			<p class="text-zinc-200 text-sm font-medium">This setlist is empty</p>
			<p class="text-zinc-500 text-xs">Select songs in the Feed tab and add them to a setlist.</p>
		</div>
	{:else}
		<!-- Backdrop to close any open dropdown -->
		{#if openDropdownId}
			<button class="fixed inset-0 z-10" aria-label="Close" on:click={() => (openDropdownId = null)}></button>
		{/if}

		<div
			use:dndzone={{ items: dndItems, flipDurationMs: 150, dragDisabled: !isOwn }}
			on:consider={handleDndConsider}
			on:finalize={handleDndFinalize}
			class="space-y-2"
		>
			{#each dndItems as dndItem (dndItem.id)}
				{@const opts = dndItem.record ? getStreamingOptions(dndItem.record, $prefs) : null}
				<div animate:flip={{ duration: 150 }}
					class="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3
						{isOwn ? 'cursor-grab active:cursor-grabbing' : ''}"
				>
					{#if isOwn}
						<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4 text-zinc-700 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
						</svg>
					{/if}

					{#if !$instanceConfig.albumArtDisabled && dndItem.record?.thumbnailUrl}
						<img src={dndItem.record.thumbnailUrl} alt="" aria-hidden="true" class="w-10 h-10 rounded-md object-cover shrink-0" />
					{/if}

					<div class="flex-1 min-w-0">
						{#if dndItem.record}
							<p class="text-sm font-semibold text-zinc-100 truncate">{dndItem.record.title}</p>
							<p class="text-xs text-zinc-500 truncate">{dndItem.record.artist}{dndItem.record.album ? ` · ${dndItem.record.album}` : ''}</p>
						{:else}
							<p class="text-sm text-zinc-500 truncate">{dndItem.id}</p>
						{/if}
					</div>

					<!-- Streaming dropdown -->
					{#if opts && opts.first}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="relative shrink-0" on:click|stopPropagation on:keydown|stopPropagation>
							<!-- Primary pill -->
							<div class="flex items-stretch h-7">
								<a
									href={dndItem.record?.[opts.first.key] as string}
									target="_blank"
									rel="noopener noreferrer"
									style="background-color:{opts.first.brand.bg}; color:{opts.first.brand.text}; border-color:{opts.first.brand.border}"
									class="text-xs border flex items-center px-2.5 {opts.rest.length > 0 ? 'rounded-l-full' : 'rounded-full'} hover:opacity-80 transition-opacity whitespace-nowrap"
								>
									{opts.first.label}
								</a>
								{#if opts.rest.length > 0}
									<button
										on:click={() => (openDropdownId = openDropdownId === dndItem.id ? null : dndItem.id)}
										aria-label="More streaming options"
										style="background-color:{opts.first.brand.bg}; color:{opts.first.brand.text}; border-color:{opts.first.brand.border}"
										class="border border-l-0 flex items-center px-1.5 rounded-r-full hover:opacity-80 transition-opacity"
									>
										<svg viewBox="0 0 10 10" fill="none" class="w-2.5 h-2.5" xmlns="http://www.w3.org/2000/svg">
											<path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									</button>
								{/if}
							</div>

							<!-- Dropdown -->
							{#if openDropdownId === dndItem.id}
								<div class="absolute right-0 top-full mt-1.5 z-20 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden min-w-[140px]">
									{#each opts.rest as platform}
										<a
											href={dndItem.record?.[platform.key] as string}
											target="_blank"
											rel="noopener noreferrer"
											class="flex items-center px-3 py-2 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
										>
											{platform.label}
										</a>
									{/each}
									{#if dndItem.record?.songlinkUrl}
										<a
											href={dndItem.record.songlinkUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="flex items-center px-3 py-2 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-zinc-800 transition-colors border-t border-zinc-800"
										>
											song.link
										</a>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					{#if isOwn}
						<button
							on:click={() => removeItem(dndItem.id)}
							aria-label="Remove from setlist"
							class="text-zinc-700 hover:text-red-400 transition-colors shrink-0"
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
