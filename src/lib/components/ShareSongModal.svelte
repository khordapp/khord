<script lang="ts">
	import { closeShareSong, lastSharedSong } from '$lib/stores/shareSong';
	import SongSearch from './SongSearch.svelte';
	import { type TrackResult } from '$lib/search';
	import { extractPlatformUrls, getCanonicalEntity, type OdesliResponse } from '$lib/odesli/client';
	import { getAgent } from '$lib/atproto/agent';
	import { session } from '$lib/stores/auth';
	import { SONG_NSID, type KhordSongRecord } from '$lib/atproto/lexicons/song';

	const NOTE_LIMIT = 300;

	let selected: TrackResult | null = null;
	let note = '';
	let sharing = false;
	let shareError = '';
	let shared = false;

	$: noteCharsLeft = NOTE_LIMIT - [...note].length; // grapheme-aware via spread
	$: noteOverLimit = noteCharsLeft < 0;

	function handleSelect(e: CustomEvent<TrackResult>) {
		selected = e.detail;
		shareError = '';
	}

	function clearSelection() {
		selected = null;
		note = '';
		shareError = '';
	}

	async function handleShare() {
		if (!selected || !$session) return;
		sharing = true;
		shareError = '';
		try {
			const trimmedNote = note.trim();
			let record: KhordSongRecord = {
				title: selected.title,
				artist: selected.artist,
				...(selected.album && { album: selected.album }),
				...(trimmedNote && { note: trimmedNote }),
				createdAt: new Date().toISOString()
			};

			if (selected.appleMusicUrl) {
				const res = await fetch(`/api/resolve?url=${encodeURIComponent(selected.appleMusicUrl)}`);
				if (!res.ok) throw new Error(`Could not resolve song links (${res.status})`);
				const odesliResult: OdesliResponse = await res.json();
				const platformUrls = extractPlatformUrls(odesliResult);
				const entity = getCanonicalEntity(odesliResult);
				record = {
					...record,
					// Prefer Odesli's canonical metadata where available
					title: entity?.title ?? selected.title,
					artist: entity?.artistName ?? selected.artist,
					...platformUrls
				};
			}

			const res = await getAgent().com.atproto.repo.createRecord({
				repo: $session.did,
				collection: SONG_NSID,
				record: { $type: SONG_NSID, ...record }
			});

			lastSharedSong.set({ uri: res.data.uri, cid: res.data.cid, value: record });
			shared = true;
			setTimeout(closeShareSong, 1500);
		} catch (e) {
			shareError = e instanceof Error ? e.message : 'Failed to share. Please try again.';
		} finally {
			sharing = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (selected) clearSelection();
			else closeShareSong();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Backdrop -->
<button
	class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
	aria-label="Close"
	on:click={closeShareSong}
/>

<!-- Modal -->
<div
	class="fixed z-50 bottom-0 left-0 right-0 sm:bottom-auto sm:top-20 sm:left-1/2 sm:-translate-x-1/2
		w-full sm:max-w-md bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl shadow-2xl"
	role="dialog"
	aria-modal="true"
	aria-label="Share a song"
>
	<div class="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
		<h2 class="text-sm font-semibold">Share a song</h2>
		<button
			on:click={closeShareSong}
			class="text-zinc-500 hover:text-zinc-100 transition-colors text-lg leading-none"
			aria-label="Close"
		>
			✕
		</button>
	</div>

	<div class="p-5 space-y-4">
		{#if shared}
			<div class="py-6 text-center space-y-1">
				<p class="text-zinc-100 text-sm font-medium">Added to your lineup</p>
				<p class="text-zinc-500 text-xs">{selected?.title} · {selected?.artist}</p>
			</div>
		{:else if !selected}
			<SongSearch autofocus on:select={handleSelect} />
		{:else}
			<div class="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 flex items-center justify-between gap-3">
				<div>
					<p class="text-sm text-zinc-100 font-medium">{selected.title}</p>
					<p class="text-xs text-zinc-500">
						{selected.artist}{selected.album ? ` · ${selected.album}` : ''}{selected.year ? ` (${selected.year})` : ''}
					</p>
				</div>
				<button
					on:click={clearSelection}
					disabled={sharing}
					class="text-zinc-600 hover:text-zinc-300 transition-colors text-sm shrink-0 disabled:opacity-0"
					aria-label="Clear selection"
				>
					✕
				</button>
			</div>

			<div class="space-y-1">
				<textarea
					bind:value={note}
					placeholder="Add a note… (optional)"
					rows="3"
					maxlength={NOTE_LIMIT}
					disabled={sharing}
					class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100
						placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500
						resize-none disabled:opacity-50"
				></textarea>
				<div class="flex justify-end">
					<span class="text-xs {noteCharsLeft <= 20 ? (noteOverLimit ? 'text-red-400' : 'text-amber-400') : 'text-zinc-600'}">
						{noteCharsLeft}
					</span>
				</div>
			</div>

			{#if shareError}
				<p class="text-xs text-red-400">{shareError}</p>
			{/if}

			<button
				on:click={handleShare}
				disabled={sharing || noteOverLimit}
				class="w-full bg-white text-black text-sm font-medium px-4 py-2.5 rounded-lg
					hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
					flex items-center justify-center gap-2"
			>
				{#if sharing}
					<span class="w-3.5 h-3.5 border-2 border-zinc-400 border-t-zinc-800 rounded-full animate-spin"></span>
					Resolving platforms…
				{:else}
					Share to your lineup
				{/if}
			</button>
		{/if}
	</div>
</div>
