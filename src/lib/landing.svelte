<!--
  CUSTOMIZABLE LANDING PAGE CONTENT
  ──────────────────────────────────
  Edit this file to add your own text, images, or markup to the logged-out
  home page, below the main hero section.

  This is a standard Svelte component — you can write plain HTML, use Svelte
  templating, and import anything from the project. The theme object (t) is
  available for consistent styling.

  To remove this section entirely, just delete all content and leave the file
  empty (the <script> block can be removed too).
-->
<script lang="ts">
	import { theme as t } from '$lib/theme';
	import { APP_NAME } from '$lib/config';
</script>

<div class="space-y-6 pt-2">
	<!-- How it works -->
	<div class="{$t.surfaceBg} border {$t.borderBase} rounded-2xl px-8 py-8 space-y-6">
		<h2 class="text-sm font-semibold {$t.textFaint} uppercase tracking-widest">How it works</h2>
		<ol class="space-y-5">
			<li class="flex gap-4">
				<span class="text-2xl leading-none mt-0.5" aria-hidden="true">🎵</span>
				<div>
					<p class="text-sm font-semibold {$t.textPrimary}">Share what you're listening to</p>
					<p class="text-sm {$t.textMuted} mt-1">
						Search for any song and post it to your feed. Your followers see it alongside who shared it.
					</p>
				</div>
			</li>
			<li class="flex gap-4">
				<span class="text-2xl leading-none mt-0.5" aria-hidden="true">🎧</span>
				<div>
					<p class="text-sm font-semibold {$t.textPrimary}">Everyone hears it their way</p>
					<p class="text-sm {$t.textMuted} mt-1">
						{APP_NAME} links to Spotify, Apple Music, Tidal, Deezer, and more — so no one has to switch services to listen.
					</p>
				</div>
			</li>
			<li class="flex gap-4">
				<span class="text-2xl leading-none mt-0.5" aria-hidden="true">📋</span>
				<div>
					<p class="text-sm font-semibold {$t.textPrimary}">Build setlists together</p>
					<p class="text-sm {$t.textMuted} mt-1">
						Collect songs into setlists and share them with friends. Others can propose songs to add.
					</p>
				</div>
			</li>
		</ol>
	</div>

	<!-- Sign-in note -->
	<p class="text-xs {$t.textFaint} text-center pb-2">
		{APP_NAME} uses your Bluesky account — no separate sign-up needed.
	</p>
</div>
