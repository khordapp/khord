<script lang="ts">
	import type { KhordSongRecord } from '$lib/atproto/lexicons/song';
	import { SONG_NSID } from '$lib/atproto/lexicons/song';
	import type { FollowedUser } from '$lib/atproto/social';
	import { extractPlatformUrls, getCanonicalEntity, type OdesliResponse } from '$lib/odesli/client';
	import { votes } from '$lib/stores/votes';
	import { session } from '$lib/stores/auth';
	import { getAgent } from '$lib/atproto/agent';
	import { instanceConfig } from '$lib/stores/instance';
	import { theme as t } from '$lib/theme';
	import { AUTH_PROVIDER_NAME, APP_NAME } from '$lib/config';
	import { prefs } from '$lib/stores/prefs';
	import type { PlatformKey } from '$lib/stores/prefs';

	const PLATFORMS: { key: PlatformKey; label: string; color: string }[] = [
		{ key: 'spotifyUrl',      label: 'Spotify',       color: '#1DB954' },
		{ key: 'appleMusicUrl',   label: 'Apple Music',   color: '#FC3C44' },
		{ key: 'youtubeMusicUrl', label: 'YouTube Music', color: '#FF0000' },
		{ key: 'tidalUrl',        label: 'Tidal',         color: '#9bf0e1' },
		{ key: 'deezerUrl',       label: 'Deezer',        color: '#EF5466' },
		{ key: 'amazonMusicUrl',  label: 'Amazon Music',  color: '#00A8E1' },
		{ key: 'soundcloudUrl',   label: 'SoundCloud',    color: '#FF5500' },
	];

	export let uri: string;
	export let cid: string;
	export let record: KhordSongRecord;
	export let sharedBy: FollowedUser;
	export let selected = false;
	export let onselect: (uri: string) => void = () => {};
	export let voteCount = 0;

	$: songlink = record.songlinkUrl;
	$: liked = $votes.has(uri);

	$: allPlatforms = PLATFORMS.filter((p) => record[p.key]);
	$: preferredPlatform = $prefs ? (allPlatforms.find((p) => p.key === $prefs) ?? null) : null;
	$: primaryPlatform = preferredPlatform ?? allPlatforms[0] ?? null;

	let localCount = voteCount;
	$: localCount = voteCount;

	const POST_LIMIT = 300;

	let liking = false;
	let posting = false;
	let posted = false;
	let composeOpen = false;
	let composeNote = '';
	let includeArt = false;
	let resyncing = false;
	let resynced = false;
	let resyncError = '';

	$: isOwn = $session?.did === sharedBy.did;

	$: composeTitleText = `${record.title}${record.artist ? ` by ${record.artist}` : ''}`;
	$: composeFooter = `Shared from ${APP_NAME}`;
	$: fullPostText = [composeTitleText, ...(composeNote.trim() ? [composeNote.trim()] : []), composeFooter].join('\n\n');
	$: composeCharsLeft = POST_LIMIT - [...fullPostText].length;
	$: composeOver = composeCharsLeft < 0;

	function openCompose() {
		if (!record.songlinkUrl) return;
		composeNote = record.note ?? '';
		includeArt = !$instanceConfig.albumArtDisabled && !!record.thumbnailUrl;
		composeOpen = true;
	}

	async function submitPost() {
		if (!$session || posting || !record.songlinkUrl || composeOver) return;
		posting = true;
		try {
			const encoder = new TextEncoder();
			const titleByteEnd = encoder.encode(composeTitleText).length;
			const facets: { index: { byteStart: number; byteEnd: number }; features: { $type: string; uri: string }[] }[] = [
				{
					index: { byteStart: 0, byteEnd: titleByteEnd },
					features: [{ $type: 'app.bsky.richtext.facet#link', uri: record.songlinkUrl }]
				}
			];

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let embed: any;
			if (includeArt && record.thumbnailUrl) {
				const proxyRes = await fetch(`/api/thumbnail?url=${encodeURIComponent(record.thumbnailUrl)}`);
				if (proxyRes.ok) {
					const blob = await proxyRes.blob();
					const upload = await getAgent().uploadBlob(blob, { encoding: blob.type });
					embed = {
						$type: 'app.bsky.embed.external',
						external: {
							uri: record.songlinkUrl,
							title: composeTitleText,
							description: composeNote.trim(),
							thumb: upload.data.blob
						}
					};
				}
			}

			await getAgent().app.bsky.feed.post.create(
				{ repo: $session.did },
				{
					$type: 'app.bsky.feed.post',
					text: fullPostText,
					...(facets.length ? { facets } : {}),
					...(embed ? { embed } : {}),
					createdAt: new Date().toISOString()
				}
			);
			composeOpen = false;
			posted = true;
			setTimeout(() => { posted = false; }, 3000);
		} finally {
			posting = false;
		}
	}

	async function toggleLike() {
		if (!$session || liking) return;
		liking = true;
		const wasLiked = liked;
		localCount = wasLiked ? Math.max(0, localCount - 1) : localCount + 1;
		try {
			if (wasLiked) await votes.unlike($session.did, uri);
			else await votes.like($session.did, uri, cid);
		} catch {
			localCount = wasLiked ? localCount + 1 : Math.max(0, localCount - 1);
		} finally {
			liking = false;
		}
	}

	async function resync() {
		if (!$session || resyncing || !record.appleMusicUrl) return;
		resyncing = true;
		resyncError = '';
		try {
			const res = await fetch(`/api/resolve?url=${encodeURIComponent(record.appleMusicUrl)}`);
			if (!res.ok) throw new Error(`Resolve failed (${res.status})`);
			const odesliResult: OdesliResponse = await res.json();
			const platformUrls = extractPlatformUrls(odesliResult);
			const entity = getCanonicalEntity(odesliResult);
			const updated: KhordSongRecord = {
				...record,
				title: entity?.title ?? record.title,
				artist: entity?.artistName ?? record.artist,
				...platformUrls
			};
			const rkey = uri.split('/').pop()!;
			await getAgent().com.atproto.repo.putRecord({
				repo: $session.did,
				collection: SONG_NSID,
				rkey,
				record: { $type: SONG_NSID, ...updated }
			});
			record = updated;
			resynced = true;
			setTimeout(() => { resynced = false; }, 3000);
		} catch (e) {
			resyncError = e instanceof Error ? e.message : 'Resync failed.';
			setTimeout(() => { resyncError = ''; }, 4000);
		} finally {
			resyncing = false;
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

<article class="relative sm:rounded-xl border-b sm:border {$t.surfaceBg} pl-5 py-4 space-y-3 transition-colors
	{selected ? 'border-zinc-400 ring-1 ring-zinc-400' : $t.borderBase}
	{primaryPlatform ? 'pr-16' : 'pr-5'}">
	<button
		type="button"
		aria-label={selected ? 'Deselect song' : 'Select song'}
		title={selected ? 'Deselect' : 'Select for bulk actions (delete, create mixtape)'}
		on:click={() => onselect(uri)}
		class="w-full text-left space-y-2"
	>
		<div class="flex items-start gap-3">
			<!-- Selection indicator / album art -->
			<div class="shrink-0 relative">
				{#if !$instanceConfig.albumArtDisabled && record.thumbnailUrl}
					<img
						src={record.thumbnailUrl}
						alt=""
						aria-hidden="true"
						class="w-12 h-12 rounded-md object-cover"
					/>
					{#if selected}
						<div class="absolute inset-0 rounded-md bg-black/60 flex items-center justify-center">
							<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
								<circle cx="8" cy="8" r="8" fill="white"/>
								<path d="M4.5 8L7 10.5L11.5 6" stroke="#09090b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</div>
					{/if}
				{:else}
					<div class="mt-0.5 w-4 h-4 flex items-center justify-center">
						{#if selected}
							<svg viewBox="0 0 16 16" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
								<circle cx="8" cy="8" r="8" fill="white"/>
								<path d="M4.5 8L7 10.5L11.5 6" stroke="#09090b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						{:else}
							<div class="w-4 h-4 rounded-full border {$t.borderStrong}"></div>
						{/if}
					</div>
				{/if}
			</div>
			<div>
				<p class="text-base font-semibold {$t.textPrimary} leading-snug">{record.title}</p>
				<p class="text-sm {$t.textMuted} mt-0.5">
					{record.artist}{record.album ? ` · ${record.album}` : ''}
				</p>
			</div>
		</div>

	</button>

	<!-- Floating play button -->
	{#if primaryPlatform}
		<a
			href={record[primaryPlatform.key] as string}
			title="Listen on {primaryPlatform.label}"
			on:click|stopPropagation
			class="absolute right-4 inset-y-0 flex items-center z-10"
		>
			<div
				class="w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-opacity hover:opacity-80"
				style="background-color: {primaryPlatform.color}"
			>
				<svg viewBox="0 0 10 10" fill="white" class="w-4 h-4 ml-0.5" xmlns="http://www.w3.org/2000/svg">
					<path d="M2 1.5l6 3.5-6 3.5V1.5Z"/>
				</svg>
			</div>
		</a>
	{/if}

	<div class="flex items-center gap-2 min-w-0" style="padding-left: {!$instanceConfig.albumArtDisabled && record.thumbnailUrl ? '3.75rem' : '1.75rem'}">
		{#if sharedBy.avatar}
			<img src={sharedBy.avatar} alt={sharedBy.handle} class="w-5 h-5 rounded-full object-cover shrink-0" />
		{/if}
		<p class="text-xs {$t.textMuted} truncate">
			{#if sharedBy.handle && !sharedBy.handle.startsWith('did:')}
				<a href="https://bsky.app/profile/{sharedBy.handle}" target="_blank" rel="noopener noreferrer"
					class="{$t.textSecondary} {$t.hoverText} transition-colors"
				>{sharedBy.displayName ?? sharedBy.handle}</a>
			{:else}
				<span class="{$t.textSecondary}">{sharedBy.displayName ?? sharedBy.handle}</span>
			{/if}
			· {timeAgo(record.createdAt)}
		</p>
	</div>

	{#if record.note}
		<p class="text-sm {$t.textSecondary} leading-snug" style="padding-left: {!$instanceConfig.albumArtDisabled && record.thumbnailUrl ? '3.75rem' : '1.75rem'}">{record.note}</p>
	{/if}

	<!-- Action row: left-aligned to album art -->
	<div class="flex items-center gap-6">
		{#if songlink}
			<a
				href={songlink}
				target="_blank"
				rel="noopener noreferrer"
				title="Open on song.link — see all available platforms"
				class="p-2 transition-colors {$t.textFaint} {$t.hoverTextSecondary}"
			>
				<svg viewBox="0 0 24 24" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
					<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</a>
		{/if}
		{#if $session && record.songlinkUrl}
			<button
				on:click={openCompose}
				disabled={posting}
				aria-label="Post to {AUTH_PROVIDER_NAME}"
				title="Share this song as a post on {AUTH_PROVIDER_NAME}"
				class="p-2 transition-colors disabled:opacity-50 {posted ? $t.textPrimary : `${$t.textFaint} ${$t.hoverTextSecondary}`}"
			>
				{#if posting}
					<span class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block"></span>
				{:else if posted}
					<svg viewBox="0 0 14 14" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
						<path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
						<path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 3v13.5M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				{/if}
			</button>
		{/if}
		<button
			on:click={toggleLike}
			disabled={liking}
			aria-label={liked ? 'Unlike' : 'Upnote'}
			title={liked ? 'Remove your upnote' : 'Upnote this song'}
			class="p-2 flex items-center gap-1.5 transition-colors disabled:opacity-50 {liked ? $t.accentText : `${$t.textFaint} ${$t.hoverTextSecondary}`}"
		>
			{#if liking}
				<span class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block"></span>
			{:else}
				<span class="flex items-center gap-0.5">
					<svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
						<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					<span class="text-base leading-none -mt-0.5">♪</span>
				</span>
				{#if localCount > 0}
					<span class="text-sm tabular-nums">{localCount}</span>
				{/if}
			{/if}
		</button>
		{#if isOwn && record.appleMusicUrl}
			<button
				on:click={resync}
				disabled={resyncing}
				aria-label="Resync song metadata"
				title="Re-fetch metadata and platform links from streaming services"
				class="p-2 transition-colors disabled:opacity-50 {resynced ? $t.textPrimary : resyncError ? 'text-red-400' : `${$t.textFaint} ${$t.hoverTextSecondary}`}"
			>
				{#if resyncing}
					<span class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block"></span>
				{:else if resynced}
					<svg viewBox="0 0 14 14" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
						<path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
						<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				{/if}
			</button>
		{/if}
	</div>
</article>

<style>
	@media (max-width: 639px) {
		article {
			background-color: transparent;
		}
		article:last-child {
			border-bottom-width: 0;
		}
	}
</style>

{#if composeOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Cancel" on:click={() => (composeOpen = false)}></button>
		<div class="relative w-full max-w-sm {$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-4 pt-4 pb-2 border-b {$t.borderBase} flex items-center justify-between">
				<span class="text-sm font-semibold {$t.textPrimary}">Post to {AUTH_PROVIDER_NAME}</span>
				<button on:click={() => (composeOpen = false)} aria-label="Close" class="{$t.textMuted} {$t.hoverTextSecondary} transition-colors">
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
						<div class="w-8 h-8 rounded-full {$t.elevatedBg} flex items-center justify-center text-xs font-semibold {$t.textSecondary} shrink-0">
							{($session.handle ?? '?')[0].toUpperCase()}
						</div>
					{/if}
					<span class="text-xs {$t.textMuted}">@{$session.handle}</span>
				</div>
			{/if}

			<!-- Fixed: title + artist -->
			<div class="px-4 pt-3 pb-2">
				<p class="text-sm font-medium {$t.textPrimary}">{composeTitleText}</p>
			</div>

			<!-- Editable: optional note -->
			<div class="px-4 pb-2 border-y {$t.borderBase}">
				<textarea
					bind:value={composeNote}
					rows="3"
					class="w-full bg-transparent text-base sm:text-sm {$t.textPrimary} placeholder:{$t.textFaint} py-2.5 resize-none focus:outline-none"
					placeholder="Add a note… (optional)"
				></textarea>
			</div>

			<!-- Fixed: shared from footer -->
			<div class="px-4 pt-2 pb-1">
				<p class="text-xs {$t.textFaint}">{composeFooter}</p>
			</div>

			{#if !$instanceConfig.albumArtDisabled && record.thumbnailUrl}
				<div class="px-4 pb-2 flex items-center gap-3">
					<button
						type="button"
						role="switch"
						aria-checked={includeArt}
						on:click={() => (includeArt = !includeArt)}
						aria-label="Include album art"
						class="relative w-8 h-5 rounded-full transition-colors shrink-0 {includeArt ? $t.btnPrimaryBg : $t.elevatedBg}"
					>
						<span class="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full {$t.recessedBg} transition-transform {includeArt ? 'translate-x-3.5' : 'translate-x-0'}"></span>
					</button>
					<div class="flex items-center gap-2 min-w-0">
						{#if includeArt}
							<img src={record.thumbnailUrl} alt="" aria-hidden="true" class="w-6 h-6 rounded object-cover shrink-0" />
						{/if}
						<span class="text-xs {$t.textMuted}">Include album art</span>
					</div>
				</div>
			{/if}

			<div class="flex items-center justify-between px-4 pb-3">
				<span class="text-xs {composeOver ? 'text-red-400' : composeCharsLeft <= 20 ? 'text-amber-400' : $t.textFaint}">
					{composeCharsLeft}
				</span>
				<div class="flex items-center gap-2">
					<button on:click={() => (composeOpen = false)} class="text-xs {$t.textMuted} {$t.hoverTextSecondary} px-3 py-1.5 transition-colors">
						Cancel
					</button>
					<button
						on:click={submitPost}
						disabled={posting || composeOver}
						class="text-xs font-semibold {$t.btnPrimaryBg} {$t.btnPrimaryText} px-3 py-1.5 rounded-full {$t.btnPrimaryHover} transition-colors disabled:opacity-40"
					>
						{#if posting}
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
