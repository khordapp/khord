<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { searchTracks, type TrackResult } from '$lib/search';

	export let autofocus = false;

	const dispatch = createEventDispatcher<{ select: TrackResult }>();

	let query = '';
	let searching = false;
	let results: TrackResult[] = [];
	let searchError = '';
	let debounceTimer: ReturnType<typeof setTimeout>;

	$: if (query.trim().length >= 2) {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(doSearch, 350);
	} else {
		clearTimeout(debounceTimer);
		results = [];
		searchError = '';
	}

	async function doSearch() {
		searching = true;
		searchError = '';
		try {
			results = await searchTracks(query.trim());
		} catch (e) {
			searchError = e instanceof Error ? e.message : 'Search failed. Please try again.';
			results = [];
		} finally {
			searching = false;
		}
	}

	function select(result: TrackResult) {
		dispatch('select', result);
		query = '';
		results = [];
	}

	const placeholder = 'Search songs…';
</script>

<div class="space-y-2">
	<div class="relative">
		<input
			type="search"
			bind:value={query}
			placeholder={placeholder}
			autofocus={autofocus}
			class="w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-100
				focus:outline-none focus:ring-1 focus:ring-zinc-500 placeholder:text-zinc-600"
		/>
		<span class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">♪</span>
		{#if searching}
			<span class="absolute right-3 top-1/2 -translate-y-1/2">
				<span class="block w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin"></span>
			</span>
		{/if}
	</div>

	{#if query.trim().length >= 2}
		<div class="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden max-h-64 overflow-y-auto">
			{#if searching && results.length === 0}
				<div class="px-4 py-3 space-y-2.5">
					{#each [1, 2, 3] as _}
						<div class="space-y-1.5">
							<div class="h-3.5 w-2/3 bg-zinc-800 rounded animate-pulse"></div>
							<div class="h-3 w-1/3 bg-zinc-800 rounded animate-pulse"></div>
						</div>
					{/each}
				</div>
			{:else if searchError}
				<div class="px-4 py-4 text-center text-red-400 text-sm">{searchError}</div>
			{:else if results.length > 0}
				<ul>
					{#each results as result}
						<li>
							<button
								on:click={() => select(result)}
								class="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0"
							>
								<p class="text-sm text-zinc-100 truncate">{result.title}</p>
								<p class="text-xs text-zinc-500 truncate">
									{result.artist}{result.album ? ` · ${result.album}` : ''}{result.year ? ` (${result.year})` : ''}
								</p>
							</button>
						</li>
					{/each}
				</ul>
			{:else if !searching}
				<div class="px-4 py-4 text-center text-zinc-500 text-sm">No results found.</div>
			{/if}
		</div>
	{/if}
</div>
