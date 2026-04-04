<script lang="ts">
	import { musicService, type MusicService } from '$lib/stores/musicService';

	export let onSelect: ((service: MusicService) => void) | undefined = undefined;

	const services: { id: MusicService; name: string; description: string; color: string }[] = [
		{
			id: 'spotify',
			name: 'Spotify',
			description: 'Stream on Spotify',
			color: 'bg-[#1DB954]'
		},
		{
			id: 'apple',
			name: 'Apple Music',
			description: 'Stream on Apple Music',
			color: 'bg-[#fc3c44]'
		}
	];

	function select(service: MusicService) {
		musicService.select(service);
		onSelect?.(service);
	}
</script>

<div class="grid grid-cols-2 gap-4">
	{#each services as svc}
		<button
			on:click={() => select(svc.id)}
			class="relative flex flex-col gap-3 p-5 rounded-xl border transition-all text-left
				{$musicService === svc.id
				? 'border-white bg-zinc-800'
				: 'border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-800'}"
		>
			<span class="w-9 h-9 rounded-lg {svc.color} flex items-center justify-center text-white font-bold text-sm">
				{svc.name[0]}
			</span>
			<div>
				<p class="font-medium text-sm text-zinc-100">{svc.name}</p>
				<p class="text-xs text-zinc-500 mt-0.5">{svc.description}</p>
			</div>
			{#if $musicService === svc.id}
				<span class="absolute top-3 right-3 w-2 h-2 rounded-full bg-white"></span>
			{/if}
		</button>
	{/each}
</div>
