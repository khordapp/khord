<script lang="ts">
	import { session } from '$lib/stores/auth';
	import type { FollowedUser } from '$lib/atproto/social';
	import type { KhordSong } from '$lib/atproto/lexicons/song';
	import { onMount } from 'svelte';
	import { APP_NAME, APP_URL } from '$lib/config';
	import { votes } from '$lib/stores/votes';
	import { theme as t } from '$lib/theme';
	import { prefs } from '$lib/stores/prefs';
	import SongCard from '$lib/components/SongCard.svelte';

	export let data: {
		song: KhordSong | null;
		sharedBy: FollowedUser | null;
	};

	// Initialise from server-loaded data — OG tags render on first HTML response
	let song: KhordSong | null = data.song;
	let sharedBy: FollowedUser | null = data.sharedBy;
	let voteCount = 0;
	let loading = !song; // skip loading state if SSR already gave us data
	let error = '';
	let authResolved = false;

	// Redirect logged-in users with a preferred platform directly to their streaming service.
	// Uses a reactive statement because $session loads asynchronously after mount.
	let redirected = false;
	$: if (!redirected && song && $session && $prefs) {
		const preferredUrl = song.value[$prefs] as string | undefined;
		if (preferredUrl) {
			redirected = true;
			window.location.replace(preferredUrl);
		}
	}

	onMount(async () => {
		authResolved = true;
		try {
			// Fetch votes regardless — depends on who's logged in
			if (song) {
				try {
					const res = await fetch(`/api/votes/counts?uris=${encodeURIComponent(song.uri)}`);
					if (res.ok) {
						const d = await res.json();
						voteCount = (d.counts as Record<string, number>)[song.uri] ?? 0;
					}
				} catch { /* non-fatal */ }

				if ($session) await votes.load($session.did);
			}
		} catch (e) {
			if (!song) error = e instanceof Error ? e.message : 'Could not load song.';
		} finally {
			loading = false;
		}
	});

	$: ogTitle = song ? `${song.value.title}${song.value.artist ? ` by ${song.value.artist}` : ''}` : APP_NAME;
	$: ogDesc = song ? `${ogTitle} — view on ${APP_NAME}, listen anywhere on Spotify, Apple Music, Tidal, and more.` : '';
</script>

<svelte:head>
	<title>{ogTitle}{song ? ` — ${APP_NAME}` : ''}</title>
	{#if song}
		<meta name="description" content={ogDesc} />
		<meta property="og:title" content={ogTitle} />
		<meta property="og:description" content="View on {APP_NAME}, listen anywhere — Spotify, Apple Music, Tidal, and more." />
		<meta property="og:url" content="{APP_URL}/song/{sharedBy?.handle ?? ''}/{song.uri.split('/').pop()}" />
		<meta property="og:type" content="music.song" />
		{#if song.value.thumbnailUrl}
			<meta property="og:image" content="{APP_URL}/api/thumbnail?url={encodeURIComponent(song.value.thumbnailUrl)}" />
			<meta property="og:image:width" content="300" />
			<meta property="og:image:height" content="300" />
		{/if}
	{/if}
</svelte:head>

<div class="max-w-lg mx-auto space-y-6 py-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<a href="/" aria-label="Back to {APP_NAME}" class="flex items-center gap-1.5 text-sm {$t.textMuted} {$t.hoverTextSecondary} transition-colors">
			<svg viewBox="0 0 14 14" fill="none" class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg">
				<path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			{APP_NAME}
		</a>
	</div>

	<!-- Song card -->
	{#if loading}
		<div class="sm:rounded-xl border {$t.borderBase} {$t.surfaceBg} pl-5 pr-16 py-4 space-y-3">
			<div class="flex items-start gap-3">
				<div class="w-12 h-12 rounded-md {$t.elevatedBg} animate-pulse shrink-0"></div>
				<div class="space-y-2 flex-1 pt-1">
					<div class="h-4 rounded {$t.elevatedBg} animate-pulse w-3/4"></div>
					<div class="h-3 rounded {$t.elevatedBg} animate-pulse w-1/2"></div>
				</div>
			</div>
		</div>
	{:else if error}
		<p class="text-sm {$t.textMuted} text-center py-8">{error}</p>
	{:else if song && sharedBy}
		<SongCard
			uri={song.uri}
			cid={song.cid}
			record={song.value}
			{sharedBy}
			{voteCount}
			publicView={!$session}
		/>

		{#if authResolved && !$session}
			<div class="text-center space-y-2 py-4">
				<p class="text-sm {$t.textMuted}">Sign in to upnote songs, collaborate on mixtapes, and share music with friends.</p>
				<a href="/login" class="inline-flex items-center gap-2 {$t.btnPrimaryBg} {$t.btnPrimaryText} text-sm font-semibold px-5 py-2.5 rounded-lg {$t.btnPrimaryHover} transition-colors">
					Join {APP_NAME}
				</a>
			</div>
		{/if}
	{/if}
</div>
