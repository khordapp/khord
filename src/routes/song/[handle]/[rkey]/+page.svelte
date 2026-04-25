<script lang="ts">
	import { page } from '$app/state';
	import { session, authReady } from '$lib/stores/auth';
	import { fetchSong } from '$lib/atproto/social';
	import type { FollowedUser } from '$lib/atproto/social';
	import type { KhordSong } from '$lib/atproto/lexicons/song';
	import { getAgent } from '$lib/atproto/agent';
	import { onMount } from 'svelte';
	import { APP_NAME, APP_URL } from '$lib/config';
	import { votes } from '$lib/stores/votes';
	import { theme as t } from '$lib/theme';
	import SongCard from '$lib/components/SongCard.svelte';

	const handle: string = page.params.handle ?? '';
	const rkey: string = page.params.rkey ?? '';

	let song: KhordSong | null = null;
	let sharedBy: FollowedUser | null = null;
	let voteCount = 0;
	let loading = true;
	let error = '';

	onMount(async () => {
		await authReady;
		try {
			const profile = await getAgent().getProfile({ actor: handle });
			const did = profile.data.did;
			sharedBy = {
				did,
				handle: profile.data.handle,
				displayName: profile.data.displayName,
				avatar: profile.data.avatar
			};
			song = await fetchSong(did, rkey);

			// Vote counts
			try {
				const res = await fetch(`/api/votes/counts?uris=${encodeURIComponent(song.uri)}`);
				if (res.ok) {
					const data = await res.json();
					voteCount = (data.counts as Record<string, number>)[song.uri] ?? 0;
				}
			} catch { /* non-fatal */ }

			// Load user's votes if logged in
			if ($session) {
				await votes.load($session.did);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load song.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	{#if song}
		<title>{song.value.title}{song.value.artist ? ` by ${song.value.artist}` : ''} — {APP_NAME}</title>
		<meta name="description" content="Listen to {song.value.title}{song.value.artist ? ` by ${song.value.artist}` : ''} on {APP_NAME} — available on Spotify, Apple Music, Tidal, and more." />
		<meta property="og:title" content="{song.value.title}{song.value.artist ? ` by ${song.value.artist}` : ''}" />
		<meta property="og:description" content="Listen on {APP_NAME} — available on Spotify, Apple Music, Tidal, and more." />
		<meta property="og:url" content="{APP_URL}/song/{handle}/{rkey}" />
		{#if song.value.thumbnailUrl}
			<meta property="og:image" content="{APP_URL}/api/thumbnail?url={encodeURIComponent(song.value.thumbnailUrl)}" />
		{/if}
	{:else}
		<title>{APP_NAME}</title>
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
		/>

		{#if !$session}
			<div class="text-center space-y-2 py-4">
				<p class="text-sm {$t.textMuted}">Want to discover more music like this?</p>
				<a href="/login" class="inline-flex items-center gap-2 {$t.btnPrimaryBg} {$t.btnPrimaryText} text-sm font-semibold px-5 py-2.5 rounded-lg {$t.btnPrimaryHover} transition-colors">
					Join {APP_NAME}
				</a>
			</div>
		{/if}
	{/if}
</div>
