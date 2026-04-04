<script lang="ts">
	import { onMount } from 'svelte';
	import { signIn } from '$lib/atproto/agent';
	import { APP_NAME, AUTH_PROVIDER_NAME } from '$lib/config';

	let handle = '';
	let error = '';
	let loading = false;

	let instanceFull = false;
	let instanceRestricted = false;
	let handleInput: HTMLInputElement | undefined;

	onMount(async () => {
		handleInput?.focus();
		try {
			const res = await fetch('/api/auth/status');
			if (res.ok) {
				const data = await res.json();
				instanceFull = data.full;
				instanceRestricted = data.restricted;
			}
		} catch {
			// Non-fatal — proceed as open instance
		}
	});

	$: isEmail = handle.includes('@') && !handle.startsWith('@');
	$: blocked = instanceFull;

	async function handleSubmit() {
		if (isEmail || blocked) return;
		loading = true;
		error = '';
		try {
			await signIn(handle.trim().replace(/^@/, ''));
			// Browser navigates to {AUTH_PROVIDER_NAME} for auth — /oauth/callback completes the flow.
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not start sign-in. Check your handle and try again.';
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in — {APP_NAME}</title>
</svelte:head>

<div class="max-w-sm space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold">Sign in</h1>
		<p class="text-zinc-400 text-sm">
			{APP_NAME} uses {AUTH_PROVIDER_NAME} to sign in securely — no passwords shared with us.
		</p>
	</div>

	{#if instanceFull}
		<div class="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-4 space-y-1">
			<p class="text-sm font-medium text-zinc-100">This instance is full</p>
			<p class="text-xs text-zinc-500">
				No new sign-ins are being accepted at this time. Contact the administrator if you believe
				you should have access.
			</p>
		</div>
	{:else}
		{#if instanceRestricted}
			<div class="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
				<p class="text-xs text-zinc-500">
					This is a private instance — sign-in is restricted to specific accounts.
				</p>
			</div>
		{/if}

		<form on:submit|preventDefault={handleSubmit} class="space-y-4">
			<div class="space-y-1">
				<label for="handle" class="text-sm text-zinc-300">{AUTH_PROVIDER_NAME} handle</label>
				<input
					id="handle"
					bind:this={handleInput}
					bind:value={handle}
					type="text"
					autocomplete="username"
					placeholder="you.bsky.social"
					class="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100
						focus:outline-none focus:ring-1 focus:ring-zinc-500 placeholder:text-zinc-600"
				/>
				{#if isEmail}
					<p class="text-amber-400 text-xs">
						Enter your {AUTH_PROVIDER_NAME} handle, not your email — e.g. <span class="font-mono">you.bsky.social</span>.
						Find it in your <a href="https://bsky.app/settings" target="_blank" rel="noopener noreferrer" class="underline">{AUTH_PROVIDER_NAME} settings</a>.
					</p>
				{/if}
			</div>

			{#if error}
				<p class="text-red-400 text-sm">{error}</p>
			{/if}

			<button
				type="submit"
				disabled={!handle.trim() || loading || isEmail}
				class="w-full bg-white text-black text-sm font-medium px-4 py-2 rounded-md
					hover:bg-zinc-200 transition-colors disabled:opacity-50"
			>
				{loading ? 'Opening {AUTH_PROVIDER_NAME} sign-in…' : 'Continue with {AUTH_PROVIDER_NAME}'}
			</button>
		</form>
	{/if}

	<div class="border-t border-zinc-800 pt-5 text-sm text-zinc-500">
		Don't have a {AUTH_PROVIDER_NAME} account?
		<a
			href="https://bsky.app"
			target="_blank"
			rel="noopener noreferrer"
			class="text-zinc-300 hover:text-white transition-colors"
		>
			Create one at bsky.app ↗
		</a>
	</div>
</div>
