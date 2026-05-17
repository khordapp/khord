<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { closeShareSong, lastSharedSong, prefilledTrack } from '$lib/stores/shareSong';
	import SongSearch from './SongSearch.svelte';
	import { type TrackResult } from '$lib/search';
	import { getAgent } from '$lib/atproto/agent';
	import { session } from '$lib/stores/auth';
	import { SONG_NSID, type KhordSongRecord } from '$lib/atproto/lexicons/song';
	import { APP_URL } from '$lib/config';
	import { theme as t } from '$lib/theme';
	import { fly } from 'svelte/transition';

	const NOTE_LIMIT = 300;

	let selected: TrackResult | null = null;
	let resolving = false;

	onMount(async () => {
		if ($prefilledTrack) {
			const track = $prefilledTrack;
			prefilledTrack.set(null);
			selected = track;

			// Immediately resolve other platform URLs so all services show in the modal.
			if (track.title && track.artist) {
				resolving = true;
				try {
					const p = new URLSearchParams({ title: track.title, artist: track.artist });
					const r = await fetch(`/api/resolve?${p}`);
					if (r.ok) {
						const resolved = await r.json();
						selected = {
							...track,
							...(resolved.spotifyUrl      && !track.spotifyUrl      && { spotifyUrl:       resolved.spotifyUrl }),
							...(resolved.appleMusicUrl   && !track.appleMusicUrl   && { appleMusicUrl:    resolved.appleMusicUrl }),
							...(resolved.youtubeMusicUrl && !track.youtubeMusicUrl && { youtubeMusicUrl:  resolved.youtubeMusicUrl }),
							...(resolved.deezerUrl       && !track.deezerUrl       && { deezerUrl:        resolved.deezerUrl }),
						};
					}
				} finally {
					resolving = false;
				}
			}
		}
	});
	let note = '';
	let sharing = false;
	let shareError = '';
	let shared = false;

	// Shift the bottom sheet above the on-screen keyboard on iOS Safari.
	// visualViewport.height shrinks when the keyboard appears; the difference
	// is how far up we need to move the fixed-bottom panel.
	let keyboardOffset = 0;
	function updateKeyboardOffset() {
		const vv = window.visualViewport;
		if (!vv || window.innerWidth >= 640) { keyboardOffset = 0; return; }
		keyboardOffset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
	}
	onMount(() => {
		window.visualViewport?.addEventListener('resize', updateKeyboardOffset);
	});
	onDestroy(() => {
		window.visualViewport?.removeEventListener('resize', updateKeyboardOffset);
	});

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

		const track = selected;
		const trimmedNote = note.trim();
		const agent = getAgent();
		const did = $session.did;

		try {
			// Only resolve if we're still missing platform URLs (pre-resolve on mount may have already filled them).
			let resolved: { spotifyUrl?: string; appleMusicUrl?: string; youtubeMusicUrl?: string; deezerUrl?: string } = {};
			const needsResolve = track.title && track.artist &&
				(!track.spotifyUrl || !track.appleMusicUrl || !track.youtubeMusicUrl || !track.deezerUrl);
			if (needsResolve) {
				const p = new URLSearchParams({ title: track.title, artist: track.artist });
				const r = await fetch(`/api/resolve?${p}`);
				if (r.ok) resolved = await r.json();
			}

			const record: KhordSongRecord = {
				title: track.title,
				artist: track.artist,
				...(track.album        && { album:          track.album }),
				...(track.artworkUrl   && { thumbnailUrl:   track.artworkUrl }),
				// Platform URLs: prefer pre-known source URL, fall back to resolved result.
				...(( track.appleMusicUrl)                                  && { appleMusicUrl:    track.appleMusicUrl }),
				...((track.spotifyUrl      || resolved.spotifyUrl)      && { spotifyUrl:       track.spotifyUrl      ?? resolved.spotifyUrl }),
				...((track.youtubeMusicUrl || resolved.youtubeMusicUrl) && { youtubeMusicUrl:  track.youtubeMusicUrl ?? resolved.youtubeMusicUrl }),
				...((track.deezerUrl       || resolved.deezerUrl)       && { deezerUrl:        track.deezerUrl       ?? resolved.deezerUrl }),
				...(trimmedNote && { note: trimmedNote }),
				instanceUrl: APP_URL,
				createdAt: new Date().toISOString()
			};

			const createRes = await agent.com.atproto.repo.createRecord({
				repo: did,
				collection: SONG_NSID,
				record: { $type: SONG_NSID, ...record }
			});

			lastSharedSong.set({ uri: createRes.data.uri, cid: createRes.data.cid, value: record });
			shared = true;
			setTimeout(closeShareSong, 800);
		} catch (e) {
			sharing = false;
			shareError = e instanceof Error ? e.message : 'Something went wrong.';
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
	transition:fly={{ y: 320, duration: 260 }}
	style={keyboardOffset > 0 ? `bottom: ${keyboardOffset}px; transition: bottom 0.2s ease;` : undefined}
	class="fixed z-50 bottom-0 left-0 right-0 flex flex-col
		sm:bottom-auto sm:top-20 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-md
		{$t.surfaceBg} border-t border-l border-r sm:border {$t.borderStrong}
		rounded-t-3xl sm:rounded-2xl shadow-2xl
		max-h-[88dvh] sm:max-h-[90dvh]"
	role="dialog"
	aria-modal="true"
	aria-label="Share a song"
>
	<!-- Drag handle (mobile only) -->
	<div class="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
		<div class="w-10 h-1 rounded-full {$t.borderStrong} bg-current opacity-30"></div>
	</div>

	<div class="px-5 py-4 border-b {$t.borderBase} flex items-center justify-between shrink-0">
		<h2 class="text-base font-semibold {$t.textPrimary}">Share a song</h2>
		<button
			on:click={closeShareSong}
			class="{$t.textMuted} {$t.hoverText} transition-colors text-xl leading-none"
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
					{#if resolving}
						<p class="text-xs {$t.textFaint} mt-1">Finding streaming links…</p>
					{/if}
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

	<!-- Safe-area spacer for home indicator -->
	<div class="shrink-0 sm:hidden" style="height: env(safe-area-inset-bottom, 12px)"></div>
</div>
