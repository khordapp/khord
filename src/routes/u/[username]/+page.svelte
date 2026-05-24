<script lang="ts">
	import type { PageData } from './$types';
	import { theme as t } from '$lib/theme';
	import { session, avatarVersion } from '$lib/stores/auth';
	import { instanceConfig } from '$lib/stores/instance';
	import { thumbUrl } from '$lib/config';
	import { APP_NAME } from '$lib/config';

	export let data: PageData;

	$: ({ profile, stats, recentSongs, recentSetlists, viewerLoggedIn, isOwnProfile } = data);

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		if (d < 7) return `${d}d ago`;
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function joinedDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>{profile.displayName ?? profile.username} — {APP_NAME}</title>
</svelte:head>

<div class="max-w-lg space-y-8">
	<!-- Avatar + name header -->
	<div class="flex items-center gap-5">
		<div class="w-20 h-20 rounded-full overflow-hidden shrink-0 {$t.elevatedBg} flex items-center justify-center ring-2 {$t.borderStrong}">
			{#if isOwnProfile && $session?.hasAvatar}
				{#key $avatarVersion}
					<img
						src="/api/avatar/{profile.id}?v={$avatarVersion}"
						alt="{profile.username} avatar"
						class="w-full h-full object-cover"
					/>
				{/key}
			{:else if profile.hasAvatar}
				<img
					src="/api/avatar/{profile.id}"
					alt="{profile.username} avatar"
					class="w-full h-full object-cover"
				/>
			{:else}
				<span class="text-3xl font-semibold {$t.textSecondary}">
					{profile.username[0].toUpperCase()}
				</span>
			{/if}
		</div>
		<div class="min-w-0">
			<h1 class="text-xl font-bold {$t.textPrimary} leading-tight truncate">
				{profile.displayName ?? profile.username}
			</h1>
			<p class="text-sm {$t.textMuted} mt-0.5">@{profile.username}</p>
			{#if profile.createdAt}
				<p class="text-xs {$t.textFaint} mt-1">Joined {joinedDate(profile.createdAt)}</p>
			{/if}
		</div>
	</div>

	{#if !viewerLoggedIn}
		<!-- Public / logged-out view -->
		{#if profile.profilePublic}
			<p class="text-sm {$t.textSecondary}">
				Log in to see {profile.displayName ?? profile.username}'s shared songs and mixtapes.
			</p>
		{:else}
			<p class="text-sm {$t.textSecondary}">This profile is private.</p>
		{/if}
		<div class="flex gap-3">
			<a
				href="/login"
				class="px-5 py-2.5 rounded-lg {$t.btnPrimaryBg} {$t.btnPrimaryText} text-sm font-semibold transition-opacity hover:opacity-90"
			>
				Log in
			</a>
			<a
				href="/login"
				class="px-5 py-2.5 rounded-lg border {$t.borderStrong} {$t.textSecondary} text-sm font-semibold {$t.hoverBg} transition-colors"
			>
				Join {APP_NAME}
			</a>
		</div>
	{:else}
		<!-- Full profile for logged-in viewers -->
		{#if stats}
			<div class="flex gap-6">
				<div class="text-center">
					<p class="text-2xl font-bold {$t.textPrimary}">{stats.songCount}</p>
					<p class="text-xs {$t.textMuted} mt-0.5">songs shared</p>
				</div>
				<div class="text-center">
					<p class="text-2xl font-bold {$t.textPrimary}">{stats.setlistCount}</p>
					<p class="text-xs {$t.textMuted} mt-0.5">mixtapes</p>
				</div>
			</div>
		{/if}

		{#if recentSongs.length > 0}
			<div class="space-y-3">
				<h2 class="text-sm font-semibold {$t.textSecondary} uppercase tracking-wide">Recent shares</h2>
				<ul class="space-y-0 divide-y {$t.borderFaded}">
					{#each recentSongs as song}
						<li class="py-3 flex items-start gap-3">
							{#if !$instanceConfig.albumArtDisabled && song.thumbnailUrl}
								<img
									src={thumbUrl(song.thumbnailUrl)}
									alt=""
									aria-hidden="true"
									class="w-10 h-10 rounded-md object-cover shrink-0 mt-0.5"
								/>
							{:else}
								<div class="w-10 h-10 rounded-md shrink-0 {$t.recessedBg} mt-0.5"></div>
							{/if}
							<div class="min-w-0 flex-1">
								<a
									href="/song/{song.slug}"
									class="text-sm font-semibold {$t.textPrimary} {$t.hoverText} transition-colors leading-snug line-clamp-1"
								>
									{song.title}
								</a>
								<p class="text-xs {$t.textMuted} mt-0.5 truncate">{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
								<p class="text-xs {$t.textFaint} mt-0.5">{timeAgo(song.createdAt)}</p>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if recentSetlists.length > 0}
			<div class="space-y-3">
				<h2 class="text-sm font-semibold {$t.textSecondary} uppercase tracking-wide">Mixtapes</h2>
				<ul class="space-y-0 divide-y {$t.borderFaded}">
					{#each recentSetlists as setlist}
						<li class="py-3">
							<a
								href="/s/{setlist.slug}"
								class="text-sm font-semibold {$t.textPrimary} {$t.hoverText} transition-colors"
							>
								{setlist.title}
							</a>
							{#if setlist.description}
								<p class="text-xs {$t.textMuted} mt-0.5 line-clamp-1">{setlist.description}</p>
							{/if}
							<p class="text-xs {$t.textFaint} mt-0.5">{timeAgo(setlist.createdAt)}</p>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if stats && stats.songCount === 0 && stats.setlistCount === 0}
			<p class="text-sm {$t.textFaint}">No shared songs yet.</p>
		{/if}
	{/if}
</div>
