<script lang="ts">
	import { musicService, type MusicService } from '$lib/stores/musicService';
	import { theme as t } from '$lib/theme';

	export let onSelect: ((service: MusicService) => void) | undefined = undefined;

	const services: { id: MusicService; name: string; description: string; color: string }[] = [
		{ id: 'spotify',  name: 'Spotify',      description: 'Stream on Spotify',      color: 'bg-[#1DB954]' },
		{ id: 'apple',    name: 'Apple Music',   description: 'Stream on Apple Music',  color: 'bg-[#fc3c44]' },
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
				? `${t.borderHighlight} ${t.elevatedBg}`
				: `${t.borderStrong} ${t.surfaceBg} ${t.hoverBorderStrong} ${t.hoverBg}`}"
		>
			<span class="w-9 h-9 rounded-lg {svc.color} flex items-center justify-center text-white font-bold text-sm">
				{svc.name[0]}
			</span>
			<div>
				<p class="font-medium text-sm {t.textPrimary}">{svc.name}</p>
				<p class="text-xs {t.textMuted} mt-0.5">{svc.description}</p>
			</div>
			{#if $musicService === svc.id}
				<span class="absolute top-3 right-3 w-2 h-2 rounded-full {t.btnPrimaryBg}"></span>
			{/if}
		</button>
	{/each}
</div>
