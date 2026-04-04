<script lang="ts">
	import { session, isLoggedIn } from '$lib/stores/auth';
	import { APP_NAME, APP_URL, AUTH_PROVIDER_NAME } from '$lib/config';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	if (browser && !$isLoggedIn) goto('/login');

	$: handle = $session?.handle ?? '';
	$: message = `I'm on ${APP_NAME} — a music sharing app built on ${AUTH_PROVIDER_NAME}. Follow me at @${handle} and we can share songs across Spotify, Apple Music, and more. Sign up at bsky.app, then join at ${APP_URL}`;

	let copied = false;

	async function copyToClipboard() {
		await navigator.clipboard.writeText(message);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function nativeShare() {
		await navigator.share({ text: message });
	}

	$: canNativeShare = browser && 'share' in navigator;
</script>

<svelte:head>
	<title>Invite friends — {APP_NAME}</title>
</svelte:head>

<div class="space-y-8 max-w-md">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold">Invite friends</h1>
		<p class="text-zinc-400 text-sm">
			Share your handle so people you know can follow you on {APP_NAME}.
		</p>
	</div>

	<div class="space-y-3">
		<p class="text-xs font-medium text-zinc-500 uppercase tracking-wider">Your handle</p>
		<div class="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3">
			<span class="text-zinc-100 font-mono text-sm flex-1">@{handle}</span>
			<a
				href="https://bsky.app/profile/{handle}"
				target="_blank"
				rel="noopener noreferrer"
				class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
			>
				View profile ↗
			</a>
		</div>
	</div>

	<div class="space-y-3">
		<p class="text-xs font-medium text-zinc-500 uppercase tracking-wider">Invite message</p>
		<div class="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-4">
			<p class="text-sm text-zinc-300 leading-relaxed">{message}</p>
		</div>
		<div class="flex gap-2">
			<button
				on:click={copyToClipboard}
				class="flex-1 text-sm font-medium px-4 py-2 rounded-md border transition-colors
					{copied
					? 'border-green-700 bg-green-950 text-green-400'
					: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'}"
			>
				{copied ? 'Copied!' : 'Copy message'}
			</button>
			{#if canNativeShare}
				<button
					on:click={nativeShare}
					class="flex-1 text-sm font-medium px-4 py-2 rounded-md bg-white text-black hover:bg-zinc-200 transition-colors"
				>
					Share…
				</button>
			{/if}
		</div>
	</div>
</div>
