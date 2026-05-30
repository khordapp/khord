<script lang="ts">
	import type { SongRecord } from '$lib/stores/shareSong';
	import { votes } from '$lib/stores/votes';
	import { session } from '$lib/stores/auth';
	import { instanceConfig } from '$lib/stores/instance';
	import { theme as t } from '$lib/theme';
	import { prefs } from '$lib/stores/prefs';
	import { APP_URL, thumbUrl } from '$lib/config';
	import { songSlug } from '$lib/slug';
	import { CheckCircleIcon, PlayIcon, CheckIcon, UploadSimpleIcon, HeartIcon, ArrowsClockwiseIcon } from 'phosphor-svelte';
	import { PLATFORMS } from '$lib/constants';

	export let id: number;
	export let record: SongRecord;
	export let sharedBy: { userId: number; username: string; displayName?: string };
	export let selected = false;
	export let onselect: (id: number) => void = () => {};
	export let voteCount = 0;
	export let publicView = false;

	$: liked = $votes.songs.has(id);

	$: allPlatforms = PLATFORMS.filter((p) => record[p.key as keyof SongRecord]);
	$: preferredPlatform = $prefs ? (allPlatforms.find((p) => p.key === $prefs) ?? null) : null;
	$: primaryPlatform = preferredPlatform ?? allPlatforms[0] ?? null;

	let localCount = voteCount;
	$: localCount = voteCount;

	let liking = false;
	let resyncing = false;
	let resynced = false;
	let resyncError = '';
	let sharing = false;
	let shared = false;

	$: isOwn = $session?.id === sharedBy.userId;

	async function shareNative() {
		if (sharing) return;
		sharing = true;
		try {
			const text = `${record.title}${record.artist ? ` by ${record.artist}` : ''}`;
			const shareUrl = `${APP_URL}/song/${songSlug(record.title, record.artist, id)}`;
			if (navigator.share) {
				try {
					await navigator.share({ url: shareUrl });
				} catch { /* user cancelled */ }
			} else {
				try {
					await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
					shared = true;
					setTimeout(() => { shared = false; }, 2000);
				} catch { /* clipboard unavailable */ }
			}
		} finally {
			sharing = false;
		}
	}

	async function toggleLike() {
		if (!$session || liking) return;
		liking = true;
		const wasLiked = liked;
		localCount = wasLiked ? Math.max(0, localCount - 1) : localCount + 1;
		try {
			if (wasLiked) await votes.unlike(id);
			else await votes.like(id);
		} catch {
			localCount = wasLiked ? localCount + 1 : Math.max(0, localCount - 1);
		} finally {
			liking = false;
		}
	}

	async function resync() {
		if (!$session || resyncing) return;
		resyncing = true;
		resyncError = '';
		try {
			const p = new URLSearchParams({ title: record.title, artist: record.artist });
			const resolveRes = await fetch(`/api/resolve?${p}`);
			if (!resolveRes.ok) throw new Error(`Resolve failed (${resolveRes.status})`);
			const { spotifyUrl, youtubeMusicUrl, deezerUrl } = await resolveRes.json();

			const updateRes = await fetch(`/api/songs/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ spotifyUrl, youtubeMusicUrl, deezerUrl })
			});
			if (!updateRes.ok) throw new Error('Update failed');
			const updated = await updateRes.json();
			record = { ...record, ...updated };
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
		on:click={() => onselect(id)}
		class="w-full text-left space-y-2"
	>
		<div class="flex items-start gap-3">
			<div class="shrink-0 relative">
				{#if !$instanceConfig.albumArtDisabled && record.thumbnailUrl}
					<img
						src={thumbUrl(record.thumbnailUrl)}
						alt=""
						aria-hidden="true"
						class="w-12 h-12 rounded-md object-cover"
					/>
					{#if selected}
						<div class="absolute inset-0 rounded-md bg-black/60 flex items-center justify-center">
							<CheckCircleIcon size={16} weight="fill" color="white" />
						</div>
					{/if}
				{:else}
					<div class="mt-0.5 w-4 h-4 flex items-center justify-center">
						{#if selected}
							<CheckCircleIcon size={16} weight="fill" class="{$t.accentText}" />
						{:else}
							<div class="w-4 h-4 rounded-full border {$t.borderStrong}"></div>
						{/if}
					</div>
				{/if}
			</div>
			<div class="min-w-0">
				<p class="text-base font-semibold {$t.textPrimary} leading-snug">{record.title}</p>
				<p class="text-sm {$t.textMuted} mt-0.5 line-clamp-2">
					{record.artist}{record.album ? ` · ${record.album}` : ''}
				</p>
			</div>
		</div>
	</button>

	{#if primaryPlatform}
		<a
			href={record[primaryPlatform.key as keyof SongRecord] as string}
			title="Listen on {primaryPlatform.label}"
			on:click|stopPropagation
			class="absolute right-4 top-4 z-10"
		>
			<div
				class="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-opacity hover:opacity-80"
				style="background-color: {primaryPlatform.color}"
			>
				<PlayIcon size={20} weight="fill" color="white" class="ml-0.5" />
			</div>
		</a>
	{/if}

	<div class="flex items-center gap-2 min-w-0" style="padding-left: {!$instanceConfig.albumArtDisabled && record.thumbnailUrl ? '3.75rem' : '1.75rem'}">
		<p class="text-xs {$t.textMuted} truncate">
			<a href="/u/{sharedBy.username}" class="{$t.textSecondary} {$t.hoverText} transition-colors">
				{sharedBy.displayName ?? sharedBy.username}
			</a>
			· {timeAgo(record.createdAt)}
		</p>
	</div>

	{#if record.note}
		<p class="text-sm {$t.textSecondary} leading-snug" style="padding-left: {!$instanceConfig.albumArtDisabled && record.thumbnailUrl ? '3.75rem' : '1.75rem'}">{record.note}</p>
	{/if}

	<div class="flex items-center gap-6">
		<button
			on:click={shareNative}
			aria-label="Share song"
			title="Share this song"
			class="p-2 transition-colors {shared ? $t.textPrimary : `${$t.textFaint} ${$t.hoverTextSecondary}`}"
		>
			{#if shared}
				<CheckIcon size={24} />
			{:else}
				<UploadSimpleIcon size={24} />
			{/if}
		</button>
		{#if !publicView}
			<button
				on:click={toggleLike}
				disabled={liking}
				aria-label={liked ? 'Unlike' : 'Upnote'}
				title={liked ? 'Remove your upnote' : 'Upnote this song'}
				class="p-2 flex items-center gap-1.5 transition-colors disabled:opacity-50 {liked ? $t.accentText : `${$t.textFaint} ${$t.hoverTextSecondary}`}"
			>
				{#if liking}
					<span class="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin inline-block"></span>
				{:else}
					<span class="flex items-center gap-0.5">
						<HeartIcon size={24} weight={liked ? "fill" : "regular"} />
						<span class="text-base leading-none -mt-0.5">♪</span>
					</span>
					{#if localCount > 0}
						<span class="text-sm tabular-nums">{localCount}</span>
					{/if}
				{/if}
			</button>
			{#if isOwn || $instanceConfig.isOwner}
				<button
					on:click={resync}
					disabled={resyncing}
					aria-label="Resync song metadata"
					title="Re-fetch metadata and platform links from streaming services"
					class="p-2 transition-colors disabled:opacity-50 {resynced ? $t.textPrimary : resyncError ? 'text-red-400' : `${$t.textFaint} ${$t.hoverTextSecondary}`}"
				>
					{#if resyncing}
						<span class="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin inline-block"></span>
					{:else if resynced}
						<CheckIcon size={24} />
					{:else}
						<ArrowsClockwiseIcon size={24} />
					{/if}
				</button>
			{/if}
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
