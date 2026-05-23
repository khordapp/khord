<script lang="ts">
	import { session, isLoggedIn } from '$lib/stores/auth';
	import { APP_NAME, APP_URL } from '$lib/config';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { theme as t } from '$lib/theme';

	if (browser && !$isLoggedIn) goto('/login');

	$: username = $session?.username ?? '';
	$: message = `I'm on ${APP_NAME} — a music sharing app where you can discover songs across Spotify, Apple Music, and more. Join me at ${APP_URL}`;

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
		<p class="{$t.textSecondary} text-sm">
			Share {APP_NAME} with friends so you can discover music together.
		</p>
	</div>

	{#if username}
		<div class="space-y-3">
			<p class="text-xs font-medium {$t.textMuted} uppercase tracking-wider">Your username</p>
			<div class="flex items-center gap-3 {$t.surfaceBg} border {$t.borderStrong} rounded-lg px-4 py-3">
				<span class="{$t.textPrimary} font-mono text-sm flex-1">@{username}</span>
			</div>
		</div>
	{/if}

	<div class="space-y-3">
		<p class="text-xs font-medium {$t.textMuted} uppercase tracking-wider">Invite message</p>
		<div class="{$t.surfaceBg} border {$t.borderStrong} rounded-lg px-4 py-4">
			<p class="text-sm {$t.textSecondary} leading-relaxed">{message}</p>
		</div>
		<div class="flex gap-2">
			<button
				on:click={copyToClipboard}
				class="flex-1 text-sm font-medium px-4 py-2 rounded-md border transition-colors
					{copied
					? 'border-green-700 bg-green-950 text-green-400'
					: `${$t.borderStrong} ${$t.surfaceBg} ${$t.textSecondary} ${$t.hoverBorderStrong} ${$t.hoverText}`}"
			>
				{copied ? 'Copied!' : 'Copy message'}
			</button>
			{#if canNativeShare}
				<button
					on:click={nativeShare}
					class="flex-1 text-sm font-medium px-4 py-2 rounded-md {$t.btnPrimaryBg} {$t.btnPrimaryText} {$t.btnPrimaryHover} transition-colors"
				>
					Share…
				</button>
			{/if}
		</div>
	</div>
</div>
