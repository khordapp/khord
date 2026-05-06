<script lang="ts">
	import { prefs } from '$lib/stores/prefs';
	import { APP_NAME } from '$lib/config';
	import { theme as t } from '$lib/theme';
	import StreamingServiceModal from '$lib/components/StreamingServiceModal.svelte';
	import { session } from '$lib/stores/auth';
	import { deleteUserData } from '$lib/atproto/social';
	import { APP_URL } from '$lib/config';

	$: hasPair = t.hasPair();
	$: isLight = t.isLight();

	const PLATFORM_LABELS: Record<string, string> = {
		spotifyUrl: 'Spotify', appleMusicUrl: 'Apple Music', youtubeMusicUrl: 'YouTube Music',
		tidalUrl: 'Tidal', deezerUrl: 'Deezer', amazonMusicUrl: 'Amazon Music', soundcloudUrl: 'SoundCloud',
	};

	$: currentLabel = $prefs ? (PLATFORM_LABELS[$prefs] ?? null) : null;

	let modalOpen = false;

	let deleteModalOpen = false;
	let deleteInput = '';
	let deleteScope: 'instance' | 'all' = 'instance';
	let deleting = false;
	let deleteError = false;
	let deleteSuccess = false;

	async function confirmDeleteData() {
		if (!$session || deleteInput !== 'DELETE') return;
		deleting = true;
		deleteError = false;
		try {
			await deleteUserData($session.did, deleteScope === 'instance' ? APP_URL : null);
			deleteSuccess = true;
			deleteModalOpen = false;
			deleteInput = '';
		} catch {
			deleteError = true;
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head>
	<title>Settings — {APP_NAME}</title>
</svelte:head>

<div class="max-w-sm space-y-8">
	<h1 class="text-2xl font-bold">Settings</h1>

	{#if hasPair}
		<div class="space-y-3">
			<div class="space-y-1">
				<h2 class="text-sm font-semibold {$t.textPrimary}">Appearance</h2>
				<p class="text-xs {$t.textMuted}">Choose between dark and light mode.</p>
			</div>
			<button
				on:click={() => t.toggle()}
				class="flex items-center justify-between w-full px-4 py-3 rounded-lg border transition-colors
					{$t.borderStrong} {$t.surfaceBg} {$t.textSecondary} {$t.hoverBorderStrong} {$t.hoverText}"
			>
				<span class="text-sm">{isLight ? 'Light mode' : 'Dark mode'}</span>
				<span class="text-xs {$t.textMuted}">Switch to {isLight ? 'dark' : 'light'}</span>
			</button>
		</div>
	{/if}

	<div class="space-y-3">
		<div class="space-y-1">
			<h2 class="text-sm font-semibold {$t.textPrimary}">Preferred streaming service</h2>
			<p class="text-xs {$t.textMuted}">
				When set, this platform's link will always appear first on each song. Others are shown in a
				collapsed list.
			</p>
		</div>
		<button
			on:click={() => (modalOpen = true)}
			class="w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors
				{$t.borderStrong} {$t.surfaceBg} {$t.textSecondary} {$t.hoverBorderStrong} {$t.hoverText}"
		>
			<span class="text-sm">{currentLabel ?? 'None set'}</span>
			<span class="text-xs {$t.textMuted}">Change</span>
		</button>
	</div>

	<StreamingServiceModal bind:open={modalOpen} />

	{#if $session}
		<div class="space-y-3 pt-4 border-t border-red-900/40">
			<div class="space-y-1">
				<h2 class="text-sm font-semibold text-red-400">Danger zone</h2>
				<p class="text-xs {$t.textMuted}">Permanently delete all songs, votes, mixtapes, and proposals you have shared on this instance.</p>
			</div>
			{#if deleteSuccess}
				<p class="text-xs text-green-400">All your data has been deleted.</p>
			{:else}
				<button
					on:click={() => (deleteModalOpen = true)}
					class="px-4 py-2 rounded-lg border border-red-800 text-red-400 text-sm hover:bg-red-900/20 transition-colors"
				>
					Delete my data
				</button>
			{/if}
		</div>
	{/if}
</div>

{#if deleteModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
		<div class="w-full max-w-sm rounded-xl border {$t.borderStrong} {$t.surfaceBg} p-6 space-y-4 shadow-xl">
			<div class="space-y-1">
				<h2 class="text-base font-semibold text-red-400">Delete my data</h2>
				<p class="text-xs {$t.textMuted}">Permanently deletes your songs, votes, mixtapes, and proposals. This cannot be undone.</p>
			</div>
			<div class="space-y-2">
				<p class="text-xs font-medium {$t.textSecondary}">What to delete:</p>
				<label class="flex items-start gap-3 cursor-pointer">
					<input type="radio" bind:group={deleteScope} value="instance" class="mt-0.5 accent-red-500" />
					<div>
						<p class="text-sm {$t.textPrimary}">This instance only</p>
						<p class="text-xs {$t.textMuted}">Removes content you shared here. Your data on other Khord instances is untouched.</p>
					</div>
				</label>
				<label class="flex items-start gap-3 cursor-pointer">
					<input type="radio" bind:group={deleteScope} value="all" class="mt-0.5 accent-red-500" />
					<div>
						<p class="text-sm {$t.textPrimary}">All Khord instances</p>
						<p class="text-xs {$t.textMuted}">Removes all your Khord content from your AT Protocol identity, across every instance.</p>
					</div>
				</label>
			</div>
			<div class="space-y-2">
				<p class="text-xs {$t.textMuted}">Type <span class="text-red-400 font-mono font-bold">DELETE</span> to confirm:</p>
				<input
					bind:value={deleteInput}
					placeholder="DELETE"
					disabled={deleting}
					class="w-full text-base font-mono {$t.surfaceBg} border border-red-800 rounded-lg px-3 py-2 {$t.textPrimary} placeholder:{$t.textFaint} focus:outline-none focus:ring-1 focus:ring-red-700"
				/>
				{#if deleteError}
					<p class="text-xs text-red-400">Something went wrong — please try again.</p>
				{/if}
			</div>
			<div class="flex gap-2 justify-end">
				<button
					on:click={() => { deleteModalOpen = false; deleteInput = ''; deleteError = false; }}
					disabled={deleting}
					class="px-4 py-2 rounded-lg border {$t.borderStrong} {$t.textMuted} text-sm {$t.hoverBg} transition-colors"
				>
					Cancel
				</button>
				<button
					on:click={confirmDeleteData}
					disabled={deleting || deleteInput !== 'DELETE'}
					class="px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
				>
					{deleting ? 'Deleting…' : 'Delete my data'}
				</button>
			</div>
		</div>
	</div>
{/if}
