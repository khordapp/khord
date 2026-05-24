<script lang="ts">
	import { onMount } from 'svelte';
	import { prefs } from '$lib/stores/prefs';
	import { APP_NAME } from '$lib/config';
	import { theme as t } from '$lib/theme';
	import StreamingServiceModal from '$lib/components/StreamingServiceModal.svelte';
	import { session, avatarVersion } from '$lib/stores/auth';

	$: hasPair = t.hasPair();
	$: isLight = t.isLight();

	const PLATFORM_LABELS: Record<string, string> = {
		spotifyUrl: 'Spotify', appleMusicUrl: 'Apple Music', youtubeMusicUrl: 'YouTube Music',
		tidalUrl: 'Tidal', deezerUrl: 'Deezer', amazonMusicUrl: 'Amazon Music', soundcloudUrl: 'SoundCloud',
	};

	$: currentLabel = $prefs ? (PLATFORM_LABELS[$prefs] ?? null) : null;

	let modalOpen = false;

	// --- Public profile ---
	let profilePublic = true;
	let profilePublicLoading = false;
	let profilePublicMsg = '';

	onMount(async () => {
		try {
			const res = await fetch('/api/profile');
			if (res.ok) {
				const d = await res.json();
				profilePublic = d.profilePublic;
			}
		} catch { /* ignore */ }
	});

	async function toggleProfilePublic(val: boolean) {
		if (profilePublicLoading) return;
		profilePublicLoading = true;
		profilePublicMsg = '';
		try {
			const res = await fetch('/api/profile', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profilePublic: val }),
			});
			if (!res.ok) throw new Error();
			profilePublic = val;
		} catch {
			profilePublicMsg = 'Failed to save — please try again.';
		} finally {
			profilePublicLoading = false;
		}
	}

	// --- Avatar ---
	let avatarFileInput: HTMLInputElement;
	let avatarPreviewUrl = '';
	let avatarUploading = false;
	let avatarRemoving = false;
	let avatarMsg = '';
	let avatarMsgIsError = false;

	async function resizeImage(file: File): Promise<Blob> {
		return new Promise((resolve) => {
			if (file.type === 'image/gif') { resolve(file); return; }
			const img = new Image();
			const url = URL.createObjectURL(file);
			img.onload = () => {
				URL.revokeObjectURL(url);
				const MAX = 256;
				let { width, height } = img;
				if (width > MAX || height > MAX) {
					const r = Math.min(MAX / width, MAX / height);
					width = Math.round(width * r);
					height = Math.round(height * r);
				}
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
				canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.85);
			};
			img.src = url;
		});
	}

	async function handleAvatarSelect(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
			avatarMsg = 'Unsupported format — use JPG, PNG, WebP, or GIF.';
			avatarMsgIsError = true;
			return;
		}
		avatarMsg = '';
		avatarUploading = true;
		try {
			const blob = await resizeImage(file);
			if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
			avatarPreviewUrl = URL.createObjectURL(blob);

			const fd = new FormData();
			fd.append('avatar', blob, file.type === 'image/gif' ? 'avatar.gif' : 'avatar.jpg');
			const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? 'Upload failed');
			}
			session.update((s) => s ? { ...s, hasAvatar: true } : s);
			avatarVersion.update((v) => v + 1);
			avatarMsg = 'Avatar saved.';
			avatarMsgIsError = false;
		} catch (err) {
			avatarMsg = err instanceof Error ? err.message : 'Upload failed.';
			avatarMsgIsError = true;
			avatarPreviewUrl = '';
		} finally {
			avatarUploading = false;
			if (avatarFileInput) avatarFileInput.value = '';
		}
	}

	async function removeAvatar() {
		avatarRemoving = true;
		avatarMsg = '';
		try {
			const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
			if (!res.ok) throw new Error();
			session.update((s) => s ? { ...s, hasAvatar: false } : s);
			avatarVersion.update((v) => v + 1);
			if (avatarPreviewUrl) { URL.revokeObjectURL(avatarPreviewUrl); avatarPreviewUrl = ''; }
			avatarMsg = 'Avatar removed.';
			avatarMsgIsError = false;
		} catch {
			avatarMsg = 'Failed to remove avatar.';
			avatarMsgIsError = true;
		} finally {
			avatarRemoving = false;
		}
	}

	// --- Delete data ---
	let deleteModalOpen = false;
	let deleteInput = '';
	let deleting = false;
	let deleteError = false;
	let deleteSuccess = false;

	async function confirmDeleteData() {
		if (!$session || deleteInput !== 'DELETE') return;
		deleting = true;
		deleteError = false;
		try {
			const res = await fetch('/api/auth/delete-data', { method: 'POST' });
			if (!res.ok) throw new Error();
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

	{#if $session}
		<div class="space-y-3">
			<div class="space-y-1">
				<h2 class="text-sm font-semibold {$t.textPrimary}">Profile picture</h2>
				<p class="text-xs {$t.textMuted}">JPG, PNG, WebP or GIF · max 512 KB · resized to 256 px before saving.</p>
			</div>
			<div class="flex items-center gap-4">
				<div class="w-16 h-16 rounded-full overflow-hidden shrink-0 ring-2 {$t.borderStrong} relative {$t.elevatedBg} flex items-center justify-center">
					<span class="text-xl font-semibold {$t.textSecondary}">
						{($session.username ?? '?')[0].toUpperCase()}
					</span>
					{#if avatarPreviewUrl}
						<img src={avatarPreviewUrl} alt="Preview" class="absolute inset-0 w-full h-full object-cover" />
					{:else if $session.hasAvatar}
						{#key $avatarVersion}
							<img
								src="/api/avatar/{$session.id}?v={$avatarVersion}"
								alt="Current avatar"
								class="absolute inset-0 w-full h-full object-cover"
								on:error={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
							/>
						{/key}
					{/if}
				</div>
				<div class="flex flex-col gap-2">
					<label class="cursor-pointer px-4 py-2 rounded-lg border {$t.borderStrong} {$t.textSecondary} text-sm {$t.hoverBg} transition-colors {avatarUploading ? 'opacity-50 pointer-events-none' : ''}">
						{avatarUploading ? 'Uploading…' : 'Choose photo'}
						<input
							bind:this={avatarFileInput}
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							class="sr-only"
							on:change={handleAvatarSelect}
							disabled={avatarUploading}
						/>
					</label>
					{#if $session.hasAvatar || avatarPreviewUrl}
						<button
							on:click={removeAvatar}
							disabled={avatarRemoving || avatarUploading}
							class="px-4 py-2 rounded-lg border border-red-800 text-red-400 text-sm hover:bg-red-900/20 transition-colors disabled:opacity-40"
						>
							{avatarRemoving ? 'Removing…' : 'Remove photo'}
						</button>
					{/if}
				</div>
			</div>
			{#if avatarMsg}
				<p class="text-xs {avatarMsgIsError ? 'text-red-400' : 'text-green-400'}">{avatarMsg}</p>
			{/if}
		</div>

		<div class="space-y-3">
			<div class="space-y-1">
				<h2 class="text-sm font-semibold {$t.textPrimary}">Public profile</h2>
				<p class="text-xs {$t.textMuted}">When enabled, visitors who are not logged in can see your name and avatar at <span class="font-mono">/u/{$session.username}</span>.</p>
			</div>
			<button
				on:click={() => toggleProfilePublic(!profilePublic)}
				disabled={profilePublicLoading}
				class="w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors
					{$t.borderStrong} {$t.surfaceBg} {$t.textSecondary} {$t.hoverBorderStrong} {$t.hoverText}
					disabled:opacity-50"
			>
				<span class="text-sm">{profilePublic ? 'Public profile on' : 'Public profile off'}</span>
				<span class="text-xs {$t.textMuted}">{profilePublic ? 'Turn off' : 'Turn on'}</span>
			</button>
			{#if profilePublicMsg}
				<p class="text-xs text-red-400">{profilePublicMsg}</p>
			{/if}
		</div>
	{/if}

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
				<p class="text-xs {$t.textMuted}">Permanently deletes your songs, votes, mixtapes, and proposals. Your account is kept so you can sign back in. This cannot be undone.</p>
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
