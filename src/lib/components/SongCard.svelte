<script lang="ts">
	import type { KhordSongRecord } from '$lib/atproto/lexicons/song';
	import type { FollowedUser } from '$lib/atproto/social';
	import { votes } from '$lib/stores/votes';
	import { session } from '$lib/stores/auth';
	import { getAgent } from '$lib/atproto/agent';
	import { prefs } from '$lib/stores/prefs';
	import { instanceConfig } from '$lib/stores/instance';
	import { AUTH_PROVIDER_NAME, APP_NAME } from '$lib/config';

	export let uri: string;
	export let cid: string;
	export let record: KhordSongRecord;
	export let sharedBy: FollowedUser;
	export let selected = false;
	export let onselect: (uri: string) => void = () => {};


	const PLATFORMS: { key: keyof KhordSongRecord; label: string; brand: { bg: string; text: string; border: string } }[] = [
		{ key: 'spotifyUrl',      label: 'Spotify',       brand: { bg: '#1DB954', text: '#000000', border: '#1DB954' } },
		{ key: 'appleMusicUrl',   label: 'Apple Music',   brand: { bg: '#FC3C44', text: '#ffffff', border: '#FC3C44' } },
		{ key: 'youtubeMusicUrl', label: 'YouTube Music', brand: { bg: '#FF0000', text: '#ffffff', border: '#FF0000' } },
		{ key: 'tidalUrl',        label: 'Tidal',         brand: { bg: '#000000', text: '#ffffff', border: '#ffffff' } },
		{ key: 'deezerUrl',       label: 'Deezer',        brand: { bg: '#EF5466', text: '#ffffff', border: '#EF5466' } },
		{ key: 'amazonMusicUrl',  label: 'Amazon Music',  brand: { bg: '#00A8E1', text: '#ffffff', border: '#00A8E1' } },
		{ key: 'soundcloudUrl',   label: 'SoundCloud',    brand: { bg: '#FF5500', text: '#ffffff', border: '#FF5500' } },
	];

	$: preferred = $prefs && record[$prefs]
		? PLATFORMS.find((p) => p.key === $prefs) ?? null
		: null;
	$: others = PLATFORMS.filter((p) => record[p.key] && p.key !== $prefs);
	$: songlink = record.songlinkUrl;

	let showMore = false;
	$: liked = $votes.has(uri);

	const POST_LIMIT = 300;

	let liking = false;
	let posting = false;
	let posted = false;
	let composeOpen = false;
	let composeText = '';
	let includeArt = false;

	$: composeCharsLeft = POST_LIMIT - [...composeText].length;
	$: composeOver = composeCharsLeft < 0;

	function openCompose() {
		if (!record.songlinkUrl) return;
		const artist = record.artist ? ` by ${record.artist}` : '';
		const parts = [`${record.title}${artist}`];
		if (record.note) parts.push(record.note);
		parts.push(`Shared from ${APP_NAME}`);
		composeText = parts.join('\n\n');
		includeArt = !$instanceConfig.albumArtDisabled && !!record.thumbnailUrl;
		composeOpen = true;
	}

	async function submitPost() {
		if (!$session || posting || !record.songlinkUrl || composeOver) return;
		posting = true;
		try {
			const encoder = new TextEncoder();
			const facets: { index: { byteStart: number; byteEnd: number }; features: { $type: string; uri: string }[] }[] = [];

			// Link facet on "Title by Artist" text if still present
			const artist = record.artist ? ` by ${record.artist}` : '';
			const titleText = `${record.title}${artist}`;
			const titleIndex = composeText.indexOf(titleText);
			if (titleIndex >= 0) {
				const byteStart = encoder.encode(composeText.slice(0, titleIndex)).length;
				facets.push({
					index: { byteStart, byteEnd: byteStart + encoder.encode(titleText).length },
					features: [{ $type: 'app.bsky.richtext.facet#link', uri: record.songlinkUrl }]
				});
			}

			// Link facet on the bare URL if still present
			const urlIndex = composeText.lastIndexOf(record.songlinkUrl);
			if (urlIndex >= 0) {
				const byteStart = encoder.encode(composeText.slice(0, urlIndex)).length;
				facets.push({
					index: { byteStart, byteEnd: byteStart + encoder.encode(record.songlinkUrl).length },
					features: [{ $type: 'app.bsky.richtext.facet#link', uri: record.songlinkUrl }]
				});
			}

			// External embed with album art if requested
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
							title: `${record.title}${artist}`,
							description: record.note ?? '',
							thumb: upload.data.blob
						}
					};
				}
			}

			await getAgent().app.bsky.feed.post.create(
				{ repo: $session.did },
				{
					$type: 'app.bsky.feed.post',
					text: composeText,
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
		try {
			if (liked) await votes.unlike($session.did, uri);
			else await votes.like($session.did, uri, cid);
		} finally {
			liking = false;
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

<article class="relative rounded-xl border bg-zinc-900 px-5 py-4 space-y-3 transition-colors
	{selected ? 'border-zinc-400 ring-1 ring-zinc-400' : 'border-zinc-800'}">
	<button
		type="button"
		aria-label={selected ? 'Deselect song' : 'Select song'}
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
							<div class="w-4 h-4 rounded-full border border-zinc-700"></div>
						{/if}
					</div>
				{/if}
			</div>
			<div>
				<p class="text-base font-semibold text-zinc-100 leading-snug">{record.title}</p>
				<p class="text-sm text-zinc-400 mt-0.5">
					{record.artist}{record.album ? ` · ${record.album}` : ''}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2 min-w-0" style="padding-left: {!$instanceConfig.albumArtDisabled && record.thumbnailUrl ? '3.75rem' : '1.75rem'}">
			{#if sharedBy.avatar}
				<img src={sharedBy.avatar} alt={sharedBy.handle} class="w-5 h-5 rounded-full object-cover shrink-0" />
			{/if}
			<p class="text-xs text-zinc-500 truncate">
				<span class="text-zinc-400">{sharedBy.displayName ?? sharedBy.handle}</span>
				· {timeAgo(record.createdAt)}
			</p>
		</div>
	</button>

	{#if record.note}
		<p class="text-sm text-zinc-300 leading-snug" style="padding-left: {!$instanceConfig.albumArtDisabled && record.thumbnailUrl ? '3.75rem' : '1.75rem'}">{record.note}</p>
	{/if}

	<div class="flex items-center justify-between gap-2">
		<div class="flex flex-wrap gap-1.5 items-center">
			<span class="text-xs text-zinc-600 shrink-0">Listen on</span>
			{#if preferred}
				<a
					href={record[preferred.key] as string}
					target="_blank"
					rel="noopener noreferrer"
					style="background-color:{preferred.brand.bg}; color:{preferred.brand.text}; border-color:{preferred.brand.border}"
					class="text-xs border px-2.5 py-1 rounded-full transition-opacity hover:opacity-80"
				>
					{preferred.label}
				</a>
			{/if}

			{#each (preferred ? [] : others.slice(0, 1)) as platform}
				<a
					href={record[platform.key] as string}
					target="_blank"
					rel="noopener noreferrer"
					class="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-500
						px-2.5 py-1 rounded-full transition-colors"
				>
					{platform.label}
				</a>
			{/each}

			{#if (preferred ? others : others.slice(1)).length > 0}
				<div class="relative">
					<button
						on:click={() => (showMore = !showMore)}
						class="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500
							px-2.5 py-1 rounded-full transition-colors"
					>
						More
					</button>

					{#if showMore}
						<button
							class="fixed inset-0 z-10"
							aria-label="Close"
							on:click={() => (showMore = false)}
						></button>
						<div class="absolute left-0 bottom-full mb-1.5 z-20 bg-zinc-900 border border-zinc-700
							rounded-xl shadow-xl overflow-hidden min-w-[140px]">
							{#each (preferred ? others : others.slice(1)) as platform}
								<a
									href={record[platform.key] as string}
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center px-3 py-2 text-xs text-zinc-300 hover:text-zinc-100
										hover:bg-zinc-800 transition-colors"
								>
									{platform.label}
								</a>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#if songlink}
				<a
					href={songlink}
					target="_blank"
					rel="noopener noreferrer"
					class="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-900 hover:border-indigo-700
						px-2.5 py-1 rounded-full transition-colors"
				>
					song.link
				</a>
			{/if}
		</div>

		<div class="flex items-center gap-1.5 shrink-0">
			{#if $session && record.songlinkUrl}
				<button
					on:click={openCompose}
					disabled={posting}
					aria-label="Post to {AUTH_PROVIDER_NAME}"
					class="group flex items-center gap-1.5 h-7 px-2.5 rounded-full border transition-colors disabled:opacity-50
						{posted
							? 'text-white bg-zinc-700 border-zinc-600'
							: 'text-zinc-500 border-transparent hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800'}"
				>
					{#if posting}
						<span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
					{:else if posted}
						<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span class="text-xs">Posted</span>
					{:else}
						<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span class="text-xs hidden group-hover:inline">Post to {AUTH_PROVIDER_NAME}</span>
					{/if}
				</button>
			{/if}
			<button
				on:click={toggleLike}
				disabled={liking}
				aria-label={liked ? 'Unlike' : 'Upnote'}
				class="group flex items-center gap-1.5 h-7 px-2.5 rounded-full border transition-colors disabled:opacity-50
					{liked
						? 'text-white bg-zinc-700 border-zinc-600 hover:bg-zinc-600'
						: 'text-zinc-500 border-transparent hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800'}"
			>
				{#if liking}
					<span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
				{:else}
					<span class="text-sm leading-none">♪</span>
					<span class="text-xs {liked ? 'inline' : 'hidden group-hover:inline'}">
						{liked ? 'Upnoted' : 'Upnote'}
					</span>
				{/if}
			</button>
		</div>
	</div>
</article>

{#if composeOpen}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Cancel" on:click={() => (composeOpen = false)}></button>
		<div class="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-4 pt-4 pb-2 border-b border-zinc-800 flex items-center justify-between">
				<span class="text-sm font-semibold text-zinc-100">Post to {AUTH_PROVIDER_NAME}</span>
				<button on:click={() => (composeOpen = false)} aria-label="Close" class="text-zinc-500 hover:text-zinc-300 transition-colors">
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
						<div class="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0">
							{($session.handle ?? '?')[0].toUpperCase()}
						</div>
					{/if}
					<span class="text-xs text-zinc-500">@{$session.handle}</span>
				</div>
			{/if}

			<textarea
				bind:value={composeText}
				rows="5"
				class="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-600 px-4 py-3 resize-none focus:outline-none"
				placeholder="Write something…"
			></textarea>

			{#if !$instanceConfig.albumArtDisabled && record.thumbnailUrl}
				<div class="px-4 pb-2 flex items-center gap-3">
					<button
						type="button"
						role="switch"
						aria-checked={includeArt}
						on:click={() => (includeArt = !includeArt)}
						aria-label="Include album art"
						class="relative w-8 h-5 rounded-full transition-colors shrink-0 {includeArt ? 'bg-white' : 'bg-zinc-700'}"
					>
						<span class="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-zinc-900 transition-transform {includeArt ? 'translate-x-3.5' : 'translate-x-0'}"></span>
					</button>
					<div class="flex items-center gap-2 min-w-0">
						{#if includeArt}
							<img src={record.thumbnailUrl} alt="" aria-hidden="true" class="w-6 h-6 rounded object-cover shrink-0" />
						{/if}
						<span class="text-xs text-zinc-400">Include album art</span>
					</div>
				</div>
			{/if}

			<div class="flex items-center justify-between px-4 pb-3">
				<span class="text-xs {composeOver ? 'text-red-400' : composeCharsLeft <= 20 ? 'text-amber-400' : 'text-zinc-600'}">
					{composeCharsLeft}
				</span>
				<div class="flex items-center gap-2">
					<button on:click={() => (composeOpen = false)} class="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 transition-colors">
						Cancel
					</button>
					<button
						on:click={submitPost}
						disabled={posting || composeOver || composeText.trim().length === 0}
						class="text-xs font-semibold bg-white text-black px-3 py-1.5 rounded-full hover:bg-zinc-200 transition-colors disabled:opacity-40"
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
