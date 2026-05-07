<script lang="ts">
	import { closeShareSong, lastSharedSong } from '$lib/stores/shareSong';
	import SongSearch from './SongSearch.svelte';
	import { type TrackResult } from '$lib/search';
	import { extractPlatformUrls, getCanonicalEntity } from '$lib/odesli/client';
	import { getAgent } from '$lib/atproto/agent';
	import { session } from '$lib/stores/auth';
	import { SONG_NSID, type KhordSongRecord } from '$lib/atproto/lexicons/song';
	import { updateSong } from '$lib/atproto/social';
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

		const track = selected;
		const trimmedNote = note.trim();
		const agent = getAgent();
		const did = $session.did;

		try {
			// Phase 1 — Spotify + YouTube in parallel (~300ms), iTunes provides everything else.
			let phase1: { spotifyUrl?: string; youtubeMusicUrl?: string } = {};
			if (track.title && track.artist) {
				const p = new URLSearchParams({ phase: '1', title: track.title, artist: track.artist });
				const r = await fetch(`/api/resolve?${p}`);
				if (r.ok) phase1 = await r.json();
			}

			const record: KhordSongRecord = {
				title: track.title,
				artist: track.artist,
				...(track.album       && { album:          track.album }),
				...(track.artworkUrl  && { thumbnailUrl:   track.artworkUrl }),
				...(track.appleMusicUrl && { appleMusicUrl: track.appleMusicUrl }),
				...(phase1.spotifyUrl      && { spotifyUrl:      phase1.spotifyUrl }),
				...(phase1.youtubeMusicUrl && { youtubeMusicUrl: phase1.youtubeMusicUrl }),
				...(trimmedNote && { note: trimmedNote }),
				instanceUrl: APP_URL,
				createdAt: new Date().toISOString()
			};

			const createRes = await agent.com.atproto.repo.createRecord({
				repo: did,
				collection: SONG_NSID,
				record: { $type: SONG_NSID, ...record }
			});
			const rkey = createRes.data.uri.split('/').pop()!;

			lastSharedSong.set({ uri: createRes.data.uri, cid: createRes.data.cid, value: record });
			shared = true;
			setTimeout(closeShareSong, 800);

			// Phase 2 — background Odesli enrichment (Deezer, Tidal, Amazon, SoundCloud, song.link).
			if (track.appleMusicUrl) {
				const p = new URLSearchParams({ url: track.appleMusicUrl, title: track.title, artist: track.artist });
				fetch(`/api/resolve?${p}`)
					.then((r) => r.ok ? r.json() : null)
					.then((result) => {
						if (!result) return;
						const platformUrls = extractPlatformUrls(result);
						const entity = getCanonicalEntity(result);
						const enriched: KhordSongRecord = {
							...record,
							title:           entity?.title       ?? record.title,
							artist:          entity?.artistName  ?? record.artist,
							thumbnailUrl:    record.thumbnailUrl ?? platformUrls.thumbnailUrl,
							appleMusicUrl:   record.appleMusicUrl  ?? platformUrls.appleMusicUrl,
							spotifyUrl:      record.spotifyUrl     ?? platformUrls.spotifyUrl,
							youtubeMusicUrl: record.youtubeMusicUrl ?? platformUrls.youtubeMusicUrl,
							...(platformUrls.odesliKey    && { odesliKey:      platformUrls.odesliKey }),
							...(platformUrls.deezerUrl    && { deezerUrl:      platformUrls.deezerUrl }),
							...(platformUrls.tidalUrl     && { tidalUrl:       platformUrls.tidalUrl }),
							...(platformUrls.amazonMusicUrl && { amazonMusicUrl: platformUrls.amazonMusicUrl }),
							...(platformUrls.soundcloudUrl  && { soundcloudUrl:  platformUrls.soundcloudUrl }),
							...(platformUrls.songlinkUrl    && { songlinkUrl:    platformUrls.songlinkUrl }),
						};
						updateSong(did, rkey, enriched).catch((e) => console.error('[ShareSong] Phase 2 update failed:', e));
					})
					.catch((e) => console.error('[ShareSong] Phase 2 resolve failed:', e));
			}
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
				<p class="{$t.textFaint} text-xs">Fetching remaining platform links…</p>
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
