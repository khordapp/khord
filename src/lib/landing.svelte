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
				<!-- Vinyl record -->
				<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0 mt-1 {$t.accentText}" aria-hidden="true">
					<circle cx="10" cy="10" r="8.25" stroke="currentColor" stroke-width="1.25"/>
					<circle cx="10" cy="10" r="3.5" stroke="currentColor" stroke-width="1.25"/>
					<circle cx="10" cy="10" r="1" fill="currentColor"/>
				</svg>
				<div>
					<p class="text-sm font-semibold {$t.textPrimary}">Share what you're listening to</p>
					<p class="text-sm {$t.textMuted} mt-1">
						Search for any song and post it to your feed. Your followers see it alongside who shared it.
					</p>
				</div>
			</li>
			<li class="flex gap-4">
				<!-- Headphones -->
				<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0 mt-1 {$t.accentText}" aria-hidden="true">
					<path d="M3.5 11.5V10a6.5 6.5 0 0113 0v1.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
					<rect x="1.75" y="11" width="3.25" height="4.5" rx="1" stroke="currentColor" stroke-width="1.25"/>
					<rect x="15" y="11" width="3.25" height="4.5" rx="1" stroke="currentColor" stroke-width="1.25"/>
				</svg>
				<div>
					<p class="text-sm font-semibold {$t.textPrimary}">Everyone hears it their way</p>
					<p class="text-sm {$t.textMuted} mt-1">
						{APP_NAME} links to Spotify, Apple Music, and other platforms — so no one has to switch services to listen.
					</p>
				</div>
			</li>
			<li class="flex gap-4">
				<!-- Cassette tape -->
				<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0 mt-1 {$t.accentText}" aria-hidden="true">
					<rect x="1.75" y="4.75" width="16.5" height="10.5" rx="1.5" stroke="currentColor" stroke-width="1.25"/>
					<circle cx="7" cy="10" r="2.25" stroke="currentColor" stroke-width="1.25"/>
					<circle cx="13" cy="10" r="2.25" stroke="currentColor" stroke-width="1.25"/>
					<path d="M9.25 10h1.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
					<path d="M4.5 14.25h11" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.35"/>
				</svg>
				<div>
					<p class="text-sm font-semibold {$t.textPrimary}">Build mixtapes together</p>
					<p class="text-sm {$t.textMuted} mt-1">
						Collect songs into mixtapes and share them with friends. Others can propose songs to add.
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
