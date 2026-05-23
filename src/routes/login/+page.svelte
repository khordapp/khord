<script lang="ts">
	import { onMount } from 'svelte';
	import { APP_NAME } from '$lib/config';
	import { theme as t } from '$lib/theme';
	import { session, authReady } from '$lib/stores/auth';
	import { instanceConfig } from '$lib/stores/instance';
	import { goto } from '$app/navigation';

	let mode: 'login' | 'register' = 'login';
	let email = '';
	let username = '';
	let password = '';
	let errorMsg = '';
	let loading = false;
	let instanceFull = false;

	onMount(async () => {
		if ($session) { goto('/'); return; }
		try {
			const res = await fetch('/api/auth/status');
			if (res.ok) { const d = await res.json(); instanceFull = d.full; }
		} catch { /* non-fatal */ }
	});

	async function submit() {
		errorMsg = '';
		loading = true;
		try {
			const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
			const body = mode === 'login'
				? { email: email.trim().toLowerCase(), password }
				: { email: email.trim().toLowerCase(), username: username.trim(), password };

			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const msg = await res.text();
				try {
					const parsed = JSON.parse(msg);
					if (parsed.pendingRequest) {
						errorMsg = 'Your access request has been submitted and is pending admin review.';
						return;
					}
					errorMsg = parsed.message ?? msg;
				} catch {
					errorMsg = msg || 'Something went wrong.';
				}
				return;
			}

			const user = await res.json();
			session.set({ id: user.id, username: user.username, email: user.email, displayName: user.displayName, role: user.role });
			instanceConfig.update((c) => ({ ...c, isOwner: user.isOwner }));
			goto('/');
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Something went wrong.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{mode === 'login' ? 'Sign in' : 'Create account'} — {APP_NAME}</title>
</svelte:head>

<div class="max-w-sm space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-bold {$t.textPrimary}">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
		<p class="{$t.textSecondary} text-sm">
			{mode === 'login' ? `Welcome back to ${APP_NAME}.` : `Join ${APP_NAME} to start sharing music.`}
		</p>
	</div>

	{#if instanceFull && mode === 'register'}
		<div class="rounded-lg border {$t.borderStrong} {$t.surfaceBg} px-4 py-4 space-y-1">
			<p class="text-sm font-medium {$t.textPrimary}">This instance is full</p>
			<p class="text-xs {$t.textMuted}">No new accounts are being accepted. Contact the administrator if you believe you should have access.</p>
		</div>
	{:else}
		<form on:submit|preventDefault={submit} class="space-y-4">
			<div class="space-y-1">
				<label for="email" class="text-sm {$t.textSecondary}">Email</label>
				<input
					id="email"
					bind:value={email}
					type="email"
					autocomplete="email"
					required
					placeholder="you@example.com"
					class="w-full {$t.surfaceBg} border {$t.borderStrong} rounded-md px-3 py-2 text-base sm:text-sm {$t.textPrimary}
						focus:outline-none focus:ring-1 {$t.focusRing} placeholder:{$t.textFaint}"
				/>
			</div>

			{#if mode === 'register'}
				<div class="space-y-1">
					<label for="username" class="text-sm {$t.textSecondary}">Username</label>
					<input
						id="username"
						bind:value={username}
						type="text"
						autocomplete="username"
						required
						placeholder="your_username"
						pattern={'[a-zA-Z0-9_.\\-]{2,32}'}
						class="w-full {$t.surfaceBg} border {$t.borderStrong} rounded-md px-3 py-2 text-base sm:text-sm {$t.textPrimary}
							focus:outline-none focus:ring-1 {$t.focusRing} placeholder:{$t.textFaint}"
					/>
					<p class="text-xs {$t.textFaint}">2–32 characters: letters, numbers, underscores, dots, hyphens.</p>
				</div>
			{/if}

			<div class="space-y-1">
				<label for="password" class="text-sm {$t.textSecondary}">Password</label>
				<input
					id="password"
					bind:value={password}
					type="password"
					autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
					required
					minlength={mode === 'register' ? 8 : 1}
					class="w-full {$t.surfaceBg} border {$t.borderStrong} rounded-md px-3 py-2 text-base sm:text-sm {$t.textPrimary}
						focus:outline-none focus:ring-1 {$t.focusRing} placeholder:{$t.textFaint}"
				/>
				{#if mode === 'register'}<p class="text-xs {$t.textFaint}">At least 8 characters.</p>{/if}
			</div>

			{#if errorMsg}
				<p class="text-red-400 text-sm">{errorMsg}</p>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="w-full {$t.btnPrimaryBg} {$t.btnPrimaryText} text-sm font-medium px-4 py-2 rounded-md
					{$t.btnPrimaryHover} transition-colors disabled:opacity-50"
			>
				{loading ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign in' : 'Create account')}
			</button>
		</form>

		<div class="border-t {$t.borderBase} pt-4 text-sm {$t.textMuted} text-center">
			{mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
			<button
				on:click={() => { mode = mode === 'login' ? 'register' : 'login'; errorMsg = ''; }}
				class="{$t.textSecondary} {$t.hoverText} transition-colors ml-1"
			>
				{mode === 'login' ? 'Create one' : 'Sign in'}
			</button>
		</div>
	{/if}
</div>
