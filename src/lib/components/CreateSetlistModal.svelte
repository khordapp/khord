<script lang="ts">
	import { closeCreateSetlist } from '$lib/stores/createSetlist';
	import { type TrackResult } from '$lib/search';
	import { session } from '$lib/stores/auth';
	import type { SongRecord } from '$lib/stores/shareSong';
	import { thumbUrl } from '$lib/config';
	import { goto } from '$app/navigation';
	import { searchTracks } from '$lib/search';
	import { theme as t } from '$lib/theme';

	const TITLE_LIMIT = 100;

	let title = '';
	let titleFocused = false;
	let description = '';
	let open = false;
	let tags: string[] = [];
	let tagInput = '';

	function addTag() {
		const t = tagInput.trim().toLowerCase().slice(0, 25);
		if (t && tags.length < 10 && !tags.includes(t)) tags = [...tags, t];
		tagInput = '';
	}

	function removeTag(tag: string) {
		tags = tags.filter(t => t !== tag);
	}

	let query = '';
	let searching = false;
	let searchResults: TrackResult[] = [];
	let searchError = '';
	let debounceTimer: ReturnType<typeof setTimeout>;

	interface SetlistSong {
		trackResult: TrackResult;
		record: SongRecord;
		songId: number;
	}
	let songs: SetlistSong[] = [];

	let resolving = false;
	let resolveError = '';
	let creating = false;

	$: titleCharsLeft = TITLE_LIMIT - [...title].length;
	$: canCreate = title.trim().length > 0 && songs.length > 0 && !creating;

	$: if (query.trim().length >= 2) {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(doSearch, 350);
	} else {
		clearTimeout(debounceTimer);
		searchResults = [];
		searchError = '';
	}

	async function doSearch() {
		searching = true;
		searchError = '';
		try {
			searchResults = await searchTracks(query.trim());
		} catch (e) {
			searchError = e instanceof Error ? e.message : 'Search failed.';
			searchResults = [];
		} finally {
			searching = false;
		}
	}

	async function addSong(track: TrackResult) {
		if (!$session || resolving) return;
		resolving = true;
		resolveError = '';
		query = '';
		searchResults = [];
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

			const createRes = await fetch('/api/songs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...record, listed: 0 })
			});
			if (!createRes.ok) throw new Error('Failed to create song');
			const { id: songId } = await createRes.json();

			songs = [...songs, { trackResult: track, record, songId }];
		} catch (e) {
			resolveError = e instanceof Error ? e.message : 'Failed to add song.';
		} finally {
			resolving = false;
		}
	}

	function removeFromList(songId: number) {
		songs = songs.filter((s) => s.songId !== songId);
	}

	async function handleCreate() {
		if (!$session || !canCreate) return;
		creating = true;
		try {
			// Create the setlist
			const createRes = await fetch('/api/setlists', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					description: description.trim() || undefined,
					open,
					tags,
				})
			});
			if (!createRes.ok) throw new Error('Failed to create setlist');
			const { id: setlistId } = await createRes.json();

			// Add each song
			for (const song of songs) {
				await fetch(`/api/setlists/${setlistId}/items`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						songId: song.songId,
						snapshot: {
							title: song.record.title,
							artist: song.record.artist,
							...(song.record.album && { album: song.record.album }),
							...(song.record.thumbnailUrl && { thumbnailUrl: song.record.thumbnailUrl }),
							...(song.record.appleMusicUrl && { appleMusicUrl: song.record.appleMusicUrl }),
							...(song.record.spotifyUrl && { spotifyUrl: song.record.spotifyUrl }),
							...(song.record.youtubeMusicUrl && { youtubeMusicUrl: song.record.youtubeMusicUrl }),
							...(song.record.deezerUrl && { deezerUrl: song.record.deezerUrl }),
						}
					})
				});
			}

			closeCreateSetlist();
			goto(`/s/${setlistId}`);
		} finally {
			creating = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeCreateSetlist();
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
	<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close" on:click={closeCreateSetlist}></button>

	<div class="relative w-full max-w-md {$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
		<div class="px-5 pt-5 pb-4 border-b {$t.borderBase} flex items-center justify-between shrink-0">
			<h2 class="text-sm font-semibold {$t.textPrimary}">New mixtape</h2>
			<button on:click={closeCreateSetlist} aria-label="Close" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">
				<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
					<path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		</div>

		<div class="flex-1 overflow-y-auto">
			<div class="px-5 pt-4 pb-3 space-y-1.5">
				<input
					bind:value={title}
					on:focus={() => (titleFocused = true)}
					on:blur={() => (titleFocused = false)}
					placeholder="Mixtape name…"
					maxlength={TITLE_LIMIT}
					class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg px-3 py-2 text-base sm:text-sm {$t.textPrimary}
						placeholder:{$t.textMuted} focus:outline-none {$t.hoverBorderStrong} transition-colors"
				/>
				{#if titleFocused || title.length > TITLE_LIMIT * 0.8}
					<p class="text-xs text-right {titleCharsLeft < 10 ? 'text-amber-400' : $t.textFaint}">{titleCharsLeft}</p>
				{/if}
				<textarea
					bind:value={description}
					placeholder="Describe the theme or vibe… (optional)"
					rows="2"
					maxlength="500"
					class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg px-3 py-2 text-base sm:text-sm {$t.textPrimary} placeholder:{$t.textMuted} focus:outline-none {$t.hoverBorderStrong} transition-colors resize-none"
				></textarea>
				<label class="flex items-center gap-2.5 cursor-pointer select-none">
					<input type="checkbox" bind:checked={open} class="rounded" />
					<span class="text-sm {$t.textPrimary}">Open challenge</span>
				</label>
				<div class="space-y-1.5">
					<input
						bind:value={tagInput}
						on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
						placeholder="Add a tag… (press Enter)"
						maxlength="25"
						class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg px-3 py-1.5 text-base sm:text-sm {$t.textPrimary} placeholder:{$t.textMuted} focus:outline-none {$t.hoverBorderStrong} transition-colors"
					/>
					{#if tags.length > 0}
						<div class="flex flex-wrap gap-1.5">
							{#each tags as tag}
								<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs {$t.accentBg} {$t.accentText} border {$t.accentBorder}">
									#{tag}
									<button on:click={() => removeTag(tag)} class="hover:opacity-70 leading-none" aria-label="Remove tag">×</button>
								</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<div class="px-5 pb-3 space-y-2">
				<p class="text-xs {$t.textMuted} font-medium">Add songs</p>
				<div class="relative">
					<input
						type="search"
						bind:value={query}
						placeholder="Search for a song…"
						disabled={resolving}
						class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg pl-9 pr-3 py-2 text-base sm:text-sm {$t.textPrimary}
							placeholder:{$t.textMuted} focus:outline-none {$t.hoverBorderStrong} transition-colors disabled:opacity-50"
					/>
					<span class="absolute left-3 top-1/2 -translate-y-1/2 {$t.textMuted} text-sm pointer-events-none">♪</span>
					{#if searching || resolving}
						<span class="absolute right-3 top-1/2 -translate-y-1/2">
							<span class="block w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin"></span>
						</span>
					{/if}
				</div>

				{#if resolveError}
					<p class="text-xs text-red-400">{resolveError}</p>
				{/if}

				{#if query.trim().length >= 2}
					<div class="rounded-lg border {$t.borderBase} {$t.recessedBg} overflow-hidden max-h-52 overflow-y-auto">
						{#if searching && searchResults.length === 0}
							<div class="px-4 py-3 space-y-2.5">
								{#each [1, 2, 3] as _}
									<div class="space-y-1.5">
										<div class="h-3.5 w-2/3 {$t.elevatedBg} rounded animate-pulse"></div>
										<div class="h-3 w-1/3 {$t.elevatedBg} rounded animate-pulse"></div>
									</div>
								{/each}
							</div>
						{:else if searchError}
							<div class="px-4 py-4 text-center text-red-400 text-sm">{searchError}</div>
						{:else if searchResults.length > 0}
							<ul>
								{#each searchResults as result}
									{@const alreadyAdded = songs.some(
										(s) => s.trackResult.title === result.title && s.trackResult.artist === result.artist
									)}
									<li>
										<button
											on:click={() => !alreadyAdded && addSong(result)}
											disabled={alreadyAdded || resolving}
											class="w-full text-left px-4 py-3 border-b {$t.borderBase} last:border-0 transition-colors
												{alreadyAdded ? 'opacity-40 cursor-default' : $t.hoverBg}"
										>
											<p class="text-sm {$t.textPrimary} truncate">{result.title}</p>
											<p class="text-xs {$t.textMuted} truncate">
												{result.artist}{result.album ? ` · ${result.album}` : ''}
											</p>
										</button>
									</li>
								{/each}
							</ul>
						{:else if !searching}
							<div class="px-4 py-4 text-center {$t.textMuted} text-sm">No results found.</div>
						{/if}
					</div>
				{/if}
			</div>

			{#if songs.length > 0}
				<div class="px-5 pb-4 space-y-2">
					<p class="text-xs {$t.textMuted} font-medium">{songs.length} {songs.length === 1 ? 'song' : 'songs'}</p>
					<ul class="space-y-1.5">
						{#each songs as song, i}
							<li class="flex items-center gap-3 rounded-lg {$t.elevatedBg} px-3 py-2">
								{#if song.record.thumbnailUrl}
									<img src={thumbUrl(song.record.thumbnailUrl)} alt="" aria-hidden="true" class="w-8 h-8 rounded object-cover shrink-0" />
								{:else}
									<span class="w-8 h-8 flex items-center justify-center {$t.textFaint} text-xs shrink-0">{i + 1}</span>
								{/if}
								<div class="flex-1 min-w-0">
									<p class="text-xs font-medium {$t.textPrimary} truncate">{song.record.title}</p>
									<p class="text-xs {$t.textMuted} truncate">{song.record.artist}</p>
								</div>
								<button
									on:click={() => removeFromList(song.songId)}
									aria-label="Remove"
									class="{$t.textFaint} hover:text-red-400 transition-colors shrink-0"
								>
									<svg viewBox="0 0 14 14" fill="none" class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg">
										<path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
									</svg>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<div class="px-5 py-4 border-t {$t.borderBase} flex items-center justify-between gap-3 shrink-0">
			<p class="text-xs {$t.textFaint}">
				{#if songs.length === 0}Add at least one song{:else if !title.trim()}Give your mixtape a name{/if}
			</p>
			<button
				on:click={handleCreate}
				disabled={!canCreate}
				class="flex items-center gap-1.5 text-sm font-semibold {$t.btnPrimaryBg} {$t.btnPrimaryText} px-4 py-2 rounded-full
					{$t.btnPrimaryHover} transition-colors disabled:opacity-40"
			>
				{#if creating}
					<span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
					Creating…
				{:else}
					Create mixtape
				{/if}
			</button>
		</div>
	</div>
</div>
