import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { TrackResult } from '$lib/search';

export const load: PageServerLoad = async ({ url, fetch }) => {
	const streamingUrl = url.searchParams.get('url');
	if (!streamingUrl) error(400, 'No streaming URL provided');

	const params = new URLSearchParams({ url: streamingUrl });
	const res = await fetch(`/api/resolve-link?${params}`);

	if (!res.ok) {
		const msg = res.status === 400 ? 'Unrecognised link — only Spotify, Apple Music, Deezer, and YouTube Music are supported.'
			: res.status === 422 ? 'Could not load track info from that link. Try sharing again.'
			: 'Something went wrong loading track info.';
		error(res.status, msg);
	}

	const { track }: { track: TrackResult; platform: string } = await res.json();
	return { track };
};
