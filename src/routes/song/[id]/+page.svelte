<script lang="ts">
	import { session } from '$lib/stores/auth';
	import { votes } from '$lib/stores/votes';
	import { APP_NAME, APP_URL } from '$lib/config';
	import { songSlug } from '$lib/slug';
	import { theme as t } from '$lib/theme';
	import { prefs } from '$lib/stores/prefs';
	import SongCard from '$lib/components/SongCard.svelte';
	import type { SongRecord } from '$lib/stores/shareSong';

	export let data: {
		song: SongRecord & { id: number };
		sharedBy: { userId: number; username: string; displayName?: string };
		voteCount: number;
		viewerUserId: number | null;
	};

	let redirected = false;
	$: if (!redirected && data.song && $session && $prefs) {
		const preferredUrl = data.song[$prefs as keyof typeof data.song] as string | undefined;
		if (preferredUrl) {
			redirected = true;
			window.location.replace(preferredUrl);
		}
	}

	$: ogTitle = `${data.song.title}${data.song.artist ? ` by ${data.song.artist}` : ''}`;
	$: ogDesc = `${ogTitle} — view on ${APP_NAME}, listen on Spotify, Apple Music, and other platforms.`;
	$: canonicalUrl = `${APP_URL}/song/${songSlug(data.song.title, data.song.artist, data.song.id)}`;
</script>

<svelte:head>
	<title>{ogTitle} — {APP_NAME}</title>
	<link rel="canonical" href={canonicalUrl} />
	<meta name="description" content={ogDesc} />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content="View on {APP_NAME} — listen on Spotify, Apple Music, and other platforms." />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:type" content="music.song" />
	{#if data.song.thumbnailUrl}
		<meta property="og:image" content="{APP_URL}/api/thumbnail?url={encodeURIComponent(data.song.thumbnailUrl)}" />
		<meta property="og:image:width" content="300" />
		<meta property="og:image:height" content="300" />
	{/if}
</svelte:head>

<div class="max-w-lg mx-auto space-y-6 py-4">
	<div class="flex items-center justify-between">
		<a href="/" aria-label="Back to {APP_NAME}" class="flex items-center gap-1.5 text-sm {$t.textMuted} {$t.hoverTextSecondary} transition-colors">
			<svg viewBox="0 0 14 14" fill="none" class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg">
				<path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			{APP_NAME}
		</a>
	</div>

	<SongCard
		id={data.song.id}
		record={data.song}
		sharedBy={data.sharedBy}
		voteCount={data.voteCount}
		publicView={data.viewerUserId === null}
	/>

	{#if data.viewerUserId === null}
		<div class="text-center space-y-2 py-4">
			<p class="text-sm {$t.textMuted}">Sign in to upnote songs, collaborate on mixtapes, and share music with friends.</p>
			<a href="/login" class="inline-flex items-center gap-2 {$t.btnPrimaryBg} {$t.btnPrimaryText} text-sm font-semibold px-5 py-2.5 rounded-lg {$t.btnPrimaryHover} transition-colors">
				Join {APP_NAME}
			</a>
		</div>
	{/if}
</div>
