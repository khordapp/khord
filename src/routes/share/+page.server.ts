import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { TrackResult } from '$lib/search';
import type { PlaylistData } from '../api/resolve-link/+server';

export const load: PageServerLoad = async ({ url, fetch }) => {
	const streamingUrl = url.searchParams.get('url');
	if (!streamingUrl) error(400, 'No streaming URL provided');

	const params = new URLSearchParams({ url: streamingUrl });
	const res = await fetch(`/api/resolve-link?${params}`);

	if (!res.ok) {
		const msg = res.status === 400 ? 'Unrecognised link — Spotify, Apple Music, Deezer, and YouTube Music are supported.'
			: res.status === 422 ? 'Could not load track info from that link. Try sharing again.'
			: 'Something went wrong loading track info.';
		error(res.status, msg);
	}

	const data = await res.json();

	if (data.type === 'playlist') {
		const { platform, playlist }: { platform: string; playlist: PlaylistData } = data;
		return { type: 'playlist' as const, platform, playlist };
	}

	const { platform, track }: { platform: string; track: TrackResult } = data;
	return { type: 'track' as const, platform, track };
};
