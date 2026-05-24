<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isLoggedIn, authReady, session } from '$lib/stores/auth';
	import { openShareSongWithTrack } from '$lib/stores/shareSong';
	import { APP_URL } from '$lib/config';
	import { theme as t } from '$lib/theme';

	let isLightTheme = false;
	$: if ($t) isLightTheme = t.isLight();

	export let data: import('./$types').PageData;

	let mixtapeName = '';
	let selected: Set<number> = new Set();
	let creating = false;
	let createStep = 0;
	let createTotal = 0;
	let createError = '';

	onMount(() => {
		let unsub: (() => void) | undefined;
		unsub = authReady.subscribe((ready) => {
			if (!ready) return;
			if (unsub) unsub();

			if (!$isLoggedIn) {
				goto('/login', { replaceState: true });
				return;
			}

			if (data.type === 'track') {
				openShareSongWithTrack(data.track);
				goto('/', { replaceState: true });
				return;
			}

			mixtapeName = data.playlist.title;
			const seen = new Set<string>();
			data.playlist.tracks.forEach((track, i) => {
				const key = `${track.title.toLowerCase()}|${track.artist.toLowerCase()}`;
				if (!seen.has(key)) {
					seen.add(key);
					selected.add(i);
				}
			});
			selected = selected;
		});
		return unsub;
	});

	$: playlist = data.type === 'playlist' ? data.playlist : null;
	$: allSelected = playlist ? selected.size === playlist.tracks.length : false;
	$: selectedCount = selected.size;
	$: progressPct = createTotal > 0 ? Math.round((createStep / createTotal) * 100) : 0;

	function toggleAll() {
		if (allSelected) {
			selected = new Set();
		} else {
			selected = new Set(playlist!.tracks.map((_, i) => i));
		}
	}

	function toggleTrack(i: number) {
		const next = new Set(selected);
		if (next.has(i)) next.delete(i);
		else next.add(i);
		selected = next;
	}

	function sourceUrlFor(track: { sourceUrl: string }, key: 'spotify' | 'apple' | 'deezer' | 'youtube'): string | undefined {
		const url = track.sourceUrl;
		if (key === 'spotify'  && url.includes('open.spotify.com'))  return url;
		if (key === 'apple'    && url.includes('music.apple.com'))   return url;
		if (key === 'deezer'   && url.includes('deezer.com'))        return url;
		if (key === 'youtube'  && (url.includes('music.youtube.com') || url.includes('youtube.com'))) return url;
	}

	async function handleCreate() {
		if (!$session || creating || selectedCount === 0) return;
		creating = true;
		createError = '';

		const tracks = playlist!.tracks.filter((_, i) => selected.has(i));
		const seen = new Set<string>();
		const dedupedTracks = tracks.filter(track => {
			const key = `${track.title.toLowerCase()}|${track.artist.toLowerCase()}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});

		createTotal = dedupedTracks.length;
		createStep = 0;

		const songIds: { id: number; track: typeof dedupedTracks[0]; snapshot: Record<string, string | undefined> }[] = [];

		const CONCURRENCY = 5;
		for (let i = 0; i < dedupedTracks.length; i += CONCURRENCY) {
			const batch = dedupedTracks.slice(i, i + CONCURRENCY);
			const results = await Promise.all(batch.map(async (track) => {
				try {
					const p = new URLSearchParams({ title: track.title, artist: track.artist });
					const resolveRes = await fetch(`/api/resolve?${p}`);
					const resolved = resolveRes.ok ? await resolveRes.json() : {};

					const spotifyUrl      = sourceUrlFor(track, 'spotify')  ?? resolved.spotifyUrl;
					const appleMusicUrl   = sourceUrlFor(track, 'apple')    ?? resolved.appleMusicUrl;
					const deezerUrl       = sourceUrlFor(track, 'deezer')   ?? resolved.deezerUrl;
					const youtubeMusicUrl = sourceUrlFor(track, 'youtube')  ?? resolved.youtubeMusicUrl;

					const songBody: Record<string, unknown> = {
						title:  track.title,
						artist: track.artist,
						listed: 0,
						...(track.album      && { album: track.album }),
						...(track.artworkUrl && { thumbnailUrl: track.artworkUrl }),
						...(spotifyUrl       && { spotifyUrl }),
						...(appleMusicUrl    && { appleMusicUrl }),
						...(youtubeMusicUrl  && { youtubeMusicUrl }),
						...(deezerUrl        && { deezerUrl }),
					};

					const res = await fetch('/api/songs', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(songBody),
					});
					if (!res.ok) throw new Error('Failed to create song');
					const { id } = await res.json();

					return {
						id,
						track,
						snapshot: {
							title:  track.title,
							artist: track.artist,
							...(track.album      && { album: track.album }),
							...(track.artworkUrl && { thumbnailUrl: track.artworkUrl }),
							...(spotifyUrl       && { spotifyUrl }),
							...(appleMusicUrl    && { appleMusicUrl }),
							...(youtubeMusicUrl  && { youtubeMusicUrl }),
							...(deezerUrl        && { deezerUrl }),
						},
					};
				} catch {
					return null;
				} finally {
					createStep++;
				}
			}));
			songIds.push(...results.filter((r): r is NonNullable<typeof r> => r !== null));
		}

		if (songIds.length === 0) {
			createError = 'Could not create any tracks. Please try again.';
			creating = false;
			return;
		}

		try {
			const name = mixtapeName.trim() || playlist!.title;
			const slRes = await fetch('/api/setlists', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: name }),
			});
			if (!slRes.ok) throw new Error('Failed to create setlist');
			const { id: setlistId } = await slRes.json();

			await Promise.all(songIds.map(({ id: songId, snapshot }) =>
				fetch(`/api/setlists/${setlistId}/items`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ songId, snapshot }),
				})
			));

			goto(`/s/${setlistId}`);
		} catch {
			createError = 'Failed to create mixtape. Please try again.';
			creating = false;
		}
	}
</script>

{#if data.type === 'track' || !playlist}
	<div class="min-h-dvh flex items-center justify-center {$t.pageBg}">
		<p class="text-sm {$t.textMuted}">Opening…</p>
	</div>
{:else}
	<div class="h-dvh {$t.pageBg} {$t.textPrimary} flex flex-col">

		<!-- Header -->
		<div class="px-6 pt-5 pb-3 flex items-center gap-3 border-b {$t.borderFaded}">
			<button on:click={() => history.back()} class="shrink-0 {$t.textMuted} {$t.hoverTextSecondary} transition-colors" aria-label="Back">
				<svg viewBox="0 0 16 16" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
					<path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
			<div class="min-w-0">
				<p class="text-xs {$t.textFaint} mb-0.5">Import playlist</p>
				<input
					bind:value={mixtapeName}
					disabled={creating}
					maxlength="100"
					placeholder="Mixtape name…"
					class="text-base font-semibold {$t.textPrimary} bg-transparent focus:outline-none w-full truncate disabled:opacity-60"
				/>
			</div>
		</div>

		<!-- Track count + select controls -->
		<div class="px-6 py-2 flex items-center justify-between border-b {$t.borderFaded}">
			<p class="text-xs {$t.textFaint}">
				{data.platform.charAt(0).toUpperCase() + data.platform.slice(1)} · {playlist.tracks.length} tracks
				{#if playlist.tracks.length !== selectedCount}
					<span class="{$t.accentText}"> · {selectedCount} selected</span>
				{/if}
			</p>
			<button
				on:click={toggleAll}
				disabled={creating}
				class="text-xs font-medium {$t.accentText} {$t.accentTextHover} transition-colors disabled:opacity-40"
			>
				{allSelected ? 'Deselect all' : 'Select all'}
			</button>
		</div>

		<!-- Track list -->
		<div
			class="flex-1 overflow-y-auto divide-y {$t.borderFaded}"
			style="padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px))"
		>
			{#each playlist.tracks as track, i}
				{@const isDupe = (() => {
					const key = `${track.title.toLowerCase()}|${track.artist.toLowerCase()}`;
					return playlist.tracks.findIndex(t => `${t.title.toLowerCase()}|${t.artist.toLowerCase()}` === key) !== i;
				})()}
				<button
					class="w-full flex items-center gap-3 px-6 py-3 text-left transition-colors {selected.has(i) ? $t.hoverBg : 'opacity-40'} {creating ? 'pointer-events-none' : ''}"
					on:click={() => toggleTrack(i)}
					disabled={creating}
				>
					<div class="shrink-0 w-5 h-5 rounded-full border {selected.has(i) ? `${$t.accentBg} ${$t.accentBorder} flex items-center justify-center` : $t.borderStrong}">
						{#if selected.has(i)}
							<svg viewBox="0 0 10 10" fill="none" class="w-3 h-3" xmlns="http://www.w3.org/2000/svg">
								<path d="M2 5l2.5 2.5L8 3" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						{/if}
					</div>

					{#if track.artworkUrl}
						<img src={track.artworkUrl} alt="" class="w-10 h-10 rounded-md shrink-0 object-cover" />
					{:else}
						<div class="w-10 h-10 rounded-md shrink-0 {$t.surfaceBg} {$t.borderBase} border flex items-center justify-center">
							<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4 {$t.textFaint}" xmlns="http://www.w3.org/2000/svg">
								<path d="M6 12V4.5l7-1.5V11" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
								<circle cx="4" cy="12" r="2" stroke="currentColor" stroke-width="1.25"/>
								<circle cx="11" cy="11" r="2" stroke="currentColor" stroke-width="1.25"/>
							</svg>
						</div>
					{/if}

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium {$t.textPrimary} truncate">
							{track.title}
							{#if isDupe}<span class="text-xs font-normal {$t.textFaint} ml-1">(duplicate)</span>{/if}
						</p>
						<p class="text-xs {$t.textMuted} truncate">{track.artist}{track.album ? ` · ${track.album}` : ''}</p>
					</div>
				</button>
			{/each}
		</div>
	</div>

	<!-- Fixed bottom action bar -->
	<div
		class="fixed bottom-0 left-0 right-0 z-30 px-4 pt-3"
		style="
			background: {isLightTheme ? 'rgba(255,255,255,0.60)' : 'rgba(9,9,11,0.60)'};
			backdrop-filter: blur(32px) saturate(200%) brightness({isLightTheme ? '108%' : '120%'});
			-webkit-backdrop-filter: blur(32px) saturate(200%) brightness({isLightTheme ? '108%' : '120%'});
			border-top: 1px solid {isLightTheme ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)'};
			box-shadow: inset 0 1px 0 {isLightTheme ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.07)'}, 0 -8px 32px {isLightTheme ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.35)'};
			padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
		"
	>
		<div class="absolute inset-0 pointer-events-none" style="background: linear-gradient(to bottom, {isLightTheme ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.05)'} 0%, transparent 60%);"></div>
		<div class="relative space-y-2">
			{#if createError}
				<p class="text-xs text-red-400">{createError}</p>
			{/if}
			{#if creating}
				<div class="space-y-1.5">
					<div class="flex justify-between text-xs {$t.textMuted}">
						<span>Creating mixtape…</span>
						<span>{createStep} / {createTotal}</span>
					</div>
					<div class="w-full h-1.5 {$t.surfaceBg} rounded-full overflow-hidden">
						<div
							class="{$t.accentBg} h-full rounded-full transition-all duration-300"
							style="width: {progressPct}%"
						></div>
					</div>
				</div>
			{:else}
				<button
					on:click={handleCreate}
					disabled={selectedCount === 0}
					class="w-full py-3 rounded-xl text-sm font-semibold {$t.btnPrimaryBg} {$t.btnPrimaryText} {$t.btnPrimaryHover} transition-colors disabled:opacity-40"
				>
					Create mixtape · {selectedCount} {selectedCount === 1 ? 'track' : 'tracks'}
				</button>
			{/if}
		</div>
	</div>
{/if}
