<script lang="ts">
	import { closeShareSong, lastSharedSong, pendingSharedSong } from '$lib/stores/shareSong';
	import SongSearch from './SongSearch.svelte';
	import { type TrackResult } from '$lib/search';
	import { extractPlatformUrls, getCanonicalEntity, type OdesliResponse } from '$lib/odesli/client';
	import { getAgent } from '$lib/atproto/agent';
	import { session } from '$lib/stores/auth';
	import { SONG_NSID, type KhordSongRecord } from '$lib/atproto/lexicons/song';
	import { APP_URL } from '$lib/config';
	import { theme as t } from '$lib/theme';

	const NOTE_LIMIT = 300;

	let selected: TrackResult | null = null;
	let note = '';
	let sharing = false;
	let shareError = '';
	let shared = false;

	$: noteCharsLeft = NOTE_LIMIT - [...note].length;
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
		if (!selected || !$session || sharing) return;
		sharing = true;
		shareError = '';

		// Capture everything before the modal closes
		const track = selected;
		const trimmedNote = note.trim();
		const agent = getAgent();
		const did = $session.did;

		// Signal the feed to show a placeholder card while resolution runs in background
		pendingSharedSong.set({ title: track.title, artist: track.artist, ...(track.album && { album: track.album }) });

		// Show success immediately, then close — resolution continues in the background
		shared = true;
		setTimeout(closeShareSong, 800);

		try {
			let record: KhordSongRecord = {
				title: track.title,
				artist: track.artist,
				...(track.album && { album: track.album }),
				...(trimmedNote && { note: trimmedNote }),
				instanceUrl: APP_URL,
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

			const res = await agent.com.atproto.repo.createRecord({
				repo: did,
				collection: SONG_NSID,
				record: { $type: SONG_NSID, ...record }
			});

			lastSharedSong.set({ uri: res.data.uri, cid: res.data.cid, value: record });
		} catch (e) {
			console.error('[ShareSong] background resolution failed:', e);
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
></button>

<!-- Modal -->
<div
	class="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 sm:left-1/2 sm:right-auto sm:top-20 sm:translate-y-0 sm:-translate-x-1/2
		sm:w-full sm:max-w-md {$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl
		max-h-[90dvh] flex flex-col"
	role="dialog"
	aria-modal="true"
	aria-label="Share a song"
>
	<div class="px-5 py-4 border-b {$t.borderBase} flex items-center justify-between shrink-0">
		<h2 class="text-sm font-semibold {$t.textPrimary}">Share a song</h2>
		<button
			on:click={closeShareSong}
			class="{$t.textMuted} {$t.hoverText} transition-colors text-lg leading-none"
			aria-label="Close"
		>
			✕
		</button>
	</div>

	<div class="p-5 space-y-4 overflow-y-auto">
		{#if shared}
			<div class="py-6 text-center space-y-2">
				<p class="{$t.textPrimary} text-sm font-medium">Added to your lineup</p>
				<p class="{$t.textMuted} text-xs">{selected?.title} · {selected?.artist}</p>
				<p class="{$t.textFaint} text-xs">Resolving streaming links in the background…</p>
			</div>
		{:else if !selected}
			<SongSearch autofocus on:select={handleSelect} />
		{:else}
			<div class="rounded-lg border {$t.borderStrong} {$t.recessedBg} px-4 py-3 flex items-center justify-between gap-3">
				<div>
					<p class="text-sm {$t.textPrimary} font-medium">{selected.title}</p>
					<p class="text-xs {$t.textMuted}">
						{selected.artist}{selected.album ? ` · ${selected.album}` : ''}{selected.year ? ` (${selected.year})` : ''}
					</p>
				</div>
				<button
					on:click={clearSelection}
					disabled={sharing}
					class="{$t.textFaint} {$t.hoverTextSecondary} transition-colors text-sm shrink-0 disabled:opacity-0"
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
					class="w-full {$t.recessedBg} border {$t.borderStrong} rounded-lg px-3 py-2 text-base sm:text-sm {$t.textPrimary}
						placeholder:{$t.textFaint} focus:outline-none focus:ring-1 {$t.focusRing}
						resize-none disabled:opacity-50"
				></textarea>
				<div class="flex justify-end">
					<span class="text-xs {noteCharsLeft <= 20 ? (noteOverLimit ? 'text-red-400' : 'text-amber-400') : $t.textFaint}">
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
				class="w-full {$t.btnPrimaryBg} {$t.btnPrimaryText} text-sm font-medium px-4 py-2.5 rounded-lg
					{$t.btnPrimaryHover} transition-colors disabled:opacity-50 disabled:cursor-not-allowed
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
