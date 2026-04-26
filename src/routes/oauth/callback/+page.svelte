<script lang="ts">
	import { onMount } from 'svelte';
	import { initAuth, signOut, LoginContinuedInParentWindowError } from '$lib/atproto/agent';
	import { APP_NAME } from '$lib/config';
	import { session } from '$lib/stores/auth';
	import { following, followingLoaded } from '$lib/stores/following';
	import { getFollowing } from '$lib/atproto/social';
	import { goto } from '$app/navigation';
	import { theme as t } from '$lib/theme';

	let error = '';
	let pendingRequest = false;

	onMount(async () => {
		try {
			const s = await initAuth();
			if (!s) throw new Error('Sign-in did not complete. Please try again.');

			// Check access before establishing session
			const res = await fetch('/api/auth/check', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ did: s.did, handle: s.handle ?? null })
			});
			const result = await res.json();
			if (!result.allowed) {
				await signOut();
				if (result.pendingRequest) {
					pendingRequest = true;
				} else {
					error = result.reason ?? 'Access denied.';
				}
				return;
			}

			session.set(s);
			followingLoaded.set(false);
			getFollowing(s.did).then((follows) => {
				following.set(follows);
				followingLoaded.set(true);
			});
			goto('/');
		} catch (e) {
			if (e instanceof LoginContinuedInParentWindowError) {
				return;
			}
			error = e instanceof Error ? e.message : 'Sign-in failed. Please try again.';
		}
	});
</script>

<svelte:head>
	<title>Signing in… — {APP_NAME}</title>
</svelte:head>

<div class="flex flex-col items-center justify-center py-24 space-y-4 text-center">
	{#if pendingRequest}
		<div class="space-y-3 max-w-sm">
			<div class="w-10 h-10 rounded-full {$t.elevatedBg} flex items-center justify-center mx-auto">
				<svg viewBox="0 0 24 24" fill="none" class="w-5 h-5 {$t.textMuted}" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 6v6l4 2M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</div>
			<p class="text-base font-semibold {$t.textPrimary}">Access request submitted</p>
			<p class="text-sm {$t.textMuted} leading-relaxed">
				The instance admin will review your request. You'll be able to sign in once it's approved.
			</p>
		</div>
	{:else if error}
		<p class="text-red-400 text-sm max-w-sm">{error}</p>
		<a href="/login" class="text-sm {$t.textMuted} {$t.hoverText} transition-colors">
			← Try again
		</a>
	{:else}
		<div class="w-6 h-6 border-2 {$t.textFaint} border-t-current rounded-full animate-spin"></div>
		<p class="{$t.textMuted} text-sm">Completing sign-in…</p>
	{/if}
</div>
